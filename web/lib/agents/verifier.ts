/**
 * Verifier Agent —— 纯规则,不用 LLM
 * 综合 jobResult + defenderLogs 计算 VerificationResult
 */
import type { AttackPlaybook, AttackJobResult, VerificationResult } from '../types';

interface DefenderLogLine {
  ts?: number | string;
  client_ip?: string;
  reason?: string;
  rule?: string;
  ua?: string;
  path?: string;
}

export async function runVerifier(input: {
  playbook: AttackPlaybook;
  jobResult: AttackJobResult;
  defenderLogs?: string[];
}): Promise<VerificationResult> {
  const { playbook, jobResult, defenderLogs = [] } = input;

  const total = Math.max(jobResult.totalRequests, 1);
  const successful = jobResult.successfulRequests;
  const reachability = Math.min(1, Math.max(0, successful / total));

  // 解析 defender 日志(JSON 行)
  const parsedLogs: DefenderLogLine[] = [];
  for (const line of defenderLogs) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      parsedLogs.push(JSON.parse(trimmed));
    } catch {
      // 忽略非 JSON 行
    }
  }
  const rulesSet = new Set<string>();
  for (const log of parsedLogs) {
    const rule = log.rule ?? log.reason;
    if (rule) rulesSet.add(rule);
  }
  const defenderRulesHit = Array.from(rulesSet);
  const defenderTriggered = defenderRulesHit.length > 0 || jobResult.blockedRequests > 0;

  // 防御触发耗时:第一条日志的 ts 减去攻击开始时间
  let defenderLatencyMs: number | null = null;
  if (defenderTriggered && parsedLogs.length > 0) {
    const firstTs = parsedLogs
      .map((l) => (typeof l.ts === 'number' ? l.ts : l.ts ? Date.parse(String(l.ts)) : NaN))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)[0];
    const startedAtMs = Date.parse(jobResult.startedAt);
    if (Number.isFinite(firstTs) && Number.isFinite(startedAtMs)) {
      defenderLatencyMs = Math.max(0, firstTs - startedAtMs);
    }
  }

  // 业务影响档位 —— reachability 越低代表靶机被打挂得越厉害
  let businessImpact: VerificationResult['businessImpact'];
  if (reachability < 0.3) businessImpact = 'high';
  else if (reachability < 0.6) businessImpact = 'medium';
  else if (reachability < 0.9) businessImpact = 'low';
  else businessImpact = 'none';

  // 业务影响惩罚(攻击应该绕过防御而非打挂靶机)
  const impactPenalty =
    businessImpact === 'high' ? 25 : businessImpact === 'medium' ? 10 : businessImpact === 'low' ? 3 : 0;

  // 评分: reachability * 60 + (未触发?40:0) - impactPenalty
  const rawScore = reachability * 60 + (defenderTriggered ? 0 : 40) - impactPenalty;
  const score = Math.round(Math.min(100, Math.max(0, rawScore)));

  return {
    playbookId: playbook.id,
    reachability: Number(reachability.toFixed(3)),
    avgLatencyMs: Math.round(jobResult.avgLatencyMs),
    defenderTriggered,
    defenderLatencyMs,
    defenderRulesHit,
    totalRequests: jobResult.totalRequests,
    blockedRequests: jobResult.blockedRequests,
    businessImpact,
    score
  };
}
