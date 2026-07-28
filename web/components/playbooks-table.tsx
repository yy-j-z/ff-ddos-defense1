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
  if (s >= 70) return 'text-red-400';
  if (s >= 40) return 'text-amber-400';
  return 'text-emerald-400';
}

export function PlaybooksTable({ rows }: { rows: PlaybookLibraryItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#1f2937] py-16 text-center text-sm text-slate-500">
        剧本库为空，完成一次攻防会话后成功剧本会沉淀到这里
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#1f2937] bg-[#111827d9]">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#1f2937] text-[10px] uppercase tracking-wide text-slate-500">
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
                  'cursor-pointer border-b border-[#1f2937] transition-colors hover:bg-[#1e293b]',
                  isOpen && 'bg-[#1e293b]'
                )}
              >
                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                  {row.playbook.id.slice(0, 8)}
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={strategyVariant[row.playbook.strategy] ?? 'neutral'}>
                    {row.playbook.strategy}
                  </Badge>
                </td>
                <td className="max-w-0 px-4 py-2.5 text-slate-200">
                  <span className="block truncate">{row.playbook.intent}</span>
                </td>
                <td
                  className={cn(
                    'px-4 py-2.5 text-right font-mono font-semibold tabular-nums',
                    scoreTone(row.score)
                  )}
                >
                  {row.score}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500">
                  {row.createdAt}
                </td>
              </tr>
            );
            const detail = isOpen ? (
              <tr key={`${row.playbook.id}-yaml`} className="border-b border-[#1f2937] bg-[#0a0e1a]">
                <td colSpan={5} className="px-4 py-3">
                  <pre className="scroll-quiet overflow-x-auto rounded-md border border-[#1f2937] bg-[#060812] p-3 font-mono text-[11px] leading-relaxed text-slate-400">
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
