import * as React from 'react'
import * as ToastPrimitives from '@radix-ui/react-toast'
import { cva, type VariantProps } from 'class-variance-authority'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

const ToastProvider = ToastPrimitives.Provider

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn('fixed bottom-4 right-4 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 sm:max-w-sm', className)}
    {...props}
  />
))
ToastViewport.displayName = 'ToastViewport'

const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg border p-4 pr-6 shadow-lg transition-all',
  {
    variants: {
      variant: {
        default: 'border-brand-200 bg-white text-brand-800',
        success: 'border-success-200 bg-white text-brand-800 border-l-4 border-l-success-600',
        error: 'border-danger-200 bg-white text-brand-800 border-l-4 border-l-danger-600',
        info: 'border-info-200 bg-white text-brand-800 border-l-4 border-l-info-600',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, children, ...props }, ref) => (
  <ToastPrimitives.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props}>
    {children}
  </ToastPrimitives.Root>
))
Toast.displayName = 'Toast'

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close ref={ref} className={cn('absolute right-2 top-2 text-brand-400 hover:text-brand-700', className)} toast-close="" {...props}>
    <X size={16} />
  </ToastPrimitives.Close>
))
ToastClose.displayName = 'ToastClose'

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title ref={ref} className={cn('text-sm font-semibold', className)} {...props} />
))
ToastTitle.displayName = 'ToastTitle'

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description ref={ref} className={cn('text-sm text-brand-600', className)} {...props} />
))
ToastDescription.displayName = 'ToastDescription'

export { ToastProvider, ToastViewport, Toast, ToastClose, ToastTitle, ToastDescription }

// ── Toast hook & context ──

type ToastVariant = 'default' | 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

const ToastContext = React.createContext<{
  show: (toast: Omit<ToastItem, 'id'>) => void
} | null>(null)

export function ToastContextProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])

  const show = React.useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setToasts(prev => [...prev, { ...toast, id }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  const icons = {
    default: <Info size={18} className="text-brand-400" />,
    success: <CheckCircle2 size={18} className="text-success-600" />,
    error: <AlertCircle size={18} className="text-danger-600" />,
    info: <Info size={18} className="text-info-600" />,
  }

  return (
    <ToastContext.Provider value={{ show }}>
      <ToastProvider duration={4000}>
        {children}
        {toasts.map(t => (
          <Toast key={t.id} variant={t.variant}>
            {icons[t.variant]}
            <div className="flex-1">
              <ToastTitle>{t.title}</ToastTitle>
              {t.description && <ToastDescription>{t.description}</ToastDescription>}
            </div>
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastContextProvider')
  return ctx
}
