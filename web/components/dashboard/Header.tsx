'use client';

import { Shield, Activity, Terminal, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

interface HeaderProps {
  sessionCount: number;
  runningCount: number;
}

export function DashboardHeader({ sessionCount, runningCount }: HeaderProps) {
  const isRunning = runningCount > 0;

  return (
    <header
      role="banner"
      className="relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0a0e1a 0%, #111827 50%, #0a0e1a 100%)',
        borderBottom: '1px solid #1f2937'
      }}
    >
      {/* 扫描线 */}
      <motion.div
        className="absolute left-0 right-0 h-px z-10"
        style={{ background: 'linear-gradient(90deg, transparent, #06b6d4, transparent)' }}
        animate={{ top: ['0%', '100%'] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      />

      <div className="mx-auto px-4 py-3" style={{ maxWidth: '1920px' }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* 左侧 Logo */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <Shield className="w-8 h-8 text-cyan-400" />
              <motion.div
                className="absolute inset-0"
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Shield className="w-8 h-8 text-cyan-400" />
              </motion.div>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wider text-white">
                AI Agent驱动的DDoS防御能力自检系统
              </h1>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-yellow-400" />
                  红蓝对抗 · 多智能体闭环
                </span>
                <span className="text-slate-600">|</span>
                <span>赛道: B-EP1 智能体互联网创新攻关</span>
              </div>
            </div>
          </div>

          {/* 右侧状态 */}
          <div className="flex items-center gap-4 flex-wrap">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-md"
              style={{ background: 'rgba(17, 24, 39, 0.8)' }}
              aria-live="polite"
            >
              <Activity className={`w-4 h-4 ${isRunning ? 'text-green-400' : 'text-slate-400'}`} />
              <span className="text-sm text-slate-300">
                系统状态:{' '}
                <span className={isRunning ? 'text-green-400 font-semibold' : 'text-slate-400'}>
                  {isRunning ? '运行中' : '待机'}
                </span>
              </span>
            </div>

            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-md"
              style={{ background: 'rgba(17, 24, 39, 0.8)' }}
            >
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-slate-300">
                会话总数: <span className="text-cyan-400 font-semibold">{sessionCount}</span>
              </span>
            </div>

            {isRunning && (
              <motion.div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)'
                }}
                animate={{ opacity: [1, 0.7, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <div className="w-2 h-2 rounded-full bg-red-500 status-running" />
                <span className="text-sm text-red-400 font-medium">自检执行中</span>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
