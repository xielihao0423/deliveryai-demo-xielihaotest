import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { TimeRange } from '@/data/mockMetrics'

interface TimeRangeFilterProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

export function TimeRangeFilter({ value, onChange }: TimeRangeFilterProps) {
  const { t } = useTranslation()
  const options: { key: TimeRange; label: string }[] = [
    { key: 'today', label: t('dashboard.range_today') },
    { key: '7d', label: t('dashboard.range_7d') },
    { key: '30d', label: t('dashboard.range_30d') },
  ]

  return (
    <div className="inline-flex rounded-xl border border-charcoal-900/10 bg-white p-1">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-semibold transition-all',
            value === opt.key
              ? 'bg-chili-500 text-white shadow-sm'
              : 'text-charcoal-500 hover:bg-rice-200',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
