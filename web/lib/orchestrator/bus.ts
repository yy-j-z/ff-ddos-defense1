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

// 单个 session 缓存的最大事件数(防止某个长会话把内存撑爆);超出后丢弃最旧事件。
const MAX_BUFFER_PER_SESSION = 5000;
// 会话进入终态后,保留缓存供迟到的重连客户端重放的时长,到期后彻底释放。
const RETENTION_MS = 10 * 60 * 1000;

class SessionBus {
  private readonly emitter = new EventEmitter();
  // 每个 session 缓存历史事件,新连上的 SSE 客户端可以重放
  private readonly buffers = new Map<string, SSEEvent[]>();
  private readonly closed = new Set<string>();
  private readonly evictTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    this.emitter.setMaxListeners(1000);
  }

  publish(sessionId: string, event: SSEEvent) {
    const buf = this.buffers.get(sessionId) ?? [];
    buf.push(event);
    // 限制单会话缓存上限,丢弃最旧事件(FIFO)
    if (buf.length > MAX_BUFFER_PER_SESSION) {
      buf.splice(0, buf.length - MAX_BUFFER_PER_SESSION);
    }
    this.buffers.set(sessionId, buf);
    this.emitter.emit(sessionId, event);
    if (event.type === 'session.completed' || event.type === 'session.stopped' || event.type === 'error') {
      this.closed.add(sessionId);
      this.scheduleEviction(sessionId);
    }
  }

  // 终态后延迟释放该 session 的所有内存(缓存 + closed 标记 + 残留监听器)
  private scheduleEviction(sessionId: string) {
    const existing = this.evictTimers.get(sessionId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.buffers.delete(sessionId);
      this.closed.delete(sessionId);
      this.evictTimers.delete(sessionId);
      this.emitter.removeAllListeners(sessionId);
    }, RETENTION_MS);
    // 不阻止进程退出
    (timer as { unref?: () => void }).unref?.();
    this.evictTimers.set(sessionId, timer);
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
