/**
 * 相似策略搜索模块
 * 基于 pgvector 余弦距离，搜索与当前业务画像最相似的历史成功策略。
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import type { AttackPlaybook } from '../types';

export interface RagResult {
  playbook: AttackPlaybook;
  score: number;         // 该策略的历史得分（越高说明攻击越有效）
  similarity: number;    // 相似度 0~1（1=完全一致）
  createdAt: string;
}

/**
 * 搜索与 queryVector 最相似的 topK 个历史策略。
 * 要求：该策略历史得分 >= minScore（默认 50，太低的不值得参考）
 * 返回按相似度降序排列。
 *
 * 如果 pgvector 查询失败或没有数据，返回空数组。
 */
export async function searchSimilarPlaybooks(
  queryVector: number[],
  topK: number = 3,
  minScore: number = 50
): Promise<RagResult[]> {
  if (!queryVector || queryVector.length === 0) return [];

  try {
    // 使用 pgvector 的余弦距离(<->)，距离越小 = 越相似
    // 只检索历史得分 >= minScore 的策略，避免参考"失败经验"
    const rows = await db.execute<{
      data: unknown;
      score: number;
      intent: string;
      strategy: string;
      created_at: string;
      distance: number;
    }>(sql`
      SELECT
        data,
        score,
        intent,
        strategy,
        created_at,
        embedding <-> ${JSON.stringify(queryVector)}::vector AS distance
      FROM playbooks
      WHERE
        embedding IS NOT NULL
        AND score >= ${minScore}
      ORDER BY distance ASC
      LIMIT ${topK}
    `);

    if (!rows || rows.length === 0) return [];

    return rows.map((row) => {
      // 余弦距离转相似度：similarity = 1 / (1 + distance)
      const distance = Number(row.distance ?? 1);
      const similarity = distance < 0.001 ? 1.0 : Math.round((1 / (1 + distance)) * 100) / 100;
      return {
        playbook: (typeof row.data === 'string' ? JSON.parse(row.data) : row.data) as AttackPlaybook,
        score: row.score,
        similarity,
        createdAt: String(row.created_at ?? ''),
      };
    });
  } catch (err) {
    console.warn('[rag] 相似搜索失败，降级跳过 RAG:', (err as Error).message?.slice(0, 120));
    return [];
  }
}
