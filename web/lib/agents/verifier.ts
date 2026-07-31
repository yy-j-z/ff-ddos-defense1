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

/** 防御日志证据状态: ok=日志正常读取, missing=无日志文件/无记录, error=读取出错 */
export type DefenderLogStatus = 'ok' | 'missing' | 'error';

export async function runVerifier(input: {
  playbook: AttackPlaybook;
  jobResult: AttackJobResult;
  defenderLogs?: string[];
  /** 日志读取状态: 缺失/出错时,绝不把"读不到日志"当作"防御未触发" */
  defenderLogStatus?: DefenderLogStatus;
  /** 良性基线平均延迟(ms) —— 有值则用它修正"绕过得分"的判定(L1 最小版) */
  baselineLatencyMs?: number | null;
}): Promise<VerificationResult> {
  const { playbook, jobResult, defenderLogs = [] } = input;
  const logStatus: DefenderLogStatus = input.defenderLogStatus ?? 'ok';
  const baselineLatencyMs = input.baselineLatencyMs ?? null;

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

  // ── 证据完整性:日志读不到 = 证据缺失,绝不当作"防御未触发" ──
  // 原先: readDefenderLogs 读不到 → [] → defenderTriggered=false → +40 分("绕过")
  // 这等于"日志挂了=攻击赢了",是逻辑漏洞(V2)。修正:
  //   logStatus=error/missing 时,无法证实"防御未触发",绕过分不成立。
  const evidenceComplete = logStatus === 'ok';
  const bypassCredible = !defenderTriggered && evidenceComplete;

  // 绕过加分:只有当防御日志证据完整且确认未触发时才成立。
  // 若提供了基线延迟(良性流量),还要求攻击平均延迟显著高于基线(>1.3x),
  // 否则"未触发"可能是普通合法请求 —— 消除"防御放行=攻击成功"的评分悖论(D1 最小修正)。
  let bypassBonus = 0;
  if (bypassCredible) {
    if (baselineLatencyMs && baselineLatencyMs > 0 && jobResult.avgLatencyMs < baselineLatencyMs * 1.3) {
      // 攻击未造成可观测劣化 —— 不构成"绕过攻击",不给加分
      bypassBonus = 0;
    } else {
      bypassBonus = 40;
    }
  }

  // 评分: reachability * 60 + (证据完整且未触发?40:0) - impactPenalty
  const rawScore = reachability * 60 + bypassBonus - impactPenalty;
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
    score,
    logStatus,
    evidenceComplete
  };
}
