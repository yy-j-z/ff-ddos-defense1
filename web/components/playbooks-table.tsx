'use client';

import { useState } from 'react';
import { stringify } from 'yaml';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PlaybookLibraryItem } from '@/lib/types';

const strategyVariant: Record<string, 'warning' | 'danger' | 'info'> = {
  slowloris: 'warning',
  http_flood: 'danger',
  syn_flood: 'info'
};

function scoreTone(s: number) {
  if (s >= 70) return 'text-danger';
  if (s >= 40) return 'text-warning';
  return 'text-success';
}

export function PlaybooksTable({ rows }: { rows: PlaybookLibraryItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong py-16 text-center text-sm text-muted-foreground">
        剧本库为空,完成一次攻防会话后成功剧本会沉淀到这里
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wide text-subtle-foreground">
            <th className="px-4 py-2.5 text-left font-medium">ID</th>
            <th className="px-4 py-2.5 text-left font-medium">策略</th>
            <th className="px-4 py-2.5 text-left font-medium">意图</th>
            <th className="px-4 py-2.5 text-right font-medium">得分</th>
            <th className="px-4 py-2.5 text-right font-medium">创建时间</th>
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((row) => {
            const isOpen = expanded === row.playbook.id;
            const main = (
              <tr
                key={row.playbook.id}
                onClick={() => setExpanded(isOpen ? null : row.playbook.id)}
                className={cn(
                  'cursor-pointer border-b border-border transition-colors hover:bg-surface-muted',
                  isOpen && 'bg-surface-muted'
                )}
              >
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {row.playbook.id.slice(0, 8)}
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={strategyVariant[row.playbook.strategy] ?? 'neutral'}>
                    {row.playbook.strategy}
                  </Badge>
                </td>
                <td className="max-w-0 px-4 py-2.5 text-foreground">
                  <span className="block truncate">{row.playbook.intent}</span>
                </td>
                <td className={cn('px-4 py-2.5 text-right font-mono font-semibold tabular-nums', scoreTone(row.score))}>
                  {row.score}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-subtle-foreground">{row.createdAt}</td>
              </tr>
            );
            const detail = isOpen ? (
              <tr key={`${row.playbook.id}-yaml`} className="border-b border-border bg-surface-muted">
                <td colSpan={5} className="px-4 py-3">
                  <pre className="scroll-quiet overflow-x-auto rounded-md border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
{stringify(row.playbook, { indent: 2, lineWidth: 80 })}
                  </pre>
                </td>
              </tr>
            ) : null;
            return detail ? [main, detail] : [main];
          })}
        </tbody>
      </table>
    </div>
  );
}
