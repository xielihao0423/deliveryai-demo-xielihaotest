import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { agentApi } from '@/api/client'
import type { Agent, AgentInput, AgentType } from '@/types'
import { useToast } from '@/components/ui/toast'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editAgent?: Agent | null
  onSaved: (agent: Agent) => void
}

export function AgentFormModal({ open, onOpenChange, editAgent, onSaved }: Props) {
  const { show } = useToast()
  const [name, setName] = useState(editAgent?.name || '')
  const [type, setType] = useState<AgentType>(editAgent?.type || 'codex_appserver')
  const [endpoint, setEndpoint] = useState(editAgent?.endpoint || '')
  const [auth, setAuth] = useState('')
  const [note, setNote] = useState(editAgent?.note || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isEdit = !!editAgent

  async function handleSubmit() {
    setError('')

    if (!name.trim()) { setError('Agent 名称不能为空'); return }
    if (!endpoint.trim()) { setError('端点地址不能为空'); return }

    setSubmitting(true)
    try {
      const input: AgentInput = {
        name: name.trim(),
        type,
        endpoint: endpoint.trim(),
        note: note.trim() || undefined,
      }
      if (auth.trim()) input.auth_config = auth.trim()

      let agent: Agent
      if (isEdit && editAgent) {
        agent = await agentApi.update(editAgent.id, input)
        show({ title: 'Agent 更新成功', variant: 'success' })
      } else {
        agent = await agentApi.create(input)
        const statusLabel = agent.status === 'online' ? '在线' : agent.status === 'error' ? '异常' : '离线'
        show({ title: `Agent 创建成功`, description: `状态: ${statusLabel}`, variant: agent.status === 'online' ? 'success' : 'info' })
      }
      onSaved(agent)
      onOpenChange(false)
      // Reset form
      setName(''); setType('codex_appserver'); setEndpoint(''); setAuth(''); setNote('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      setError(msg)
      show({ title: '操作失败', description: msg, variant: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑 Agent' : '新增 Agent'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-brand-800">Agent 名称 <span className="text-danger-600">*</span></label>
            <input
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-900"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如：codex-prod"
            />
            <p className="mt-1 text-xs text-brand-400">名称在平台内必须唯一</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-brand-800">Agent 类型 <span className="text-danger-600">*</span></label>
            <Select value={type} onValueChange={(v) => setType(v as AgentType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="codex_appserver">Codex AppServer</SelectItem>
                <SelectItem value="trae_cli">Trae CLI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-brand-800">端点地址 <span className="text-danger-600">*</span></label>
            <input
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-900"
              value={endpoint}
              onChange={e => setEndpoint(e.target.value)}
              placeholder="traex 或 http://localhost:7331/acp"
            />
            <p className="mt-1 text-xs text-brand-400">
              HTTP 地址（http://…）或命令路径（如 <code className="font-mono">traex</code>、<code className="font-mono">/usr/local/bin/traex acp serve</code>）
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-brand-800">认证信息</label>
            <input
              type="password"
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-900"
              value={auth}
              onChange={e => setAuth(e.target.value)}
              placeholder={isEdit ? '留空保持不变' : 'API Key / Token（可选）'}
            />
            <p className="mt-1 text-xs text-brand-400">认证信息在存储时加密</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-brand-800">备注</label>
            <textarea
              className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-900"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="可选描述"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-700">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? '验证中...' : isEdit ? '保存' : '验证并保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
