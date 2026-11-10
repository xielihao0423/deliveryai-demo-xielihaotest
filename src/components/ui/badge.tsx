import { cn } from '@/lib/utils'

const badgeStyles = {
  online: 'bg-success-50 text-success-700',
  offline: 'bg-brand-100 text-brand-500',
  error: 'bg-danger-50 text-danger-700',
  active: 'bg-info-50 text-info-700',
  archived: 'bg-brand-100 text-brand-500',
  feishu: 'bg-warning-50 text-warning-700',
  web: 'bg-info-50 text-info-700',
} as const

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const style = badgeStyles[status as keyof typeof badgeStyles] || 'bg-brand-100 text-brand-700'
  const dotColor = status === 'online' ? 'bg-success-500' : status === 'error' ? 'bg-danger-500' : 'bg-brand-400'
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', style)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dotColor)} />
      {label || status}
    </span>
  )
}

export function Badge({ variant = 'web', children }: { variant?: keyof typeof badgeStyles | 'default'; children: React.ReactNode }) {
  const style = (badgeStyles as Record<string, string>)[variant] || 'bg-brand-100 text-brand-700'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', style)}>
      {children}
    </span>
  )
}
