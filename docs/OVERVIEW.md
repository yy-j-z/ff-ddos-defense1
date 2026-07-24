# FF — 项目概览

LLM 多 Agent 驱动的 **DDoS 防御自动化验证系统**:基于真实业务流量(PCAP),让 AI 扮演攻击方,对模拟防御网关发起闭环攻防,自动评估防御有效性,并沉淀可复用的攻击剧本。

> 详细设计见 [`DESIGN.md`](../DESIGN.md),接口契约见 [`CONTRACTS.md`](../CONTRACTS.md),部署见 [`README.md`](../README.md)。

---

## 一句话原理

上传一份流量样本 → AI 分析业务画像 → 生成针对性攻击 → 打模拟防火墙 → 打分 → AI 决定下一轮策略,循环直到成功绕过 / 防御有效 / 达到回合上限。

## 闭环流程

```
PCAP → Analyzer → 业务画像
                     │
        ┌────────────┤  每回合
        ▼            │
      Judge → 攻击意图 │
        ▲            ▼
        │        Attacker → 攻击剧本 → Worker 执行(真实流量)
        │            │
        └── Verifier ◄── 防御响应 / 可达性
              (评分 + 决策)
```

| Agent | 模型 | 职责 |
|---|---|---|
| **Analyzer** | deepseek-v4-flash | 从流量提取「可被利用」的业务画像 |
| **Attacker** | deepseek-v4-flash | 据画像 + 历史失败原因生成攻击剧本 |
| **Verifier** | 规则引擎(无 LLM) | 按可达性、防御触发、业务影响打分 |
| **Judge** | deepseek-v4-pro | 综合历史决定继续 / 成功 / 失败 / 终止 |

## 运行时架构

```
浏览器 ─(SSE)─ Web (Next.js:3000, 编排器 + 4 Agents)
                 │
     ┌───────────┼────────────┬──────────┐
   Postgres    Redis      PCAP Analyzer  DeepSeek
   +pgvector  (队列)      (FastAPI:8001)   API
                 │
          Attacker Worker (Python)
                 │ 攻击流量
          Defender (OpenResty:8080) ──反代──► Target (nginx)
          限流 + UA 黑名单              放行 200 / 拦截 429
```

## 技术栈

| 层 | 选型 |
|---|---|
| 全栈 | Next.js 15 + TypeScript + Tailwind |
| Agent | OpenAI SDK(兼容 DeepSeek)+ Zod |
| 数据 | PostgreSQL 16 + pgvector + Drizzle ORM |
| 队列 | Redis + BullMQ |
| 实时 | Server-Sent Events |
| PCAP 解析 | Python FastAPI + Scapy |
| 攻击执行 | Python(slowloris / http_flood / syn_flood 等) |
| 靶场 | nginx / OpenResty + Lua |

## 目录结构

```
├── db/                  建表 + 种子数据
├── samples/             演示用 PCAP + 生成脚本
├── targets/
│   ├── nginx.conf       靶机(catch-all 200)
│   └── defender/        防御网关(限流 + UA 黑名单 + JSON 日志)
├── services/
│   ├── analyzer/        PCAP 解析(FastAPI + Scapy)
│   └── attacker/        攻击执行 worker + 各策略
└── web/                 Next.js 全栈
    ├── app/api/         sessions / start / stream(SSE) / playbooks
    └── lib/
        ├── agents/      analyzer / attacker / verifier / judge
        ├── orchestrator/ 状态机 graph + scope 校验 + 事件总线
        ├── llm/         DeepSeek client + 宽容 JSON 解析
        ├── db/          Drizzle schema + 查询
        └── queue/       BullMQ 入队 / 轮询
```

## 快速开始

```bash
cp .env.example .env       # 填入 DEEPSEEK_API_KEY
bash scripts/start.sh      # 全 Docker 拉起
# 打开 http://localhost:3000 → 新建 Session → 上传 samples/ 里的 PCAP
```

本地混合开发模式见 [`README.md`](../README.md#快速开始)。

## 安全边界

- **网络隔离**:全 Docker 下 `attack-net` 设 `internal: true`,攻击流量不出宿主机;target 不暴露端口。
- **目标锁定**:编排器强制把攻击目标覆写为 `DEFENDER_URL`;attacker worker 独立二次校验目标白名单(`ATTACK_ALLOWED_HOSTS`),拒绝越界任务。
- **强度上限**:每秒请求数 / 并发连接 / 时长在 web 与 worker 两侧均有上限兜底(`ATTACK_MAX_*`)。
- **会话 Scope**:每个 Session 绑定允许策略 / 最大时长 / 回合上限,执行前校验并自动收敛。

## 端口

| 服务 | 地址 |
|---|---|
| Web 控制台 | http://localhost:3000 |
| Defender(攻击入口) | http://localhost:8080 |
| Target(靶机) | http://localhost:8090 |
| PCAP Analyzer | http://localhost:8001 |
| Postgres / Redis | 5432 / 6379 |
