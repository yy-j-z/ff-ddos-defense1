import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { ATTACK_QUEUE, type AttackJobData, type AttackJobResult } from '../types';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null
});

export const attackQueue = new Queue<AttackJobData, AttackJobResult>(ATTACK_QUEUE, { connection });

export async function enqueueAttack(data: AttackJobData) {
  const job = await attackQueue.add('run', data, {
    removeOnComplete: 100,
    removeOnFail: 100,
    attempts: 1
  });
  return job.id!;
}

/**
 * 等待攻击结果。
 *
 * 不用 BullMQ 的 `waitUntilFinished`(依赖 events stream 的 completed 事件),
 * 因为 Python worker 走的是直连 Redis 的简化协议:只把结果写进
 * `bull:<queue>:<jobId>` 哈希的 `returnvalue` 字段。这里直接轮询该哈希,
 * 对原生 BullMQ worker 和 Python fallback worker 都兼容。
 */
export async function waitForAttack(jobId: string, timeoutMs = 90000): Promise<AttackJobResult> {
  const key = `bull:${ATTACK_QUEUE}:${jobId}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [ret, failed] = await connection.hmget(key, 'returnvalue', 'failedReason');
    if (ret) return JSON.parse(ret) as AttackJobResult;
    if (failed) throw new Error(`attack job ${jobId} failed: ${failed}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`attack job ${jobId} timed out after ${timeoutMs}ms`);
}
