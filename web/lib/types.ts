/**
 * 核心数据契约 — 所有 Agent / Service 共享
 * 修改前请同步通知其他 Track。
 */
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// 1. Session & Scope
// ─────────────────────────────────────────────────────────────

export const ScopeSchema = z.object({
  allowedTargets: z.array(z.string()).default(['target', 'defender']),
  maxBandwidthMbps: z.number().int().positive().default(100),
  maxDurationSec: z.number().int().positive().default(120),
  maxRounds: z.number().int().positive().default(5),
  allowedStrategies: z.array(z.enum(['slowloris', 'http_flood', 'syn_flood', 'hulk_flood', 'slow_headers'])).default(['slowloris', 'http_flood'])
});
export type Scope = z.infer<typeof ScopeSchema>;

export const SessionStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'stopped']);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/** 列表页用的会话摘要(round/bestScore 由 playbooks/verifications 聚合得出) */
export interface SessionListItem {
  id: string;
  name: string;
  status: SessionStatus;
  round: number;
  maxRounds: number;
  bestScore: number;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────
// 2. BusinessProfile  (Analyzer Agent 输出)
// ─────────────────────────────────────────────────────────────

export const BusinessProfileSchema = z.object({
  summary: z.string().describe('一句话业务画像摘要'),
  protocols: z.object({
    tcp: z.number().min(0).max(1),
    udp: z.number().min(0).max(1),
    icmp: z.number().min(0).max(1),
    other: z.number().min(0).max(1)
  }),
  qpsBaseline: z.object({
    avg: z.number().nonnegative(),
    p99: z.number().nonnegative()
  }),
  topApis: z.array(z.object({
    path: z.string(),
    method: z.string(),
    ratio: z.number().min(0).max(1)
  })).max(10),
  tlsFingerprints: z.array(z.string()).max(5).optional(),
  userAgentDistribution: z.array(z.object({
    ua: z.string(),
    ratio: z.number().min(0).max(1)
  })).max(10),
  vulnerabilities: z.array(z.string()).describe('攻击者视角可利用的薄弱点')
});
export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;

// ─────────────────────────────────────────────────────────────
// 3. AttackPlaybook  (Attacker Agent 输出 / Worker 输入)
// ─────────────────────────────────────────────────────────────

export const StrategySchema = z.enum(['slowloris', 'http_flood', 'syn_flood', 'hulk_flood', 'slow_headers']);
export type Strategy = z.infer<typeof StrategySchema>;

// LLM 常把整数写成浮点(如 15.5),这里统一四舍五入后再校验,避免 ZodError 误降级。
const roundIfNumber = (v: unknown) => (typeof v === 'number' ? Math.round(v) : v);
const posInt = z.preprocess(roundIfNumber, z.number().int().positive());
const nonNegInt = z.preprocess(roundIfNumber, z.number().int().nonnegative());

export const AttackPlaybookSchema = z.object({
  id: z.string(),
  round: nonNegInt,
  intent: z.string().describe('本回合攻击意图,一句话'),
  strategy: StrategySchema,
  parameters: z.object({
    targetUrl: z.string().default('http://defender:8080'),
    targetEndpoints: z.array(z.string()).default(['/']),
    concurrentConnections: posInt.default(100),
    requestsPerSecond: posInt.optional(),
    sendIntervalMs: posInt.optional(),
    durationSec: posInt.default(30),
    userAgents: z.array(z.string()).default(['Mozilla/5.0']),
    headers: z.record(z.string(), z.string()).optional()
  }),
  expectedBypass: z.string().describe('预期如何绕过防御,用于事后复盘'),
  hypothesis: z.string().describe('攻击假设,例如:防御只看 IP 速率不看连接数')
});
export type AttackPlaybook = z.infer<typeof AttackPlaybookSchema>;

// ─────────────────────────────────────────────────────────────
// 4. VerificationResult  (Verifier Agent 输出)
// ─────────────────────────────────────────────────────────────

export const VerificationResultSchema = z.object({
  playbookId: z.string(),
  reachability: z.number().min(0).max(1).describe('靶机响应率,1=完全可达,0=完全不可达'),
  avgLatencyMs: z.number().nonnegative(),
  defenderTriggered: z.boolean(),
  defenderLatencyMs: z.number().nonnegative().nullable().describe('防御触发耗时,未触发为 null'),
  defenderRulesHit: z.array(z.string()).describe('命中的防御规则名称'),
  totalRequests: z.number().int().nonnegative(),
  blockedRequests: z.number().int().nonnegative(),
  businessImpact: z.enum(['none', 'low', 'medium', 'high']),
  score: z.number().min(0).max(100).describe('绕过得分,越高表示攻击越成功'),
  /** 防御日志证据状态: ok=日志正常, missing=文件存在但无本轮记录, error=日志读取失败 */
  logStatus: z.enum(['ok', 'missing', 'error']).default('ok').describe('防御日志证据状态'),
  /** 证据是否完整:日志读取失败/LLM降级时=false,报告需醒目标注 */
  evidenceComplete: z.boolean().default(true).describe('本回合证据是否完整')
});
export type VerificationResult = z.infer<typeof VerificationResultSchema>;

/**
 * 会话级执行元信息 —— 用于报告/UI 醒目标注"本轮是否走了降级路径"。
 * 消除"看起来通过但实际是 mock/fallback"的可信性问题(L4)。
 */
export interface SessionMeta {
  /** 真实 LLM 闭环,还是 mock 降级,mixed=部分 agent 降级 */
  llmMode: 'real' | 'mock' | 'mixed';
  /** PCAP 解析是否成功 */
  pcapStatus: 'ok' | 'failed';
  /** 本轮降级/回退次数(LLM 失败、队列失败、PCAP 失败等) */
  fallbackCount: number;
  /** 攻击执行是否走 mock(队列/Redis 不可用) */
  attackMode: 'real' | 'mock';
  /** 是否有回合证据不完整 */
  evidenceIncomplete: boolean;
}

// ─────────────────────────────────────────────────────────────
// 5. JudgeDecision  (Judge Agent 输出)
// ─────────────────────────────────────────────────────────────

export const JudgeDecisionSchema = z.object({
  verdict: z.enum(['continue', 'success', 'failed', 'stop']),
  reasoning: z.string().describe('决策推理过程'),
  nextIntent: z.string().nullable().describe('下一轮攻击意图,verdict=continue 时必填'),
  defenseWeaknesses: z.array(z.string()).describe('已发现的防御弱点'),
  recommendations: z.array(z.string()).describe('给防御团队的加固建议')
});
export type JudgeDecision = z.infer<typeof JudgeDecisionSchema>;

// ─────────────────────────────────────────────────────────────
// 6. Agent Trace  (供 UI 展示推理过程)
// ─────────────────────────────────────────────────────────────

export const AgentNameSchema = z.enum(['analyzer', 'attacker', 'verifier', 'judge']);
export type AgentName = z.infer<typeof AgentNameSchema>;

/** Agent 推理流条目(UI 与服务端共享,放此处避免 client bundle 误引 db) */
export interface ThinkingEntry {
  agent: AgentName;
  text: string;
}

/** 剧本库列表项 */
export interface PlaybookLibraryItem {
  playbook: AttackPlaybook;
  score: number;
  createdAt: string;
}

export interface AgentTrace {
  id: string;
  sessionId: string;
  round: number;
  agentName: AgentName;
  input: unknown;
  output: unknown;
  thinking?: string;
  durationMs: number;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────
// 7. SSE Event  (web ↔ client 实时推送)
// ─────────────────────────────────────────────────────────────

export type SSEEvent =
  | { type: 'session.started'; sessionId: string }
  | { type: 'agent.start'; agent: AgentName; round: number }
  | { type: 'agent.thinking'; agent: AgentName; round: number; chunk: string }
  | { type: 'agent.done'; agent: AgentName; round: number; output: unknown }
  | { type: 'profile.ready'; profile: BusinessProfile }
  | { type: 'playbook.ready'; playbook: AttackPlaybook }
  | { type: 'attack.metric'; round: number; ts: number; rps: number; blocked: number }
  | { type: 'verification.done'; result: VerificationResult }
  | { type: 'judge.decision'; decision: JudgeDecision }
  | { type: 'session.meta'; meta: SessionMeta }
  | { type: 'session.completed'; sessionId: string }
  | { type: 'session.stopped'; sessionId: string; reason: string }
  | { type: 'error'; message: string };

// ─────────────────────────────────────────────────────────────
// 8. Python Service Contracts  (web ↔ Python)
// ─────────────────────────────────────────────────────────────

/** POST {ANALYZER_URL}/analyze  multipart/form-data file=<pcap>  → BusinessProfile */
export const PCAP_ANALYZER_ENDPOINT = '/analyze';

/** BullMQ queue name for attack jobs (web → attacker-worker) */
export const ATTACK_QUEUE = 'attack-jobs';

export interface AttackJobData {
  sessionId: string;
  playbook: AttackPlaybook;
}

export interface AttackJobResult {
  playbookId: string;
  totalRequests: number;
  successfulRequests: number;
  blockedRequests: number;
  errors: number;
  avgLatencyMs: number;
  startedAt: string;
  finishedAt: string;
  rawMetrics: Array<{ ts: number; rps: number; blocked: number }>;
}
