import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { TrendChart } from '@/components/dashboard/TrendChart'
import { TimeRangeFilter } from '@/components/dashboard/TimeRangeFilter'
import { getMetricData, getMetricSummary, type TimeRange, type DailyMetric } from '@/data/mockMetrics'
import { logout } from '@/lib/auth'

interface DashboardState {
  data: DailyMetric[]
  summary: ReturnType<typeof getMetricSummary>
  error: boolean
}

function loadDashboardData(range: TimeRange): DashboardState {
  try {
    return {
      data: getMetricData(range),
      summary: getMetricSummary(range),
      error: false,
    }
  } catch {
    return {
      data: [],
      summary: getMetricSummary(range),
      error: true,
    }
  }
}

export function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [range, setRange] = useState<TimeRange>('30d')
  const [state, setState] = useState<DashboardState>(() => loadDashboardData('30d'))

  const summary = state.summary

  const handleRangeChange = (newRange: TimeRange) => {
    setRange(newRange)
    setState(loadDashboardData(newRange))
  }

  const handleRefresh = () => {
    setState(loadDashboardData(range))
  }

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const formatNumber = useMemo(() => (v: number) => v.toLocaleString('zh-CN'), [])
  const formatMoney = useMemo(() => (v: number) => `¥${v.toLocaleString('zh-CN')}`, [])
  const formatPercent = useMemo(() => (v: number) => `${v.toFixed(2)}%`, [])

  const updatedAt = useMemo(() => {
    const d = new Date(summary.updatedAt)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${day} ${h}:${min}`
  }, [summary.updatedAt])

  if (state.error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-rice-100">
        <p className="text-lg font-semibold text-charcoal-700">{t('dashboard.error_load')}</p>
        <Button onClick={handleRefresh}>
          <RefreshCw size={16} />
          {t('dashboard.refresh')}
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-rice-100 paper-noise">
      {/* 顶部标题栏 */}
      <header className="border-b border-charcoal-900/5 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-charcoal-900">{t('dashboard.title')}</h1>
            <p className="mt-1 text-sm text-charcoal-500">
              {t('dashboard.updated_at', { time: updatedAt })}
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut size={16} />
            {t('dashboard.logout')}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {/* 指标卡片区 */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label={t('dashboard.metric_dau')}
            value={formatNumber(summary.dau)}
            change={summary.dauChange}
            changeLabel=" %"
          />
          <MetricCard
            label={t('dashboard.metric_revenue')}
            value={formatMoney(summary.revenue)}
            change={summary.revenueChange}
            changeLabel=" %"
          />
          <MetricCard
            label={t('dashboard.metric_new_users')}
            value={formatNumber(summary.newUsers)}
            change={summary.newUsersChange}
            changeLabel=" %"
          />
          <MetricCard
            label={t('dashboard.metric_conversion')}
            value={formatPercent(summary.conversionRate)}
            change={summary.conversionRateChange}
            changeLabel=" pp"
          />
        </section>

        {/* 时间范围筛选器 */}
        <section className="mt-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-charcoal-900">{t('dashboard.trend_title')}</h2>
          <TimeRangeFilter value={range} onChange={handleRangeChange} />
        </section>

        {/* 趋势图表区 */}
        {state.data.length === 0 ? (
          <div className="mt-4 flex h-64 items-center justify-center rounded-2xl border border-charcoal-900/5 bg-white shadow-card">
            <p className="text-sm text-charcoal-500">{t('dashboard.no_data')}</p>
          </div>
        ) : (
          <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <TrendChart
              title={t('dashboard.metric_dau')}
              data={state.data}
              dataKey="dau"
              color="#e13b2b"
              format={formatNumber}
            />
            <TrendChart
              title={t('dashboard.metric_revenue')}
              data={state.data}
              dataKey="revenue"
              color="#e69b18"
              format={formatMoney}
            />
            <TrendChart
              title={t('dashboard.metric_new_users')}
              data={state.data}
              dataKey="newUsers"
              color="#34312d"
              format={formatNumber}
            />
            <TrendChart
              title={t('dashboard.metric_conversion')}
              data={state.data}
              dataKey="conversionRate"
              color="#5f5b55"
              format={formatPercent}
            />
          </section>
        )}
      </main>
    </div>
  )
}
