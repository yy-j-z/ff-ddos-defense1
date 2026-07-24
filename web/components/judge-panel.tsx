'use client';

import { Badge } from '@/components/ui/badge';
import type { JudgeDecision } from '@/lib/types';

const verdictMeta: Record<
  JudgeDecision['verdict'],
  { label: string; variant: 'info' | 'danger' | 'success' | 'neutral' }
> = {
  continue: { label: '继续下一回合', variant: 'info' },
  success: { label: '攻击成功', variant: 'danger' },
  failed: { label: '防御有效', variant: 'success' },
  stop: { label: '终止会话', variant: 'neutral' }
};

export function JudgePanel({ decision }: { decision: JudgeDecision | null }) {
  if (!decision) {
    return <p className="text-xs text-subtle-foreground">等待 Judge 决策</p>;
  }
  const meta = verdictMeta[decision.verdict];
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">判定</span>
        <Badge variant={meta.variant} dot>
          {meta.label}
        </Badge>
      </div>

      <p className="leading-relaxed text-foreground">{decision.reasoning}</p>

      {decision.nextIntent && (
        <div>
          <span className="text-muted-foreground">下轮意图　</span>
          <span className="text-foreground">{decision.nextIntent}</span>
        </div>
      )}

      {decision.defenseWeaknesses.length > 0 && (
        <Section title="防御弱点" items={decision.defenseWeaknesses} marker="text-danger" />
      )}
      {decision.recommendations.length > 0 && (
        <Section title="加固建议" items={decision.recommendations} marker="text-success" />
      )}
    </div>
  );
}

function Section({ title, items, marker }: { title: string; items: string[]; marker: string }) {
  return (
    <div>
      <div className="mb-1 text-muted-foreground">{title}</div>
      <ul className="space-y-1">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 leading-relaxed text-foreground">
            <span className={marker}>—</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
