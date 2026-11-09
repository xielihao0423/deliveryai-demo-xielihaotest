import { useEffect, useState, useCallback } from 'react'
import { Save, Plug, Trash2, Send } from 'lucide-react'
import { feishuApi } from '@/api/client'
import type { FeishuConfig, FeishuEvent, PushLog } from '@/types'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

const eventLabels: Record<string, string> = {
  agent_online: 'Agent 上线',
  agent_offline: 'Agent 下线',
  agent_error: 'Agent 异常',
  session_completed: '对话完成',
}

export function FeishuPage() {
  const { show } = useToast()
  const [, setConfig] = useState<FeishuConfig | null>(null)
  const [events, setEvents] = useState<FeishuEvent[]>([])
  const [logs, setLogs] = useState<PushLog[]>([])
  const [webhook, setWebhook] = useState('')
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [configData, logsData] = await Promise.all([
        feishuApi.getConfig(),
        feishuApi.getLogs(),
      ])
      const cfg = configData.config
      setConfig(cfg)
      setEvents(configData.events)
      setWebhook(cfg.webhook_url)
      setAppId(cfg.bot_app_id)
      setAppSecret(cfg.bot_app_secret)
      setEnabled(cfg.enabled)
      setLogs(logsData)
    } catch (err) {
      show({ title: '加载失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    }
  }, [show])

  useEffect(() => { loadData() }, [loadData])

  async function handleSave() {
    setSaving(true)
    try {
      await feishuApi.updateConfig({
        webhook_url: webhook,
        bot_app_id: appId,
        bot_app_secret: appSecret.includes('•') ? undefined : appSecret,
        enabled,
      })
      show({ title: '配置已保存', variant: 'success' })
      loadData()
    } catch (err) {
      show({ title: '保存失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    try {
      const result = await feishuApi.test()
      if (result.success) {
        show({ title: '测试消息已发送', variant: 'success' })
        loadData()
      } else {
        show({ title: '测试失败', description: '请检查 Webhook URL 和网络', variant: 'error' })
      }
    } catch (err) {
      show({ title: '测试失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    } finally {
      setTesting(false)
    }
  }

  async function handleToggleEvent(eventType: string, enabled: boolean) {
    try {
      await feishuApi.toggleEvent(eventType, enabled)
      setEvents(prev => prev.map(e => e.event_type === eventType ? { ...e, enabled } : e))
    } catch (err) {
      show({ title: '操作失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    }
  }

  async function handleClearLogs() {
    try {
      await feishuApi.clearLogs()
      setLogs([])
      show({ title: '日志已清空', variant: 'info' })
    } catch (err) {
      show({ title: '操作失败', description: err instanceof Error ? err.message : '', variant: 'error' })
    }
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Left column: Config + Events */}
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>飞书机器人配置</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-brand-800">启用飞书集成</label>
                <div className="flex items-center gap-3">
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                  <span className="text-sm text-brand-400">{enabled ? '已启用' : '已禁用'}</span>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-brand-800">Webhook URL</label>
                <input
                  className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-900"
                  value={webhook}
                  onChange={e => setWebhook(e.target.value)}
                  placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                />
                <p className="mt-1 text-xs text-brand-400">飞书群组自定义机器人的 Webhook 地址</p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-brand-800">App ID</label>
                <input
                  className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-900"
                  value={appId}
                  onChange={e => setAppId(e.target.value)}
                  placeholder="飞书应用 App ID"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-brand-800">App Secret</label>
                <input
                  type="password"
                  className="w-full rounded-lg border border-brand-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-900"
                  value={appSecret}
                  onChange={e => setAppSecret(e.target.value)}
                  placeholder="飞书应用 App Secret"
                />
                <p className="mt-1 text-xs text-brand-400">认证信息在存储时加密，界面中脱敏显示</p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="secondary" size="sm" onClick={handleTest} disabled={testing}>
                  <Plug className="h-3.5 w-3.5" /> {testing ? '测试中...' : '测试连接'}
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  <Save className="h-3.5 w-3.5" /> {saving ? '保存中...' : '保存配置'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>通知事件配置</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {events.map(evt => (
                <div key={evt.event_type} className="flex items-center justify-between border-b border-brand-50 py-2.5">
                  <span className="text-sm text-brand-700">{eventLabels[evt.event_type] || evt.event_type}</span>
                  <Switch
                    checked={evt.enabled}
                    onCheckedChange={(checked) => handleToggleEvent(evt.event_type, checked)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right column: Push logs + Bot instructions */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>推送日志</CardTitle>
            <Button variant="ghost" size="xs" onClick={handleClearLogs}>
              <Trash2 className="h-3 w-3" /> 清空
            </Button>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className="py-6 text-center text-sm text-brand-400">暂无推送日志</p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {logs.map(log => (
                  <div key={log.id} className="flex items-start gap-2 border-b border-brand-50 py-2 text-xs">
                    <span className={cn(
                      'mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium',
                      log.status === 'success' ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700',
                    )}>
                      {log.status === 'success' ? <Send className="h-2.5 w-2.5" /> : '✕'}
                      {log.status === 'success' ? '成功' : '失败'}
                    </span>
                    <div className="flex-1">
                      <div className="text-brand-700">{log.message}</div>
                      <div className="text-brand-400">{new Date(log.created_at).toLocaleString('zh-CN')} · {log.event_type}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>双向 Bot 对话说明</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm leading-relaxed text-brand-600">
              <div>
                <p className="mb-1 font-semibold text-brand-800">使用方式：</p>
                <p>在飞书群组中 @Bot 并选择目标 Agent 即可发起对话：</p>
                <pre className="mt-2 rounded-lg bg-brand-50 px-3 py-2 font-mono text-xs">@AgentHub /agent codex-prod 请帮我写一个快速排序</pre>
              </div>
              <div>
                <p className="mb-1 font-semibold text-brand-800">消息路由：</p>
                <p>飞书消息回调 → 平台后端路由到目标 Agent → Agent 回复推回飞书群组，同时在平台 Session 列表中可见。</p>
              </div>
              <div>
                <p className="mb-1 font-semibold text-brand-800">Session 映射：</p>
                <p>飞书侧发起的对话以独立 Session 管理，来源标记为「飞书」，与平台 Web 侧对话统一管理。</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
