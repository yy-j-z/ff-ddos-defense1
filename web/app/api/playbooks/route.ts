/**
 * GET /api/playbooks —— 全局剧本库(可按 strategy / minScore 过滤)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { playbooks } from '@/lib/db/schema';
import { and, desc, eq, gte } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const strategy = url.searchParams.get('strategy');
  const minScore = url.searchParams.get('minScore');
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);

  const conditions = [] as ReturnType<typeof eq>[];
  if (strategy) conditions.push(eq(playbooks.strategy, strategy));
  if (minScore) {
    const n = parseInt(minScore, 10);
    if (Number.isFinite(n)) conditions.push(gte(playbooks.score, n));
  }

  try {
    const rows = await db
      .select()
      .from(playbooks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(playbooks.createdAt))
      .limit(limit);
    return NextResponse.json({ playbooks: rows });
  } catch (err) {
    return NextResponse.json({ error: 'db error', message: (err as Error).message }, { status: 500 });
  }
}
