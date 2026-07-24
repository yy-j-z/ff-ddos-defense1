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

export function SessionDetailView({ sessionId, name, createdAt, maxRounds, live, seed }: SessionDetailViewProps) {
  const stream = useSessionStream(sessionId, live, seed);

  const latest = stream.verifications[stream.verifications.length - 1] ?? null;
  const playbookScoreById = new Map(stream.verifications.map((v) => [v.playbookId, v.score]));
  const bestScore = stream.verifications.reduce((m, v) => Math.max(m, v.score), 0);
  const status = statusMeta[stream.status] ?? statusMeta.closed;

  return (
    <div className="flex h-full flex-col">
      {/* 固定页头:不随内容滚动 */}
      <header className="shrink-0 border-b border-border px-8 pb-5 pt-6">
        <div className="mx-auto max-w-5xl space-y-3">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">
              会话
            </Link>
            <span className="text-border-strong">/</span>
            <span className="text-foreground">{name}</span>
          </nav>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
                <Badge variant={status.variant} dot>
                  {status.label}
                </Badge>
              </div>
              <div className="font-mono text-[11px] text-subtle-foreground">
                {sessionId.slice(0, 8)} · {createdAt}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={`/api/sessions/${sessionId}/report`}
                download
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50 border border-border bg-surface text-muted-foreground hover:bg-surface-muted hover:text-foreground h-8 px-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                导出报告
              </a>
              <Stat label="当前回合" value={`${stream.playbooks.length}`} suffix={`/ ${maxRounds}`} />
              <Stat
                label="最佳得分"
                value={bestScore ? `${bestScore}` : '—'}
                tone={bestScore >= 70 ? 'text-danger' : undefined}
              />
            </div>
          </div>
        </div>
      </header>

      {/* 主体:桌面端分区滚动(左栏整体滚,右栏两块各自滚);窄屏整页滚 */}
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-8 py-6 lg:overflow-hidden">
        <div className="mx-auto grid max-w-5xl grid-cols-12 gap-6 lg:h-full">
          {/* 左栏:流量 → 本回合结论 → 判定,整体一个滚动区 */}
          <div className="col-span-12 lg:col-span-8 lg:h-full lg:min-h-0">
            <Card className="scroll-quiet divide-y divide-border lg:max-h-full lg:overflow-y-auto">
              <Section
                title="攻防流量"
                aside={
                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                    <Legend color="#3f3f46" label="总流量" />
                    <Legend color="#dc2626" label="被拦截" />
                  </div>
                }
              >
                {stream.metrics.length === 0 ? (
                  <div className="flex h-56 items-center justify-center text-xs text-subtle-foreground">
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

          {/* 右栏:时间线 / 推理流 两块各占一半,各自独立滚动 */}
          <div className="col-span-12 lg:col-span-4 lg:h-full lg:min-h-0">
            <Card className="divide-y divide-border lg:flex lg:h-full lg:flex-col">
              <Section title="回合时间线" fill>
                {stream.playbooks.length === 0 ? (
                  <div className="py-4 text-center text-xs text-subtle-foreground">等待生成剧本</div>
                ) : (
                  <div className="scroll-quiet max-h-[42vh] space-y-2 overflow-y-auto pr-1 lg:max-h-none lg:h-full">
                    {stream.playbooks.map((pb, idx) => (
                      <PlaybookCard
                        key={`${pb.id}-${idx}`}
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

/** 面板内的带标题分区。fill=true 时填满可用高度,内容区内部滚动(用于右栏两块)。 */
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
        <h2 className="text-xs font-medium tracking-tight text-foreground">{title}</h2>
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
      <div className="text-[10px] uppercase tracking-wide text-subtle-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={cn('font-mono text-lg font-semibold tabular-nums', tone ?? 'text-foreground')}>{value}</span>
        {suffix && <span className="font-mono text-xs text-subtle-foreground">{suffix}</span>}
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
