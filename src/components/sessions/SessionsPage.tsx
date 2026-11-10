import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, RotateCcw, MessageSquare, Trash2 } from 'lucide-react'
import { sessionApi } from '@/api/client'
import type { Session } from '@/types'
import { Button } from '@/components/ui/button'
import { StatusBadge, Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type FilterTab = 'active' | 'archived' | 'all'

export function SessionsPage() {
  const navigate = useNavigate()
  const { show } = useToast()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('active')

  const loadSessions = useCallback(async () => {
    try {
      const data = await sessionApi.list(filter === 'all' ? undefined : filter)
      setSessions(data)
    } catch (err) {
      show({ title: '加载失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [filter, show])

  useEffect(() => { loadSessions() }, [loadSessions])

  async function handleArchive(session: Session) {
    try {
      await sessionApi.archive(session.id)
      show({ title: 'Session 已归档', variant: 'success' })
      loadSessions()
    } catch (err) {
      show({ title: '归档失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    }
  }

  async function handleRestore(session: Session) {
    try {
      await sessionApi.restore(session.id)
      show({ title: 'Session 已恢复', variant: 'success' })
      loadSessions()
    } catch (err) {
      show({ title: '恢复失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    }
  }

  async function handleDelete(session: Session) {
    try {
      await sessionApi.delete(session.id)
      show({ title: 'Session 已删除', variant: 'success' })
      loadSessions()
    } catch (err) {
      show({ title: '删除失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    }
  }

  function handleResume(session: Session) {
    if (session.agent_status !== 'online') {
      show({ title: 'Agent 不可用', description: '该 Session 关联的 Agent 不在线，仅可查看历史', variant: 'error' })
      return
    }
    navigate('/chat', { state: { agentId: session.agent_id } })
  }

  const filters: { key: FilterTab; label: string }[] = [
    { key: 'active', label: '活跃 Session' },
    { key: 'archived', label: '已归档' },
    { key: 'all', label: '全部' },
  ]

  if (loading) return <div className="py-20 text-center text-brand-400">加载中...</div>

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-lg border px-4 py-2 text-sm transition-colors',
              filter === f.key
                ? 'border-brand-900 bg-brand-900 text-white'
                : 'border-brand-200 bg-white text-brand-600 hover:bg-brand-50',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-brand-400">
          <MessageSquare className="mb-3 h-12 w-12 opacity-20" />
          <p className="text-base font-medium text-brand-600">暂无 Session</p>
          <p className="mt-1 text-sm">开始对话后，Session 将自动出现在这里</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-brand-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-100">
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-brand-400">Session</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-brand-400">Agent</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-brand-400">来源</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-brand-400">消息数</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-brand-400">创建时间</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-brand-400">最后活跃</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-brand-400">状态</th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-brand-400">操作</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(session => (
                <tr key={session.id} className="border-b border-brand-50 hover:bg-brand-50/50">
                  <td className="px-3 py-3">
                    <div className="font-mono text-xs text-brand-700">{session.id.slice(0, 12)}...</div>
                    {session.title && <div className="text-xs text-brand-400">{session.title}</div>}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    {session.agent_name ? (
                      <div>
                        <div className="text-brand-800">{session.agent_name}</div>
                        {session.agent_status && (
                          <div className="mt-0.5"><StatusBadge status={session.agent_status} /></div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-danger-600">Agent 已删除</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={session.source === 'feishu' ? 'feishu' : 'web'}>
                      {session.source === 'feishu' ? '飞书' : 'Web'}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-sm text-brand-600">{session.message_count ?? 0}</td>
                  <td className="px-3 py-3 text-xs text-brand-500">{new Date(session.created_at).toLocaleString('zh-CN')}</td>
                  <td className="px-3 py-3 text-xs text-brand-500">{new Date(session.last_active_at).toLocaleString('zh-CN')}</td>
                  <td className="px-3 py-3"><StatusBadge status={session.status} /></td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <Button
                        variant="ghost" size="xs"
                        onClick={() => handleResume(session)}
                        disabled={session.status !== 'active' || session.agent_status !== 'online'}
                        title={session.agent_status !== 'online' ? 'Agent 不可用' : '续接对话'}
                      >
                        <MessageSquare className="h-3 w-3" /> 续接
                      </Button>
                      {session.status === 'active' ? (
                        <Button variant="ghost" size="xs" onClick={() => handleArchive(session)}>
                          <Archive className="h-3 w-3" /> 归档
                        </Button>
                      ) : (
                        <Button variant="ghost" size="xs" onClick={() => handleRestore(session)}>
                          <RotateCcw className="h-3 w-3" /> 恢复
                        </Button>
                      )}
                      <Button variant="ghost" size="xs" onClick={() => handleDelete(session)}>
                        <Trash2 className="h-3 w-3 text-danger-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
