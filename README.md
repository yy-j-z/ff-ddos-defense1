# FF — 基于多 Agent 的 DDoS 防御自动化验证系统

LLM Agent 驱动的闭环攻防自检系统:**Analyzer → Attacker → Verifier → Judge** 四个 Agent 协作,基于真实业务流量(PCAP)迭代生成、执行并评估攻击剧本,自动化验证 DDoS 防御系统的有效性,并沉淀可复用的攻击剧本库。

完整架构与设计见 [`DESIGN.md`](./DESIGN.md);接口契约见 [`CONTRACTS.md`](./CONTRACTS.md)。

---

## 闭环流程

```
PCAP ──► Analyzer ──► BusinessProfile
                          │
            ┌─────────────┤  (每回合)
            ▼             │
         Judge ──► 攻击意图 Intent
            ▲             │
            │             ▼
            │         Attacker ──► AttackPlaybook
            │             │
            │             ▼
            │      Attacker Worker ──► 攻击 Defender(真实流量)
            │             │
            │             ▼
            └──── Verifier ◄── 防御响应 / 可达性指标
                  (评分 + 决策:继续/成功/失败/停止)
```

- **Analyzer**(deepseek-v4-flash):从 PCAP 摘要提取「可被攻击者利用」的业务画像
- **Attacker**(deepseek-v4-flash):据画像 + 历史失败原因生成针对性攻击剧本
- **Verifier**(规则引擎,无 LLM):按可达性、防御触发、业务影响打分
- **Judge**(deepseek-v4-pro + thinking):综合历史决定下一轮策略或终止

---

## 系统架构

运行时组件与数据流(本地混合模式为例):

```
                    浏览器
                      │ HTTP / SSE
                      ▼
        ┌──────────────────────────────┐
        │     Web (Next.js :3000)       │
        │  Dashboard · API Routes        │
        │  Orchestrator 状态机 + 4 Agents│
        └──────────────────────────────┘
          │          │           │            │
     SQL  │    队列  │    HTTP    │   LLM       │
          ▼          ▼           ▼            ▼
   ┌──────────┐ ┌────────┐ ┌────────────┐ ┌────────────┐
   │ Postgres │ │ Redis  │ │PCAP Analyzer│ │  DeepSeek  │
   │ +pgvector│ │(BullMQ)│ │(FastAPI:8001)│ │   API      │
   │  :5432   │ │ :6379  │ │   Scapy     │ │ (v4 flash/ │
   └──────────┘ └────────┘ └────────────┘ │   pro)     │
                     │                      └────────────┘
                     │ 消费 attack-jobs
                     ▼
              ┌───────────────┐
              │Attacker Worker│  slowloris / http_flood / syn_flood
              │   (Python)    │
              └───────────────┘
                     │ 攻击流量(DEFENDER_URL)
                     ▼
              ┌───────────────┐   反向代理    ┌──────────────┐
              │   Defender    │ ────────────► │  Target      │
              │ OpenResty:8080│   放行 200    │ nginx :8090  │
              │ 限流+UA黑名单 │   拦截 429    │ catch-all 200│
              └───────────────┘               └──────────────┘
                     │ /var/log/defender.log(JSON)
                     └──────────► Verifier(读防御日志评分)
```

**职责分层**

| 层 | 组件 | 说明 |
|---|---|---|
| 控制面 | Web Dashboard | 任务管理、SSE 实时可视化 |
| 编排 | Orchestrator(`lib/orchestrator/graph.ts`) | 状态机驱动单回合流程、Scope 校验、事件总线 |
| 智能体 | Analyzer / Attacker / Verifier / Judge | 决策与生成,实际网络动作下放到工具层 |
| 工具/服务 | PCAP Analyzer · Attacker Worker | Python 服务:解析流量、执行攻击 |
| 数据 | Postgres+pgvector · Redis | 会话/剧本/画像/trace 持久化、任务队列 |
| 靶场 | Defender(OpenResty)· Target(nginx) | 模拟防御网关 + 受保护业务 |

> 全 Docker 模式下,`target` 与 `attacker-worker` 仅位于内部网络 `attack-net`(`internal: true`),攻击流量不出宿主机。详见 [`DESIGN.md`](./DESIGN.md) §2 与 §8。

## 技术栈

