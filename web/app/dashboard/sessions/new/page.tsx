'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Strategy = 'slowloris' | 'http_flood' | 'syn_flood' | 'hulk_flood' | 'slow_headers';
const ALL_STRATEGIES: Strategy[] = ['slowloris', 'http_flood', 'syn_flood', 'hulk_flood', 'slow_headers'];

export default function NewSessionPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pcap, setPcap] = useState<File | null>(null);
  const [useAutoCollect, setUseAutoCollect] = useState(true);
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

      const form = new FormData();
      if (pcap && !useAutoCollect) {
        form.append('file', pcap);
      }
      const startRes = await fetch(`/api/sessions/${id}/start`, { method: 'POST', body: form });
      if (!startRes.ok) throw new Error(`启动失败 (${startRes.status})`);

      router.push(`/dashboard/sessions/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#060812' }}>
      {/* Header */}
      <header
        className="relative overflow-hidden shrink-0"
        style={{
          background: 'linear-gradient(135deg, #0a0e1a 0%, #111827 50%, #0a0e1a 100%)',
          borderBottom: '1px solid #1f2937'
        }}
      >
        <motion.div
          className="absolute left-0 right-0 h-px z-10"
          style={{ background: 'linear-gradient(90deg, transparent, #06b6d4, transparent)' }}
          animate={{ top: ['0%', '100%'] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        />
        <div className="mx-auto px-6 py-4" style={{ maxWidth: '900px' }}>
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-cyan-400" />
            <div>
              <h1 className="text-lg font-bold text-white">新建攻防会话</h1>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Zap className="w-3 h-3 text-yellow-400" />
                配置攻击范围，启动自动化对抗验证
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Form */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-6">
        <form onSubmit={onSubmit} className="mx-auto max-w-[900px] px-6 space-y-4">
          {/* 基本信息 */}
          <div className="cyber-card">
            <div className="cyber-card-header">
              <h2 className="cyber-title">基本信息</h2>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">会话名称</Label>
                <Input
                  id="name"
                  placeholder="例：电商靶机演练"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>流量来源</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setUseAutoCollect(true)}
                    className={cn(
                      'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-all',
                      useAutoCollect
                        ? 'border-[#06b6d440] bg-[#06b6d41a] text-[#06b6d4]'
                        : 'border-[#1f2937] text-slate-500 hover:border-[#374151] hover:text-slate-300'
                    )}
                  >
                    自动采集流量
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseAutoCollect(false)}
                    className={cn(
                      'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-all',
                      !useAutoCollect
                        ? 'border-[#06b6d440] bg-[#06b6d41a] text-[#06b6d4]'
                        : 'border-[#1f2937] text-slate-500 hover:border-[#374151] hover:text-slate-300'
                    )}
                  >
                    上传 PCAP 文件
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  {useAutoCollect
                    ? '系统自动通过 pcap-analyzer 采集业务流量画像'
                    : '手动上传 .pcap / .pcapng 流量样本文件'}
                </p>
              </div>
              {!useAutoCollect && (
                <div className="space-y-1.5">
                  <Label htmlFor="pcap">PCAP 流量样本</Label>
                  <label
                    htmlFor="pcap"
                    className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-[#374151] bg-[#0f172a] px-3 py-3 text-sm text-slate-500 transition-colors hover:border-[#06b6d460] hover:text-slate-300"
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
            </div>
          </div>

          {/* Security Scope */}
          <div className="cyber-card">
            <div className="cyber-card-header">
              <h2 className="cyber-title">Scope 安全约束</h2>
            </div>
            <div className="space-y-4">
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
                          'rounded-md border px-2.5 py-1 font-mono text-xs transition-all',
                          on
                            ? 'border-[#06b6d440] bg-[#06b6d41a] text-[#06b6d4]'
                            : 'border-[#1f2937] text-slate-500 hover:border-[#374151] hover:text-slate-400'
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
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
      </div>
    </div>
  );
}
