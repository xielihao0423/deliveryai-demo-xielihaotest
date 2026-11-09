import { Router } from 'express'
import db, { encryptAuth } from '../db/database.js'
import type { FeishuConfig, PushLog } from '../types/index.js'
import { sendFeishuNotification, handleFeishuWebhook } from '../services/FeishuService.js'

const router = Router()

// GET /api/feishu/config — get feishu config
router.get('/config', (_req, res) => {
  const row = db.prepare('SELECT * FROM feishu_config WHERE id = ?').get('default') as Record<string, unknown> | undefined
  if (!row) {
    res.json({ success: true, data: null })
    return
  }

  const config: Partial<FeishuConfig> = {
    id: row.id as string,
    webhook_url: row.webhook_url as string,
    bot_app_id: row.bot_app_id as string,
    // Mask app_secret in response (NFR-004)
    bot_app_secret: row.bot_app_secret ? '••••••••••••••••' : '',
    enabled: (row.enabled as number) === 1,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }

  const events = db.prepare('SELECT * FROM feishu_events ORDER BY event_type').all() as Record<string, unknown>[]
  const mappedEvents = events.map(r => ({
    event_type: r.event_type as string,
    enabled: (r.enabled as number) === 1,
  }))

  res.json({ success: true, data: { config, events: mappedEvents } })
})

// PUT /api/feishu/config — update feishu config
router.put('/config', (req, res) => {
  const { webhook_url, bot_app_id, bot_app_secret, enabled } = req.body as {
    webhook_url?: string
    bot_app_id?: string
    bot_app_secret?: string
    enabled?: boolean
  }

  const existing = db.prepare('SELECT * FROM feishu_config WHERE id = ?').get('default') as Record<string, unknown> | undefined
  if (!existing) {
    res.status(404).json({ success: false, error: '飞书配置不存在' })
    return
  }

  const now = new Date().toISOString()

  // If app_secret is masked placeholder, keep existing
  const newSecret = bot_app_secret && !bot_app_secret.includes('•')
    ? encryptAuth(bot_app_secret)
    : existing.bot_app_secret as string

  db.prepare(`UPDATE feishu_config SET webhook_url = ?, bot_app_id = ?, bot_app_secret = ?, enabled = ?, updated_at = ? WHERE id = ?`)
    .run(
      webhook_url ?? existing.webhook_url,
      bot_app_id ?? existing.bot_app_id,
      newSecret,
      enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
      now,
      'default',
    )

  res.json({ success: true })
})

// PUT /api/feishu/events/:eventType — toggle event
router.put('/events/:eventType', (req, res) => {
  const { enabled } = req.body as { enabled: boolean }
  const eventType = req.params.eventType

  const existing = db.prepare('SELECT event_type FROM feishu_events WHERE event_type = ?').get(eventType) as { event_type: string } | undefined
  if (!existing) {
    res.status(404).json({ success: false, error: '事件类型不存在' })
    return
  }

  db.prepare('UPDATE feishu_events SET enabled = ? WHERE event_type = ?')
    .run(enabled ? 1 : 0, eventType)

  res.json({ success: true })
})

// POST /api/feishu/test — test feishu connection
router.post('/test', async (_req, res) => {
  const config = db.prepare('SELECT * FROM feishu_config WHERE id = ?').get('default') as
    { webhook_url: string; enabled: number } | undefined

  if (!config || !config.webhook_url) {
    res.json({ success: false, error: '未配置 Webhook URL' })
    return
  }

  const success = await sendFeishuNotification('AgentHub 测试消息：飞书连接正常', 'agent_online')
  res.json({ success })
})

// GET /api/feishu/logs — get push logs
router.get('/logs', (_req, res) => {
  const rows = db.prepare('SELECT * FROM push_logs ORDER BY created_at DESC LIMIT 50').all() as Record<string, unknown>[]
  const logs: PushLog[] = rows.map(r => ({
    id: r.id as string,
    event_type: r.event_type as string,
    message: r.message as string,
    status: r.status as 'success' | 'failed',
    created_at: r.created_at as string,
  }))

  res.json({ success: true, data: logs })
})

// DELETE /api/feishu/logs — clear push logs
router.delete('/logs', (_req, res) => {
  db.prepare('DELETE FROM push_logs').run()
  res.json({ success: true })
})

// POST /api/feishu/webhook — feishu bot callback entry point
router.post('/webhook', async (req, res) => {
  try {
    const result = await handleFeishuWebhook(req.body)
    if (result.success) {
      // For URL verification challenge, return the challenge
      if (result.message && !(req.body as { challenge?: string }).challenge) {
        res.json({ success: true })
      } else {
        res.json({ challenge: result.message })
      }
    } else {
      res.json({ success: false, error: result.message })
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : '未知错误' })
  }
})

export default router
