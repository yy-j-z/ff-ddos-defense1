/**
 * Mock 降级 —— 当 DEEPSEEK_API_KEY 缺失或 LLM 调用失败时使用,
 * 保证 demo 不挂。提供"5 回合演进"剧情:
 *   R1: SYN flood → 被防御拦住
 *   R2: HTTP flood 轻量试探 → 部分绕过
 *   R3: HULK 随机参数 → 绕过缓存
 *   R4: slow_headers 慢速 → 耗尽连接池
 *   R5: 组合攻击 → 最终评估
 */
import type {
  BusinessProfile,
  AttackPlaybook,
  JudgeDecision,
  VerificationResult
} from '../types';

export const MOCK_PROFILE: BusinessProfile = {
  summary: '中等流量的电商登录服务,主要 HTTPS over TCP,客户端集中在国内常见浏览器 UA',
  protocols: { tcp: 0.85, udp: 0.1, icmp: 0.02, other: 0.03 },
  qpsBaseline: { avg: 1200, p99: 3500 },
  topApis: [
    { path: '/api/login', method: 'POST', ratio: 0.35 },
    { path: '/api/cart', method: 'GET', ratio: 0.25 },
    { path: '/api/product', method: 'GET', ratio: 0.2 }
  ],
  tlsFingerprints: ['ja3:e7d705a3286e19ea42f587b344ee6865'],
  userAgentDistribution: [
    { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0', ratio: 0.55 },
    { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/17.0', ratio: 0.25 },
    { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile Safari', ratio: 0.15 }
  ],
  vulnerabilities: [
    '/api/login 接口为高频热点且消耗较大,适合作为慢速攻击目标',
    'TLS 指纹单一,绕过难度低',
    '业务峰值 QPS 3500,流量基线相对较低易被淹没'
  ]
};

export function mockPlaybook(round: number, profile: BusinessProfile): AttackPlaybook {
  const playbooks: Record<number, AttackPlaybook> = {
    1: {
      id: `pb-mock-r1-${Date.now()}`,
      round: 1,
      intent: '试探:用 SYN flood 探测防御阈值',
      strategy: 'syn_flood',
      parameters: {
        targetUrl: process.env.DEFENDER_URL ?? 'http://defender:8080',
        targetEndpoints: profile.topApis.slice(0, 1).map((a) => a.path),
        concurrentConnections: 2000,
        requestsPerSecond: 5000,
        durationSec: 20,
        userAgents: profile.userAgentDistribution.map((u) => u.ua).slice(0, 3)
      },
      expectedBypass: '靠纯量压垮 TCP 半连接队列',
      hypothesis: '防御未启用 SYN cookies,可能直接打满'
    },
    2: {
      id: `pb-mock-r2-${Date.now()}`,
      round: 2,
      intent: '改用慢速 L7 攻击,避开速率限流',
      strategy: 'slowloris',
      parameters: {
        targetUrl: process.env.DEFENDER_URL ?? 'http://defender:8080',
        targetEndpoints: profile.topApis.slice(0, 2).map((a) => a.path),
        concurrentConnections: 5000,
        sendIntervalMs: 10000,
        durationSec: 60,
        userAgents: profile.userAgentDistribution.map((u) => u.ua)
      },
      expectedBypass: '单连接低速,绕过基于 RPS 的限流',
      hypothesis: '防御只看每 IP 速率,不看长连接堆积'
    },
    3: {
      id: `pb-mock-r3-${Date.now()}`,
      round: 3,
      intent: '模仿真实 UA + 分布式慢速,完全混入业务流量',
      strategy: 'http_flood',
      parameters: {
        targetUrl: process.env.DEFENDER_URL ?? 'http://defender:8080',
        targetEndpoints: profile.topApis.map((a) => a.path),
        concurrentConnections: 800,
        requestsPerSecond: Math.max(50, Math.min(200, Math.round((profile.qpsBaseline.avg || 1200) * 0.05))),
        durationSec: 60,
        userAgents: profile.userAgentDistribution.map((u) => u.ua),
        headers: { Accept: 'application/json,text/html;q=0.9' }
      },
      expectedBypass: 'UA/Header 与业务一致,RPS 控制在基线内',
      hypothesis: '防御缺乏行为模式分析,无法区分仿真请求'
    },
    4: {
      id: `pb-mock-r4-${Date.now()}`,
      round: 4,
      intent: '用 HULK 随机参数绕过缓存,直击后端',
      strategy: 'hulk_flood',
      parameters: {
        targetUrl: process.env.DEFENDER_URL ?? 'http://defender:8080',
        targetEndpoints: profile.topApis.slice(0, 2).map((a) => a.path),
        concurrentConnections: 500,
        requestsPerSecond: 200,
        durationSec: 45,
        userAgents: profile.userAgentDistribution.map((u) => u.ua).slice(0, 3),
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
      },
      expectedBypass: '每个请求 URL 不同,绕过 CDN/反向代理缓存',
      hypothesis: '防御依赖缓存层缓解攻击,HULK 随机参数可绕过'
    },
    5: {
      id: `pb-mock-r5-${Date.now()}`,
      round: 5,
      intent: '慢速 Header 攻击耗尽连接池,彻底瘫痪服务',
      strategy: 'slow_headers',
      parameters: {
        targetUrl: process.env.DEFENDER_URL ?? 'http://defender:8080',
        targetEndpoints: ['/api/login', '/api/cart'],
        concurrentConnections: 3000,
        durationSec: 60,
        userAgents: profile.userAgentDistribution.map((u) => u.ua).slice(0, 2)
      },
      expectedBypass: '逐字节发送 Header,绕过基于 RPS 的速率限制',
      hypothesis: '防御不检查连接建立后的数据发送速率'
    }
  };
  return playbooks[round] ?? playbooks[3];
}

export function mockJudgeDecision(round: number, maxRounds: number, history: VerificationResult[]): JudgeDecision {
  if (round === 0) {
    return {
      verdict: 'continue',
      reasoning: '初始回合,先用基础攻击探测防御能力。',
      nextIntent: '试探:用 SYN flood 探测防御阈值',
      defenseWeaknesses: [],
      recommendations: []
    };
  }
  const last = history[history.length - 1];

  // 自学习：基于实际得分决策，而非固定序列
  if (last && last.score >= 70) {
    return {
      verdict: 'success',
      reasoning: `第 ${round} 回合攻击得分 ${last.score}，成功绕过防御，无需继续。已测试 ${history.length} 种策略，防御对此类攻击无效。`,
      nextIntent: null,
      defenseWeaknesses: ['速率限制未覆盖该攻击类型', '无行为基线检测'],
      recommendations: ['启用 JA3 指纹聚类', '为高频 API 加入异常 UA 检测', '引入连接持续时间监控']
    };
  }
  if (last && last.score < 20 && history.length >= 2) {
    return {
      verdict: 'failed',
      reasoning: `连续 ${history.length} 轮得分均低于 20，防御对各类型攻击均有效。`,
      nextIntent: null,
      defenseWeaknesses: [],
      recommendations: ['继续保持现有防御规则', '可逐步收紧慢连接超时参数']
    };
  }
  if (round >= maxRounds) {
    return {
      verdict: 'failed',
      reasoning: `已达最大 ${maxRounds} 回合，最高得分 ${Math.max(...history.map(h => h.score))}。防御整体表现良好。`,
      nextIntent: null,
      defenseWeaknesses: last?.defenderRulesHit ?? [],
      recommendations: ['继续保持现有规则', '可逐步收紧慢连接超时']
    };
  }

  // 基于上一轮结果自适应选择下一轮策略
  const allStrategies = ['syn_flood', 'http_flood', 'slowloris', 'hulk_flood', 'slow_headers'];
  const usedStrategies = history.map(h => {
    // 从 playbook 中提取 strategy (这里只能从 defenderRulesHit 推测)
    return '';
  }).filter(Boolean);

  let nextIntent: string;
  if (last && last.score >= 40 && last.score < 70) {
    // 部分成功：加大力度，同类型深入
    nextIntent = `上一轮得分 ${last.score}，部分绕过成功。加大并发与持续时间，尝试完全击穿。`;
  } else if (last && last.score < 40) {
    // 被防御拦截：换完全不同策略
    nextIntent = `上一轮得分仅 ${last.score}，防御有效。改用不同攻击向量，避开已触发的 ${last.defenderRulesHit.join(',') || '规则'}。`;
  } else {
    nextIntent = '继续探索新的攻击面，寻找防御盲区。';
  }

  return {
    verdict: 'continue',
    reasoning: `第 ${round}/${maxRounds} 轮，上轮得分 ${last?.score ?? 0}。${nextIntent}`,
    nextIntent,
    defenseWeaknesses: last?.defenderRulesHit ?? [],
    recommendations: last && last.score > 30
      ? ['建议针对本轮攻击类型加强防御', '增加行为基线检测']
      : []
  };
}

export function isMockMode(): boolean {
  return !process.env.DEEPSEEK_API_KEY;
}
