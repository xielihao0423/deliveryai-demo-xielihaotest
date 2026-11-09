import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, RefreshCw, Trash2, Pencil, MessageSquare } from 'lucide-react'
import { agentApi } from '@/api/client'
import type { Agent } from '@/types'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AgentFormModal } from './AgentFormModal'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

const agentTypeLabels: Record<string, string> = {
  codex_appserver: 'Codex AppServer',
  trae_cli: 'Trae CLI',
}

export function AgentsPage() {
  const navigate = useNavigate()
  const { show } = useToast()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editAgent, setEditAgent] = useState<Agent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadAgents = useCallback(async () => {
    try {
      const data = await agentApi.list()
      setAgents(data)
    } catch (err) {
      show({ title: '加载失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [show])

  useEffect(() => { loadAgents() }, [loadAgents])

  async function handleRefresh() {
    setRefreshing(true)
    await loadAgents()
    setRefreshing(false)
    show({ title: '状态已刷新', variant: 'info' })
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await agentApi.delete(deleteTarget.id)
      setAgents(prev => prev.filter(a => a.id !== deleteTarget.id))
      show({ title: `Agent "${deleteTarget.name}" 已删除`, variant: 'success' })
      setDeleteTarget(null)
    } catch (err) {
      show({ title: '删除失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    }
  }

  function startChat(agent: Agent) {
    if (agent.status !== 'online') {
      show({ title: 'Agent 不可用', description: '该 Agent 当前不在线，无法发起对话', variant: 'error' })
      return
    }
    navigate('/chat', { state: { agentId: agent.id } })
  }

  const stats = {
    total: agents.length,
    online: agents.filter(a => a.status === 'online').length,
    offline: agents.filter(a => a.status === 'offline').length,
    error: agents.filter(a => a.status === 'error').length,
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-brand-400">加载中...</div>
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex gap-3">
          <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} /> 刷新状态
          </Button>
          <Button size="sm" onClick={() => { setEditAgent(null); setFormOpen(true) }}>
            <Plus className="h-3.5 w-3.5" /> 新增 Agent
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <KpiCard label="Agent 总数" value={stats.total} sub="已注册" />
        <KpiCard label="在线" value={stats.online} sub="正常运行" color="text-success-600" />
        <KpiCard label="离线" value={stats.offline} sub="不可达" color="text-brand-400" />
        <KpiCard label="异常" value={stats.error} sub="需处理" color="text-danger-600" />
      </div>

      {/* Agent grid */}
      {agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-brand-400">
          <p className="mb-2 text-lg font-medium text-brand-600">暂无 Agent</p>
          <p className="text-sm">点击「新增 Agent」开始纳管你的第一个 Agent</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {agents.map(agent => (
            <div
              key={agent.id}
              className="cursor-pointer rounded-xl border border-brand-200 bg-white p-5 transition-shadow hover:shadow-md"
              onClick={() => navigate(`/agents/${agent.id}`)}
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="text-base font-semibold text-brand-900">{agent.name}</div>
                  <div className="mt-0.5 text-xs text-brand-400">{agentTypeLabels[agent.type]}</div>
                </div>
                <StatusBadge status={agent.status} />
              </div>

              <div className="mt-2 break-all font-mono text-xs text-brand-400">{agent.endpoint}</div>

              {agent.last_check_at && (
                <div className="mt-2 text-xs text-brand-400">
                  最后检查: {new Date(agent.last_check_at).toLocaleString('zh-CN')}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-brand-100 pt-3">
                <span className="text-xs text-brand-400">
                  {agent.skill_count ?? 0} Skills
                </span>
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="xs" onClick={() => startChat(agent)}>
                    <MessageSquare className="h-3 w-3" /> 对话
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => { setEditAgent(agent); setFormOpen(true) }}>
                    <Pencil className="h-3 w-3" /> 编辑
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => setDeleteTarget(agent)}>
                    <Trash2 className="h-3 w-3 text-danger-600" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agent form modal */}
      <AgentFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        editAgent={editAgent}
        onSaved={() => { loadAgents() }}
      />

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>确认删除</DialogTitle></DialogHeader>
          <p className="text-sm text-brand-600">
            确定要删除 Agent "{deleteTarget?.name}" 吗？关联的 Session 将标记为 Agent 不可用。
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="danger" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KpiCard({ label, value, sub, color }: { label: string; value: number; sub: string; color?: string }) {
  return (
    <div className="rounded-xl border border-brand-200 bg-white px-5 py-4">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-400">{label}</div>
      <div className={cn('text-2xl font-semibold', color || 'text-brand-900')}>{value}</div>
      <div className="mt-0.5 text-xs text-brand-400">{sub}</div>
    </div>
  )
}
