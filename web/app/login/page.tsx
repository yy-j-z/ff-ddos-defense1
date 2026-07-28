'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

function LoginForm() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) {
        router.replace('/dashboard');
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '登录失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm border-[#1f2937] bg-[#111827cc] backdrop-blur-md shadow-[0_0_30px_rgba(6,182,212,0.1)]">
      <CardHeader>
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#06b6d4"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 0 6px rgba(6,182,212,0.5))' }}
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <CardTitle>FF · 登录</CardTitle>
        </div>
        <p className="text-xs text-slate-500">DDoS 防御自动化验证系统</p>
      </CardHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">账号</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">密码</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? '登录中…' : '登录'}
        </Button>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main
      className="flex min-h-screen items-center justify-center px-4 relative overflow-hidden"
      style={{ background: '#060812' }}
    >
      {/* 网格背景 */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(6, 182, 212, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(6, 182, 212, 0.03) 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }}
      />

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
