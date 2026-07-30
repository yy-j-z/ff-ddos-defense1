'use client';

import { useState, useMemo } from 'react';
import { stringify } from 'yaml';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Search, Filter } from 'lucide-react';
import type { PlaybookLibraryItem } from '@/lib/types';

const ALL_STRATEGIES = ['slowloris', 'http_flood', 'syn_flood', 'hulk_flood', 'slow_headers'] as const;

const strategyVariant: Record<string, 'warning' | 'danger' | 'info' | 'neutral'> = {
  slowloris: 'warning',
  http_flood: 'danger',
  syn_flood: 'info',
  hulk_flood: 'neutral',
  slow_headers: 'warning',
};

const strategyLabels: Record<string, string> = {
  slowloris: 'Slowloris',
  http_flood: 'HTTP Flood',
  syn_flood: 'SYN Flood',
  hulk_flood: 'HULK Flood',
  slow_headers: 'Slow Headers',
};

function scoreTone(s: number) {
  if (s >= 70) return 'text-red-400';
  if (s >= 40) return 'text-amber-400';
  return 'text-emerald-400';
}

interface Props {
  rows: PlaybookLibraryItem[];
}

export function PlaybooksTable({ rows }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [strategyFilter, setStrategyFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = rows;
    // 策略类型筛选
    if (strategyFilter) {
      result = result.filter((r) => r.playbook.strategy === strategyFilter);
    }
    // 文本搜索（匹配 intent / 策略名称）
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (r) =>
          r.playbook.intent.toLowerCase().includes(q) ||
          r.playbook.strategy.toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, search, strategyFilter]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#1f2937] py-16 text-center text-sm text-slate-500">
        策略库为空，完成一次攻防测试后成功策略会沉淀到这里
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 筛选工具栏 */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* 搜索框 */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="搜索策略名称或意图…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-[#1f2937] bg-[#0f172a] pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#06b6d4] focus:ring-1 focus:ring-[#06b6d4]/30 transition-colors"
          />
        </div>
      </div>

      {/* 策略类型快捷筛选按钮 */}
      <div className="flex flex-wrap gap-1.5">
        <Filter className="w-3.5 h-3.5 text-slate-500 self-center mr-1" />
        <button
          onClick={() => setStrategyFilter(null)}
          className={cn(
            'rounded-md border px-2.5 py-1 font-mono text-xs transition-all',
            !strategyFilter
              ? 'border-[#06b6d440] bg-[#06b6d41a] text-[#06b6d4]'
              : 'border-[#1f2937] text-slate-500 hover:border-[#374151] hover:text-slate-300'
          )}
        >
          全部
        </button>
        {ALL_STRATEGIES.map((s) => (
          <button
            key={s}
            onClick={() => setStrategyFilter(strategyFilter === s ? null : s)}
            className={cn(
              'rounded-md border px-2.5 py-1 font-mono text-xs transition-all',
              strategyFilter === s
                ? 'border-[#06b6d440] bg-[#06b6d41a] text-[#06b6d4]'
                : 'border-[#1f2937] text-slate-500 hover:border-[#374151] hover:text-slate-300'
            )}
          >
            {strategyLabels[s]}
          </button>
        ))}
        {filtered.length < rows.length && (
          <span className="text-xs text-slate-500 self-center ml-auto">
            筛选出 {filtered.length} / {rows.length} 条
          </span>
        )}
      </div>

      {/* 表格 */}
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">
                  没有匹配的策略
                </td>
              </tr>
            ) : (
              filtered.flatMap((row) => {
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
                        {strategyLabels[row.playbook.strategy] ?? row.playbook.strategy}
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
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
