-- FF Defender: reasonably strong L7 defense rules.
-- Source of truth for Verifier Agent via /var/log/defender.log (JSON lines).
--
-- Defense layers:
--   1) User-Agent blacklist (substring match, case-insensitive)
--   2) Per-IP sliding-window rate limit (50 req/s, burst 25)
--   3) Empty UA / missing UA rejection
--   4) Login endpoint specific rate limit (5 req/s, burst 3)
--   5) GET method on login endpoints -> block

local limit_req = require "resty.limit.req"
local cjson     = require "cjson.safe"

local LOG_PATH = "/var/log/defender.log"

-- Per-IP rate limiter (general) — 50 req/s, burst 25
local lim, lim_err = limit_req.new("ff_limit_req_store", 50, 25)
if not lim then
    ngx.log(ngx.ERR, "ff-defender: failed to instantiate limiter: ", lim_err)
    return
end

-- Login endpoint rate limiter (stricter) — 5 req/s, burst 3
local login_lim, login_lim_err = limit_req.new("ff_login_limit_req_store", 5, 3)
if not login_lim then
    ngx.log(ngx.ERR, "ff-defender: failed to instantiate login limiter: ", login_lim_err)
end

local UA_BLACKLIST = {
    "bot", "curl", "python-requests", "wget", "scrapy",
    "go-http-client", "masscan", "nmap", "slowloris", "hping",
    "ab/", "siege", "locust", "nikto", "sqlmap", "hydra",
}

local LOGIN_PATHS = {
    ["/api/login"] = true,
    ["/api/register"] = true,
}

-- Rate limiting keys on the real TCP peer (remote_addr) only.
-- X-Forwarded-For is client-supplied and trivially forged, so keying limits on
-- it lets an attacker rotate a fake XFF per request and appear as a new IP each
-- time, defeating the limiter. If this defender is ever placed behind a trusted
-- reverse proxy, set TRUST_XFF=1 in its env AND restrict who can reach it.
local TRUST_XFF = (os.getenv("TRUST_XFF") == "1")

local function client_ip()
    if TRUST_XFF then
        local xff = ngx.var.http_x_forwarded_for
        if xff and xff ~= "" then
            local first = xff:match("([^,%s]+)")
            if first then return first end
        end
    end
    return ngx.var.remote_addr or "unknown"
end

local function log_block(reason, ip, ua, path)
    local record = {
        ts = ngx.utctime(),
        client_ip = ip,
        reason = reason,
        ua = ua or "",
        path = path or "",
    }
    local line, err = cjson.encode(record)
    if not line then
        ngx.log(ngx.ERR, "ff-defender: encode error: ", err)
        return
    end
    local fh, ferr = io.open(LOG_PATH, "a")
    if not fh then
        ngx.log(ngx.ERR, "ff-defender: cannot open log file ", LOG_PATH, ": ", ferr)
        return
    end
    fh:write(line, "\n")
    fh:close()
end

local function ua_blocked(ua)
    if not ua or ua == "" then
        return true, "empty_user_agent"
    end
    local lower = ua:lower()
    for _, kw in ipairs(UA_BLACKLIST) do
        if lower:find(kw, 1, true) then
            return true, "ua_blacklist:" .. kw
        end
    end
    return false, nil
end

local function is_login_path(path)
    for p, _ in pairs(LOGIN_PATHS) do
        if path == p or path:find(p, 1, true) == 1 then
            return true
        end
    end
    return false
end

-- ── Main request handler ──
local ip   = client_ip()
local ua   = ngx.var.http_user_agent or ""
local path = ngx.var.request_uri or ""
local method = ngx.var.request_method or "GET"

-- 1) UA blacklist check.
local blocked, why = ua_blocked(ua)
if blocked then
    log_block(why, ip, ua, path)
    return ngx.exit(429)
end

-- 2) GET method on login paths -> block
if method == "GET" and is_login_path(path) then
    log_block("login_get_method", ip, ua, path)
    return ngx.exit(429)
end

-- 3) Login endpoint rate limit
if is_login_path(path) and login_lim then
    local login_delay, login_err = login_lim:incoming(ip, true)
    if not login_delay then
        if login_err == "rejected" then
            log_block("login_rate_limit", ip, ua, path)
            ngx.header["Retry-After"] = "10"
            return ngx.exit(429)
        end
    end
end

-- 4) Per-IP rate limit.
local delay, rl_err = lim:incoming(ip, true)
if not delay then
    if rl_err == "rejected" then
        log_block("rate_limit", ip, ua, path)
        ngx.header["Retry-After"] = "1"
        return ngx.exit(429)
    end
    ngx.log(ngx.ERR, "ff-defender: limiter error: ", rl_err)
    return
end

if delay > 0 then
    ngx.sleep(delay)
end
