import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SessionCard } from '@/components/session-card';
import { ScrollPage } from '@/components/scroll-page';
import { getSessionSummaries } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const sessions = await getSessionSummaries();

  return (
    <ScrollPage className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">会话</h1>
          <p className="mt-1 text-sm text-muted-foreground">管理攻防演练会话,或新建一次自动化对抗验证</p>
        </div>
        <Link href="/dashboard/sessions/new">
          <Button>新建会话</Button>
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong py-16 text-center text-sm text-muted-foreground">
          暂无会话,点击右上角「新建会话」开始一次攻防演练
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
