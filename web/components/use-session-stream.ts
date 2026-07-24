'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  SSEEvent,
  BusinessProfile,
  AttackPlaybook,
  VerificationResult,
  JudgeDecision,
  AgentName,
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
}

export interface SessionStreamSeed {
  profile: BusinessProfile | null;
  playbooks: AttackPlaybook[];
  verifications: VerificationResult[];
  judge: JudgeDecision | null;
  thinking: ThinkingEntry[];
  metrics?: Array<{ ts: number; rps: number; blocked: number }>;
}

function reduce(state: SessionStreamState, ev: SSEEvent): SessionStreamState {
  const next = { ...state, events: [...state.events, ev] };
  switch (ev.type) {
    case 'profile.ready':
      next.profile = ev.profile;
      break;
    case 'playbook.ready':
      next.playbooks = [...state.playbooks, ev.playbook];
      break;
    case 'verification.done':
      next.verifications = [...state.verifications, ev.result];
      break;
    case 'judge.decision':
      next.judge = ev.decision;
      next.activeAgent = null;
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
    status: 'connecting'
  }));
  const esRef = useRef<EventSource | null>(null);

  // SSE 实时推送
  useEffect(() => {
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
  }, [sessionId]);

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
        const data = await res.json() as {
          profile: BusinessProfile | null;
          playbooks: AttackPlaybook[];
          verifications: VerificationResult[];
          judge: JudgeDecision | null;
          traces: Array<{ agentName: string; thinking: string | null; createdAt: string; output: unknown }>;
          session: { status: string };
        };

        if (cancelled) return;

        setState((prev) => {
          const next = { ...prev };

          // 合并 playbooks (新增的追加)
          if (data.playbooks && data.playbooks.length > prev.playbooks.length) {
            next.playbooks = data.playbooks;
          }
          // 合并 verifications
          if (data.verifications && data.verifications.length > prev.verifications.length) {
            next.verifications = data.verifications;
          }
          // 合并 judge
          if (data.judge) {
            next.judge = data.judge;
          }
          // 合并 profile
          if (data.profile) {
            next.profile = data.profile;
          }
          // 合并 thinking (traces)
          if (data.traces && data.traces.length > 0) {
            const newThinking: ThinkingEntry[] = [];
            for (const t of data.traces) {
              if (t.thinking) {
                newThinking.push({ agent: t.agentName as AgentName, text: t.thinking });
              }
            }
            if (newThinking.length > prev.thinking.length) {
              next.thinking = newThinking;
            }
          }
          // 更新状态
          if (data.session && (data.session.status === 'completed' || data.session.status === 'failed' || data.session.status === 'stopped')) {
            next.status = 'closed';
            next.activeAgent = null;
          } else if (next.status === 'connecting' || next.status === 'closed') {
            next.status = 'live';
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
