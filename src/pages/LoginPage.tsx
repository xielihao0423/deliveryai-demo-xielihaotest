import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Lock, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { login } from '@/lib/auth'

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const from = (location.state as { from?: string })?.from || '/dashboard'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!username || !password) {
      setError(t('login.error_empty'))
      return
    }

    const user = login(username, password)
    if (user) {
      navigate(from, { replace: true })
    } else {
      setError(t('login.error_invalid'))
      setPassword('')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-rice-100 paper-noise px-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-charcoal-900/5 bg-white p-8 shadow-card">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-chili-500 text-white shadow-md">
              <Lock size={28} />
            </div>
            <h1 className="text-2xl font-bold text-charcoal-900">{t('login.title')}</h1>
            <p className="mt-1 text-sm text-charcoal-500">{t('login.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-charcoal-700">{t('login.username_label')}</label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('login.username_placeholder')}
                  className="h-11 w-full rounded-xl border border-charcoal-900/10 bg-rice-50 pl-10 pr-4 text-sm text-charcoal-900 placeholder:text-charcoal-500/50 focus:border-chili-500 focus:outline-none focus:ring-2 focus:ring-chili-500/20"
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-charcoal-700">{t('login.password_label')}</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.password_placeholder')}
                  className="h-11 w-full rounded-xl border border-charcoal-900/10 bg-rice-50 pl-10 pr-4 text-sm text-charcoal-900 placeholder:text-charcoal-500/50 focus:border-chili-500 focus:outline-none focus:ring-2 focus:ring-chili-500/20"
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-chili-50 px-3 py-2 text-sm font-semibold text-chili-600">{error}</p>
            )}

            <Button type="submit" className="h-12 w-full text-base">
              {t('login.submit')}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-charcoal-500/60">
            {t('login.hint')}
          </p>
        </div>
      </div>
    </div>
  )
}
