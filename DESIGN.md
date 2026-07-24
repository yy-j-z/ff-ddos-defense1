# 基于多 Agent 的 DDoS 防御自动化验证系统 — 设计文档

> 比赛项目 · v0.1 · 2026-05-27

---

## 1. 项目概述

### 1.1 背景

传统 DDoS 防御系统的有效性验证依赖人工渗透测试或预设攻击脚本,存在三个痛点:

1. **覆盖面有限**:人工只能想到已知攻击模式,难以覆盖新型变种
2. **反馈滞后**:一次测试到一次优化往往以周/月计
3. **缺乏针对性**:通用攻击脚本无法针对具体业务的流量特征做对抗

### 1.2 项目目标

构建一个由 LLM Agent 驱动的**闭环自检系统**,实现:

- 自动分析业务流量特征,生成针对性攻击方案
- 在隔离环境中执行攻击,验证防御系统响应
- 根据验证结果迭代优化攻击策略,沉淀可复用的"攻击-防御"剧本库

### 1.3 核心创新点

1. **业务感知的攻击生成**:Attacker Agent 基于真实业务画像构造对抗流量,而非通用模板
2. **多 Agent 协作闭环**:Analyzer → Attacker → Verifier → Judge 形成强化学习式优化循环
3. **可解释的攻防过程**:每个 Agent 的推理过程透明可审计,便于防御团队复盘加固

---

## 2. 系统架构

### 2.1 总体架构

```
                              浏览器 (HTTP / SSE)
                                    │
┌──────────────────────────────────────────────────────────┐
│            Next.js 全栈应用 (Web + API)                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Dashboard  │  │  Orchestr.   │  │  Agent Layer   │  │
│  │   (UI/SSE)  │  │  (自研状态机) │  │  (4 Agents)    │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
└──────────────────────────────────────────────────────────┘
     │            │            │            │            │
 SQL │      队列  │      HTTP   │     LLM     │            │
     ▼            ▼            ▼            ▼            │
┌────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐      │
│Postgres│  │  Redis  │  │  PCAP    │  │ DeepSeek │      │
│+pgvec  │  │ +BullMQ │  │ Analyzer │  │   API    │      │
└────────┘  └─────────┘  │ (Python) │  │ v4 flash │      │
                 │        └──────────┘  │  / pro   │      │
       消费 jobs │                      └──────────┘      │
                 ▼                                         │
          ┌──────────┐                                     │
          │ Attacker │ ◄───────────────────────────────────┘
          │  Worker  │   攻击流量 (DEFENDER_URL)
          │ (Python) │
          └──────────┘
                 │
                 ▼
          ┌──────────┐   反向代理 (放行)   ┌──────────┐
          │ Defender │ ─────────────────► │  Target  │
          │OpenResty │   限流/UA → 429    │  (nginx) │
          └──────────┘                    └──────────┘
                 │ /var/log/defender.log (JSON)
                 └──────► Verifier 读日志评分
                              隔离 Docker 网络 (attack-net)
```

### 2.2 模块划分

| 模块 | 技术 | 职责 |
|---|---|---|
| **Web/控制台** | Next.js 15 + Tailwind | 任务管理、可视化、SSE 推送 |
| **Orchestrator** | 自研状态机(`lib/orchestrator/graph.ts`) | 协调 Agent 执行流、Scope 校验、事件总线 |
| **Analyzer Agent** | openai SDK + DeepSeek v4-flash | 解读 PCAP 摘要,产出业务画像 |
| **Attacker Agent** | openai SDK + DeepSeek v4-flash | 生成参数化攻击剧本 (Playbook) |
| **Verifier Agent** | 规则引擎(无 LLM) | 评估攻击效果与防御响应、读防御日志 |
| **Judge Agent** | DeepSeek v4-pro + thinking | 综合评分、决策下一轮动作 |
| **PCAP Analyzer** | Python FastAPI + Scapy | PCAP 解析,产出结构化摘要 |
| **Attacker Worker** | Python + httpx/socket | 按 Playbook 执行 slowloris/http_flood/syn_flood |
| **Target** | nginx(catch-all 200) | 受保护的靶机 |
| **Defender** | OpenResty + Lua | 限流 + UA 黑名单,JSON 命中日志 |
| **LLM 解析** | jsonrepair + Zod | 宽容解析 LLM JSON,整数字段自动取整 |

