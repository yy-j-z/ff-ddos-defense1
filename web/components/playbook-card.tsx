'use client';

import { useState } from 'react';
import { stringify } from 'yaml';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AttackPlaybook } from '@/lib/types';

const strategyVariant: Record<AttackPlaybook['strategy'], 'warning' | 'danger' | 'info'> = {
  slowloris: 'warning',
  http_flood: 'danger',
  syn_flood: 'info'
};

function scoreTone(score: number) {
  if (score >= 70) return 'text-danger';
  if (score >= 40) return 'text-warning';
  return 'text-success';
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
        'rounded-md border bg-surface transition-colors',
        active ? 'border-foreground/30 ring-1 ring-foreground/10' : 'border-border'
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-subtle-foreground">R{playbook.round}</span>
            <Badge variant={strategyVariant[playbook.strategy]}>{playbook.strategy}</Badge>
          </div>
          <div className="truncate text-xs text-foreground">{playbook.intent}</div>
        </div>
        {score !== undefined && (
          <span className={cn('font-mono text-sm font-semibold tabular-nums', scoreTone(score))}>{score}</span>
        )}
      </button>
      {open && (
        <pre className="scroll-quiet overflow-x-auto border-t border-border bg-surface-muted px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
{yaml}
        </pre>
      )}
    </div>
  );
}
