/**
 * Attacker Agent
 * 输入: BusinessProfile + intent + 历史 playbook/verification(防止重复无效策略)
 * 输出: AttackPlaybook —— 参数化攻击剧本
 */
import { generateObject } from '../llm/client';
import {
  AttackPlaybookSchema,
  type AttackPlaybook,
  type BusinessProfile,
  type VerificationResult
} from '../types';
import { isMockMode, mockPlaybook } from './mock';

const SYSTEM = `你是红队专家,负责全面评估防御系统的能力。你的任务不是"不惜一切代价绕过防御",
而是**系统性地用不同攻击策略测试防御的各个维度**,找出薄弱点和强项。

核心规则:
- **每轮必须使用与之前不同的 strategy**——只有尝试不同类型攻击,才能全面评估防御
- 如果某策略得分高(>60),说明防御对此策略无效,下一轮换另一种策略继续测试
- 如果某策略得分低(<30),说明防御对此策略有效,换一个方向试探
- 5 轮的目标是覆盖尽可能多的攻击类型,而非死磕一种
- 每次换策略时,分析上一轮的结果来调整新策略的参数

其他要求:
- intent 要具体到"绕过什么机制",不要泛泛而谈
- hypothesis 必须给出防御的可能弱点假设
- expectedBypass 描述绕过路径
- parameters 必须真实反映业务画像(这是本系统"按你的流量定制攻击"的核心,不可省略):
  · targetEndpoints 必须取自 profile.topApis 的 path(攻击要瞄准真实业务接口,严禁使用通用 "/")
  · userAgents 必须取自 profile.userAgentDistribution 的 ua(攻击流量要混入真实 UA,伪装成正常用户)
  · requestsPerSecond 以 profile.qpsBaseline.avg 为参照:意图为"混入基线"时取接近基线的值,意图为"压垮"时取明显高于基线的值
  · 若 profile.vulnerabilities 指出某接口弱点,优先把该接口放進 targetEndpoints
- strategy 只能在允许列表中选择`;

export async function runAttacker(input: {
  profile: BusinessProfile;
  intent: string;
  round: number;
  allowedStrategies?: string[];
  previousPlaybooks?: AttackPlaybook[];
  previousResults?: VerificationResult[];
}): Promise<{ playbook: AttackPlaybook; thinking?: string }> {
  if (isMockMode()) {
    return {
      playbook: mockPlaybook(input.round, input.profile),
      thinking: 'mock mode: 使用预设剧本演进序列'
    };
  }

  const historySection =
    input.previousPlaybooks && input.previousPlaybooks.length > 0
      ? (() => {
          const lines = input.previousPlaybooks!.map((pb, i) => {
            const res = input.previousResults?.[i];
            let line = `第 ${pb.round} 轮: strategy=${pb.strategy}, intent="${pb.intent}", hypothesis="${pb.hypothesis}"`;
            if (res) line += ` → 得分 ${res.score}, 命中规则 ${res.defenderRulesHit.join(',') || '无'}`;
            return line;
          });
          const used = [...new Set(input.previousPlaybooks!.map(p => p.strategy))].join(', ');
          return `\n\n## 历史回合\n${lines.join('\n')}\n\n**已用过的策略**: ${used}\n请从尚未使用过的策略中选择,若已全部使用过,则选之前得分最低的策略调整参数重新尝试。`;
        })()
      : '';

  const allowed = (input.allowedStrategies ?? ['slowloris', 'http_flood', 'syn_flood']).join(', ');
  const prompt = `## 业务画像\n${JSON.stringify(input.profile, null, 2)}

## 本轮意图
${input.intent}

## 允许的 strategy
${allowed}

## 当前回合号
${input.round}${historySection}

请输出符合 AttackPlaybookSchema 的剧本。id 用 "pb-r${input.round}-<short-uuid>" 形式。`;

  try {
    const { object, thinking } = await generateObject({
      tier: 'flash',
      system: SYSTEM,
      prompt,
      schema: AttackPlaybookSchema,
      schemaName: 'AttackPlaybook',
      temperature: 0.8
    });
    const playbook = { ...object, round: input.round } as AttackPlaybook;
    return { playbook, thinking };
  } catch (err) {
    // 第 1 次重试：告诉 LLM 哪里错了，让它修正
    const errMsg = (err as Error).message;
    console.warn('[attacker] 第1次失败，重试...', errMsg.slice(0, 120));
    try {
      const retryPrompt = prompt + `\n\n⚠️ 上一次生成失败: ${errMsg}\n请修正以下问题:\n- requestsPerSecond 和 sendIntervalMs 必须 > 0（不能为 0）\n- concurrentConnections 必须 > 0（不能为 0）\n- durationSec 必须 > 0（不能为 0）`;
      const { object: retryObj, thinking: retryThinking } = await generateObject({
        tier: 'flash',
        system: SYSTEM,
        prompt: retryPrompt,
        schema: AttackPlaybookSchema,
        schemaName: 'AttackPlaybook',
        temperature: 0.4  // 降低温度，让输出更稳定
      });
      const playbook = { ...retryObj, round: input.round } as AttackPlaybook;
      console.log('[attacker] 重试成功');
      return { playbook, thinking: retryThinking || `retry after: ${errMsg.slice(0, 80)}` };
    } catch (retryErr) {
      console.error('[attacker] 重试仍失败，降级到 mock', (retryErr as Error).message.slice(0, 120));
      return {
        playbook: mockPlaybook(input.round, input.profile),
        thinking: `fallback after retry: ${(retryErr as Error).message.slice(0, 100)}`
      };
    }
  }
}
