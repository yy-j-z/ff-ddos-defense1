'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // 仪表盘主页 和 新建会话页 全屏无侧栏
  const isFullScreen = pathname === '/dashboard' || pathname === '/dashboard/sessions/new';

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: '#060812', color: '#e2e8f0' }}
    >
      {!isFullScreen && <Sidebar />}
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
