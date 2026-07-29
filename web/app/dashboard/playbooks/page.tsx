import { getPlaybookLibrary } from '@/lib/db/queries';
import { PlaybooksTable } from '@/components/playbooks-table';
import { ScrollPage } from '@/components/scroll-page';

export const dynamic = 'force-dynamic';

export default async function PlaybooksPage() {
  const rows = await getPlaybookLibrary();

  return (
    <ScrollPage className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-100">策略库</h1>
        <p className="mt-1 text-sm text-slate-400">
          沉淀的成功策略可在新任务中作为 RAG 参考
        </p>
      </div>
      <PlaybooksTable rows={rows} />
    </ScrollPage>
  );
}
