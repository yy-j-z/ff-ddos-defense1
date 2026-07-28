import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-medium leading-tight',
  {
    variants: {
      variant: {
        default: 'border-[#1f2937] bg-[#111827] text-slate-300',
        neutral: 'border-[#1f2937] bg-[#1e293b] text-slate-400',
        success: 'border-[#10b98140] bg-[#10b9811a] text-[#10b981]',
        warning: 'border-[#f59e0b40] bg-[#f59e0b1a] text-[#f59e0b]',
        danger: 'border-[#ef444440] bg-[#ef44441a] text-[#ef4444]',
        info: 'border-[#06b6d440] bg-[#06b6d41a] text-[#06b6d4]',
        outline: 'border-[#1f2937] text-slate-400'
      }
    },
    defaultVariants: { variant: 'default' }
  }
);

const dotColor: Record<string, string> = {
  default: 'bg-slate-400',
  neutral: 'bg-slate-500',
  success: 'bg-[#10b981] shadow-[0_0_6px_rgba(16,185,129,0.5)]',
  warning: 'bg-[#f59e0b]',
  danger: 'bg-[#ef4444] shadow-[0_0_6px_rgba(239,68,68,0.5)]',
  info: 'bg-[#06b6d4] shadow-[0_0_6px_rgba(6,182,212,0.5)]',
  outline: 'bg-slate-400'
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
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
