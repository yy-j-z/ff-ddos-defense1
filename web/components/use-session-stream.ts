'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  SSEEvent,
  BusinessProfile,
  AttackPlaybook,
  VerificationResult,
  JudgeDecision,
  AgentName,
  SessionMeta,
  ThinkingEntry
} from '@/lib/types';

export interface SessionStreamState {
  events: SSEEvent[];
  profile: BusinessProfile | null;
  playbooks: AttackPlaybook[];
  verifications: VerificationResult[];
  judge: JudgeDecision | null;
  metrics: Array<{ ts: number; rps: number; blocked: number }>;
  thinking: ThinkingEntry[];
  activeAgent: AgentName | null;
  status: 'connecting' | 'live' | 'closed';
  /** 执行元信息(降级/证据标注),L4 */
  meta: SessionMeta | null;
}

export interface SessionStreamSeed {
  profile: BusinessProfile | null;
  playbooks: AttackPlaybook[];
  verifications: VerificationResult[];
  judge: JudgeDecision | null;
  thinking: ThinkingEntry[];
  metrics?: Array<{ ts: number; rps: number; blocked: number }>;
  meta?: SessionMeta | null;
}

function reduce(state: SessionStreamState, ev: SSEEvent): SessionStreamState {
  const next = { ...state, events: [...state.events, ev] };
  switch (ev.type) {
    case 'profile.ready':
      next.profile = ev.profile;
      break;
    case 'playbook.ready': {
      // 防止 SSE 回放时重复添加（已完成 session 的历史事件会重放）
      const exists = state.playbooks.some((p) => p.id === ev.playbook.id);
      if (!exists) {
        next.playbooks = [...state.playbooks, ev.playbook];
      }
      break;
    }
    case 'verification.done': {
      // 防止重复
      const exists = state.verifications.some((v) => v.playbookId === ev.result.playbookId);
      if (!exists) {
        next.verifications = [...state.verifications, ev.result];
      }
      break;
    }
    case 'judge.decision':
      next.judge = ev.decision;
      next.activeAgent = null;
      break;
    case 'session.meta':
      next.meta = ev.meta;
      break;
    case 'attack.metric':
      next.metrics = [...state.metrics, { ts: ev.ts, rps: ev.rps, blocked: ev.blocked }];
      break;
    case 'agent.start':
      next.activeAgent = ev.agent;
      break;
    case 'agent.thinking': {
      const last = state.thinking[state.thinking.length - 1];
      if (last && last.agent === ev.agent) {
        next.thinking = [...state.thinking.slice(0, -1), { agent: ev.agent, text: last.text + ev.chunk }];
      } else {
        next.thinking = [...state.thinking, { agent: ev.agent, text: ev.chunk }];
      }
      break;
    }
    case 'agent.done':
      next.activeAgent = null;
      break;
    case 'session.completed':
    case 'session.stopped':
    case 'error':
      next.status = 'closed';
      next.activeAgent = null;
      break;
  }
  return next;
}

/**
 * 从 seed 数据初始状态 + 实时 SSE 推送 + 兜底轮询。
 * 每 2 秒轮询一次 API 确保页面始终最新，SSE 推送增量更新。
 */
