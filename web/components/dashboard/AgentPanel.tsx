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
      {/* 六边形头盔 — 攻击型机器人 */}
      <polygon points="24,4 40,13 40,35 24,44 8,35 8,13" stroke="#ef4444" strokeWidth="2" fill="#1a0a0a" />
      <rect x="17" y="18" width="14" height="10" rx="2" stroke="#ef4444" strokeWidth="1.5" fill="none" />
      <circle cx="20" cy="22" r="2" fill="#ef4444" />
      <circle cx="28" cy="22" r="2" fill="#ef4444" />
      <line x1="24" y1="18" x2="24" y2="12" stroke="#ef4444" strokeWidth="1.5" />
      <path d="M20 30 Q24 34 28 30" stroke="#ef4444" strokeWidth="1.5" fill="none" />
      <line x1="10" y1="8" x2="14" y2="12" stroke="#ef4444" strokeWidth="1.5" />
      <line x1="38" y1="8" x2="34" y2="12" stroke="#ef4444" strokeWidth="1.5" />
      <line x1="20" y1="12" x2="18" y2="8" stroke="#ef4444" strokeWidth="1.5" />
      <line x1="28" y1="12" x2="30" y2="8" stroke="#ef4444" strokeWidth="1.5" />
    </svg>
  ),
  analyzer: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      {/* 方形护目镜 — 分析型机器人 */}
      <rect x="8" y="8" width="32" height="32" rx="4" stroke="#3b82f6" strokeWidth="2" fill="#0a0a1a" />
      <rect x="14" y="16" width="20" height="12" rx="2" stroke="#3b82f6" strokeWidth="1.5" fill="none" />
      <circle cx="22" cy="22" r="4" fill="#3b82f6" opacity="0.3" />
      <circle cx="22" cy="22" r="2" fill="#3b82f6" />
      <path d="M32 28 L36 32" stroke="#3b82f6" strokeWidth="1.5" />
      <rect x="24" y="13" width="2" height="4" rx="1" fill="#3b82f6" />
      <rect x="20" y="29" width="2" height="4" rx="1" fill="#3b82f6" />
      <line x1="12" y1="20" x2="14" y2="22" stroke="#3b82f6" strokeWidth="1" />
      <line x1="34" y1="20" x2="36" y2="22" stroke="#3b82f6" strokeWidth="1" />
    </svg>
  ),
  verifier: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      {/* 圆形护盾 — 验证型机器人 */}
      <circle cx="24" cy="24" r="20" stroke="#10b981" strokeWidth="2" fill="#0a1a0a" />
      <circle cx="24" cy="24" r="14" stroke="#10b981" strokeWidth="1.5" fill="none" opacity="0.3" />
      <rect x="17" y="15" width="14" height="12" rx="3" stroke="#10b981" strokeWidth="1.5" fill="none" />
      <circle cx="21" cy="20" r="1.5" fill="#10b981" />
      <circle cx="27" cy="20" r="1.5" fill="#10b981" />
      <path d="M20 27 Q24 32 28 27" stroke="#10b981" strokeWidth="1.5" fill="none" />
      <path d="M19 33 L22 36 L29 29" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <line x1="15" y1="13" x2="17" y2="15" stroke="#10b981" strokeWidth="1" />
      <line x1="33" y1="13" x2="31" y2="15" stroke="#10b981" strokeWidth="1" />
    </svg>
  ),
  judge: (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      {/* 菱形法冠 — 裁决型机器人 */}
      <polygon points="24,6 40,16 40,32 24,42 8,32 8,16" stroke="#a855f7" strokeWidth="2" fill="#0f0a1a" />
      <rect x="16" y="14" width="16" height="12" rx="2" stroke="#a855f7" strokeWidth="1.5" fill="none" />
      <circle cx="21" cy="19" r="1.5" fill="#a855f7" />
      <circle cx="27" cy="19" r="1.5" fill="#a855f7" />
      <path d="M20 26 Q24 30 28 26" stroke="#a855f7" strokeWidth="1.5" fill="none" />
      {/* 天平元素 */}
      <line x1="24" y1="10" x2="24" y2="14" stroke="#a855f7" strokeWidth="1.5" />
      <line x1="16" y1="34" x2="20" y2="30" stroke="#a855f7" strokeWidth="1.5" />
      <line x1="32" y1="34" x2="28" y2="30" stroke="#a855f7" strokeWidth="1.5" />
      <line x1="14" y1="36" x2="18" y2="36" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="30" y1="36" x2="34" y2="36" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" />
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
