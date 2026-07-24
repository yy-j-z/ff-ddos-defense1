# 接口契约速查 (Track 0 产出)

> 各 Track 共用的接口约定。修改前必须同步其他 Track。

## 核心类型(TypeScript)
路径:`web/lib/types.ts`

| 类型 | 产出方 | 消费方 |
|---|---|---|
| `Scope` | Web 用户创建 Session | Orchestrator 校验 / Worker 校验 |
| `BusinessProfile` | Analyzer Agent(通过 PCAP Analyzer) | Attacker / Judge |
| `AttackPlaybook` | Attacker Agent | Attacker Worker (Python) / Verifier |
| `VerificationResult` | Verifier Agent | Judge / UI |
| `JudgeDecision` | Judge Agent | Orchestrator / UI |
| `AgentTrace` | 所有 Agent | UI (展示推理过程) |
| `SSEEvent` | Web API Route | UI 客户端 |
| `AttackJobData` / `AttackJobResult` | Web ↔ BullMQ ↔ Worker | — |

## 服务间通信

### Web ↔ PCAP Analyzer (Python)
- **URL**: `http://pcap-analyzer:8001/analyze`
- **方法**: POST multipart/form-data,字段名 `file`
- **响应**: JSON 符合 `BusinessProfileSchema`
- **环境变量**: `ANALYZER_URL`(web 端)

### Web ↔ Attacker Worker (Python)
- **方式**: Redis BullMQ
- **队列名**: `attack-jobs`(常量 `ATTACK_QUEUE`)
- **Job data**: `AttackJobData`
- **Job result**: `AttackJobResult`

### Web ↔ Defender (OpenResty)
- **攻击目标**: `http://defender:8080`(Worker 打这里)
- **日志路径**: `/var/log/defender.log`(JSON 行,字段 `ts,client_ip,reason,ua,path`)
- **Verifier 读取**: 通过 docker volume 共享,或 defender 暴露 `/_stats` API(Track D 决定)

## 环境变量
| 名称 | 用途 | 默认 |
|---|---|---|
| `DEEPSEEK_API_KEY` | LLM 凭证 | — |
| `DEEPSEEK_BASE_URL` | LLM 端点 | https://api.deepseek.com |
| `DATABASE_URL` | Postgres | postgres://postgres:dev@postgres:5432/ff |
| `REDIS_URL` | Redis | redis://redis:6379 |
| `ANALYZER_URL` | PCAP 服务 | http://pcap-analyzer:8001 |
| `DEFENDER_URL` | 攻击靶 | http://defender:8080 |
| `TARGET_URL` | 直连靶机 (Verifier 拨测) | http://target:80 |

## LLM 模型
- Judge(reasoning):`deepseek-v4-pro` + `thinking.enabled=true`
- 其他 Agent:`deepseek-v4-flash`
- 调用入口:`web/lib/llm/client.ts` 的 `generateObject({ tier, system, prompt, schema })`

## 数据库
- Drizzle schema:`web/lib/db/schema.ts`
- pgvector 维度:**1024**(DeepSeek embedding 不一定支持,留空即可,后续用 OpenAI/本地模型)
- 初始化:`db/init.sql` 由 Track D 提供(创建 vector 扩展)

## Track 边界(避免文件冲突)
| Track | 写入路径 |
|---|---|
| 0 (已完成) | `web/`(骨架)、`services/*/Dockerfile + main.py/worker.py 占位`、`CONTRACTS.md` |
| A (UI) | `web/app/`、`web/components/` |
| B (Agent) | `web/lib/agents/`、`web/lib/orchestrator/`、`web/app/api/` |
| C (Python) | `services/analyzer/main.py` 替换、`services/attacker/worker.py + strategies/` 新增 |
| D (Infra) | 根 `docker-compose.yml`、`targets/`、`db/`、`scripts/`、`.env.example`、根 `README.md` |
