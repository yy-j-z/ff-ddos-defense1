/**
 * POST /api/sessions/[id]/start —— 上传 PCAP 并启动 orchestrator(异步)
 * multipart/form-data: file=<pcap> (可选，自动采集模式不传)
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { sessions } from '@/lib/db/schema';
import { ScopeSchema } from '@/lib/types';
import { eq } from 'drizzle-orm';
import { runSessionInBackground } from '@/lib/orchestrator/graph';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 自动采集模式：读取默认样本 PCAP 作为流量基线 */
function loadDefaultPcap(): { buffer: Buffer; filename: string } {
  const candidates = [
    join(process.cwd(), '..', 'samples', 'ecommerce.pcap'),
    join(process.cwd(), 'samples', 'ecommerce.pcap'),
  ];
  for (const p of candidates) {
    try {
      return { buffer: readFileSync(p), filename: 'ecommerce.pcap' };
    } catch { /* try next */ }
  }
  // 所有路径都失败，返回空（走 mock）
  return { buffer: Buffer.alloc(0), filename: 'auto-collect.pcap' };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 });
  if (session.status === 'running') {
    return NextResponse.json({ error: 'session already running' }, { status: 409 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'invalid multipart body' }, { status: 400 });
  const file = form.get('file');
  let pcapBuffer: Buffer;
  let filename = 'capture.pcap';
  if (file instanceof File && file.size > 0) {
    // 手动上传模式：使用用户上传的 PCAP
    pcapBuffer = Buffer.from(await file.arrayBuffer());
    filename = file.name || filename;
  } else {
    // 自动采集模式：加载默认样本 PCAP（而非空 buffer）
    const def = loadDefaultPcap();
    pcapBuffer = def.buffer;
    filename = def.filename;
    console.log(`[start] 自动采集模式，使用样本: ${filename} (${pcapBuffer.length} bytes)`);
  }

  const scope = ScopeSchema.parse(session.scope);

  // 异步启动,立刻返回
  runSessionInBackground({ sessionId: id, pcapBuffer, pcapFilename: filename, scope });

  return NextResponse.json({ started: true, sessionId: id });
}
