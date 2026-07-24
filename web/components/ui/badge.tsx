import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/*
 * 方角、低饱和、细描边。状态类用一个前导小圆点表达,而非整块糖果色。
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-medium leading-tight',
  {
    variants: {
      variant: {
        default: 'border-border-strong bg-surface-muted text-foreground',
        neutral: 'border-border bg-surface-muted text-muted-foreground',
        success: 'border-success/25 bg-success/8 text-success',
        warning: 'border-warning/25 bg-warning/8 text-warning',
        danger: 'border-danger/25 bg-danger/8 text-danger',
        info: 'border-info/25 bg-info/8 text-info',
        outline: 'border-border text-muted-foreground'
      }
    },
    defaultVariants: { variant: 'default' }
  }
);

const dotColor: Record<string, string> = {
  default: 'bg-muted-foreground',
  neutral: 'bg-subtle-foreground',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  outline: 'bg-muted-foreground'
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /** 显示前导状态点 */
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotColor[variant ?? 'default'])} />
      )}
      {children}
    </div>
  );
}
