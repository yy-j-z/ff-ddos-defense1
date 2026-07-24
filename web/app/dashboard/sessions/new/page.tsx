'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { ScrollPage } from '@/components/scroll-page';
import { cn } from '@/lib/utils';

type Strategy = 'slowloris' | 'http_flood' | 'syn_flood' | 'hulk_flood' | 'slow_headers';
const ALL_STRATEGIES: Strategy[] = ['slowloris', 'http_flood', 'syn_flood', 'hulk_flood', 'slow_headers'];

export default function NewSessionPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pcap, setPcap] = useState<File | null>(null);
  const [useAutoCollect, setUseAutoCollect] = useState(true);  // 默认：自动采集
  const [maxDuration, setMaxDuration] = useState(120);
  const [maxRounds, setMaxRounds] = useState(5);
  const [allowed, setAllowed] = useState<Strategy[]>(['slowloris', 'http_flood']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleStrategy(s: Strategy) {
    setAllowed((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // 1) 创建会话
      const createRes = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          scope: { maxDurationSec: maxDuration, maxRounds, allowedStrategies: allowed }
        })
      });
      if (!createRes.ok) throw new Error(`创建失败 (${createRes.status})`);
      const { id } = (await createRes.json()) as { id: string };

      // 2) 启动编排（自动采集模式传空 → pcap-analyzer 自动处理）
      const form = new FormData();
      if (pcap && !useAutoCollect) {
        // 手动上传模式：传用户选择的文件
        form.append('file', pcap);
      }
      // 自动采集模式：传空 FormData → 后端自动从 pcap-analyzer 获取流量
      const startRes = await fetch(`/api/sessions/${id}/start`, { method: 'POST', body: form });
      if (!startRes.ok) throw new Error(`启动失败 (${startRes.status})`);

      // 3) 进入详情页看实时闭环
      router.push(`/dashboard/sessions/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <ScrollPage className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">新建会话</h1>
        <p className="mt-1 text-sm text-muted-foreground">配置攻击范围，系统自动采集业务流量</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>基本信息</CardTitle>
            <CardDescription>用于在会话列表中识别本次演练</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">会话名称</Label>
              <Input
                id="name"
                placeholder="例:电商靶机演练"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            {/* 流量来源切换 */}
            <div className="space-y-1.5">
              <Label>流量来源</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setUseAutoCollect(true)}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                    useAutoCollect
                      ? 'border-foreground/30 bg-foreground/10 text-foreground'
                      : 'border-border text-muted-foreground hover:border-border-strong'
                  )}
                >
                  自动采集流量
                </button>
                <button
                  type="button"
                  onClick={() => setUseAutoCollect(false)}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                    !useAutoCollect
                      ? 'border-foreground/30 bg-foreground/10 text-foreground'
                      : 'border-border text-muted-foreground hover:border-border-strong'
                  )}
                >
                  上传 PCAP 文件
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {useAutoCollect
                  ? '系统自动通过 pcap-analyzer 采集业务流量画像，无需手动上传'
                  : '手动上传 .pcap / .pcapng 流量样本文件'}
              </p>
            </div>
            {/* 手动上传时显示文件选择器 */}
            {!useAutoCollect && (
              <div className="space-y-1.5">
                <Label htmlFor="pcap">PCAP 流量样本</Label>
                <label
                  htmlFor="pcap"
                  className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-border-strong bg-surface-muted px-3 py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                >
                  {pcap ? pcap.name : '点击选择 .pcap / .pcapng 文件'}
                </label>
                <input
                  id="pcap"
                  type="file"
                  accept=".pcap,.pcapng"
                  className="hidden"
                  onChange={(e) => setPcap(e.target.files?.[0] ?? null)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scope 安全约束</CardTitle>
            <CardDescription>限制本次会话允许的攻击规模与策略</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="duration">最大持续 (秒)</Label>
                <Input
                  id="duration"
                  type="number"
                  min={10}
                  max={600}
                  value={maxDuration}
                  onChange={(e) => setMaxDuration(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rounds">最大回合数</Label>
                <Input
                  id="rounds"
                  type="number"
                  min={1}
                  max={10}
                  value={maxRounds}
                  onChange={(e) => setMaxRounds(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>允许的攻击策略</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_STRATEGIES.map((s) => {
                  const on = allowed.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleStrategy(s)}
                      className={cn(
                        'rounded-md border px-2.5 py-1 font-mono text-xs transition-colors',
                        on
                          ? 'border-foreground/30 bg-foreground/5 text-foreground'
                          : 'border-border text-subtle-foreground hover:border-border-strong hover:text-muted-foreground'
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={() => router.back()} disabled={submitting}>
            取消
          </Button>
          <Button type="submit" disabled={!name || submitting}>
            {submitting ? '创建中…' : '创建并开始'}
          </Button>
        </div>
      </form>
    </ScrollPage>
  );
}
