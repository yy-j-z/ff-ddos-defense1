import { Sidebar } from '@/components/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-foreground">
      <Sidebar />
      {/* main 不自身滚动;由各页面决定滚动区域(列表页整页滚,详情页分区滚) */}
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
