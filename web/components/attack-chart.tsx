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

const AXIS = '#64748b';
const GRID = '#1e293b';
const RPS = '#06b6d4';
const BLOCKED = '#ef4444';

export function AttackChart({ data }: { data: MetricPoint[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="fillRps" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RPS} stopOpacity={0.2} />
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
            domain={['dataMin', 'dataMax']}
            type="number"
            label={{ value: '时间 (秒)', position: 'insideBottomRight', offset: -5, style: { fill: AXIS, fontSize: 10 } }}
          />
          <YAxis
            stroke={AXIS}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={36}
            domain={[0, 'auto']}
            tickFormatter={(v) => `${v}`}
          />
          <Tooltip
            cursor={{ stroke: '#475569', strokeWidth: 1 }}
            contentStyle={{
              background: '#0f172a',
              border: '1px solid #1f2937',
              borderRadius: 6,
              fontSize: 12,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              color: '#e2e8f0'
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
