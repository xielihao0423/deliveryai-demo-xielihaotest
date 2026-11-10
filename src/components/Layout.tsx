import { NavLink, useLocation } from 'react-router-dom'
import { Bot, MessageSquare, MessagesSquare, Settings2, Server } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/agents', label: 'Agent 列表', icon: Server, group: '管理' },
  { to: '/sessions', label: 'Session 管理', icon: MessagesSquare, group: '管理' },
  { to: '/chat', label: '对话交互', icon: MessageSquare, group: '管理' },
  { to: '/feishu', label: '飞书配置', icon: Settings2, group: '集成' },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()

  // Determine breadcrumb from path
  const currentNav = navItems.find(n => location.pathname.startsWith(n.to))
  const breadcrumb = currentNav?.label || 'AgentHub'

  return (
    <div className="flex min-h-screen bg-brand-50">
      {/* Sidebar */}
      <aside className="sticky top-0 flex h-screen w-60 flex-col border-r border-brand-200 bg-white">
        <div className="flex items-center gap-2 px-4 py-5">
          <Bot className="h-5 w-5 text-brand-900" />
          <span className="text-base font-semibold text-brand-900">AgentHub</span>
        </div>

        <nav className="flex-1 px-3">
          {['管理', '集成'].map(group => (
            <div key={group} className="mb-2">
              <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-brand-400">{group}</div>
              {navItems.filter(n => n.group === group).map(item => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-brand-100 font-medium text-brand-900'
                          : 'text-brand-600 hover:bg-brand-50 hover:text-brand-900',
                      )
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-brand-100 px-4 py-3 text-xs text-brand-400">
          AgentHub v1.0<br />内部工具 · 单管理员模式
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-x-hidden">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-brand-200 bg-white px-8 py-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-brand-400">{breadcrumb}</span>
          </div>
        </header>
        <main className="px-8 py-6">{children}</main>
      </div>
    </div>
  )
}
