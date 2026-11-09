import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageSquare, RefreshCw, Settings2 } from 'lucide-react'
import { agentApi } from '@/api/client'
import type { Agent, Skill } from '@/types'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { StatusBadge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

const agentTypeLabels: Record<string, string> = {
  codex_appserver: 'Codex AppServer',
  trae_cli: 'Trae CLI',
}

export function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { show } = useToast()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [skillModal, setSkillModal] = useState<Skill | null>(null)
  const [skillConfig, setSkillConfig] = useState('')

  const loadAgent = useCallback(async () => {
    if (!id) return
    try {
      const [agentData, skillsData] = await Promise.all([
        agentApi.get(id),
        agentApi.getSkills(id),
      ])
      setAgent(agentData)
      setSkills(skillsData)
    } catch (err) {
      show({ title: '加载失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [id, show])

  useEffect(() => { loadAgent() }, [loadAgent])

  async function handleSyncSkills() {
    if (!id) return
    setSyncing(true)
    try {
      const result = await agentApi.syncSkills(id)
      show({ title: 'Skill 同步完成', description: `同步了 ${result.synced} 个 Skill`, variant: 'success' })
      await loadAgent()
    } catch (err) {
      show({ title: '同步失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    } finally {
      setSyncing(false)
    }
  }

  async function handleToggleSkill(skill: Skill, enabled: boolean) {
    if (!id) return
    try {
      await agentApi.updateSkill(id, skill.id, { enabled })
      setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, enabled } : s))
      show({ title: `Skill "${skill.name}" 已${enabled ? '启用' : '禁用'}`, variant: 'success' })
    } catch (err) {
      show({ title: '操作失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    }
  }

  async function handleSaveSkillConfig() {
    if (!id || !skillModal) return
    try {
      const updated = await agentApi.updateSkill(id, skillModal.id, { config: skillConfig })
      setSkills(prev => prev.map(s => s.id === skillModal.id ? updated : s))
      show({ title: 'Skill 配置已保存', variant: 'success' })
      setSkillModal(null)
    } catch (err) {
      show({ title: '保存失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    }
  }

  function openSkillModal(skill: Skill) {
    setSkillModal(skill)
    setSkillConfig(skill.config)
  }

  function startChat() {
    if (agent?.status !== 'online') {
      show({ title: 'Agent 不可用', description: '该 Agent 当前不在线', variant: 'error' })
      return
    }
    navigate('/chat', { state: { agentId: agent.id } })
  }

  if (loading) return <div className="py-20 text-center text-brand-400">加载中...</div>
  if (!agent) return <div className="py-20 text-center text-brand-400">Agent 不存在</div>

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm">
        <button onClick={() => navigate('/agents')} className="flex items-center gap-1 text-brand-400 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" /> Agent 管理
        </button>
        <span className="text-brand-300">/</span>
        <span className="text-brand-700">{agent.name}</span>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-brand-900">{agent.name}</h1>
          <StatusBadge status={agent.status} />
        </div>
        <Button size="sm" onClick={startChat} disabled={agent.status !== 'online'}>
          <MessageSquare className="h-3.5 w-3.5" /> 发起对话
        </Button>
      </div>

      {/* Agent info card */}
      <div className="mb-6 rounded-xl border border-brand-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-brand-900">基本信息</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <InfoItem label="Agent ID" value={agent.id} mono />
          <InfoItem label="类型" value={agentTypeLabels[agent.type]} />
          <InfoItem label="端点地址" value={agent.endpoint} mono />
          <InfoItem label="最后检查" value={agent.last_check_at ? new Date(agent.last_check_at).toLocaleString('zh-CN') : '—'} />
          <InfoItem label="创建时间" value={new Date(agent.created_at).toLocaleString('zh-CN')} />
          <InfoItem label="Skill 数量" value={String(skills.length)} />
          {agent.note && <InfoItem label="备注" value={agent.note} />}
        </div>
      </div>

      {/* Skills section */}
      <div className="rounded-xl border border-brand-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-brand-900">Skill 列表</h3>
          <Button variant="secondary" size="sm" onClick={handleSyncSkills} disabled={syncing || agent.status !== 'online'}>
            <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} /> 同步 Skill
          </Button>
        </div>

        {skills.length === 0 ? (
          <div className="py-10 text-center text-sm text-brand-400">
            暂无 Skill，点击「同步 Skill」从 Agent 获取
          </div>
        ) : (
          <div className="space-y-2">
            {skills.map(skill => (
              <div key={skill.id} className="flex items-center justify-between rounded-lg border border-brand-200 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-brand-900">{skill.name}</div>
                  <div className="mt-0.5 text-xs text-brand-400">{skill.description || '无描述'}</div>
                  <div className="mt-1 text-xs text-brand-300">
                    最后同步: {new Date(skill.synced_at).toLocaleString('zh-CN')}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="xs" onClick={() => openSkillModal(skill)}>
                    <Settings2 className="h-3 w-3" /> 配置
                  </Button>
                  <Switch
                    checked={skill.enabled}
                    onCheckedChange={(checked) => handleToggleSkill(skill, checked)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Skill config modal */}
      <Dialog open={!!skillModal} onOpenChange={(open) => !open && setSkillModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skill 配置 — {skillModal?.name}</DialogTitle>
          </DialogHeader>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-brand-800">配置参数 (JSON)</label>
            <textarea
              className="h-48 w-full rounded-lg border border-brand-200 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand-900"
              value={skillConfig}
              onChange={e => setSkillConfig(e.target.value)}
            />
            <p className="mt-1 text-xs text-brand-400">修改后将同步到 Agent 并确认生效</p>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSkillModal(null)}>取消</Button>
            <Button onClick={handleSaveSkillConfig}>保存配置</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InfoItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-brand-400">{label}</div>
      <div className={cn('mt-1 text-brand-800', mono && 'font-mono text-xs')}>{value}</div>
    </div>
  )
}
