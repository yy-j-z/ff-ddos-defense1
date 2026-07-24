'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const items = [
  {
    href: '/dashboard',
    label: '会话',
    match: (p: string) => p === '/dashboard' || p.startsWith('/dashboard/sessions')
  },
  {
    href: '/dashboard/playbooks',
    label: '剧本库',
    match: (p: string) => p.startsWith('/dashboard/playbooks')
  },
  {
    href: '/dashboard/guide',
    label: '使用教程',
    match: (p: string) => p.startsWith('/dashboard/guide')
  }
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 shrink-0 border-r border-border bg-surface">
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-border px-5">
          <span className="font-mono text-sm font-semibold tracking-tight text-foreground">FF</span>
          <span className="text-xs text-muted-foreground">DDoS 防御验证</span>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {items.map((it) => {
            const active = it.match(pathname);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  'flex items-center rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-surface-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground'
                )}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border px-5 py-3 text-[11px] leading-relaxed text-subtle-foreground">
          多 Agent 闭环
          <br />
          自动化对抗验证
        </div>
      </div>
    </aside>
  );
}
