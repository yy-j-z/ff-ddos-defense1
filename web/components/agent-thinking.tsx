'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { AgentName, ThinkingEntry } from '@/lib/types';
export type { ThinkingEntry };

/* 安静的推理日志:无打字机、无呼吸点。每个 Agent 一个低饱和左边条 + 等宽标签。 */
const agentMeta: Record<AgentName, { label: string; border: string; text: string }> = {
  analyzer: { label: 'ANALYZER', border: 'border-info', text: 'text-info' },
  attacker: { label: 'ATTACKER', border: 'border-danger', text: 'text-danger' },
  verifier: { label: 'VERIFIER', border: 'border-success', text: 'text-success' },
  judge: { label: 'JUDGE', border: 'border-warning', text: 'text-warning' }
};

const ORDER: AgentName[] = ['analyzer', 'attacker', 'verifier', 'judge'];

export function AgentThinking({ entries, active }: { entries: ThinkingEntry[]; active?: AgentName | null }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* 流水线进度:文字标签 + 状态点,允许换行,不溢出 */}
      <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-1.5 text-[10px]">
        {ORDER.map((name) => {
          const seen = entries.some((e) => e.agent === name);
          const isActive = active === name;
          return (
            <div key={name} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  isActive ? 'bg-foreground' : seen ? 'bg-muted-foreground' : 'bg-border-strong'
                )}
              />
              <span
                className={cn(
                  'font-mono tracking-wide',
                  isActive ? 'text-foreground' : seen ? 'text-muted-foreground' : 'text-subtle-foreground'
                )}
              >
                {agentMeta[name].label}
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
          <div className="py-8 text-center text-xs text-subtle-foreground">暂无推理记录</div>
        )}
        {entries.map((entry, idx) => {
          const M = agentMeta[entry.agent];
          return (
            <div key={idx} className={cn('border-l-2 pl-3 text-xs', M.border)}>
              <span className={cn('font-mono text-[10px] tracking-wide', M.text)}>{M.label}</span>
              <p className="mt-0.5 whitespace-pre-wrap leading-relaxed text-muted-foreground">{entry.text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
