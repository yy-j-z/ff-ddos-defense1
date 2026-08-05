'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const items = [
  {
    href: '/dashboard',
    label: '攻防总览',
    match: (p: string) => p === '/dashboard'
  },
  {
    href: '/dashboard/sessions',
    label: '自检任务',
    match: (p: string) => p.startsWith('/dashboard/sessions')
  },
  {
    href: '/dashboard/playbooks',
    label: '策略库',
    match: (p: string) => p.startsWith('/dashboard/playbooks')
  },
  {
    href: '/dashboard/guide',
    label: '操作手册',
    match: (p: string) => p.startsWith('/dashboard/guide')
  }
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function onLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <aside
      className="relative w-56 shrink-0 border-r flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #0a0e1a 0%, #111827 100%)',
        borderColor: '#1f2937'
      }}
    >

      {/* Logo 区 */}
      <div className="flex h-14 items-center gap-2 border-b px-5" style={{ borderColor: '#1f2937' }}>
        <div className="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#06b6d4"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 0 6px rgba(6,182,212,0.5))' }}
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <span className="font-mono text-sm font-semibold tracking-tight text-white">FF</span>
        <span className="text-xs text-slate-500">DDoS 防御验证</span>
      </div>

      {/* 导航 */}
      <nav className="flex-1 space-y-0.5 p-3">
        {items.map((it) => {
          const active = it.match(pathname);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                'flex items-center rounded-md px-3 py-2 text-sm transition-all',
                active
                  ? 'bg-[#06b6d41a] font-medium text-[#06b6d4] border border-[#06b6d440] shadow-[0_0_10px_rgba(6,182,212,0.1)]'
                  : 'text-slate-400 hover:bg-[#111827] hover:text-slate-200'
              )}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>

      {/* 退出 */}
      <div className="border-t p-3" style={{ borderColor: '#1f2937' }}>
        <button
          onClick={onLogout}
          className="flex w-full items-center rounded-md px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-[#111827] hover:text-red-400"
        >
          退出登录
        </button>
      </div>

      {/* 底部 */}
      <div className="border-t px-5 py-3 text-[11px] leading-relaxed" style={{ borderColor: '#1f2937' }}>
        <span className="text-slate-500">多 Agent 闭环</span>
        <br />
        <span className="text-slate-600">自动化对抗验证</span>
      </div>
    </aside>
  );
}