---

## 3. 核心数据流

### 3.1 单回合执行流程

```
[用户上传PCAP]
      │
      ▼
[1] Analyzer Agent
   输入: PCAP摘要 (来自Python服务)
   输出: BusinessProfile { protocols, qps_baseline, tls_fingerprint, key_apis }
      │
      ▼
[2] Judge Agent  ──► 决定本轮攻击意图 (Intent)
   例: "绕过L7限流,模拟正常User-Agent的慢速请求"
      │
      ▼
[3] Attacker Agent
   输入: BusinessProfile + Intent + 历史Playbook (RAG)
   输出: AttackPlaybook (YAML)
      │
      ▼
[4] 安全网关 (Scope校验)
   ├─ 通过 → 执行
   └─ 超阈值 → 人工确认 / 拒绝
      │
      ▼
[5] Attacker Worker  执行攻击
      │
      ▼
[6] Verifier Agent  采集指标
   - 靶机可用性 (拨测)
   - 防御系统是否触发清洗
   - 业务延迟/丢包
      │
      ▼
[7] Judge Agent  评分 + 决策
   ├─ 攻击成功 → 沉淀Playbook,生成报告
   ├─ 攻击失败 → 调整策略,回到 [3]
   └─ 达到Budget → 终止
```

### 3.2 关键数据结构

**BusinessProfile** (Analyzer 输出):
```typescript
{
  sessionId: string,
  protocols: { tcp: 0.7, udp: 0.2, icmp: 0.1 },
  qpsBaseline: { avg: 1200, p99: 3500 },
  topApis: [{ path: "/api/login", method: "POST", ratio: 0.3 }],
  tlsFingerprint: "ja3:e7d705a3286e19ea42f587b344ee6865",
  clientDistribution: { regions: [...], uaDistribution: [...] }
}
```

**AttackPlaybook** (Attacker 输出, YAML):
```yaml
id: pb-2026-0527-001
intent: "L7 slow-rate bypass"
strategy: slowloris
parameters:
  concurrent_connections: 5000
  send_interval_ms: 10000
  user_agents:    # 模仿业务画像中的UA分布
    - "Mozilla/5.0 ..."
  target_endpoints:
    - "/api/login"
duration_sec: 60
expected_bypass: "limit by IP rate, since each conn is low-volume"
```

**VerificationResult** (Verifier 输出):
```typescript
{
  reachability: 0.45,        // 靶机响应率
  defenderTriggered: true,
  defenderLatencyMs: 8500,   // 清洗触发耗时
  businessImpact: "high",
  score: 72                  // 综合绕过得分 0-100
}
```

---

## 4. Agent 详细设计

### 4.1 Analyzer Agent

- **模型**: Claude Sonnet 4.6
- **输入预处理**: PCAP → Zeek/Scapy → 结构化摘要 (避免直接喂原始包给 LLM)
- **输出**: 用 Vercel AI SDK 的 `generateObject` + Zod Schema 约束
- **关键 Prompt 设计**: 强调"提取可被攻击者利用的业务特征",而非通用流量统计

### 4.2 Attacker Agent

- **模型**: Claude Sonnet 4.6 (代码/配置生成)
- **工具**:
  - `searchPlaybookDB(intent, profile)`: 向量检索相似场景历史剧本
  - `getDefenderKnowledge(mechanism)`: 查询已知防御机制 KB
- **输出约束**: 必须是符合 Schema 的 Playbook,不允许返回任意代码
- **多样性策略**: temperature=0.8,鼓励探索新组合

