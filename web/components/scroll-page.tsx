import { cn } from '@/lib/utils';

/** 普通页面的滚动容器：内容区独立滚动，居中限宽。暗色滚动条。 */
export function ScrollPage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="scroll-quiet h-full overflow-y-auto">
      <div className={cn('mx-auto max-w-5xl px-8 py-8', className)}>{children}</div>
    </div>
  );
}
