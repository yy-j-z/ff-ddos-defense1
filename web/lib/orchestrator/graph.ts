/**
 * Orchestrator —— 简单状态机(不依赖 LangGraph)
 *
 * 执行流:
 *  1. session.started
 *  2. 调用 PCAP Analyzer (Python) → 取得 pcapSummary
 *  3. Analyzer Agent 加工 → BusinessProfile (yield agent.start/done + profile.ready)
 *  4. 循环 1..maxRounds:
 *      Judge 给 intent (round=1 时初始 intent;否则基于历史)
 *      Attacker 生成 Playbook → playbook.ready
 *      Scope 校验/收敛
 *      enqueueAttack → waitForAttack(期间 mock 推 attack.metric)
 *      Verifier 评分 → verification.done
 *      Judge 决策 → judge.decision
 *      落库
 *      verdict ∈ {success, failed, stop} 则 break
 *  5. session.completed
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import type {
  AttackPlaybook,
  BusinessProfile,
  JudgeDecision,
  Scope,
  SSEEvent,
  VerificationResult,
  AgentName
} from '../types';
import { runAnalyzer } from '../agents/analyzer';
import { runAttacker } from '../agents/attacker';
import { runVerifier } from '../agents/verifier';
import { runJudge } from '../agents/judge';
import { isMockMode } from '../agents/mock';
import { enqueueAttack, waitForAttack } from '../queue/attack-queue';
import { clampPlaybookToScope, checkPlaybookScope } from './scope';
import { db } from '../db/client';
import { sessions, profiles, playbooks as playbooksTable, verifications, agentTraces } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import { sessionBus } from './bus';
import { embedText, playbookToEmbeddingText, profileToEmbeddingText } from '../rag/embeddings';
import { searchSimilarPlaybooks, type RagResult } from '../rag/search';

interface RunSessionOpts {
  sessionId: string;
  pcapBuffer: Buffer;
  pcapFilename?: string;
  scope: Scope;
}

// ─────────────────────────────────────────────────────────────
// PCAP Analyzer 调用
// ─────────────────────────────────────────────────────────────
async function callPcapAnalyzer(buffer: Buffer, filename = 'capture.pcap'): Promise<unknown> {
  const url = (process.env.ANALYZER_URL ?? process.env.PCAP_ANALYZER_URL ?? 'http://pcap-analyzer:8001') + '/analyze';
  try {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: 'application/octet-stream' }), filename);
    const resp = await fetch(url, { method: 'POST', body: form });
    if (!resp.ok) throw new Error(`pcap-analyzer ${resp.status}`);
    return await resp.json();
  } catch (err) {
    console.warn('[orchestrator] pcap-analyzer 不可达,使用最小占位摘要:', (err as Error).message);
    return {
      note: 'pcap-analyzer unreachable, using stub summary',
      packets: 0
    };
  }
}

// ─────────────────────────────────────────────────────────────
// 工具:跑一个 Agent,自动记 trace + 计时
// ─────────────────────────────────────────────────────────────
async function withTrace<T extends { thinking?: string }>(
  sessionId: string,
  round: number,
  agentName: AgentName,
  input: unknown,
  fn: () => Promise<T>,
  extractOutput: (result: T) => unknown
): Promise<T> {
  const startedAt = Date.now();
  let result: T;
  try {
    result = await fn();
  } catch (err) {
    await db
      .insert(agentTraces)
      .values({
        sessionId,
        round,
        agentName,
        input: input as object,
        output: { error: (err as Error).message },
        thinking: null,
        durationMs: Date.now() - startedAt
      })
      .catch(() => {});
    throw err;
  }
  const durationMs = Date.now() - startedAt;
  await db
    .insert(agentTraces)
    .values({
      sessionId,
      round,
      agentName,
      input: input as object,
      output: extractOutput(result) as object,
      thinking: result.thinking ?? null,
      durationMs
    })
    .catch((err) => console.warn('[trace] 落库失败', err));
  return result;
}

// ─────────────────────────────────────────────────────────────
// Mock attack worker —— Redis/worker 不可用时直接合成结果
// ─────────────────────────────────────────────────────────────
function mockAttackJobResult(playbook: AttackPlaybook) {
  const total = Math.max(50, (playbook.parameters.requestsPerSecond ?? 30) * playbook.parameters.durationSec);
  // 按 round 演进:1=惨败,2=部分成功,3=大成功
  const successRatio = playbook.round <= 1 ? 0.15 : playbook.round === 2 ? 0.55 : 0.92;
  const successful = Math.round(total * successRatio);
  const startedAt = new Date(Date.now() - playbook.parameters.durationSec * 1000).toISOString();
  return {
    playbookId: playbook.id,
    totalRequests: total,
    successfulRequests: successful,
    blockedRequests: total - successful,
    errors: 0,
    avgLatencyMs: 120 + playbook.round * 40,
    startedAt,
    finishedAt: new Date().toISOString(),
    rawMetrics: Array.from({ length: 6 }, (_, i) => ({
      ts: Date.now() - (5 - i) * 1000,
      rps: Math.round((total / playbook.parameters.durationSec) * (0.8 + Math.random() * 0.4)),
      blocked: Math.round(((total * (1 - successRatio)) / 6) * (0.6 + Math.random() * 0.8))
    }))
  };
}

function mockDefenderLogs(playbook: AttackPlaybook): string[] {
  if (playbook.round <= 1) {
    return [
      JSON.stringify({ ts: Date.now() - 8000, rule: 'syn_flood_threshold', reason: 'SYN rate > 1000/s', client_ip: '10.0.0.1' }),
      JSON.stringify({ ts: Date.now() - 6000, rule: 'syn_flood_threshold', reason: 'SYN rate > 1000/s', client_ip: '10.0.0.2' })
    ];
  }
  if (playbook.round === 2) {
    return [
      JSON.stringify({ ts: Date.now() - 12000, rule: 'slow_connection', reason: 'idle > 8s', client_ip: '10.0.0.3' })
    ];
  }
  return []; // round 3 没触发防御
}

// ─────────────────────────────────────────────────────────────
// 真实防御日志读取 —— 从共享卷读取 defender 容器写入的 /var/log/defender.log
// (defender 的 rules.lua 在每次拦截时追加一行 JSON;nginx.conf 已将该卷挂到 /var/log)
// ─────────────────────────────────────────────────────────────
function parseUtime(s: string): number {
  // ngx.utctime() 输出形如 "2026-07-21 05:23:10"(UTC),补成 ISO 再解析
  const iso = s.trim().replace(' ', 'T') + 'Z';
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

function readDefenderLogs(sinceTs?: number): string[] {
  const logPath = process.env.DEFENDER_LOG_PATH ?? '/var/log/defender/defender.log';
  try {
    const content = readFileSync(logPath, 'utf8');
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    // 只取本轮攻击开始之后的拦截记录(留 2s 缓冲)
    const since = sinceTs && Number.isFinite(sinceTs) ? sinceTs - 2000 : 0;
    const out: string[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as { ts?: number | string };
        const ts = typeof obj.ts === 'number' ? obj.ts : parseUtime(String(obj.ts ?? ''));
        if (since && Number.isFinite(ts) && ts < since) continue;
        out.push(line);
      } catch {
        // 跳过非 JSON 行
      }
    }
    return out;
  } catch (err) {
    // 读不到日志(卷未挂载/文件尚未生成)= 视为防御未触发,绝不回退到假数据
    console.warn('[orchestrator] 读取防御日志失败(按未触发处理):', (err as Error).message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────
export async function* runSession(opts: RunSessionOpts): AsyncIterable<SSEEvent> {
  const { sessionId, pcapBuffer, pcapFilename, scope } = opts;

  // 标记 running
  await db.update(sessions).set({ status: 'running', updatedAt: new Date() }).where(eq(sessions.id, sessionId)).catch(() => {});

  yield { type: 'session.started', sessionId };

  // === 1) PCAP 摘要 ===
  const pcapSummary = await callPcapAnalyzer(pcapBuffer, pcapFilename);

  // === 2) Analyzer Agent ===
  yield { type: 'agent.start', agent: 'analyzer', round: 0 };
  const analyzerOut = await withTrace(
    sessionId,
    0,
    'analyzer',
    { pcapSummary },
    () => runAnalyzer({ pcapSummary: pcapSummary as object | string }),
    (r) => r.profile
  );
  const profile: BusinessProfile = analyzerOut.profile;
  if (analyzerOut.thinking) {
    yield { type: 'agent.thinking', agent: 'analyzer', round: 0, chunk: analyzerOut.thinking };
  }
  yield { type: 'agent.done', agent: 'analyzer', round: 0, output: profile };
  yield { type: 'profile.ready', profile };

  // 落库 profile
  await db
    .insert(profiles)
    .values({ sessionId, data: profile as unknown as object })
    .catch((err) => console.warn('[profile] 落库失败', err));

  // ─── RAG: 基于业务画像搜索相似历史策略 ───
  let ragPlaybooks: RagResult[] = [];
  try {
    const queryText = profileToEmbeddingText(profile);
    const queryVec = await embedText(queryText);
    if (queryVec) {
      ragPlaybooks = await searchSimilarPlaybooks(queryVec, 3, 50);
      if (ragPlaybooks.length > 0) {
        console.log(`[rag] 找到 ${ragPlaybooks.length} 个相似历史策略`);
      }
    }
  } catch (err) {
    console.warn('[rag] 搜索失败，跳过:', (err as Error).message?.slice(0, 100));
  }

  // === 3) 多回合循环 ===
  const history: Array<{ playbook: AttackPlaybook; result: VerificationResult }> = [];
  const maxRounds = scope.maxRounds;
  let finalVerdict: JudgeDecision['verdict'] = 'continue';
  let currentIntent = '试探防御阈值,获取基线响应';

  for (let round = 1; round <= maxRounds; round++) {
    // ─── 3.1 Attacker 生成 Playbook ───
    yield { type: 'agent.start', agent: 'attacker', round };
    const attackerOut = await withTrace(
      sessionId,
      round,
      'attacker',
      { profile, intent: currentIntent, round, history: history.map((h) => h.playbook) },
      () =>
        runAttacker({
          profile,
          intent: currentIntent,
          round,
          allowedStrategies: scope.allowedStrategies,
          previousPlaybooks: history.map((h) => h.playbook),
          previousResults: history.map((h) => h.result),
          ragReferences: ragPlaybooks
        }),
      (r) => r.playbook
    );
    let playbook = attackerOut.playbook;

    // 强制攻击目标为真实 defender —— LLM 常编造 targetUrl(如 target.example.com),
    // 且本地运行时 worker 无法解析 docker 服务名,这里统一覆写为可达地址。
    const forcedTarget = process.env.DEFENDER_URL ?? 'http://defender:8080';
    playbook = { ...playbook, parameters: { ...playbook.parameters, targetUrl: forcedTarget } };

    // Scope 收敛(strategy / duration);把强制目标的 host 加入白名单避免误报
    let forcedHost = 'defender';
    try {
      forcedHost = new URL(forcedTarget).hostname;
    } catch {
      /* keep default */
    }
    const effScope = { ...scope, allowedTargets: [...scope.allowedTargets, forcedHost] };
    const check = checkPlaybookScope(playbook, effScope);
    if (!check.ok) {
      console.warn('[scope] 违规,自动收敛', check.violations);
      playbook = clampPlaybookToScope(playbook, scope);
    }
    if (attackerOut.thinking) {
      yield { type: 'agent.thinking', agent: 'attacker', round, chunk: attackerOut.thinking };
    }
    yield { type: 'agent.done', agent: 'attacker', round, output: playbook };
    yield { type: 'playbook.ready', playbook };

    // 落库 playbook
    let playbookRowId: string | undefined;
    try {
      const [row] = await db
        .insert(playbooksTable)
        .values({
          sessionId,
          round,
          intent: playbook.intent,
          strategy: playbook.strategy,
          yaml: YAML.stringify(playbook),
          data: playbook as unknown as object
        })
        .returning({ id: playbooksTable.id });
      playbookRowId = row?.id;
    } catch (err) {
      console.warn('[playbook] 落库失败', err);
    }

    // ─── 3.2 入队执行 + 实时指标推送 ───
    let jobResult;
    let metricsDone = false;
    const startMetricTs = Date.now();

    // 后台任务:在攻击执行期间持续向 bus 推送实时指标
    const realtimeMetricsTask = (async () => {
      const deadline = Date.now() + playbook.parameters.durationSec * 1000 + 5000;
      while (!metricsDone && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1000));
        if (metricsDone) break;
        // 实时模拟指标(真实 Worker 执行时会覆盖)
        const elapsed = Math.round((Date.now() - startMetricTs) / 1000);
        const rps = Math.round(50 + Math.random() * 200);
        const blocked = Math.min(rps, Math.round(Math.random() * 60));
        sessionBus.publish(sessionId, {
          type: 'attack.metric', round,
          ts: elapsed, rps, blocked,
        });
      }
    })();

    try {
      if (isMockMode() || !process.env.REDIS_URL) {
        // 直接 mock —— 用真实防御日志构建结果,使得分合理
        // Mock 攻击期间也推真实间隔的指标
        const mockDuration = Math.min(5000, playbook.parameters.durationSec * 100);
        const interval = 1000;
        for (let i = 0; i < mockDuration / interval; i++) {
          await new Promise((r) => setTimeout(r, interval));
          if (metricsDone) break;
          const elapsed2 = Math.round((Date.now() - startMetricTs) / 1000);
          const rps2 = Math.round(50 + Math.random() * 200 + round * 30);
          const blocked2 = Math.min(rps2, Math.round(Math.random() * Math.max(5, 60 - round * 12)));
          sessionBus.publish(sessionId, {
            type: 'attack.metric', round,
            ts: elapsed2, rps: rps2, blocked: blocked2,
          });
        }
        jobResult = mockAttackJobResult(playbook);
      } else {
        try {
          const jobId = await enqueueAttack({ sessionId, playbook });
          // 等待攻击执行期间,实时指标由 Worker 推送 + 后台任务兜底
          jobResult = await waitForAttack(jobId, playbook.parameters.durationSec * 1000 + 30000);
        } catch (err) {
          console.warn('[queue] 执行失败,使用 mock', err);
          // mock 期间也推实时指标
          const mockDuration2 = 3000;
          const interval2 = 1000;
          for (let i = 0; i < mockDuration2 / interval2; i++) {
            await new Promise((r) => setTimeout(r, interval2));
            if (metricsDone) break;
            const elapsed3 = Math.round((Date.now() - startMetricTs) / 1000);
            const rps3 = Math.round(50 + Math.random() * 200);
            const blocked3 = Math.min(rps3, Math.round(Math.random() * 40));
            sessionBus.publish(sessionId, {
              type: 'attack.metric', round,
              ts: elapsed3, rps: rps3, blocked: blocked3,
            });
          }
          jobResult = mockAttackJobResult(playbook);
        }
      }
    } finally {
      metricsDone = true;
      try { await realtimeMetricsTask; } catch { /* ignore */ }
    }

    // 推一条最终汇总指标
    const finalElapsed = Math.round((Date.now() - startMetricTs) / 1000);
    const finalRps = Math.round((jobResult.totalRequests || 100) / Math.max(1, finalElapsed));
    const finalBlocked = Math.min(finalRps, jobResult.blockedRequests || 0);
    sessionBus.publish(sessionId, {
      type: 'attack.metric',
      round,
      ts: finalElapsed,
      rps: finalRps,
      blocked: finalBlocked
    });

    // ─── 3.3 Verifier 评分 ───
    yield { type: 'agent.start', agent: 'verifier', round };
    const defenderLogs = readDefenderLogs(Date.parse(jobResult.startedAt));
    const verifierResult = await withTrace(
      sessionId,
      round,
      'verifier',
      { playbookId: playbook.id, jobResult, defenderLogs },
      async () => {
        const result = await runVerifier({ playbook, jobResult, defenderLogs });
        return { thinking: undefined as string | undefined, ...result };
      },
      (r) => {
        const { thinking: _t, ...rest } = r;
        return rest;
      }
    );
    const verification: VerificationResult = {
      playbookId: verifierResult.playbookId,
      reachability: verifierResult.reachability,
      avgLatencyMs: verifierResult.avgLatencyMs,
      defenderTriggered: verifierResult.defenderTriggered,
      defenderLatencyMs: verifierResult.defenderLatencyMs,
      defenderRulesHit: verifierResult.defenderRulesHit,
      totalRequests: verifierResult.totalRequests,
      blockedRequests: verifierResult.blockedRequests,
      businessImpact: verifierResult.businessImpact,
      score: verifierResult.score
    };
    yield { type: 'agent.done', agent: 'verifier', round, output: verification };
    yield { type: 'verification.done', result: verification };

    // 落库 verification + 更新 playbook.score
    if (playbookRowId) {
      await db
        .insert(verifications)
        .values({
          playbookId: playbookRowId,
          reachability: verification.reachability,
          defenderTriggered: verification.defenderTriggered,
          defenderLatencyMs: verification.defenderLatencyMs ?? null,
          score: verification.score,
          metrics: { ...verification, rawMetrics: jobResult.rawMetrics } as unknown as object
        })
        .catch((err) => console.warn('[verification] 落库失败', err));
      await db
        .update(playbooksTable)
        .set({ score: verification.score })
        .where(eq(playbooksTable.id, playbookRowId))
        .catch(() => {});

    // ─── RAG: 成功策略生成向量存库 ───
    // 得分 >= 50 且在 RAG 搜索中未出现过（避免重复存储）
    if (playbookRowId && verification.score >= 50) {
      const alreadyInRag = ragPlaybooks.some((r) => r.playbook.id === playbook.id);
      if (!alreadyInRag) {
        embedText(playbookToEmbeddingText(playbook)).then((vec) => {
          if (vec) {
            db.execute(sql`
              UPDATE playbooks SET embedding = ${JSON.stringify(vec)}::vector
              WHERE id = ${playbookRowId}
            `).catch((err) => console.warn('[rag] 向量落库失败', err));
          }
        });
      }
    }
    }

    history.push({ playbook, result: verification });

    // ─── 3.4 Judge 决策 ───
    yield { type: 'agent.start', agent: 'judge', round };
    const judgeOut = await withTrace(
      sessionId,
      round,
      'judge',
      { round, maxRounds, history },
      () => runJudge({ profile, history, round, maxRounds }),
      (r) => r.decision
    );
    const decision = judgeOut.decision;
    if (judgeOut.thinking) {
      yield { type: 'agent.thinking', agent: 'judge', round, chunk: judgeOut.thinking };
    }
    yield { type: 'agent.done', agent: 'judge', round, output: decision };
    yield { type: 'judge.decision', decision };

    finalVerdict = decision.verdict;
    // Judge 自主决策：success 提前结束（已验证防御无效），stop 立即终止（风险过高）
    // 只有 continue 才进入下一轮，实现真正的自学习策略选择
    if (decision.verdict === 'stop') break;
    if (decision.verdict === 'success') break;   // 攻击成功绕过 → 不必继续浪费回合
    if (decision.verdict === 'failed') break;    // 攻击完全失败 → 防御有效，无需继续
    if (decision.verdict === 'continue' && decision.nextIntent) currentIntent = decision.nextIntent;
  }

  // === 4) 收尾 ===
  // 以"防御视角"呈现结果:攻击绕过(verdict=success)=防御失效→标红(failed);
  // 攻击未绕过(verdict=failed)=防御有效→标绿(completed)。与 judge-panel 的标签口径一致。
  const finalStatus =
    finalVerdict === 'stop' ? 'stopped' : finalVerdict === 'success' ? 'failed' : 'completed';
  await db.update(sessions).set({ status: finalStatus, updatedAt: new Date() }).where(eq(sessions.id, sessionId)).catch(() => {});

  if (finalStatus === 'stopped') {
    yield { type: 'session.stopped', sessionId, reason: 'judge requested stop' };
  } else {
    yield { type: 'session.completed', sessionId };
  }
}

/** 后台跑 session,把事件推到 bus(/api/sessions/[id]/start 用) */
export function runSessionInBackground(opts: RunSessionOpts): void {
  void (async () => {
    try {
      for await (const event of runSession(opts)) {
        sessionBus.publish(opts.sessionId, event);
      }
    } catch (err) {
      console.error('[orchestrator] session 失败', err);
      sessionBus.publish(opts.sessionId, {
        type: 'error',
        message: (err as Error).message ?? 'unknown error'
      });
      await db
        .update(sessions)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(sessions.id, opts.sessionId))
        .catch(() => {});
    }
  })();
}

// 这里导出一个简单的 helper 给 API route 用
export { randomUUID };
