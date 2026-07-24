/**
 * GET /api/sessions/[id] —— session 详情(含 playbooks / verifications / traces)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { sessions, playbooks, verifications, profiles, agentTraces } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const [profile] = await db.select().from(profiles).where(eq(profiles.sessionId, id)).limit(1);
    const pbs = await db
      .select()
      .from(playbooks)
      .where(eq(playbooks.sessionId, id))
      .orderBy(asc(playbooks.round));
    const traceRows = await db
      .select()
      .from(agentTraces)
      .where(eq(agentTraces.sessionId, id))
      .orderBy(asc(agentTraces.createdAt));

    // verifications by playbookId
    const playbookIds = pbs.map((p) => p.id);
    let verRows: Array<typeof verifications.$inferSelect> = [];
    if (playbookIds.length > 0) {
      const all = await db.select().from(verifications);
      verRows = all.filter((v) => playbookIds.includes(v.playbookId));
    }

    return NextResponse.json({
      session,
      profile: profile ?? null,
      playbooks: pbs,
      verifications: verRows,
      traces: traceRows
    });
  } catch (err) {
    return NextResponse.json({ error: 'db error', message: (err as Error).message }, { status: 500 });
  }
}

/** DELETE /api/sessions/[id] —— 删除会话及相关数据 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    // 先查出 playbook ids 用于删除 verifications
    const pbs = await db.select({ id: playbooks.id }).from(playbooks).where(eq(playbooks.sessionId, id));
    const pbIds = pbs.map((p) => p.id);

    // 按依赖顺序删除
    if (pbIds.length > 0) {
      for (const pid of pbIds) {
        await db.delete(verifications).where(eq(verifications.playbookId, pid)).catch(() => {});
      }
    }
    await db.delete(playbooks).where(eq(playbooks.sessionId, id)).catch(() => {});
    await db.delete(profiles).where(eq(profiles.sessionId, id)).catch(() => {});
    await db.delete(agentTraces).where(eq(agentTraces.sessionId, id)).catch(() => {});
    await db.delete(sessions).where(eq(sessions.id, id)).catch(() => {});

    return NextResponse.json({ deleted: true, sessionId: id });
  } catch (err) {
    return NextResponse.json({ error: 'delete failed', message: (err as Error).message }, { status: 500 });
  }
}
