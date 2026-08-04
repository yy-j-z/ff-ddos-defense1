/**
 * GET /api/sessions/[id]/report —— 导出会话 Markdown 报告
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionDetail } from '@/lib/db/queries';
import type { AttackPlaybook, VerificationResult, JudgeDecision, BusinessProfile, ThinkingEntry } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escMd(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function fmtDate(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

function buildReport(detail: Awaited<ReturnType<typeof getSessionDetail>>): string {
  if (!detail) return '# 会话不存在\n';

  const lines: string[] = [];
  const sep = '---';

  // ── 标题 ──
  lines.push(`# FF DDoS 防御自检报告`);
  lines.push(sep);
  lines.push(`**会话名称**: ${detail.name}`);
  lines.push(`**创建时间**: ${detail.createdAt}`);
  lines.push(`**状态**: ${detail.status === 'completed' ? '防御有效 ✅' : detail.status === 'failed' ? '检测结论：发现防御盲区（攻击已绕过）⚠️' : detail.status}`);
  lines.push(`**最大回合**: ${detail.maxRounds}`);
  // L4: 证据完整性标注 —— 走了降级路径时醒目标注,杜绝"看起来通过"
  if (detail.meta) {
    const m = detail.meta;
    const metaNotes: string[] = [];
    if (m.llmMode === 'mock') metaNotes.push('全程 mock 模式(LLM 未接入)');
    if (m.llmMode === 'mixed') metaNotes.push('部分 Agent 走降级(mock/fallback)');
    if (m.attackMode === 'mock') metaNotes.push('攻击执行走 mock(队列/Worker 不可用)');
    if (m.pcapStatus === 'failed') metaNotes.push('PCAP 解析失败,业务画像基于占位摘要');
    if (m.evidenceIncomplete) metaNotes.push('存在证据不完整的回合(防御日志缺失/读取失败)');
    if (m.fallbackCount > 0) metaNotes.push(`降级/回退 ${m.fallbackCount} 次`);
    if (metaNotes.length > 0) {
      lines.push(`> ⚠️ **执行降级提示**: ${metaNotes.join('；')}。本报告部分结论基于降级数据,仅供演示参考。`);
      lines.push('');
    }
  }
  lines.push('');

  // ── 业务画像 ──
  if (detail.profile) {
    const p = detail.profile;
    lines.push(`## 业务画像`);
    lines.push(sep);
    lines.push(`**摘要**: ${p.summary}`);
    if (p.qpsBaseline) {
      lines.push(`**QPS 基线**: avg=${p.qpsBaseline.avg}, p99=${p.qpsBaseline.p99}`);
    }
    if (p.protocols) {
      const proto = Object.entries(p.protocols)
        .filter(([_, v]) => (v as number) > 0)
        .map(([k, v]) => `${k}=${((v as number) * 100).toFixed(0)}%`)
        .join(', ');
      lines.push(`**协议分布**: ${proto}`);
    }
    if (p.topApis && p.topApis.length > 0) {
      lines.push(`**Top API**:`);
      for (const api of p.topApis) {
        lines.push(`  - \`${api.method} ${api.path}\` (占比 ${((api.ratio) * 100).toFixed(0)}%)`);
      }
    }
    if (p.vulnerabilities && p.vulnerabilities.length > 0) {
      lines.push(`**发现弱点**:`);
      for (const v of p.vulnerabilities) {
        lines.push(`  - ${v}`);
      }
    }
    lines.push('');
  }

  // ── 各回合详情 ──
  lines.push(`## 攻防回合记录`);
  lines.push(sep);

  const pbMap = new Map<number, AttackPlaybook>();
  const verMap = new Map<string, VerificationResult>();
  for (const pb of detail.playbooks) {
    pbMap.set(pb.round, pb);
  }
  for (const v of detail.verifications) {
    verMap.set(v.playbookId, v);
  }

  for (let r = 1; r <= detail.maxRounds; r++) {
    const pb = pbMap.get(r);
    if (!pb) {
      lines.push(`### 第 ${r} 轮 — 无数据`);
      lines.push('');
      continue;
    }
    const ver = verMap.get(pb.id);

    lines.push(`### 第 ${r} 轮 — ${pb.strategy}`);
    lines.push(sep);
    lines.push(`**攻击意图**: ${pb.intent}`);
    lines.push(`**策略**: \`${pb.strategy}\``);
    lines.push(`**攻击假设**: ${pb.hypothesis}`);
    lines.push(`**预期绕过**: ${pb.expectedBypass}`);

    // 参数
    const params = pb.parameters;
    const paramParts: string[] = [];
    if (params.targetEndpoints) paramParts.push(`目标端点: ${params.targetEndpoints.join(', ')}`);
    if (params.requestsPerSecond) paramParts.push(`速率: ${params.requestsPerSecond} req/s`);
    if (params.concurrentConnections) paramParts.push(`并发: ${params.concurrentConnections}`);
    if (params.durationSec) paramParts.push(`时长: ${params.durationSec}s`);
    if (paramParts.length > 0) {
      lines.push(`**攻击参数**: ${paramParts.join(' | ')}`);
    }

    // 验证结果
    if (ver) {
      lines.push('');
      lines.push(`**验证结果**:`);
      lines.push(`| 指标 | 值 |`);
      lines.push(`|------|-----|`);
      lines.push(`| 绕过得分 | ${ver.score}/100 |`);
      lines.push(`| 可达性 | ${(ver.reachability * 100).toFixed(0)}% |`);
      lines.push(`| 总请求 | ${ver.totalRequests} |`);
      lines.push(`| 被拦截 | ${ver.blockedRequests} |`);
      lines.push(`| 防御触发 | ${ver.defenderTriggered ? '是 ✅' : '否 ❌'} |`);
      if (ver.defenderRulesHit && ver.defenderRulesHit.length > 0) {
        lines.push(`| 命中规则 | ${ver.defenderRulesHit.join(', ')} |`);
      }
      lines.push(`| 业务影响 | ${ver.businessImpact} |`);
      if (ver.logStatus && ver.logStatus !== 'ok') {
        lines.push(`| ⚠️ 防御日志 | 读取失败(status=${ver.logStatus}),证据不完整,本回合得分仅供参考 |`);
      }
    }

    lines.push('');
  }

  // ── Judge 最终判定 ──
  if (detail.judge) {
    const j = detail.judge;
    lines.push(`## Judge 最终判定`);
    lines.push(sep);
    lines.push(`**裁决**: ${j.verdict === 'success' ? '攻击成功' : j.verdict === 'failed' ? '攻击失败' : j.verdict === 'continue' ? '继续' : '已停止'}`);
    lines.push(`**推理过程**: ${j.reasoning}`);
    if (j.defenseWeaknesses && j.defenseWeaknesses.length > 0) {
      lines.push(`**发现防御弱点**:`);
      for (const w of j.defenseWeaknesses) {
        lines.push(`  - ${w}`);
      }
    }
    if (j.recommendations && j.recommendations.length > 0) {
      lines.push(`**加固建议**:`);
      for (const r of j.recommendations) {
        lines.push(`  - ${r}`);
      }
    }
    lines.push('');
  }

  // ── Agent 推理摘要 ──
  if (detail.thinking && detail.thinking.length > 0) {
    lines.push(`## Agent 推理过程`);
    lines.push(sep);
    for (const t of detail.thinking) {
      lines.push(`**${t.agent.toUpperCase()}**: ${escMd(t.text)}`);
      lines.push('');
    }
  }

  lines.push(sep);
  lines.push(`*报告由 FF DDoS 防御自检系统自动生成 — ${new Date().toISOString()}*`);

  return lines.join('\n');
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getSessionDetail(id);
  if (!detail) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const md = buildReport(detail);
  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="ff-report-${id.slice(0, 8)}.md"`,
    },
  });
}
