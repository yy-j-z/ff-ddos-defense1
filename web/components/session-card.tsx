'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SessionListItem } from '@/lib/types';

const statusMeta: Record<
  SessionListItem['status'],
  { label: string; variant: 'neutral' | 'info' | 'success' | 'danger' | 'warning' }
> = {
  pending: { label: '等待中', variant: 'neutral' },
  running: { label: '运行中', variant: 'info' },
  completed: { label: '防御有效', variant: 'success' },
  failed: { label: '防御失效', variant: 'danger' },
  stopped: { label: '已停止', variant: 'warning' }
};

export function SessionCard({ session }: { session: SessionListItem }) {
  const router = useRouter();
  const meta = statusMeta[session.status];
  const pct = Math.min(100, (session.round / session.maxRounds) * 100);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`确定删除会话「${session.name}」？此操作不可撤销。`)) return;
    try {
      const res = await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
      else alert('删除失败');
    } catch {
      alert('删除失败');
    }
  };

  return (
    <div className="group relative block">
      <Link href={`/dashboard/sessions/${session.id}`} className="block">
        <Card className="h-full p-4 transition-colors hover:border-border-strong">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium text-foreground">{session.name}</h3>
              <p className="mt-0.5 font-mono text-[11px] text-subtle-foreground">{session.createdAt}</p>
            </div>
            <Badge variant={meta.variant} dot>
              {meta.label}
            </Badge>
          </div>

          <div className="mt-4 flex items-end justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-subtle-foreground">回合</div>
              <div className="font-mono text-sm tabular-nums text-foreground">
                {session.round}
                <span className="text-subtle-foreground"> / {session.maxRounds}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-subtle-foreground">攻击穿透分</div>
              <div
                className={cn(
                  'font-mono text-sm font-semibold tabular-nums',
                  session.bestScore >= 70 ? 'text-danger' : 'text-foreground'
                )}
              >
                {session.bestScore}
              </div>
            </div>
          </div>

          <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full rounded-full bg-foreground/40" style={{ width: `${pct}%` }} />
          </div>
        </Card>
      </Link>
      <button
        onClick={handleDelete}
        className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-surface/80 text-subtle-foreground opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
        title="删除会话"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
        </svg>
      </button>
    </div>
  );
}
