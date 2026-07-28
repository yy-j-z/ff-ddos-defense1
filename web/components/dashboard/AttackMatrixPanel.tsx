'use client';

import { motion } from 'framer-motion';
import { Crosshair, Layers, ShieldAlert } from 'lucide-react';

const strategies = [
  { id: 'slowloris', name: 'Slowloris', category: 'connection', identity: 'real', protocol: 'HTTP', behavior: 'slow', desc: '慢速HTTP连接耗尽，逐步占满连接池' },
  { id: 'http_flood', name: 'HTTP Flood', category: 'bandwidth', identity: 'spoofed', protocol: 'HTTP', behavior: 'flood', desc: '大流量HTTP请求泛洪攻击' },
  { id: 'syn_flood', name: 'SYN Flood', category: 'connection', identity: 'spoofed', protocol: 'TCP', behavior: 'flood', desc: 'TCP半连接SYN泛洪' },
  { id: 'hulk_flood', name: 'HULK Flood', category: 'computation', identity: 'real', protocol: 'HTTP', behavior: 'flood', desc: '随机URL生成绕过缓存，高计算消耗' },
  { id: 'slow_headers', name: 'Slow Headers', category: 'connection', identity: 'real', protocol: 'HTTP', behavior: 'slow', desc: '慢速HTTP头传输，耗尽服务端资源' },
];

const identityLabels: Record<string, string> = { real: '真实身份', spoofed: '伪造身份' };
const protocolLabels: Record<string, string> = { TCP: 'TCP', UDP: 'UDP', HTTP: 'HTTP', ICMP: 'ICMP' };
const behaviorLabels: Record<string, string> = { flood: '洪泛', slow: '慢速' };

const categoryMeta: Record<string, { label: string; color: string; barColor: string; icon: React.ReactNode }> = {
  bandwidth: { label: '带宽消耗型', color: 'text-orange-400', barColor: '#fb923c', icon: <Layers className="w-3 h-3 text-orange-400" /> },
  computation: { label: '计算消耗型', color: 'text-purple-400', barColor: '#a78bfa', icon: <ShieldAlert className="w-3 h-3 text-purple-400" /> },
  connection: { label: '连接消耗型', color: 'text-red-400', barColor: '#f87171', icon: <Crosshair className="w-3 h-3 text-red-400" /> },
};

interface Props {
  strategyStats: Record<string, { count: number; totalScore: number }>;
}

export function DashboardAttackMatrix({ strategyStats }: Props) {
  // 计算最大使用次数，用于归一化进度条
  const maxCount = Math.max(1, ...Object.values(strategyStats).map((s) => s.count));

  const categories = ['connection', 'bandwidth', 'computation'];

  return (
    <div className="cyber-card">
      <div className="cyber-card-header">
        <Crosshair className="w-4 h-4 text-red-400" />
        <h2 className="cyber-title">三维攻击策略矩阵</h2>
        <span className="text-xs text-slate-500 ml-auto">身份 × 协议 × 行为</span>
      </div>

      <div className="space-y-3">
        {categories.map((cat) => {
          const catStrategies = strategies.filter((s) => s.category === cat);
          if (catStrategies.length === 0) return null;
          const catMeta = categoryMeta[cat];

          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                {catMeta.icon}
                <span className={`text-xs font-semibold ${catMeta.color}`}>{catMeta.label}</span>
                <div className="flex-1 h-px bg-slate-700/50" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {catStrategies.map((s, i) => {
                  const stats = strategyStats[s.id];
                  const useCount = stats?.count ?? 0;
                  const avgScore = stats ? Math.round(stats.totalScore / stats.count) : 0;
                  // 进度条: 使用次数占比
                  const barPct = (useCount / maxCount) * 100;

                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="rounded-lg border p-2.5 bg-slate-900/30 border-slate-700/30 hover:border-slate-600/50 transition-all"
                    >
                      <div className="flex items-start justify-between mb-1">
                        <h4 className={`text-xs font-bold ${catMeta.color}`}>{s.name}</h4>
                        {useCount > 0 && (
                          <span className="text-[10px] text-slate-500">{useCount}次</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mb-2 line-clamp-1">{s.desc}</p>
                      <div className="flex flex-wrap gap-1 mb-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {identityLabels[s.identity]}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {protocolLabels[s.protocol]}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {behaviorLabels[s.behavior]}
                        </span>
                      </div>
                      {/* 进度条: 使用频次 */}
                      <div className="h-1 rounded-full bg-slate-800 overflow-hidden mb-1">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: catMeta.barColor, width: `${barPct}%` }}
                          initial={{ width: 0 }}
                          animate={{ width: `${barPct}%` }}
                          transition={{ duration: 0.6, delay: 0.3 }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-600">使用频次</span>
                        {useCount > 0 ? (
                          <span className="text-slate-400">
                            均分 <span className={avgScore >= 50 ? 'text-red-400' : 'text-emerald-400'}>{avgScore}</span>
                          </span>
                        ) : (
                          <span className="text-slate-600">未使用</span>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
