import { notFound } from 'next/navigation';
import { getSessionDetail } from '@/lib/db/queries';
import { SessionDetailView } from '@/components/session-detail-view';

export const dynamic = 'force-dynamic';

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getSessionDetail(id);
  if (!detail) notFound();

  const live = detail.status === 'running' || detail.status === 'pending';

  return (
    <SessionDetailView
      sessionId={detail.id}
      name={detail.name}
      createdAt={detail.createdAt}
      maxRounds={detail.maxRounds}
      live={live}
      seed={{
        profile: detail.profile,
        playbooks: detail.playbooks,
        verifications: detail.verifications,
        judge: detail.judge,
        thinking: detail.thinking,
        metrics: detail.metrics,
        meta: detail.meta
      }}
    />
  );
}
