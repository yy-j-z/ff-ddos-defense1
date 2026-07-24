'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

export interface MetricPoint {
  ts: number;
  rps: number;
  blocked: number;
}

const AXIS = '#a1a1aa';
const GRID = '#ededed';
const RPS = '#3f3f46'; // 近黑灰:总流量
const BLOCKED = '#dc2626'; // 红:被拦截

export function AttackChart({ data }: { data: MetricPoint[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="fillRps" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RPS} stopOpacity={0.12} />
              <stop offset="100%" stopColor={RPS} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="ts"
            stroke={AXIS}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            tickMargin={8}
            tickFormatter={(v) => `${v}s`}
          />
          <YAxis stroke={AXIS} tickLine={false} axisLine={false} fontSize={11} width={36} />
          <Tooltip
            cursor={{ stroke: '#d4d4d8', strokeWidth: 1 }}
            contentStyle={{
              background: '#ffffff',
              border: '1px solid #e5e5e5',
              borderRadius: 6,
              fontSize: 12,
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              color: '#18181b'
            }}
            labelFormatter={(v) => `t = ${v}s`}
          />
          <Area
            type="monotone"
            dataKey="rps"
            name="总流量"
            stroke={RPS}
            strokeWidth={1.5}
            fill="url(#fillRps)"
            dot={false}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="blocked"
            name="被拦截"
            stroke={BLOCKED}
            strokeWidth={1.5}
            fill="none"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
