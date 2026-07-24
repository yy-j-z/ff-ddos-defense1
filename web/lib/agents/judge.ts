/**
 * Judge Agent
 * 模型: deepseek-v4-pro + extended thinking
 * 综合历史结果决定下一轮策略或终止
 */
import { generateObject } from '../llm/client';
import {
  JudgeDecisionSchema,
  type JudgeDecision,
  type BusinessProfile,
  type AttackPlaybook,
  type VerificationResult
} from '../types';
import { isMockMode, mockJudgeDecision } from './mock';

const SYSTEM = `你是攻防对抗指挥官。综合本场所有历史回合,做出本轮决策:
- verdict='continue': 继续下一轮,nextIntent 必填,要给出**具体、可执行**的新意图
- verdict='success': 已成功绕过防御(通常单轮得分 >=80 或综合趋势明确)
- verdict='failed': 达到回合上限仍未成功
- verdict='stop': 风险过高或业务被严重影响,需要终止
要求:
- reasoning 要引用具体数字(得分/可达率/命中规则)
- defenseWeaknesses 列出已被验证的防御弱点
- recommendations 给防御团队的加固建议(具体到规则/参数层面)
- 评估时注意分析**已测试了哪些攻击类型、哪些尚未测试**,确保覆盖全面
- 最终评估时要总结:防御对各类型攻击的有效性分别如何`;

export async function runJudge(input: {
  profile: BusinessProfile;
  history: Array<{ playbook: AttackPlaybook; result: VerificationResult }>;
  round: number;
  maxRounds: number;
}): Promise<{ decision: JudgeDecision; thinking?: string }> {
  if (isMockMode()) {
    return {
      decision: mockJudgeDecision(
        input.round,
        input.maxRounds,
        input.history.map((h) => h.result)
      ),
      thinking: 'mock mode: 基于预设规则推进'
    };
  }

  const historyText =
    input.history.length === 0
      ? '(尚无历史回合,请给出第一轮的攻击意图)'
      : input.history
          .map(
            (h, i) =>
              `### 第 ${h.playbook.round} 轮\n- intent: ${h.playbook.intent}\n- strategy: ${h.playbook.strategy}\n- hypothesis: ${h.playbook.hypothesis}\n- score: ${h.result.score} | reachability: ${h.result.reachability} | defenderTriggered: ${h.result.defenderTriggered} | rules: ${h.result.defenderRulesHit.join(',') || '无'} | businessImpact: ${h.result.businessImpact}`
          )
          .join('\n\n');

  const prompt = `## 业务画像\n${JSON.stringify(input.profile, null, 2)}

## 当前回合: ${input.round} / 最大 ${input.maxRounds}

## 历史回合
${historyText}

请输出本轮 JudgeDecision。`;

  try {
    const { object, thinking } = await generateObject({
      tier: 'pro',
      system: SYSTEM,
      prompt,
      schema: JudgeDecisionSchema,
      schemaName: 'JudgeDecision',
      temperature: 0.4,
      enableThinking: true,
      maxTokens: 6000
    });
    // 安全降级:如果到了最大回合,强制非 continue
    if (object.verdict === 'continue' && input.round >= input.maxRounds) {
      const last = input.history[input.history.length - 1];
      object.verdict = (last && last.result.score >= 80 ? 'success' : 'failed') as JudgeDecision['verdict'];
      object.nextIntent = null;
    }
    return { decision: object, thinking };
  } catch (err) {
    // 重试一次
    const errMsg = (err as Error).message;
    console.warn('[judge] 第1次失败，重试...', errMsg.slice(0, 120));
    try {
      const { object: retryObj, thinking: retryThinking } = await generateObject({
        tier: 'pro',
        system: SYSTEM,
        prompt: prompt + `\n\n⚠️ 上一次生成失败: ${errMsg}\n请确保 verdict 是 continue/success/failed/stop 之一。`,
        schema: JudgeDecisionSchema,
        schemaName: 'JudgeDecision',
        temperature: 0.2,
        enableThinking: true,
        maxTokens: 6000
      });
      if (retryObj.verdict === 'continue' && input.round >= input.maxRounds) {
        const last = input.history[input.history.length - 1];
        retryObj.verdict = (last && last.result.score >= 80 ? 'success' : 'failed') as JudgeDecision['verdict'];
        retryObj.nextIntent = null;
      }
      console.log('[judge] 重试成功');
      return { decision: retryObj, thinking: retryThinking };
    } catch (retryErr) {
      console.error('[judge] 重试仍失败，降级到 mock', (retryErr as Error).message.slice(0, 120));
      return {
        decision: mockJudgeDecision(
          input.round,
          input.maxRounds,
          input.history.map((h) => h.result)
        ),
        thinking: `fallback after retry: ${(retryErr as Error).message.slice(0, 100)}`
      };
    }
  }
}
