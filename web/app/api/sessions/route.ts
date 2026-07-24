/**
 * POST /api/sessions  —— 创建 session
 * GET  /api/sessions  —— 列表
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { sessions } from '@/lib/db/schema';
import { ScopeSchema } from '@/lib/types';
import { desc } from 'drizzle-orm';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CreateSessionSchema = z.object({
  name: z.string().min(1).max(200),
  scope: ScopeSchema.partial().optional()
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const parsed = CreateSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }
  const scope = ScopeSchema.parse(parsed.data.scope ?? {});
  try {
    const [row] = await db
      .insert(sessions)
      .values({ name: parsed.data.name, status: 'pending', scope: scope as unknown as object })
      .returning();
    return NextResponse.json({ id: row.id, session: row });
  } catch (err) {
    return NextResponse.json({ error: 'db error', message: (err as Error).message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const rows = await db.select().from(sessions).orderBy(desc(sessions.createdAt)).limit(100);
    return NextResponse.json({ sessions: rows });
  } catch (err) {
    return NextResponse.json({ error: 'db error', message: (err as Error).message }, { status: 500 });
  }
}
