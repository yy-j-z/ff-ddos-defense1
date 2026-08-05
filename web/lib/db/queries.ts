/**
 * 服务端读取层 —— 供 Server Component 与 API Route 共用,单一数据源。
 */
import { db } from './client';
import { sessions, playbooks, verifications, profiles, agentTraces } from './schema';
import { desc, eq, asc } from 'drizzle-orm';
import type {
  SessionListItem,
  SessionStatus,
  BusinessProfile,
  AttackPlaybook,
  VerificationResult,
  JudgeDecision,
  AgentName,
  ThinkingEntry,
  PlaybookLibraryItem
} from '@/lib/types';

function fmt(d: Date): string {
  return new Date(d).toISOString().slice(0, 16).replace('T', ' ');
}

/** Dashboard 列表:聚合每个会话的回合数与攻击穿透分 */
export async function getSessionSummaries(): Promise<SessionListItem[]> {
  const [sess, pbs, vers] = await Promise.all([
    db.select().from(sessions).orderBy(desc(sessions.createdAt)).limit(100),
    db.select().from(playbooks),
    db.select().from(verifications)
  ]);
  const scoreByPb = new Map(vers.map((v) => [v.playbookId, v.score]));

  return sess.map((s) => {
    const mine = pbs.filter((p) => p.sessionId === s.id);
    const round = mine.reduce((m, p) => Math.max(m, p.round), 0);
    const bestScore = mine.reduce(
      (m, p) => Math.max(m, scoreByPb.get(p.id) ?? p.score ?? 0),
      0
    );
    const scope = (s.scope ?? {}) as { maxRounds?: number };
    return {
      id: s.id,
      name: s.name,
      status: s.status as SessionStatus,
      round,
      maxRounds: scope.maxRounds ?? 0,
      bestScore,
      createdAt: fmt(s.createdAt)
    };
  });
}

export interface SessionDetail {
  id: string;
  name: string;
  status: SessionStatus;
  maxRounds: number;
  createdAt: string;
  profile: BusinessProfile | null;
  playbooks: AttackPlaybook[];
  verifications: VerificationResult[];
  thinking: ThinkingEntry[];
  judge: JudgeDecision | null;
  metrics: Array<{ ts: number; rps: number; blocked: number }>;
  /** 执行元信息(降级/证据标注),L4 */
  meta: import('@/lib/types').SessionMeta | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 会话详情:把存库的 jsonb 还原成前端类型 */
export async function getSessionDetail(id: string): Promise<SessionDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!session) return null;

  const [profileRow] = await db.select().from(profiles).where(eq(profiles.sessionId, id)).limit(1);
  const pbRows = await db
    .select()
    .from(playbooks)
    .where(eq(playbooks.sessionId, id))
    .orderBy(asc(playbooks.round));
  const traceRows = await db
    .select()
    .from(agentTraces)
    .where(eq(agentTraces.sessionId, id))
    .orderBy(asc(agentTraces.createdAt));

  const pbIds = new Set(pbRows.map((p) => p.id));
  const allVers = await db.select().from(verifications);
  const verRows = allVers.filter((v) => pbIds.has(v.playbookId));

  const thinking: ThinkingEntry[] = traceRows
    .filter((t) => t.thinking)
    .map((t) => ({ agent: t.agentName as AgentName, text: t.thinking as string }));

  const judgeTrace = [...traceRows].reverse().find((t) => t.agentName === 'judge');
  const judge = (judgeTrace?.output as JudgeDecision | undefined) ?? null;

  // 提取 rawMetrics
  const metrics: Array<{ ts: number; rps: number; blocked: number }> = [];
  for (const v of verRows) {
    const m = v.metrics as Record<string, unknown> | undefined;
    if (m && Array.isArray(m.rawMetrics)) {
      metrics.push(...(m.rawMetrics as Array<{ ts: number; rps: number; blocked: number }>));
    }
  }

  const scope = (session.scope ?? {}) as { maxRounds?: number };

  return {
    id: session.id,
    name: session.name,
    status: session.status as SessionStatus,
    maxRounds: scope.maxRounds ?? 0,
    createdAt: fmt(session.createdAt),
    profile: (profileRow?.data as BusinessProfile | undefined) ?? null,
    playbooks: pbRows.map((p) => p.data as AttackPlaybook),
    verifications: verRows.map((v) => v.metrics as VerificationResult),
    thinking,
    judge,
    metrics,
    meta: (session.meta as import('@/lib/types').SessionMeta | null | undefined) ?? null
  };
}

/** 全局剧本库 */
export async function getPlaybookLibrary(): Promise<PlaybookLibraryItem[]> {
  const [pbs, vers] = await Promise.all([
    db.select().from(playbooks).orderBy(desc(playbooks.createdAt)).limit(200),
    db.select().from(verifications)
  ]);
  const scoreByPb = new Map(vers.map((v) => [v.playbookId, v.score]));
  return pbs.map((p) => ({
    playbook: p.data as AttackPlaybook,
    score: scoreByPb.get(p.id) ?? p.score ?? 0,
    createdAt: fmt(p.createdAt)
  }));
}
