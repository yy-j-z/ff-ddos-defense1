import { db } from '@/lib/db/client';
import { sessions, agentTraces, verifications, playbooks } from '@/lib/db/schema';
import { eq, desc, sql, asc } from 'drizzle-orm';
import { getSessionSummaries } from '@/lib/db/queries';
import { DashboardClient } from '@/components/dashboard/DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const sessionList = await getSessionSummaries();
  const sessionCount = sessionList.length;
  const runningCount = sessionList.filter((s) => s.status === 'running').length;

  // 运行中会话 ID
  const runningSessions = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.status, 'running'))
    .limit(20);
  const runningIds = runningSessions.map((s) => s.id);

  // 活跃 Agent
  const activeAgents: string[] = [];
  if (runningIds.length > 0) {
    const traces = await db
      .selectDistinct({ agentName: agentTraces.agentName })
      .from(agentTraces)
      .where(sql`${agentTraces.sessionId} IN ${runningIds}`);
    activeAgents.push(...traces.map((t) => t.agentName));
  }

  // 验证数据用于防御评分
  const allVers = await db.select().from(verifications);
  const avgScore =
    allVers.length > 0
      ? Math.round(allVers.reduce((sum, v) => sum + v.score, 0) / allVers.length)
      : 0;
  const avgReachability =
    allVers.length > 0
      ? allVers.reduce((sum, v) => sum + v.reachability, 0) / allVers.length
      : 0;
  const triggeredCount = allVers.filter((v) => v.defenderTriggered).length;

  // 按策略统计: 每种策略使用了多少次, 平均得分是多少
  const allPlaybooks = await db.select().from(playbooks);
  const strategyStats: Record<string, { count: number; totalScore: number }> = {};
  for (const pb of allPlaybooks) {
    const data = pb.data as { strategy?: string };
    const s = data.strategy ?? 'unknown';
    if (!strategyStats[s]) strategyStats[s] = { count: 0, totalScore: 0 };
    strategyStats[s].count++;
    strategyStats[s].totalScore += pb.score ?? 0;
  }

  // 趋势数据 — 按时间排序的最近验证记录，用于浮动图表
  const trendHistory = allVers.length > 0
    ? await db
        .select({
          score: verifications.score,
          reachability: verifications.reachability,
          defenderTriggered: verifications.defenderTriggered,
          createdAt: verifications.createdAt
        })
        .from(verifications)
        .orderBy(asc(verifications.createdAt))
        .limit(30)
    : [];

  return (
    <DashboardClient
      sessionCount={sessionCount}
      runningCount={runningCount}
      recentSessions={sessionList.slice(0, 10)}
      activeAgents={activeAgents}
      avgScore={avgScore}
      avgReachability={avgReachability}
      defenderTriggeredRatio={allVers.length > 0 ? triggeredCount / allVers.length : 0}
      strategyStats={strategyStats}
      trendHistory={trendHistory}
    />
  );
}
