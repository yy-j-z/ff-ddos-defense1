/**
 * In-memory pubsub —— 把 orchestrator 的 SSEEvent 转给 /api/stream 的订阅者
 * key = sessionId。订阅者通过 subscribe(sessionId, handler) 获取事件。
 *
 * 注意:进程内单例。多进程部署需要换 Redis pub/sub。
 */
import { EventEmitter } from 'node:events';
import type { SSEEvent } from '../types';

// Next.js dev mode hot-reload 会丢失模块状态,用 global 兜底
const globalKey = '__ff_session_bus__';
type GlobalWithBus = typeof globalThis & { [globalKey]?: SessionBus };

class SessionBus {
  private readonly emitter = new EventEmitter();
  // 每个 session 缓存历史事件,新连上的 SSE 客户端可以重放
  private readonly buffers = new Map<string, SSEEvent[]>();
  private readonly closed = new Set<string>();

  constructor() {
    this.emitter.setMaxListeners(1000);
  }

  publish(sessionId: string, event: SSEEvent) {
    const buf = this.buffers.get(sessionId) ?? [];
    buf.push(event);
    this.buffers.set(sessionId, buf);
    this.emitter.emit(sessionId, event);
    if (event.type === 'session.completed' || event.type === 'session.stopped' || event.type === 'error') {
      this.closed.add(sessionId);
    }
  }

  subscribe(sessionId: string, handler: (event: SSEEvent) => void): () => void {
    // 先重放
    const buf = this.buffers.get(sessionId) ?? [];
    for (const e of buf) handler(e);
    if (this.closed.has(sessionId)) {
      // 终态已发,无需后续监听
      return () => {};
    }
    this.emitter.on(sessionId, handler);
    return () => this.emitter.off(sessionId, handler);
  }

  isClosed(sessionId: string): boolean {
    return this.closed.has(sessionId);
  }

  history(sessionId: string): SSEEvent[] {
    return this.buffers.get(sessionId) ?? [];
  }
}

function getBus(): SessionBus {
  const g = globalThis as GlobalWithBus;
  if (!g[globalKey]) g[globalKey] = new SessionBus();
  return g[globalKey]!;
}

export const sessionBus = getBus();