export function useSessionStream(
  sessionId: string,
  live: boolean,
  seed: SessionStreamSeed
): SessionStreamState {
  const [state, setState] = useState<SessionStreamState>(() => ({
    events: [],
    profile: seed.profile,
    playbooks: seed.playbooks,
    verifications: seed.verifications,
    judge: seed.judge,
    metrics: seed.metrics ?? [],
    thinking: seed.thinking,
    activeAgent: null,
    meta: seed.meta ?? null,
    // live=true → 等待 SSE 连接; live=false → 已完成,直接显示
    status: live ? 'connecting' : 'closed'
  }));
  const esRef = useRef<EventSource | null>(null);

  // SSE 实时推送 —— 仅对进行中的 session 建立连接
  useEffect(() => {
    // 已完成的 session 无需 SSE,seed 数据已包含全部内容
    if (!live) return;

    let cancelled = false;

    const es = new EventSource(`/api/stream/${sessionId}`);
    esRef.current = es;

    es.onopen = () => {
      if (!cancelled) setState((s) => ({ ...s, status: 'live' }));
    };
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as SSEEvent;
        if (!cancelled) setState((s) => reduce(s, ev));
      } catch {
        /* ignore malformed */
      }
    };
    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (!cancelled) setState((s) => ({ ...s, status: 'closed', activeAgent: null }));
    };

    return () => {
      cancelled = true;
      if (esRef.current) esRef.current.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, live]);

  // 兜底轮询 —— 每 2 秒拉一次数据,合并增量
  useEffect(() => {
    let cancelled = false;
    let isFetching = false;

    const poll = async () => {
      if (isFetching) return;
      isFetching = true;
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) return;
        const raw = await res.json() as {
          profile: { data: BusinessProfile } | null;
          playbooks: Array<{ data: AttackPlaybook }>;
          verifications: Array<{ metrics: VerificationResult & { rawMetrics?: Array<{ ts: number; rps: number; blocked: number }> }; playbookId: string }>;
          traces: Array<{ agentName: string; thinking: string | null; output: JudgeDecision | null }>;
          session: { status: string };
        };

        if (cancelled) return;

        setState((prev) => {
          const next = { ...prev };

          // 解析 playbooks（从 DB 行的 .data 字段提取），用 Set 去重
          if (raw.playbooks && raw.playbooks.length > prev.playbooks.length) {
            const seen = new Set(prev.playbooks.map((p) => p.id));
            const newPbs = raw.playbooks
              .map((p) => p.data)
              .filter((pb) => !seen.has(pb.id));
            if (newPbs.length > 0) {
              next.playbooks = [...prev.playbooks, ...newPbs];
            }
          }
          // 解析 verifications（从 DB 行的 .metrics 字段提取）
          if (raw.verifications && raw.verifications.length > prev.verifications.length) {
            next.verifications = raw.verifications.map((v) => {
              const m = v.metrics;
              return {
                playbookId: m.playbookId ?? v.playbookId,
                reachability: m.reachability,
                avgLatencyMs: m.avgLatencyMs,
                defenderTriggered: m.defenderTriggered,
                defenderLatencyMs: m.defenderLatencyMs ?? null,
                defenderRulesHit: m.defenderRulesHit ?? [],
                totalRequests: m.totalRequests,
                blockedRequests: m.blockedRequests,
                businessImpact: m.businessImpact,
                score: m.score
              } as VerificationResult;
            });
          }
          // 解析 judge（从 traces 中找最后一条 judge 记录）
          if (raw.traces) {
            const judgeTrace = [...raw.traces].reverse().find((t) => t.agentName === 'judge');
            if (judgeTrace?.output) {
              next.judge = judgeTrace.output;
            }
          }
          // 解析 profile（从 DB 行的 .data 字段提取）
          if (raw.profile?.data) {
            next.profile = raw.profile.data;
          }
          // 合并 thinking
          if (raw.traces && raw.traces.length > 0) {
            const newThinking: ThinkingEntry[] = [];
            for (const t of raw.traces) {
              if (t.thinking) {
                newThinking.push({ agent: t.agentName as AgentName, text: t.thinking });
              }
            }
            if (newThinking.length > prev.thinking.length) {
              next.thinking = newThinking;
            }
          }
          // 更新状态
          if (raw.session && (raw.session.status === 'completed' || raw.session.status === 'failed' || raw.session.status === 'stopped')) {
            next.status = 'closed';
            next.activeAgent = null;
          } else if (next.status === 'connecting') {
            next.status = 'live';
          }
          // 解析 meta(降级/证据标注)—— 可能由 SSE 或轮询任一途径更新
          if (raw.session && (raw.session as { meta?: SessionMeta | null }).meta) {
            next.meta = (raw.session as { meta?: SessionMeta | null }).meta ?? null;
          }

          return next;
        });
      } catch {
        // silent
      } finally {
        isFetching = false;
      }
    };

    // 立即执行一次,然后每 2 秒轮询
    poll();
    const timer = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return state;
}
