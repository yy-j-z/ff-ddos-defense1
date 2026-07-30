/**
 * Embedding 生成模块
 * 调用 DeepSeek Embedding API（兼容 OpenAI 协议），将文本转为向量。
 *
 * 降级策略：如果 API 调用失败（网络/限频/模型不可用），返回 null，
 * 调用方自行跳过 RAG 环节，不阻塞主流程。
 */
import { llm } from '../llm/client';

const EMBEDDING_MODEL = 'deepseek-embedding';

/**
 * 将一段文本转为向量。
 * @returns number[] | null — 失败时返回 null，绝不抛异常
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!text || text.trim().length === 0) return null;

  try {
    const resp = await llm.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.trim().slice(0, 8000), // 避免超长输入
    });
    const vec = resp.data?.[0]?.embedding;
    if (!vec || !Array.isArray(vec) || vec.length === 0) {
      console.warn('[rag] embedding 返回空结果');
      return null;
    }
    return vec;
  } catch (err) {
    console.warn('[rag] embedding 生成失败，降级跳过 RAG:', (err as Error).message?.slice(0, 120));
    return null;
  }
}

/**
 * 从 AttackPlaybook 提取用于生成向量的文本。
 * 目标是让「意图相似」的攻击策略在向量空间中靠得近。
 */
export function playbookToEmbeddingText(playbook: {
  strategy: string;
  intent: string;
  hypothesis: string;
  expectedBypass?: string;
  parameters?: {
    targetEndpoints?: string[];
    userAgents?: string[];
  };
}): string {
  const parts: string[] = [];
  parts.push(`Strategy: ${playbook.strategy}`);
  parts.push(`Intent: ${playbook.intent}`);
  parts.push(`Hypothesis: ${playbook.hypothesis}`);
  if (playbook.expectedBypass) {
    parts.push(`ExpectedBypass: ${playbook.expectedBypass}`);
  }
  const eps = playbook.parameters?.targetEndpoints;
  if (eps && eps.length > 0) {
    parts.push(`Endpoints: ${eps.join(', ')}`);
  }
  const uas = playbook.parameters?.userAgents;
  if (uas && uas.length > 0) {
    parts.push(`UserAgents: ${uas.join(', ')}`);
  }
  return parts.join('\n');
}

/**
 * 从 BusinessProfile 提取用于搜索向量的文本（查询条件）。
 */
export function profileToEmbeddingText(profile: {
  summary: string;
  vulnerabilities?: string[];
  topApis?: Array<{ path: string; method: string }>;
  userAgentDistribution?: Array<{ ua: string; ratio: number }>;
  qpsBaseline?: { avg: number };
}): string {
  const parts: string[] = [];
  parts.push(`Summary: ${profile.summary}`);
  if (profile.vulnerabilities && profile.vulnerabilities.length > 0) {
    parts.push(`Vulnerabilities: ${profile.vulnerabilities.join('; ')}`);
  }
  if (profile.topApis && profile.topApis.length > 0) {
    parts.push(
      `TopAPIs: ${profile.topApis.map((a) => `${a.method} ${a.path}`).join(', ')}`
    );
  }
  if (profile.userAgentDistribution && profile.userAgentDistribution.length > 0) {
    parts.push(
      `UAs: ${profile.userAgentDistribution.map((u) => u.ua).join(', ')}`
    );
  }
  if (profile.qpsBaseline) {
    parts.push(`QPS: ${profile.qpsBaseline.avg}`);
  }
  return parts.join('\n');
}
