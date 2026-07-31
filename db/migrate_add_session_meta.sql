-- 增量迁移: sessions 表增加 meta 列(降级/证据标注, L4)
-- 服务器执行: docker compose exec -T postgres psql -U postgres -d ff -f - < db/migrate_add_session_meta.sql
-- (或: docker exec -i $(docker compose ps -q postgres) psql -U postgres -d ff < db/migrate_add_session_meta.sql)

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS meta jsonb;
