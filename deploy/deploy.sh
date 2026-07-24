#!/usr/bin/env bash
# 在 VPS 上执行:把项目跑起来 + 推送 schema + 灌入种子数据。
# 前置:已 scp 整个项目到 /opt/ff,已写好 .env(或从 .env.production.example 复制并填值)。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
    echo "[deploy] ERROR: .env not found. Run:" >&2
    echo "  cp deploy/.env.production.example .env && \$EDITOR .env" >&2
    exit 1
fi

# 校验必填
. <(grep -E '^(AUTH_PASSWORD|AUTH_SECRET|DEEPSEEK_API_KEY|POSTGRES_PASSWORD)=' .env)
for var in AUTH_PASSWORD AUTH_SECRET DEEPSEEK_API_KEY POSTGRES_PASSWORD; do
    val="${!var:-}"
    if [[ -z "$val" || "$val" == REPLACE_ME* ]]; then
        echo "[deploy] ERROR: $var is empty or still placeholder. Edit .env first." >&2
        exit 1
    fi
done
if [[ ${#AUTH_SECRET} -lt 32 ]]; then
    echo "[deploy] ERROR: AUTH_SECRET must be at least 32 chars (use: openssl rand -hex 32)." >&2
    exit 1
fi

echo "[deploy] (1/4) Building & starting docker-compose stack..."
docker compose up -d --build

echo "[deploy] (2/4) Waiting for postgres..."
for i in $(seq 1 60); do
    if docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
        echo "  postgres ready"
        break
    fi
    sleep 2
    [[ $i -eq 60 ]] && { echo "[deploy] postgres did not become ready" >&2; exit 1; }
done

echo "[deploy] (3/4) Applying schema..."
SCHEMA_SQL="$ROOT_DIR/web/drizzle/0000_loving_union_jack.sql"
if [[ ! -f "$SCHEMA_SQL" ]]; then
    SCHEMA_SQL=$(ls -1 "$ROOT_DIR"/web/drizzle/0000_*.sql 2>/dev/null | head -1)
fi
if [[ -z "${SCHEMA_SQL:-}" || ! -f "$SCHEMA_SQL" ]]; then
    echo "[deploy] WARN: no migration SQL found in web/drizzle/" >&2
else
    docker compose exec -T postgres psql -U postgres -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null
    docker compose cp "$SCHEMA_SQL" postgres:/tmp/schema.sql
    docker compose exec -T postgres psql -U postgres -d "$POSTGRES_DB" -f /tmp/schema.sql
fi

echo "[deploy] (4/4) Health check..."
sleep 3
for i in $(seq 1 30); do
    if curl -fsS -o /dev/null http://127.0.0.1:3000/login 2>/dev/null; then
        echo "  web ready"
        break
    fi
    sleep 2
done

cat <<EOF

[deploy] Stack is up.
  Internal endpoint: http://127.0.0.1:3000  (only loopback, expose via nginx)
  Login password:    \$AUTH_PASSWORD (from .env)

Next steps:
  1) Configure nginx:    cp deploy/nginx-ff.conf /etc/nginx/sites-available/ff
                         ln -s /etc/nginx/sites-available/ff /etc/nginx/sites-enabled/
  2) IP whitelist:       edit allow/deny in /etc/nginx/sites-available/ff
  3) HTTPS cert:         certbot --nginx -d ff.yourdomain.com
  4) Reload:             nginx -t && systemctl reload nginx

Logs:
  docker compose logs -f web
  docker exec ff-defender tail -f /var/log/defender.log

Stop:
  docker compose down            # keep data
  docker compose down -v         # wipe data
EOF
