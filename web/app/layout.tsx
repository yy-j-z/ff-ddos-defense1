import type { Metadata } from 'next';
import { Inter_Tight, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const sans = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap'
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'FF — DDoS 防御自动化验证系统',
  description: 'Multi-Agent DDoS Defense Validation System'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased" style={{ background: '#060812', color: '#e2e8f0' }}>
        {children}
      </body>
    </html>
  );
}
