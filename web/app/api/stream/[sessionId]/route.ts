/**
 * GET /api/stream/[sessionId] —— SSE 推送 orchestrator 事件
 * Content-Type: text/event-stream
 */
import { NextRequest } from 'next/server';
import { sessionBus } from '@/lib/orchestrator/bus';
import type { SSEEvent } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  const encoder = new TextEncoder();

  // 这些句柄在 start 内赋值,cancel(客户端断开)时用于清理,避免 listener/interval 泄漏。
  let unsubscribe: (() => void) | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (keepAlive) clearInterval(keepAlive);
    if (unsubscribe) unsubscribe();
    keepAlive = null;
    unsubscribe = null;
  };

  const stream = new ReadableStream({
    start(controller) {
      const write = (event: SSEEvent) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
        } catch {
          // controller 已关
        }
      };

      const closeStream = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      // 初始注释行,让浏览器立刻打开通道
      controller.enqueue(encoder.encode(`: connected ${sessionId}\n\n`));

      unsubscribe = sessionBus.subscribe(sessionId, (ev) => {
        write(ev);
        if (
          ev.type === 'session.completed' ||
          ev.type === 'session.stopped' ||
          ev.type === 'error'
        ) {
          // 给客户端一点时间收到再关(同时清理订阅与心跳)
          setTimeout(closeStream, 50);
        }
      });

      // 心跳,防止代理断连
      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 15000);

      // 已经是 closed 状态,主动关
      if (sessionBus.isClosed(sessionId)) {
        setTimeout(closeStream, 50);
      }
    },
    cancel() {
      // 客户端断开时触发:解绑 bus 监听并清除心跳,防止泄漏。
      cleanup();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}