| 层 | 选型 |
|---|---|
| 全栈 | Next.js 15 (App Router) + TypeScript + Tailwind |
| Agent | Vercel `openai` SDK(兼容 DeepSeek)+ Zod + jsonrepair |
| 数据库 | PostgreSQL 16 + pgvector + Drizzle ORM |
| 队列 | Redis + BullMQ(web 端)/ 直连 Redis 消费(Python worker) |
| 实时 | Server-Sent Events |
| PCAP 解析 | Python FastAPI + Scapy |
| 攻击执行 | Python + httpx/socket(slowloris / http_flood / syn_flood) |
| 靶机 / 防御 | nginx / OpenResty + Lua(限流 + UA 黑名单) |

---

## 快速开始

LLM 走 DeepSeek(OpenAI 兼容协议)。两种运行方式任选其一。

### 方式 A:本地混合(推荐开发用)

有状态服务用 Docker,web 与 Python 服务本地原生跑,热重载方便调试。

前置:Node 20+、Python 3.12+、Docker Desktop。

```bash
# 1) 有状态依赖(Docker)
docker run -d --name ff-postgres -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=ff -p 5432:5432 pgvector/pgvector:pg16
docker run -d --name ff-redis -p 6379:6379 redis:7-alpine

# 2) 靶机 + 防御(同一 docker 网络,defender 反代 target)
docker network create ff-net
docker run -d --name ff-target --network ff-net --network-alias target \
  -v "$PWD/targets/nginx.conf:/etc/nginx/nginx.conf:ro" -p 8090:80 nginx:alpine
docker build -t ff-defender ./targets/defender
docker run -d --name ff-defender --network ff-net -p 8080:8080 ff-defender

# 3) Web(Next.js)
cd web
cp .env.local.example .env.local   # 填入 DEEPSEEK_API_KEY(见下方环境变量)
npm install --legacy-peer-deps
npx drizzle-kit push --force         # 建表
docker exec -i ff-postgres psql -U postgres -d ff < ../db/seed.sql   # 灌入演示数据(可选)
npm run dev                          # http://localhost:3000

# 4) Python 服务(各开一个终端)
cd services/analyzer && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
REDIS_URL=redis://localhost:6379 .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001

cd services/attacker && python3 -m venv .venv && .venv/bin/pip install httpx redis pyyaml
REDIS_URL=redis://localhost:6379 PYTHONPATH=. .venv/bin/python worker.py
```

> Python 服务可选:若未启动,orchestrator 会自动用占位摘要 / mock 攻击结果降级,demo 仍可跑通。

### 方式 B:全 Docker

```bash
cp .env.example .env        # 填入 DEEPSEEK_API_KEY
bash scripts/start.sh       # 构建并拉起全部服务
```

---

## 环境变量

| 名称 | 说明 | 本地默认 |
|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek 密钥(必填) | — |
| `DEEPSEEK_BASE_URL` | LLM 端点 | `https://api.deepseek.com` |
| `DATABASE_URL` | Postgres | `postgres://postgres:dev@localhost:5432/ff` |
| `REDIS_URL` | Redis | `redis://localhost:6379` |
| `ANALYZER_URL` | PCAP 分析服务 | `http://localhost:8001` |
| `DEFENDER_URL` | 攻击目标(防御入口) | `http://localhost:8080` |
| `TARGET_URL` | 直连靶机(拨测) | `http://localhost:8090` |

本地模式写入 `web/.env.local`;全 Docker 模式写入根目录 `.env`(服务名替代 localhost)。

---

## 端口

| 服务 | 地址 | 说明 |
|---|---|---|
| Web 控制台 | http://localhost:3000 | Dashboard,可视化与任务管理 |
| Defender(OpenResty) | http://localhost:8080 | 防御网关,攻击入口,反代 target |
| Target(nginx) | http://localhost:8090 | 靶机(全 Docker 模式下不暴露) |
| PCAP Analyzer | http://localhost:8001 | Scapy 解析服务 |
| Postgres | localhost:5432 | pgvector |
| Redis | localhost:6379 | 队列 + 缓存 |

防御行为(可手工验证):
```bash
curl -A "Mozilla/5.0" http://localhost:8080/api/products   # 200 — 放行
curl -A "curl/8.0"    http://localhost:8080/api/products   # 429 — UA 黑名单拦截
# 高频请求触发速率限制(100 req/s per IP)→ 429
```
靶机对任意路径/方法返回 200,因此「可达性」反映的是**防御是否放行**,而非应用路由是否存在——契合 DDoS 防御验证语义。

