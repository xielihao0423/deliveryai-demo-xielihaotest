import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DailyMetric } from '@/data/mockMetrics'

interface TrendChartProps {
  title: string
  data: DailyMetric[]
  dataKey: keyof DailyMetric
  color: string
  format?: (value: number) => string
}

export function TrendChart({ title, data, dataKey, color, format }: TrendChartProps) {
  const chartData = data.map((d) => ({
    date: d.date.slice(5),
    value: d[dataKey] as number,
  }))

  return (
    <div className="rounded-2xl border border-charcoal-900/5 bg-white p-5 shadow-card">
      <h3 className="mb-4 text-sm font-bold text-charcoal-700">{title}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d6" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#5f5b55' }}
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={{ stroke: '#e5e0d6' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#5f5b55' }}
            tickLine={false}
            axisLine={false}
            width={60}
            tickFormatter={(v: number) => format ? format(v) : String(v)}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: '1px solid rgba(33,31,28,0.05)',
              boxShadow: '0 10px 30px rgba(70,45,25,0.08)',
              fontSize: 12,
            }}
            labelStyle={{ fontWeight: 600, color: '#211f1c' }}
            formatter={(value: number) => [format ? format(value) : String(value), '']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#grad-${dataKey})`}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
