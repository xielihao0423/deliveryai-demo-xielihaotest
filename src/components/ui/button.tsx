import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-900 disabled:pointer-events-none disabled:opacity-50 active:scale-95',
  {
    variants: {
      variant: {
        default: 'bg-brand-900 text-white hover:bg-brand-800 shadow-sm',
        secondary: 'bg-white text-brand-800 border border-brand-200 hover:bg-brand-50',
        outline: 'border border-brand-200 bg-white text-brand-700 hover:border-brand-300 hover:bg-brand-50',
        ghost: 'text-brand-700 hover:bg-brand-50',
        danger: 'bg-danger-600 text-white hover:bg-danger-700',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 rounded-md px-3 text-xs',
        icon: 'h-9 w-9 p-0',
        xs: 'h-7 rounded px-2 text-xs',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
)
Button.displayName = 'Button'
