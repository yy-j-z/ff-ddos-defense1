'use client';

import { DashboardHeader } from './Header';
import { DashboardAgentPanel } from './AgentPanel';
import { DashboardTrafficPanel } from './TrafficPanel';
import { DashboardAttackMatrix } from './AttackMatrixPanel';
import { DashboardNetworkViz } from './NetworkViz';
import { DashboardDefensePanel } from './DefensePanel';

interface DashboardClientProps {
  sessionCount: number;
  runningCount: number;
  recentSessions: Array<{ id: string; name: string; status: string; round: number; maxRounds: number }>;
  activeAgents: string[];
  avgScore: number;
  avgReachability: number;
  defenderTriggeredRatio: number;
  strategyStats: Record<string, { count: number; totalScore: number }>;
  trendHistory: Array<{ score: number; reachability: number; defenderTriggered: boolean; createdAt: Date }>;
}

export function DashboardClient({
  sessionCount,
  runningCount,
  recentSessions,
  activeAgents,
  avgScore,
  avgReachability,
  defenderTriggeredRatio,
  strategyStats,
  trendHistory
}: DashboardClientProps) {
  const activeSessions = recentSessions.filter(
    (s) => s.status === 'running' || s.status === 'pending'
  );

  return (
    <div className="flex flex-col h-full" style={{ background: '#060812' }}>
      <DashboardHeader sessionCount={sessionCount} runningCount={runningCount} />

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        <div className="mx-auto" style={{ maxWidth: '1920px' }}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* 左栏 3/12 */}
            <div className="col-span-1 lg:col-span-3 flex flex-col gap-4">
              <DashboardAgentPanel activeAgents={activeAgents} runningCount={runningCount} />
              <div className="flex-1">
                <DashboardTrafficPanel />
              </div>
            </div>

            {/* 中栏 6/12 */}
            <div className="col-span-1 lg:col-span-6 flex flex-col gap-4">
              <div className="flex-1" style={{ minHeight: '360px' }}>
                <DashboardNetworkViz runningCount={runningCount} />
              </div>

              {/* 运行中会话 */}
              <div className="cyber-card">
                <div className="cyber-card-header">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <h2 className="cyber-title">运行中测试任务</h2>
                  <span className="text-xs text-slate-500 ml-auto">{activeSessions.length} 个活跃</span>
                </div>

                {activeSessions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-600">
                    暂无运行中的会话
                    <br />
                    <a
                      href="/dashboard/sessions/new"
                      className="mt-2 inline-block text-[#06b6d4] hover:underline"
                    >
                      点击创建新会话 →
                    </a>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin">
                    {activeSessions.map((s) => (
                      <a
                        key={s.id}
                        href={`/dashboard/sessions/${s.id}`}
                        className="flex items-center justify-between p-2.5 rounded-lg border border-[#1f2937] bg-[#0f172a] hover:border-[#06b6d440] transition-all group"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-slate-200 truncate">{s.name}</p>
                          <p className="text-[10px] font-mono text-slate-600 mt-0.5">{s.id.slice(0, 8)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-slate-500">
                            R{s.round}/{s.maxRounds}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-amber-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 status-running" />
                            运行中
                          </span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600 group-hover:text-[#06b6d4] transition-colors">
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 右栏 3/12 */}
            <div className="col-span-1 lg:col-span-3 flex flex-col gap-4">
              <DashboardAttackMatrix strategyStats={strategyStats} />
              <div className="flex-1">
                <DashboardDefensePanel
                  sessionCount={sessionCount}
                  runningCount={runningCount}
                  avgScore={avgScore}
                  avgReachability={avgReachability}
                  defenderTriggeredRatio={defenderTriggeredRatio}
                  trendHistory={trendHistory}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer
        className="relative z-10 px-4 py-2 border-t shrink-0"
        style={{ background: 'rgba(6, 8, 18, 0.8)', borderColor: 'rgba(30, 41, 59, 0.5)' }}
      >
        <div className="mx-auto max-w-[1920px] flex items-center justify-between text-xs text-slate-600">
          <span>DDoS 攻防自检系统 v2.0 | AI Agent 驱动的多智能体对抗验证闭环</span>
          <span>赛道: B-EP1 智能体互联网创新攻关</span>
        </div>
      </footer>
    </div>
  );
}
