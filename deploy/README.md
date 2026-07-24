# FF 部署指南(私有 VPS + Docker Compose + nginx 反代)

适用场景:把 FF 部署到一台你完全控制的 VPS,只允许少数白名单 IP 访问,带 HTTPS + 软件登录双层保护。

## 前置

- 一台 4C 8G(最低 2C 4G)Linux VPS,Ubuntu 22.04/24.04 推荐
- 一个域名,A 记录指向 VPS 公网 IP
- DeepSeek API Key
- 你的客户端公网 IP(`curl ifconfig.me` 在你本机查)

> 国内云厂商需要先确认 ICP 备案 + 与客服核实 AUP 是否允许"对内 DDoS 自检"。境外 VPS(Hetzner、Lightsail)无 ICP 烦恼。

## 1. VPS 初始化

```bash
# 以 root 登录 VPS
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx ufw curl
systemctl enable --now docker

# 防火墙
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## 2. 拷贝项目

在 Windows 本地:

```powershell
# 假设 VPS IP 是 1.2.3.4,SSH 用户是 root
scp -r D:/ff-main root@1.2.3.4:/opt/ff
```

或者:在 VPS 上 `git clone` 你的私有仓库到 `/opt/ff`。

## 3. 写 .env

```bash
cd /opt/ff
cp deploy/.env.production.example .env

# 生成 AUTH_SECRET
openssl rand -hex 32

# 编辑 .env,把所有 REPLACE_ME 改成真实值
$EDITOR .env
chmod 600 .env
```

必填:`DEEPSEEK_API_KEY`、`AUTH_PASSWORD`(登录密码)、`AUTH_SECRET`(cookie 签名,32 字节 hex)、`POSTGRES_PASSWORD`(改 `DATABASE_URL` 里的同步密码)。

## 4. 一键启动

```bash
bash deploy/deploy.sh
```

脚本会:
- 校验 .env 必填字段
- `docker compose up -d --build`
- 等 Postgres healthy
- `drizzle-kit push --force` 建表
- 探活 `127.0.0.1:3000/login`

## 5. nginx 反代 + IP 白名单

```bash
cp deploy/nginx-ff.conf /etc/nginx/sites-available/ff

# 编辑域名和白名单
$EDITOR /etc/nginx/sites-available/ff
#  - 把 ff.example.com 改成你的域名
#  - 取消 allow / deny all 注释,填入你的 IP
#  - 在 /etc/nginx/nginx.conf 的 http {} 块里加一行:
#    limit_req_zone $binary_remote_addr zone=ff_login:10m rate=5r/m;
#  - 取消 location /api/auth/login 里的 limit_req 注释

ln -s /etc/nginx/sites-available/ff /etc/nginx/sites-enabled/
nginx -t

# Let's Encrypt
certbot --nginx -d ff.yourdomain.com

systemctl reload nginx
```

## 6. 验证

- 你的白名单 IP 访问 `https://ff.yourdomain.com` → 跳到登录页 → 输 `AUTH_PASSWORD` → 进 Dashboard
- 其他 IP 访问 → 403
- 创建 Session,跑一轮闭环,看 `docker exec ff-defender tail -f /var/log/defender.log` 有没有 JSON 日志写入

## 常用运维

```bash
# 查 web 日志
docker compose logs -f web

# 查防御命中
docker exec ff-defender tail -f /var/log/defender.log

# 改了代码后
cd /opt/ff && git pull && docker compose up -d --build web

# 重置(清数据)
docker compose down -v && bash deploy/deploy.sh

# 备份数据库
docker exec ff-postgres pg_dump -U postgres ff | gzip > backup-$(date +%F).sql.gz
```

## 安全检查清单

- [ ] `.env` 是 `chmod 600`,且没有 commit 到仓库
- [ ] `AUTH_SECRET` 至少 32 字节随机
- [ ] `AUTH_PASSWORD` 不是字典词
- [ ] nginx 配置启用了 IP 白名单 + 登录限流
- [ ] HTTPS 证书已颁发(`curl -I https://...` 返回 200)
- [ ] `docker compose ps` 7 个服务全 running
- [ ] `ss -tlnp` 公网只有 22/80/443,没有 3000/5432/6379/8001/8080
- [ ] DeepSeek 余额监控

## 注意

这个项目会向 `DEFENDER_URL` 发真实攻击流量(slowloris/http_flood),全部限制在 `attack-net`(internal: true)Docker 网络内,不出宿主机。但 Defender(OpenResty)和 Target(nginx)依然会消耗 VPS 的 CPU 和内存,留出余量。
