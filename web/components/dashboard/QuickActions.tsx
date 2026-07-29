'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Play, BookOpen, Shield, FileText, Terminal, Wrench, Zap } from 'lucide-react';

const actions = [
  {
    href: '/dashboard/sessions/new',
    icon: <Play className="w-4 h-4" />,
    label: '新建 DDoS 攻防测试任务',
    desc: '创建攻防测试任务',
    color: 'cyan',
    gradient: 'from-cyan-500/20 to-cyan-500/5',
    border: 'border-cyan-500/30',
    text: 'text-cyan-400',
    glow: 'shadow-[0_0_15px_rgba(6,182,212,0.15)]'
  },
  {
    href: '/dashboard/playbooks',
    icon: <BookOpen className="w-4 h-4" />,
    label: '策略库',
    desc: '成功策略沉淀',
    color: 'purple',
    gradient: 'from-purple-500/20 to-purple-500/5',
    border: 'border-purple-500/30',
    text: 'text-purple-400',
    glow: 'shadow-[0_0_15px_rgba(168,85,247,0.15)]'
  },
  {
    href: '/dashboard/guide',
    icon: <FileText className="w-4 h-4" />,
    label: '操作手册',
    desc: '操作指南',
    color: 'emerald',
    gradient: 'from-emerald-500/20 to-emerald-500/5',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    glow: 'shadow-[0_0_15px_rgba(16,185,129,0.15)]'
  }
];

export function DashboardQuickActions() {
  return (
    <div className="cyber-card" role="region" aria-label="快捷操作">
      <div className="cyber-card-header">
        <Zap className="w-4 h-4 text-yellow-400" aria-hidden="true" />
        <h2 className="cyber-title">快捷操作</h2>
      </div>

      <div className="space-y-2">
        {actions.map((action, i) => (
          <Link key={action.href} href={action.href}>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`flex items-center gap-3 p-3 rounded-lg border bg-gradient-to-r ${action.gradient} ${action.border} ${action.glow} hover:scale-[1.02] transition-transform cursor-pointer`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-slate-900/50 ${action.text}`}>
                {action.icon}
              </div>
              <div>
                <h4 className={`text-sm font-semibold ${action.text}`}>{action.label}</h4>
                <p className="text-xs text-slate-400">{action.desc}</p>
              </div>
            </motion.div>
          </Link>
        ))}
      </div>
    </div>
  );
}
