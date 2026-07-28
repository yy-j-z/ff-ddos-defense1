'use client';

import { motion } from 'framer-motion';
import { TrendingUp, Activity, Shield, Crosshair } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface DefensePanelProps {
  sessionCount: number;
  runningCount: number;
  avgScore: number;          // 平均绕过得分 (0-100, 越低越好)
  avgReachability: number;   // 平均可达性 (0-1)
  defenderTriggeredRatio: number; // 防御触发率 (0-1)
}

export function DashboardDefensePanel({
  sessionCount,
  runningCount,
  avgScore,
  avgReachability,
  defenderTriggeredRatio
}: DefensePanelProps) {
  // 防御韧性 = 100 - 平均绕过得分 (得分越低=防御越好)
  const resilienceScore = avgScore > 0 ? Math.max(5, 100 - avgScore) : 85;

  const getScoreColor = (s: number) => {
    if (s >= 80) return '#10b981';
    if (s >= 60) return '#f59e0b';
    if (s >= 40) return '#f97316';
    return '#ef4444';
  };

  const getScoreLabel = (s: number) => {
    if (s >= 80) return '优秀';
    if (s >= 60) return '良好';
    if (s >= 40) return '脆弱';
    return '危险';
  };

  const metrics = [
    {
      label: '平均绕过得分',
      value: avgScore > 0 ? `${avgScore}` : '—',
      unit: '/100',
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      icon: <Crosshair className="w-3 h-3" />
    },
    {
      label: '平均可达性',
      value: avgReachability > 0 ? `${(avgReachability * 100).toFixed(0)}` : '—',
      unit: '%',
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
      icon: <Activity className="w-3 h-3" />
    },
    {
      label: '防御触发率',
      value: avgScore > 0 ? `${(defenderTriggeredRatio * 100).toFixed(0)}` : '—',
      unit: '%',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      icon: <Shield className="w-3 h-3" />
    },
    {
      label: '会话总数',
      value: `${sessionCount}`,
      unit: '',
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
      icon: <Activity className="w-3 h-3" />
    }
  ];

  return (
    <div className="cyber-card h-full" role="region" aria-label="防御韧性评估">
      <div className="cyber-card-header">
        <TrendingUp className="w-4 h-4 text-emerald-400" aria-hidden="true" />
        <h2 className="cyber-title">防御韧性评估</h2>
      </div>

      <div className="space-y-4">
        {/* 韧性得分环形图 */}
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <ResponsiveContainer width={90} height={90}>
              <PieChart>
                <Pie
                  data={[{ value: 100 }]}
                  cx="50%" cy="50%" innerRadius={32} outerRadius={40}
                  fill="#1f2937" stroke="none" dataKey="value"
                />
                <Pie
                  data={[{ value: resilienceScore }, { value: 100 - resilienceScore }]}
                  cx="50%" cy="50%" innerRadius={32} outerRadius={40}
                  stroke="none" dataKey="value"
                >
                  <Cell fill={getScoreColor(resilienceScore)} />
                  <Cell fill="#1f2937" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-base font-bold" style={{ color: getScoreColor(resilienceScore) }}>
                {resilienceScore}
              </span>
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-slate-200">防御韧性得分</span>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: `${getScoreColor(resilienceScore)}20`,
                  color: getScoreColor(resilienceScore)
                }}
              >
                {getScoreLabel(resilienceScore)}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs">
              {avgScore > 0 ? (
                <>
                  <TrendingUp className={`w-3 h-3 ${resilienceScore >= 60 ? 'text-emerald-400' : 'text-red-400'}`} />
                  <span className={resilienceScore >= 60 ? 'text-emerald-400' : 'text-red-400'}>
                    {resilienceScore >= 60 ? '防御体系运行正常' : '存在防御薄弱点'}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-slate-400">等待验证数据</span>
                </>
              )}
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: getScoreColor(resilienceScore) }}
                animate={{ width: `${resilienceScore}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        </div>

        {/* 指标网格 */}
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`p-2 rounded-lg border ${card.bg} ${card.border}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={card.color}>{card.icon}</span>
                <span className="text-xs text-slate-400">{card.label}</span>
              </div>
              <p className={`text-sm font-bold ${card.color} tabular-nums`}>
                {card.value}{card.unit}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
