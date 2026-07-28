'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Globe, Wifi, Radio, Server, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
  type: 'normal' | 'attack' | 'defense';
}

export function DashboardNetworkViz({ runningCount }: { runningCount: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const isRunning = runningCount > 0;

  const createParticle = useCallback((): Particle => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, color: '#06b6d4', size: 2, type: 'normal' };
    const startLeft = Math.random() < 0.5;
    const colors = isRunning
      ? ['#ef4444', '#f97316', '#3b82f6', '#06b6d4']
      : ['#06b6d4', '#3b82f6', '#06b6d4'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const speed = isRunning ? 2 + Math.random() * 4 : 1 + Math.random() * 2;

    return {
      x: startLeft ? 10 : canvas.width - 10,
      y: 80 + Math.random() * (canvas.height - 160),
      vx: startLeft ? speed : -speed,
      vy: (Math.random() - 0.5) * 1,
      life: 0,
      maxLife: 80 + Math.random() * 60,
      color,
      size: 2 + Math.random() * 2,
      type: color === '#ef4444' || color === '#f97316' ? 'attack' : color === '#3b82f6' ? 'defense' : 'normal',
    };
  }, [isRunning]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) { canvas.width = rect.width; canvas.height = rect.height; }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const animate = () => {
      if (document.visibilityState === 'hidden') {
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      const nodes = [
        { x: cx, y: 50, label: 'WAF/防火墙' },
        { x: cx, y: canvas.height - 50, label: '业务服务器' },
        { x: 70, y: cy - 30, label: 'Red Agent' },
        { x: canvas.width - 70, y: cy - 30, label: 'Blue Agent' },
        { x: cx, y: cy, label: 'Orchestrator' },
      ];

      // Draw network lines
      ctx.strokeStyle = 'rgba(31, 41, 55, 0.5)';
      ctx.lineWidth = 1;
      nodes.forEach((node, i) => {
        nodes.forEach((other, j) => {
          if (i < j) {
            ctx.beginPath(); ctx.moveTo(node.x, node.y); ctx.lineTo(other.x, other.y); ctx.stroke();
          }
        });
      });

      // Data flow dots
      if (isRunning) {
        const time = Date.now() / 1000;
        nodes.forEach((node, i) => {
          nodes.forEach((other, j) => {
            if (i < j) {
              const progress = (time * 0.3 + (i + j) * 0.2) % 1;
              const fx = node.x + (other.x - node.x) * progress;
              const fy = node.y + (other.y - node.y) * progress;
              ctx.beginPath(); ctx.arc(fx, fy, 2, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(6, 182, 212, 0.5)';
              ctx.fill();
            }
          });
        });
      }

      // Spawn particles
      if (isRunning) {
        for (let i = 0; i < 2; i++) {
          if (Math.random() < 0.3) {
            particlesRef.current.push(createParticle());
          }
        }
      }

      // Update & draw particles
      particlesRef.current = particlesRef.current.filter(p => {
        p.x += p.vx; p.y += p.vy; p.life++;
        const alpha = Math.min(1, p.life / 10) * Math.min(1, (p.maxLife - p.life) / 20);
        if (alpha <= 0) return false;

        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.round(alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();

        if (p.type === 'attack') {
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = `${p.color}1a`;
          ctx.fill();
        }
        return p.life < p.maxLife;
      });

      // Draw nodes
      nodes.forEach((node, i) => {
        const isLeft = i === 2; const isRight = i === 3; const isCenter = i === 4;
        let nodeColor = '#06b6d4'; let glowColor = 'rgba(6, 182, 212, 0.3)';
        if (isLeft) { nodeColor = '#ef4444'; glowColor = 'rgba(239, 68, 68, 0.3)'; }
        else if (isRight) { nodeColor = '#3b82f6'; glowColor = 'rgba(59, 130, 246, 0.3)'; }
        else if (isCenter) { nodeColor = '#a855f7'; glowColor = 'rgba(168, 85, 247, 0.3)'; }

        if (isRunning || isCenter) {
          ctx.beginPath(); ctx.arc(node.x, node.y, 25, 0, Math.PI * 2);
          ctx.fillStyle = glowColor; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(node.x, node.y, 18, 0, Math.PI * 2);
        ctx.fillStyle = '#111827'; ctx.fill();
        ctx.strokeStyle = nodeColor; ctx.lineWidth = 2; ctx.stroke();

        ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif';
        ctx.textAlign = 'center'; ctx.fillText(node.label, node.x, node.y + 32);
      });

      // Attack wave rings
      if (isRunning) {
        const time = Date.now() / 1000;
        for (let wave = 0; wave < 3; wave++) {
          const radius = ((time * 50 + wave * 30) % 150);
          const alpha = Math.max(0, 1 - radius / 150) * 0.15;
          ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`; ctx.lineWidth = 2; ctx.stroke();
        }
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [isRunning, createParticle]);

  return (
    <div className="cyber-card h-full flex flex-col">
      <div className="cyber-card-header">
        <Globe className="w-4 h-4 text-cyan-400" />
        <h2 className="cyber-title">网络攻防态势可视化</h2>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-cyan-400" /><span className="text-xs text-slate-400">正常流量</span></div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" /><span className="text-xs text-slate-400">攻击流量</span></div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-xs text-slate-400">防御响应</span></div>
        </div>
      </div>

      <div className="flex-1 relative min-h-[300px]">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        <div className="absolute top-2 left-2">
          <div className="flex items-center gap-1.5 text-xs bg-slate-900/80 rounded px-2 py-1">
            <Wifi className="w-3 h-3 text-cyan-400" />
            <span className="text-slate-300">态势感知: {isRunning ? '攻击检测中' : '监控中'}</span>
          </div>
          {isRunning && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1.5 text-xs bg-red-500/10 rounded px-2 py-1 mt-1 border border-red-500/20"
            >
              <Radio className="w-3 h-3 text-red-400 animate-pulse" />
              <span className="text-red-400 font-semibold">{runningCount} 个会话执行中</span>
            </motion.div>
          )}
        </div>

        <div className="absolute bottom-2 right-2 flex items-center gap-3 bg-slate-900/80 rounded px-3 py-1.5">
          <div className="flex items-center gap-1.5 text-xs">
            <Server className="w-3 h-3 text-emerald-400" />
            <span className="text-slate-300">业务服务</span>
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Shield className="w-3 h-3 text-blue-400" />
            <span className="text-slate-300">WAF</span>
            <div className="w-2 h-2 rounded-full bg-blue-400" />
          </div>
        </div>
      </div>
    </div>
  );
}
