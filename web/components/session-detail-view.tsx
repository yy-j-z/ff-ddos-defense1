'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlaybookCard } from '@/components/playbook-card';
import { AttackChart } from '@/components/attack-chart';
import { AgentThinking } from '@/components/agent-thinking';
import { VerifierGauge } from '@/components/verifier-gauge';
import { JudgePanel } from '@/components/judge-panel';
import { cn } from '@/lib/utils';
import { useSessionStream, type SessionStreamSeed } from '@/components/use-session-stream';

export interface SessionDetailViewProps {
  sessionId: string;
  name: string;
  createdAt: string;
  maxRounds: number;
  live: boolean;
  seed: SessionStreamSeed;
}

const statusMeta: Record<string, { label: string; variant: 'success' | 'neutral' | 'info' }> = {
  live: { label: '实时连接', variant: 'success' },
  connecting: { label: '连接中', variant: 'info' },
  closed: { label: '已结束', variant: 'neutral' }
};

export function SessionDetailView({
  sessionId,
  name,
  createdAt,
  maxRounds,
  live,
  seed
}: SessionDetailViewProps) {
  const stream = useSessionStream(sessionId, live, seed);

  const latest = stream.verifications[stream.verifications.length - 1] ?? null;
  const playbookScoreById = new Map(stream.verifications.map((v) => [v.playbookId, v.score]));
  const bestScore = stream.verifications.reduce((m, v) => Math.max(m, v.score), 0);
  const status = statusMeta[stream.status] ?? statusMeta.closed;

  return (
    <div className="flex h-full flex-col" style={{ background: '#060812' }}>
      {/* 全屏扫描光线 */}
      <div
        className="fixed left-0 right-0 h-px z-50 pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent, #06b6d4, transparent)',
          boxShadow: '0 0 8px rgba(6,182,212,0.3)',
          animation: 'scan-line 3s linear infinite'
        }}
      />

      {/* 固定页头：暗色背景 + 底部扫描线 */}
      <header
        className="shrink-0 border-b px-8 pb-5 pt-6 relative"
        style={{
          background: 'linear-gradient(135deg, #0a0e1a 0%, #111827 50%, #0a0e1a 100%)',
          borderColor: '#1f2937'
        }}
      >
        {/* 扫描光线 */}
        <div
          className="absolute left-0 right-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, #06b6d4, transparent)',
            animation: 'scan-line 4s linear infinite'
          }}
        />

        <div className="mx-auto max-w-5xl space-y-3 relative z-10">
          <nav className="flex items-center gap-1.5 text-xs text-slate-500">
            <Link href="/dashboard" className="hover:text-[#06b6d4] transition-colors">
              自检任务
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-slate-300">{name}</span>
          </nav>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold tracking-tight text-white">{name}</h1>
                <Badge variant={status.variant} dot>
                  {status.label}
                </Badge>
              </div>
              <div className="font-mono text-[11px] text-slate-500">
                {sessionId.slice(0, 8)} · {createdAt}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={`/api/sessions/${sessionId}/report`}
                download
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06b6d4] focus-visible:ring-offset-1 focus-visible:ring-offset-[#060812] disabled:pointer-events-none disabled:opacity-50 border border-[#1f2937] bg-transparent text-slate-400 hover:bg-[#111827] hover:text-white h-8 px-3"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                导出攻防测试报告
              </a>
              <Stat label="当前回合" value={`${stream.playbooks.length}`} suffix={`/ ${maxRounds}`} />
              <Stat
                label="最佳得分"
                value={bestScore ? `${bestScore}` : '—'}
                tone={bestScore >= 70 ? 'text-red-400' : undefined}
              />
            </div>
          </div>
        </div>
      </header>

      {/* 主体 */}
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-8 py-6 lg:overflow-hidden">
        <div className="mx-auto grid max-w-5xl grid-cols-12 gap-6 lg:h-full">
          {/* 左栏 */}
          <div className="col-span-12 lg:col-span-8 lg:h-full lg:min-h-0">
            <Card className="scroll-quiet divide-y divide-[#1f2937] lg:max-h-full lg:overflow-y-auto">
              <Section
                title="攻防流量"
                aside={
                  <div className="flex items-center gap-4 text-[11px] text-slate-400">
                    <Legend color="#06b6d4" label="总流量" />
                    <Legend color="#ef4444" label="被拦截" />
                  </div>
                }
              >
                {stream.metrics.length === 0 ? (
                  <div className="flex h-56 items-center justify-center text-xs text-slate-600">
                    {stream.status === 'closed' ? '本会话无实时指标记录' : '等待攻击指标'}
                  </div>
                ) : (
                  <AttackChart data={stream.metrics} />
                )}
              </Section>

              <Section title="本回合结论">
                <VerifierGauge result={latest} />
              </Section>

              <Section title="Judge 判定">
                <JudgePanel decision={stream.judge} />
              </Section>
            </Card>
          </div>

          {/* 右栏 */}
          <div className="col-span-12 lg:col-span-4 lg:h-full lg:min-h-0">
            <Card className="divide-y divide-[#1f2937] lg:flex lg:h-full lg:flex-col">
              <Section title="回合时间线" fill>
                {stream.playbooks.length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-600">等待生成剧本</div>
                ) : (
                  <div className="scroll-quiet max-h-[42vh] space-y-2 overflow-y-auto pr-1 lg:max-h-none lg:h-full">
                    {stream.playbooks.map((pb, idx) => (
                      <PlaybookCard
                        key={`pb-${pb.round}-${pb.id}-${idx}`}
                        playbook={pb}
                        active={idx === stream.playbooks.length - 1}
                        score={playbookScoreById.get(pb.id)}
                      />
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Agent 推理流" fill>
                <AgentThinking entries={stream.thinking} active={stream.activeAgent} />
              </Section>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  aside,
  children,
  fill
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  fill?: boolean;
}) {
  return (
    <section className={cn('px-4 py-4', fill && 'flex flex-col lg:min-h-0 lg:flex-1')}>
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-xs font-medium tracking-tight text-slate-300">{title}</h2>
        {aside}
      </div>
      {fill ? <div className="min-h-0 flex-1">{children}</div> : children}
    </section>
  );
}

function Stat({
  label,
  value,
  suffix,
  tone
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={cn('font-mono text-lg font-semibold tabular-nums', tone ?? 'text-slate-200')}>
          {value}
        </span>
        {suffix && <span className="font-mono text-xs text-slate-500">{suffix}</span>}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-0.5 w-3 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
