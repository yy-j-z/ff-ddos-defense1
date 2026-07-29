'use client';

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity, Shield, Crosshair, Minus } from 'lucide-react';
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, YAxis } from 'recharts';

interface TrendPoint {
  score: number;
  reachability: number;
  defenderTriggered: boolean;
  createdAt: Date;
}

interface DefensePanelProps {
  sessionCount: number;
  runningCount: number;
  avgScore: number;          // 平均绕过得分 (0-100, 越低越好)
  avgReachability: number;   // 平均可达性 (0-1)
  defenderTriggeredRatio: number; // 防御触发率 (0-1)
  trendHistory: TrendPoint[];
}

/** 把 reachability 转成 % 并编号 */
function buildChartData(history: TrendPoint[]) {
  return history.map((h, i) => ({
    idx: i + 1,
    穿透率: Math.round(h.reachability * 100),
    绕过得分: h.score,
  }));
}

/** 最近两次的差值，用于环比箭头 */
function computeDelta(history: TrendPoint[], key: 'reachability' | 'score') {
  if (history.length < 2) return null;
  const latest = history[history.length - 1];
  const prev = history[history.length - 2];
  const a = key === 'reachability' ? latest.reachability * 100 : latest.score;
  const b = key === 'reachability' ? prev.reachability * 100 : prev.score;
  return Math.round(a - b);
}

function TrendArrow({ delta }: { delta: number | null }) {
  if (delta === null) return <Minus className="w-3 h-3 text-slate-500" />;
  if (delta > 0)
    return <TrendingUp className="w-3 h-3 text-red-400" />;
  if (delta < 0)
    return <TrendingDown className="w-3 h-3 text-emerald-400" />;
  return <Minus className="w-3 h-3 text-slate-500" />;
}

export function DashboardDefensePanel({
  sessionCount,
  runningCount,
  avgScore,
  avgReachability,
  defenderTriggeredRatio,
  trendHistory
}: DefensePanelProps) {
  const resilienceScore = avgScore > 0 ? Math.max(5, 100 - avgScore) : 85;
  const chartData = buildChartData(trendHistory);

  const penetrationPct = Math.round(avgReachability * 100);
  const triggeredPct = Math.round(defenderTriggeredRatio * 100);

  const reachDelta = computeDelta(trendHistory, 'reachability');
  const scoreDelta = computeDelta(trendHistory, 'score');

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
      label: '攻击穿透率',
      value: avgScore > 0 ? `${penetrationPct}` : '—',
      unit: '%',
      delta: reachDelta,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      icon: <Crosshair className="w-3 h-3" />,
      desc: '攻击流量到达目标的占比'
    },
    {
      label: '平均绕过得分',
      value: avgScore > 0 ? `${avgScore}` : '—',
      unit: '/100',
      delta: scoreDelta,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      icon: <Activity className="w-3 h-3" />,
      desc: '绕过成功率（越低越好）'
    },
    {
      label: '防御触发率',
      value: avgScore > 0 ? `${triggeredPct}` : '—',
      unit: '%',
      delta: null,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      icon: <Shield className="w-3 h-3" />,
      desc: '成功触发防御机制的比例'
    },
    {
      label: '测试总次数',
      value: `${sessionCount}`,
      unit: '',
      delta: null,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
      icon: <Activity className="w-3 h-3" />,
      desc: '累计攻防测试任务数'
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

          <div className="flex-1 min-w-0">
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
                    {resilienceScore >= 60 ? '防御体系运行正常' : '检测到防御薄弱点'}
                  </span>
                </>
              ) : (
                <span className="text-slate-400">等待验证数据</span>
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

        {/* 指标网格 — 带环比箭头 */}
        <div className="grid grid-cols-2 gap-2">
          {metrics.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`p-2 rounded-lg border ${card.bg} ${card.border}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className={card.color}>{card.icon}</span>
                  <span className="text-xs text-slate-400">{card.label}</span>
                </div>
                {card.delta !== null && (
                  <span className="flex items-center gap-0.5 text-[10px]" title="较上一次测试">
                    <TrendArrow delta={card.delta} />
                    <span className={card.delta > 0 ? 'text-red-400' : card.delta < 0 ? 'text-emerald-400' : 'text-slate-500'}>
                      {card.delta > 0 ? '+' : ''}{card.delta}
                    </span>
                  </span>
                )}
              </div>
              <p className={`text-sm font-bold ${card.color} tabular-nums`}>
                {card.value}{card.unit}
              </p>
            </motion.div>
          ))}
        </div>

        {/* 穿透率趋势图 — 让数据动起来 */}
        {chartData.length >= 2 && (
          <div className="rounded-lg border border-[#1f2937] bg-[#0f172a] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">攻击穿透率趋势</span>
              <span className="flex items-center gap-1 text-[10px] text-slate-600">
                <span className="w-2 h-0.5 rounded bg-red-500 inline-block" />
                穿透率 %
              </span>
            </div>
            <div style={{ height: 56 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                  <defs>
                    <linearGradient id="penetrationGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    contentStyle={{
                      background: '#111827',
                      border: '1px solid #1f2937',
                      borderRadius: '6px',
                      fontSize: '11px',
                      color: '#e2e8f0'
                    }}
                    formatter={(value: number) => [`${value}%`, '穿透率']}
                    labelFormatter={(idx) => `第 ${idx} 次`}
                  />
                  <Area
                    type="monotone"
                    dataKey="穿透率"
                    stroke="#ef4444"
                    strokeWidth={1.5}
                    fill="url(#penetrationGrad)"
                    dot={false}
                    activeDot={{ r: 3, fill: '#ef4444' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between text-[9px] text-slate-600 mt-1">
              <span>第 1 次</span>
              <span>第 {chartData.length} 次</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
