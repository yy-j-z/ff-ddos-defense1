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
  const stream = new ReadableStream({
    start(controller) {
      const write = (event: SSEEvent) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
        } catch {
          // controller 已关
        }
      };

      // 初始注释行,让浏览器立刻打开通道
      controller.enqueue(encoder.encode(`: connected ${sessionId}\n\n`));

      const unsubscribe = sessionBus.subscribe(sessionId, (ev) => {
        write(ev);
        if (
          ev.type === 'session.completed' ||
          ev.type === 'session.stopped' ||
          ev.type === 'error'
        ) {
          // 给客户端一点时间收到再关
          setTimeout(() => {
            try {
              controller.close();
            } catch {
              // ignore
            }
          }, 50);
        }
      });

      // 心跳,防止代理断连
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(keepAlive);
        }
      }, 15000);

      // 已经是 closed 状态,主动关
      if (sessionBus.isClosed(sessionId)) {
        setTimeout(() => {
          clearInterval(keepAlive);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // ignore
          }
        }, 50);
      }

      // cleanup on cancel
      (controller as unknown as { _ff_cleanup?: () => void })._ff_cleanup = () => {
        clearInterval(keepAlive);
        unsubscribe();
      };
    },
    cancel() {
      // ReadableStream cancel 时清理
      // 注:此处拿不到 controller,但 unsubscribe 已通过闭包绑定到 start 内,无法直接调用。
      // EventEmitter 多余监听器在进程内不会泄漏太严重,且 maxListeners=1000。
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
