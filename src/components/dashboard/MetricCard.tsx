import { ArrowDown, ArrowUp, Minus } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: string
  change: number
  changeLabel: string
}

export function MetricCard({ label, value, change, changeLabel }: MetricCardProps) {
  const isUp = change > 0
  const isDown = change < 0
  const color = isUp ? 'text-emerald-600' : isDown ? 'text-chili-600' : 'text-charcoal-500'
  const Icon = isUp ? ArrowUp : isDown ? ArrowDown : Minus

  return (
    <div className="rounded-2xl border border-charcoal-900/5 bg-white p-5 shadow-card">
      <p className="text-sm font-semibold text-charcoal-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-charcoal-900">{value}</p>
      <div className={`mt-2 flex items-center gap-1 text-sm font-semibold ${color}`}>
        <Icon size={16} />
        <span>{isUp ? '+' : ''}{change}{changeLabel}</span>
      </div>
    </div>
  )
}
