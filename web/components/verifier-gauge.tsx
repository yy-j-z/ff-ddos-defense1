'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { VerificationResult } from '@/lib/types';

const impactMeta: Record<
  VerificationResult['businessImpact'],
  { label: string; variant: 'neutral' | 'info' | 'warning' | 'danger' }
> = {
  none: { label: '无', variant: 'neutral' },
  low: { label: '低', variant: 'info' },
  medium: { label: '中', variant: 'warning' },
  high: { label: '高', variant: 'danger' }
};

function scoreTone(score: number) {
  if (score >= 70) return { text: 'text-danger', bar: 'bg-danger' };
  if (score >= 40) return { text: 'text-warning', bar: 'bg-warning' };
  return { text: 'text-success', bar: 'bg-success' };
}

export function VerifierGauge({ result }: { result: VerificationResult | null }) {
  if (!result) {
    return <p className="text-xs text-subtle-foreground">等待验证结果</p>;
  }
  const tone = scoreTone(result.score);
  const blockedRatio = result.totalRequests ? result.blockedRequests / result.totalRequests : 0;

  return (
    <div className="space-y-3">
      {/* 分数:克制呈现,数值中等字号 + 细条,不居中不夸张 */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">绕过得分</span>
          <span className={cn('font-mono text-2xl font-semibold tabular-nums', tone.text)}>
            {result.score}
            <span className="ml-1 text-xs font-normal text-subtle-foreground">/ 100</span>
          </span>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-muted">
          <div className={cn('h-full rounded-full', tone.bar)} style={{ width: `${result.score}%` }} />
        </div>
      </div>

      {/* 指标:键值对网格,无小卡片包裹 */}
      <dl className="grid grid-cols-3 gap-x-4 gap-y-2.5 text-xs">
        <Metric label="可达性" value={`${(result.reachability * 100).toFixed(0)}%`} />
        <Metric label="平均延迟" value={`${result.avgLatencyMs}ms`} />
        <Metric
          label="防御触发"
          value={result.defenderTriggered ? '是' : '否'}
          tone={result.defenderTriggered ? 'text-warning' : 'text-success'}
        />
        <Metric label="总请求" value={result.totalRequests.toLocaleString()} />
        <Metric label="被拦截" value={`${(blockedRatio * 100).toFixed(0)}%`} />
        <Metric label="触发耗时" value={result.defenderLatencyMs ? `${result.defenderLatencyMs}ms` : '—'} />
      </dl>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">业务影响</span>
          <Badge variant={impactMeta[result.businessImpact].variant} dot>
            {impactMeta[result.businessImpact].label}
          </Badge>
        </div>
        {result.defenderRulesHit.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground">命中规则</span>
            {result.defenderRulesHit.map((r) => (
              <span key={r} className="rounded-sm bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {r}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, tone = 'text-foreground' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-subtle-foreground">{label}</dt>
      <dd className={cn('mt-0.5 font-mono text-sm tabular-nums', tone)}>{value}</dd>
    </div>
  );
}