### 4.3 Verifier Agent

- **不使用 LLM**,纯规则引擎
- **数据源**:
  - 拨测: 简易 HTTP probe (Next.js API 内置)
  - 靶机指标: Docker stats / nginx access log
  - 防御侧: 解析模拟防御组件的日志
- **输出**: 多维度评分 + 原始指标

### 4.4 Judge Agent

- **模型**: Claude Opus 4.7 (启用 extended thinking)
- **职责**:
  1. 制定本轮攻击意图
  2. 评分上一轮结果
  3. 决定继续/调整/终止
- **状态保持**: 整个 Session 的历史保留在 context,便于跨回合推理

---

## 5. 技术栈

### 5.1 选型总览

| 层 | 技术 |
|---|---|
| 全栈框架 | Next.js 15 (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind + Recharts |
| Agent SDK | Vercel AI SDK (`ai`, `@ai-sdk/anthropic`) |
| 状态机 | LangGraph.js (或自研轻量版) |
| LLM | Claude Sonnet 4.6 / Opus 4.7 |
| ORM | Drizzle ORM |
| 数据库 | PostgreSQL 16 + pgvector |
| 队列 | Redis + BullMQ |
| 实时通信 | Server-Sent Events (SSE) |
| PCAP 解析 | Python + Scapy + PyShark + FastAPI |
| 攻击执行 | Python + Locust + Scapy + hping3 |
| 靶机 | nginx (Docker) |
| 容器编排 | Docker Compose |

### 5.2 docker-compose 结构

```yaml
services:
  web:                  # Next.js 主应用
  postgres:             # pgvector/pgvector:pg16
  redis:                # 队列 + 缓存
  pcap-analyzer:        # Python FastAPI
  attacker-worker:      # Python Worker (隔离网络)
  target:               # nginx 靶机
  defender:             # 模拟防御组件

networks:
  app-net:              # web/db/redis
  attack-net:           # attacker ↔ defender ↔ target (隔离)
```

---

## 6. 项目结构

```
ff/
├── docker-compose.yml
├── DESIGN.md
├── README.md
│
├── web/                          # Next.js 主应用
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── page.tsx          # 总览
│   │   │   ├── sessions/         # 会话管理
│   │   │   └── playbooks/        # 剧本库
│   │   └── api/
│   │       ├── sessions/         # CRUD
│   │       ├── agents/           # 各Agent调用入口
│   │       ├── stream/           # SSE推送
│   │       └── upload/           # PCAP上传
│   ├── lib/
│   │   ├── agents/
│   │   │   ├── analyzer.ts
│   │   │   ├── attacker.ts
│   │   │   ├── verifier.ts
│   │   │   └── judge.ts
│   │   ├── orchestrator/
│   │   │   ├── graph.ts          # LangGraph 状态机
│   │   │   └── scope.ts          # 安全网关
│   │   ├── db/
│   │   │   ├── schema.ts         # Drizzle schema
│   │   │   └── client.ts
│   │   └── queue/
│   │       └── attack-jobs.ts    # BullMQ
│   └── components/
│       ├── attack-timeline.tsx
│       ├── agent-thinking.tsx
│       └── playbook-viewer.tsx
│
├── services/
│   ├── analyzer/                 # Python: PCAP → Profile
│   │   ├── main.py               # FastAPI
│   │   ├── zeek_wrapper.py
│   │   └── Dockerfile
│   └── attacker/                 # Python: 执行Playbook
│       ├── worker.py             # 从Redis消费任务
│       ├── strategies/
│       │   ├── slowloris.py
│       │   ├── syn_flood.py
│       │   └── http_flood.py
│       └── Dockerfile
│
└── targets/
    ├── nginx.conf
    └── defender/                 # 简易防御模拟
        └── rules.lua             # OpenResty 限流脚本
```

---

## 7. 数据库 Schema

```typescript
// 会话
sessions: {
  id, name, status, scope: jsonb, budget, createdAt
}

// 业务画像 (Analyzer 输出)
profiles: {
  id, sessionId, data: jsonb, embedding: vector(1536)
}

// 攻击剧本
playbooks: {
  id, sessionId, round, intent, yaml: text,
  embedding: vector(1536), score: int, createdAt
}

// 验证结果
verifications: {
  id, playbookId, metrics: jsonb, score, defenderTriggered
}

// Agent 推理 trace (供 UI 展示)
agent_traces: {
  id, sessionId, agentName, input: jsonb, output: jsonb,
  thinking: text, durationMs, createdAt
}
```

---

## 8. 安全设计

### 8.1 网络隔离

- `attack-net` 与 `app-net` 完全隔离,attacker-worker 无法访问 Postgres/Redis
- 出口流量通过 Docker network 限制,只能打到 target 容器
- 所有攻击流量不出宿主机

### 8.2 Scope 强约束

每个 Session 必须绑定 Scope,Executor 执行前校验:
```typescript
{
  allowedTargets: ["target.attack-net"],  // 白名单
  maxBandwidthMbps: 100,
  maxDurationSec: 300,
  allowedStrategies: ["slowloris", "http_flood"]  // 禁用真实僵尸网络等
}
```

### 8.3 Kill Switch

- UI 提供"紧急停止"按钮,通过 Redis pub/sub 广播停止信号
- Verifier 检测到异常(如靶机彻底不可用)自动触发停止
- 超 Budget 自动终止

### 8.4 LLM 输出约束

- Attacker 输出强制 Zod Schema 校验,拒绝任意代码
- 所有工具调用 schema 化,Agent 无法执行未定义动作

---

## 9. 演示亮点 (面向评委)

### 9.1 实时攻防可视化
- **左面板**: Attacker 生成的 Playbook (YAML 实时渲染)
- **中央**: 流量曲线 + 防御响应时间线
- **右面板**: Verifier 评分仪表盘 + Judge 推理过程

### 9.2 Agent 推理透明化
- 利用 Claude extended thinking,把 Judge 的决策过程展示出来
- 每个 Agent 的输入/输出/耗时可点击查看

### 9.3 闭环优化演示
- 设计一个"3 回合通关"剧情:
  1. 第 1 回合: 简单 SYN flood → 被防御识别
  2. 第 2 回合: Judge 分析后改用慢速攻击 → 部分绕过
  3. 第 3 回合: 模仿业务 UA + 分布式低速 → 成功绕过
- 演示"系统越用越聪明"

### 9.4 Playbook 沉淀
- 成功的剧本进入向量库,下次同类业务直接复用

---

## 10. 开发计划 (1 周冲刺)

| Day | 任务 |
|---|---|
| D1 | 搭建 Next.js 骨架 + Docker Compose + DB Schema |
| D2 | Analyzer Agent + PCAP Analyzer (Python 服务) |
| D3 | Attacker Agent + Attacker Worker + 2 种攻击策略 |
| D4 | Verifier + Judge + Orchestrator 状态机 |
| D5 | Dashboard UI + SSE 实时推送 |
| D6 | 防御模拟组件 + 闭环联调 |
| D7 | Demo 剧情打磨 + 文档/PPT |

---

## 11. 风险与缓解

| 风险 | 缓解措施 |
|---|---|
| LLM 输出不稳定 | Zod Schema 强约束 + 失败重试 + Sonnet/Opus 降级 |
| 攻击流量外泄 | Docker 网络隔离 + Scope 白名单 + 防火墙规则 |
| Demo 时 API 限流 | 预生成关键 Agent 响应作为 fallback |
| 演示环境复杂度 | docker-compose 一键启动,准备演示录屏作为备份 |

---

## 12. 后续扩展方向

- 接入真实防御产品 API (而非模拟组件)
- 多 region 分布式压测节点
- 引入贝叶斯优化替代纯 LLM 决策,提升参数搜索效率
- Playbook 知识库开源,形成社区共建的攻防对抗样本集
