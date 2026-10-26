/**
 * Mock 业务指标数据生成模块
 * 生成近 30 天的核心指标数据，保证数据逻辑自洽：
 * - DAU 在合理量级范围内随机
 * - 总收入与 DAU 正相关
 * - 新增用户数为 DAU 的一部分
 * - 转化率 = 下单用户数 / DAU × 100%
 */

export interface DailyMetric {
  date: string
  dau: number
  revenue: number
  newUsers: number
  conversionRate: number
}

export type TimeRange = 'today' | '7d' | '30d'

export interface MetricSummary {
  dau: number
  revenue: number
  newUsers: number
  conversionRate: number
  dauChange: number
  revenueChange: number
  newUsersChange: number
  conversionRateChange: number
  updatedAt: string
}

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function generate30DaysData(): DailyMetric[] {
  const data: DailyMetric[] = []
  const today = new Date()
  const rand = seededRandom(20261026)

  for (let i = 29; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    const dateStr = formatDate(date)

    // DAU: 8000 ~ 15000，周末略高
    const isWeekend = date.getDay() === 0 || date.getDay() === 6
    const baseDau = isWeekend ? 11000 : 9000
    const dau = Math.round(baseDau + rand() * 4000)

    // 下单用户数：DAU 的 60%~80%
    const orderUsers = Math.round(dau * (0.6 + rand() * 0.2))

    // 转化率 = 下单用户数 / DAU × 100%
    const conversionRate = Number(((orderUsers / dau) * 100).toFixed(2))

    // 总收入：与下单用户数正相关，客单价 80~120 元
    const avgPrice = 80 + rand() * 40
    const revenue = Math.round(orderUsers * avgPrice)

    // 新增用户数：DAU 的 8%~15%
    const newUsers = Math.round(dau * (0.08 + rand() * 0.07))

    data.push({ date: dateStr, dau, revenue, newUsers, conversionRate })
  }

  return data
}

const allData: DailyMetric[] = generate30DaysData()

export function getMetricData(range: TimeRange): DailyMetric[] {
  switch (range) {
    case 'today':
      return allData.slice(-1)
    case '7d':
      return allData.slice(-7)
    case '30d':
    default:
      return allData.slice(-30)
  }
}

export function getMetricSummary(range: TimeRange): MetricSummary {
  const data = getMetricData(range)
  if (data.length === 0) {
    return {
      dau: 0, revenue: 0, newUsers: 0, conversionRate: 0,
      dauChange: 0, revenueChange: 0, newUsersChange: 0, conversionRateChange: 0,
      updatedAt: new Date().toISOString(),
    }
  }

  const latest = data[data.length - 1]
  let prev: DailyMetric | null = null
  if (data.length >= 2) {
    prev = data[data.length - 2]
  } else {
    // 仅当天数据时，从全量数据中取前一天对比
    const idx = allData.length - 2
    if (idx >= 0) prev = allData[idx]
  }

  const change = (current: number, previous: number): number => {
    if (previous === 0) return 0
    return Number((((current - previous) / previous) * 100).toFixed(2))
  }

  return {
    dau: latest.dau,
    revenue: latest.revenue,
    newUsers: latest.newUsers,
    conversionRate: latest.conversionRate,
    dauChange: prev ? change(latest.dau, prev.dau) : 0,
    revenueChange: prev ? change(latest.revenue, prev.revenue) : 0,
    newUsersChange: prev ? change(latest.newUsers, prev.newUsers) : 0,
    conversionRateChange: prev ? Number((latest.conversionRate - prev.conversionRate).toFixed(2)) : 0,
    updatedAt: new Date().toISOString(),
  }
}
