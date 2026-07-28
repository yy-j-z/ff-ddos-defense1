'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { AgentName, ThinkingEntry } from '@/lib/types';
export type { ThinkingEntry };

const agentMeta: Record<AgentName, { label: string; border: string; text: string; color: string }> = {
  analyzer: { label: 'ANALYZER', border: 'border-l-[#3b82f6]', text: 'text-[#60a5fa]', color: '#3b82f6' },
  attacker: { label: 'ATTACKER', border: 'border-l-[#ef4444]', text: 'text-[#f87171]', color: '#ef4444' },
  verifier: { label: 'VERIFIER', border: 'border-l-[#10b981]', text: 'text-[#34d399]', color: '#10b981' },
  judge: { label: 'JUDGE', border: 'border-l-[#f59e0b]', text: 'text-[#fbbf24]', color: '#f59e0b' }
};

const ORDER: AgentName[] = ['analyzer', 'attacker', 'verifier', 'judge'];

export function AgentThinking({
  entries,
  active
}: {
  entries: ThinkingEntry[];
  active?: AgentName | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* 流水线进度 */}
      <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-1.5 text-[10px]">
        {ORDER.map((name) => {
          const seen = entries.some((e) => e.agent === name);
          const isActive = active === name;
          const m = agentMeta[name];
          return (
            <div key={name} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  isActive ? 'shadow-[0_0_6px]' : '',
                  isActive ? 'bg-white' : seen ? 'bg-slate-400' : 'bg-slate-700'
                )}
                style={isActive ? { backgroundColor: m.color } : undefined}
              />
              <span
                className={cn(
                  'font-mono tracking-wide',
                  isActive
                    ? m.text
                    : seen
                      ? 'text-slate-400'
                      : 'text-slate-600'
                )}
              >
                {m.label}
              </span>
            </div>
          );
        })}
      </div>

      <div
        ref={scrollRef}
        className="scroll-quiet min-h-0 max-h-[42vh] flex-1 space-y-2 overflow-y-auto pr-1 lg:max-h-none"
      >
        {entries.length === 0 && (
          <div className="py-8 text-center text-xs text-slate-600">暂无推理记录</div>
        )}
        {entries.map((entry, idx) => {
          const M = agentMeta[entry.agent];
          return (
            <div key={idx} className={cn('border-l-2 pl-3 text-xs', M.border)}>
              <span className={cn('font-mono text-[10px] tracking-wide', M.text)}>
                {M.label}
              </span>
              <p className="mt-0.5 whitespace-pre-wrap leading-relaxed text-slate-400">
                {entry.text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
