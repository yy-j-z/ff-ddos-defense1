/**
 * Analyzer Agent
 * 输入: PCAP 摘要(JSON 对象或字符串)
 * 输出: BusinessProfile —— 攻击者视角的业务画像
 */
import { generateObject } from '../llm/client';
import { BusinessProfileSchema, type BusinessProfile } from '../types';
import { MOCK_PROFILE, isMockMode } from './mock';

const SYSTEM = `你是流量分析专家。给定一段网络流量(PCAP)摘要,请提取**可被攻击者利用的业务画像**,而非通用统计指标。
要求:
- summary 必须从攻击视角描述业务特征
- vulnerabilities 字段要列出 3~5 条具体可利用薄弱点(如热点 API、单一 UA、低 QPS 基线等)
- topApis 优先选择高频且业务关键的端点
- 不要编造未在摘要中出现的字段;缺失数据请用合理近似值`;

export async function runAnalyzer(input: {
  pcapSummary: object | string;
}): Promise<{ profile: BusinessProfile; thinking?: string }> {
  if (isMockMode()) {
    return { profile: MOCK_PROFILE, thinking: 'mock mode: 跳过 LLM 调用,使用预设业务画像' };
  }
  const summaryText =
    typeof input.pcapSummary === 'string' ? input.pcapSummary : JSON.stringify(input.pcapSummary, null, 2);

  try {
    const { object, thinking } = await generateObject({
      tier: 'flash',
      system: SYSTEM,
      prompt: `下面是 PCAP 解析后的摘要,请输出 BusinessProfile:\n\n${summaryText}`,
      schema: BusinessProfileSchema,
      schemaName: 'BusinessProfile',
      temperature: 0.3
    });
    return { profile: object, thinking };
  } catch (err) {
    console.error('[analyzer] LLM 失败,降级到 mock', err);
    return { profile: MOCK_PROFILE, thinking: `fallback: ${(err as Error).message}` };
  }
}
