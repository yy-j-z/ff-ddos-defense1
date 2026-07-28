'use client';

import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { Upload, Activity, FileText, Wifi, Server, ArrowDown, ArrowUp, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

export function DashboardTrafficPanel() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div className="cyber-card h-full" role="region" aria-label="流量特征分析">
      <div className="cyber-card-header">
        <Activity className="w-4 h-4 text-cyan-400" aria-hidden="true" />
        <h2 className="cyber-title">流量特征分析</h2>
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-3 text-center transition-all cursor-pointer ${
          isDragging ? 'border-cyan-400 bg-cyan-400/5' : 'border-slate-700 hover:border-slate-500'
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => router.push('/dashboard/sessions/new')}
      >
        <div className="flex flex-col items-center gap-1 w-full">
          <Upload className="w-5 h-5 text-slate-500" aria-hidden="true" />
          <span className="text-xs text-slate-500">拖拽或点击创建新会话</span>
          <span className="text-[10px] text-slate-600">支持 .pcap / .pcapng 流量样本</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/50 rounded p-2 border border-slate-800"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Wifi className="w-3 h-3 text-cyan-400" />
            <span className="text-xs text-slate-500">支持协议</span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {['TCP', 'UDP', 'HTTP', 'ICMP'].map((p) => (
              <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                {p}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-900/50 rounded p-2 border border-slate-800"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Server className="w-3 h-3 text-emerald-400" />
            <span className="text-xs text-slate-500">分析引擎</span>
          </div>
          <p className="text-[10px] text-slate-400">Python PCAP Analyzer</p>
          <p className="text-[10px] text-slate-500">自动提取业务画像</p>
        </motion.div>
      </div>
    </div>
  );
}