---

## 使用

1. 打开 http://localhost:3000 → **新建 Session**
2. 上传 PCAP(仓库 `samples/` 提供 4 个场景:`ecommerce` / `api-gateway` / `login-heavy` / `mixed-protocol`),设置 Scope(回合数、时长、允许策略)
3. 进入详情页观察实时闭环:左栏 Playbook 时间线、中栏攻防流量曲线 + Agent 推理流、右栏 Verifier 评分 + Judge 决策(SSE 实时推送)
4. 成功剧本沉淀到 **Playbook 库**,供后续会话作 RAG 参考

重新生成样本 PCAP:`services/analyzer/.venv/bin/python samples/gen_samples.py`

---

## 目录结构

```
ff/
├── DESIGN.md / CONTRACTS.md       # 设计文档 / 接口契约
├── docker-compose.yml             # 全 Docker 编排
├── .env.example                   # 全 Docker 环境变量模板
├── db/
│   ├── init.sql                   # pgvector 扩展(建表前)
│   └── seed.sql                   # 演示种子数据(迁移后执行)
├── scripts/start.sh               # 一键启动(全 Docker)
├── samples/                       # 演示用 PCAP + 生成脚本
├── targets/
│   ├── nginx.conf                 # 靶机(catch-all 200 + JSON access log)
│   └── defender/                  # OpenResty:限流 + UA 黑名单 + JSON 日志
└── web/                           # Next.js 全栈
    ├── app/dashboard/             # 总览 / 新建 / 详情 / 剧本库
    ├── app/api/                   # sessions / start / stream(SSE) / playbooks
    └── lib/
        ├── agents/                # analyzer / attacker / verifier / judge
        ├── orchestrator/          # 状态机 graph + scope 校验 + 事件总线
        ├── llm/                   # DeepSeek client + 宽容 JSON 解析
        ├── db/                    # Drizzle schema + 查询层
        └── queue/                 # BullMQ 入队 / 结果轮询
```

---

## 关键日志

```bash
# 防御命中日志(Verifier 数据源):JSON 行 {ts, client_ip, reason, ua, path}
docker exec ff-defender tail -f /var/log/defender.log
# 靶机访问日志(JSON 行)
docker logs -f ff-target
# 攻击 worker
# —— 本地模式看 worker 终端输出;Docker 模式 docker logs -f ff-attacker-worker
```

---

## 安全边界

- 全 Docker 模式下 `attack-net` 设 `internal: true`,攻击流量无法出宿主机;target 不暴露端口
- Orchestrator 强制把攻击目标覆写为 `DEFENDER_URL`,LLM 无法指定任意目标
- 每个 Session 绑定 Scope(允许策略 / 最大时长 / 回合上限),执行前校验并自动收敛

---

## 常见问题

**Q: `npm install` 报 peer 依赖冲突?**
A: 用 `npm install --legacy-peer-deps`(React 19 相关)。

**Q: 攻击全部 error / 可达率恒为 0?**
A: 确认 `DEFENDER_URL` 指向可达地址(本地为 `http://localhost:8080`),且 defender/target 容器在运行。本地运行的 worker 无法解析 docker 服务名 `defender`。

**Q: Agent 总是降级到 mock?**
A: 检查 `DEEPSEEK_API_KEY` 是否有效;`deepseek-v4-flash` / `deepseek-v4-pro` 是否可用。LLM 返回的不规整 JSON 由 `jsonrepair` 兜底,浮点整数字段会自动取整。

**Q: defender 启动报 `lua-resty-limit-req` not found?**
A: `openresty/openresty:alpine` 已自带该模块。

**Q: 改了 `targets/nginx.conf` 后 reload 报语法错误?**
A: Docker Desktop(macOS)bind mount 偶发同步截断,`docker restart ff-target` 强制重读完整文件即可。

---

## 停止 / 清理

```bash
# 本地混合模式
docker rm -f ff-postgres ff-redis ff-target ff-defender
docker network rm ff-net

# 全 Docker 模式
docker compose down       # 保留数据卷
docker compose down -v    # 同时清理数据
```
