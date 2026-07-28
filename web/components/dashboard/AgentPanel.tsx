'use client';

import { motion } from 'framer-motion';
import { Bot, Radio, CircleDot } from 'lucide-react';

const agentMeta: Record<
  string,
  { name: string; role: string; color: string; desc: string; glowClass: string; titleColor: string; dbAgent: string }
> = {
  attacker: {
    name: 'Red Agent',
    role: '攻击模拟',
    color: '#ef4444',
    desc: '负责模拟各类DDoS攻击，测试防御体系有效性',
    glowClass: 'agent-red-glow',
    titleColor: 'text-red-400',
    dbAgent: 'attacker'
  },
  analyzer: {
    name: 'Blue Agent',
    role: '流量分析',
    color: '#3b82f6',
    desc: '分析业务流量画像，提取关键特征与漏洞',
    glowClass: 'agent-blue-glow',
    titleColor: 'text-blue-400',
    dbAgent: 'analyzer'
  },
  verifier: {
    name: 'Verifier',
    role: '防御评估',
    color: '#10b981',
    desc: '验证攻击效果，评估防御体系响应能力',
    glowClass: '',
    titleColor: 'text-emerald-400',
    dbAgent: 'verifier'
  },
  judge: {
    name: 'Judge',
    role: '决策调度',
    color: '#a855f7',
    desc: '综合判定、策略生成与下一轮方向调整',
    glowClass: 'agent-purple-glow',
    titleColor: 'text-purple-400',
    dbAgent: 'judge'
  }
};

const agentOrder = ['attacker', 'analyzer', 'verifier', 'judge'];

const agentIcons: Record<string, React.ReactNode> = {
  attacker: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="20" stroke="#ef4444" strokeWidth="2" fill="#1a0a0a" />
      <text x="24" y="29" textAnchor="middle" fill="#ef4444" fontSize="18" fontWeight="bold">⚔</text>
    </svg>
  ),
  analyzer: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="20" stroke="#3b82f6" strokeWidth="2" fill="#0a0a1a" />
      <text x="24" y="29" textAnchor="middle" fill="#3b82f6" fontSize="18" fontWeight="bold">🔍</text>
    </svg>
  ),
  verifier: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="20" stroke="#10b981" strokeWidth="2" fill="#0a1a0a" />
      <text x="24" y="29" textAnchor="middle" fill="#10b981" fontSize="18" fontWeight="bold">✓</text>
    </svg>
  ),
  judge: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="20" stroke="#a855f7" strokeWidth="2" fill="#0f0a1a" />
      <text x="24" y="29" textAnchor="middle" fill="#a855f7" fontSize="18" fontWeight="bold">⚖</text>
    </svg>
  )
};

export function DashboardAgentPanel({
  activeAgents,
  runningCount
}: {
  activeAgents: string[];
  runningCount: number;
}) {
  return (
    <div className="space-y-3" role="region" aria-label="智能体状态监控">
      <div className="cyber-card-header">
        <Bot className="w-4 h-4 text-cyan-400" aria-hidden="true" />
        <h2 className="cyber-title">智能体状态监控</h2>
        {runningCount > 0 && (
          <span className="text-xs text-amber-400 ml-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 status-running" />
            {activeAgents.length} 个活跃
          </span>
        )}
      </div>

      <div className="space-y-3">
        {agentOrder.map((aid, i) => {
          const meta = agentMeta[aid];
          // 根据数据库真实 trace 判断 Agent 是否活跃
          const isRunning = activeAgents.includes(meta.dbAgent);

          return (
            <motion.div
              key={aid}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`cyber-card ${isRunning ? meta.glowClass : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className="relative flex-shrink-0">
                  <div className="w-14 h-14 rounded-lg overflow-hidden" style={{ background: 'rgba(0,0,0,0.3)' }}>
                    {agentIcons[aid]}
                  </div>
                  <motion.div
                    className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-900"
                    style={{
                      background: isRunning ? '#f59e0b' : '#6b7280',
                      boxShadow: isRunning ? '0 0 6px rgba(245,158,11,0.5)' : 'none'
                    }}
                    animate={isRunning ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className={`font-bold text-sm ${meta.titleColor}`}>{meta.name}</h3>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        background: 'rgba(0,0,0,0.3)',
                        color: isRunning ? '#fbbf24' : '#94a3b8'
                      }}
                    >
                      {isRunning ? '执行中' : '空闲'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-1">{meta.role}</p>
                  <p className="text-xs text-slate-500 truncate">{meta.desc}</p>
                </div>
              </div>

              {isRunning && (
                <>
                  <div className="mt-3 flex items-center gap-3">
                    <motion.div
                      className="flex items-center gap-1 text-xs"
                      style={{ color: meta.color }}
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <Radio className="w-3 h-3" />
                      <span>任务执行中...</span>
                    </motion.div>
                  </div>
                  <div className="mt-2 h-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: meta.color }}
                      animate={{ width: ['0%', '100%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </div>
                </>
              )}

              {!isRunning && (
                <div className="mt-3 flex items-center gap-1 text-xs text-slate-600">
                  <CircleDot className="w-3 h-3" />
                  <span>等待任务</span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
