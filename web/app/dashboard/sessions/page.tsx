import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SessionCard } from '@/components/session-card';
import { ScrollPage } from '@/components/scroll-page';
import { getSessionSummaries } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function SessionsListPage() {
  const sessions = await getSessionSummaries();

  return (
    <ScrollPage className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">自检任务</h1>
          <p className="mt-1 text-sm text-slate-400">
            管理攻防测试任务，或开始一次新的自动化对抗验证
          </p>
        </div>
        <Link href="/dashboard/sessions/new">
          <Button>新建 DDoS 攻防测试任务</Button>
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#1f2937] bg-[#0f172a80] flex flex-col justify-between" style={{ minHeight: '280px' }}>
          <div className="flex flex-col items-start justify-center px-8 py-12 flex-1">
            <div className="flex items-center gap-3 mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
              </svg>
              <span className="text-sm font-medium text-slate-400">暂无自检任务</span>
            </div>
            <p className="text-sm text-slate-500 ml-9">
              点击右上角「新建」开始第一次攻防测试
            </p>
          </div>

          <div className="border-t border-dashed border-[#1f2937] px-8 py-4 flex items-center justify-between">
            <a
              href="/dashboard/sessions"
              className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-[#06b6d4] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              查看历史记录
            </a>
            <span className="text-[10px] text-slate-600">系统尚未记录任何测试数据</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </ScrollPage>
  );
}
