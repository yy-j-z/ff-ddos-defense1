'use client';

import { useState } from 'react';
import { stringify } from 'yaml';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AttackPlaybook } from '@/lib/types';

const strategyVariant: Record<AttackPlaybook['strategy'], 'warning' | 'danger' | 'info' | 'neutral'> = {
  slowloris: 'warning',
  http_flood: 'danger',
  syn_flood: 'info',
  hulk_flood: 'neutral',
  slow_headers: 'warning'
};

function scoreTone(score: number) {
  if (score >= 70) return 'text-red-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-emerald-400';
}

export function PlaybookCard({
  playbook,
  active = false,
  score
}: {
  playbook: AttackPlaybook;
  active?: boolean;
  score?: number;
}) {
  const [open, setOpen] = useState(false);
  const yaml = stringify(playbook, { indent: 2, lineWidth: 80 });

  return (
    <div
      className={cn(
        'rounded-md border transition-colors',
        active
          ? 'border-[#06b6d440] bg-[#06b6d40a] shadow-[0_0_10px_rgba(6,182,212,0.05)]'
          : 'border-[#1f2937] bg-[#0f172a]'
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-slate-500">R{playbook.round}</span>
            <Badge variant={strategyVariant[playbook.strategy]}>{playbook.strategy}</Badge>
          </div>
          <div className="truncate text-xs text-slate-300">{playbook.intent}</div>
        </div>
        {score !== undefined && (
          <span className={cn('font-mono text-sm font-semibold tabular-nums', scoreTone(score))}>
            {score}
          </span>
        )}
      </button>
      {open && (
        <pre className="scroll-quiet overflow-x-auto border-t border-[#1f2937] bg-[#0a0e1a] px-3 py-2 font-mono text-[10px] leading-relaxed text-slate-400">
          {yaml}
        </pre>
      )}
    </div>
  );
}
