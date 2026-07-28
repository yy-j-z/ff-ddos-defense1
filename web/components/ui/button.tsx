import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06b6d4] focus-visible:ring-offset-1 focus-visible:ring-offset-[#060812] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[#06b6d4] text-black hover:bg-[#22d3ee] shadow-[0_0_15px_rgba(6,182,212,0.3)]',
        outline:
          'border border-[#1f2937] bg-transparent text-slate-300 hover:bg-[#111827] hover:border-[#374151] hover:text-white',
        ghost: 'text-slate-400 hover:bg-[#111827] hover:text-white',
        destructive:
          'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30',
        secondary: 'bg-[#1e293b] text-slate-200 hover:bg-[#334155]'
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9'
      }
    },
    defaultVariants: { variant: 'default', size: 'default' }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = 'Button';

export { buttonVariants };
