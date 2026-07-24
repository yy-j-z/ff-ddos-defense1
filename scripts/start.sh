#!/usr/bin/env bash
# FF one-shot launcher. Brings up the full docker-compose stack and waits for the
# core services to become healthy before printing access info.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
    echo "[start.sh] ERROR: .env not found." >&2
    echo "  Copy the template first:  cp .env.example .env" >&2
    echo "  Then fill in DEEPSEEK_API_KEY and any overrides." >&2
    exit 1
fi

echo "[start.sh] Building and starting docker-compose stack..."
docker compose up -d --build

echo "[start.sh] Waiting for postgres..."
for i in $(seq 1 60); do
    if docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
        echo "  postgres ready"
        break
    fi
    sleep 2
    if [[ $i -eq 60 ]]; then
        echo "[start.sh] postgres did not become ready in time" >&2
        exit 1
    fi
done

echo "[start.sh] Waiting for redis..."
for i in $(seq 1 30); do
    if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
        echo "  redis ready"
        break
    fi
    sleep 1
done

echo "[start.sh] Waiting for web (http://localhost:3000)..."
for i in $(seq 1 60); do
    if curl -fsS -o /dev/null http://localhost:3000/ 2>/dev/null \
       || curl -fsS -o /dev/null http://localhost:3000/api/health 2>/dev/null; then
        echo "  web ready"
        break
    fi
    sleep 2
done

echo "[start.sh] Waiting for defender (http://localhost:8080/defender/health)..."
for i in $(seq 1 30); do
    if curl -fsS -o /dev/null http://localhost:8080/defender/health 2>/dev/null; then
        echo "  defender ready"
        break
    fi
    sleep 1
done

cat <<EOF

[start.sh] Stack is up. Service endpoints:
  Web console (Next.js)      http://localhost:3000
  Defender (OpenResty proxy) http://localhost:8080
  PCAP Analyzer (FastAPI)    http://localhost:8001
  Postgres                   localhost:5432  (db: \$POSTGRES_DB, user: postgres)
  Redis                      localhost:6379

Tail logs with:    docker compose logs -f web
Stop with:         docker compose down
EOF
