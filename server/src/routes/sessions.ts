import { Router } from 'express'
import db, { generateId, decryptAuth } from '../db/database.js'
import type { Session, Message, SessionStatus } from '../types/index.js'
import { getAdapterForAgent } from '../adapters/AgentAdapter.js'
import { sendFeishuNotification, isEventEnabled } from '../services/FeishuService.js'

const router = Router()

function mapSessionRow(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    agent_id: row.agent_id as string,
    source: row.source as Session['source'],
    status: row.status as SessionStatus,
    title: row.title as string | null,
    created_at: row.created_at as string,
    last_active_at: row.last_active_at as string,
    archived_at: row.archived_at as string | null,
  }
}

// GET /api/sessions — list sessions
router.get('/', (req, res) => {
  const status = req.query.status as string | undefined
  const agentId = req.query.agent_id as string | undefined

  let query = `
    SELECT s.*, a.name as agent_name, a.status as agent_status,
      (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count
    FROM sessions s
    LEFT JOIN agents a ON s.agent_id = a.id
    WHERE 1=1
  `
  const params: string[] = []

  if (status === 'active' || status === 'archived') {
    query += ' AND s.status = ?'
    params.push(status)
  }
  if (agentId) {
    query += ' AND s.agent_id = ?'
    params.push(agentId)
  }
  query += ' ORDER BY s.last_active_at DESC'

  const rows = db.prepare(query).all(...params) as (Record<string, unknown> & { agent_name: string | null; agent_status: string | null; message_count: number })[]

  const sessions = rows.map(r => ({
    ...mapSessionRow(r),
    agent_name: r.agent_name,
    agent_status: r.agent_status,
    message_count: r.message_count,
  }))

  res.json({ success: true, data: sessions })
})

// GET /api/sessions/:id — session detail with messages
router.get('/:id', (req, res) => {
  const sessionRow = db.prepare(`
    SELECT s.*, a.name as agent_name, a.status as agent_status, a.type as agent_type
    FROM sessions s LEFT JOIN agents a ON s.agent_id = a.id
    WHERE s.id = ?
  `).get(req.params.id) as (Record<string, unknown> & { agent_name: string | null; agent_status: string | null; agent_type: string | null }) | undefined

  if (!sessionRow) {
    res.status(404).json({ success: false, error: 'Session 不存在' })
    return
  }

  const messages = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(req.params.id) as Record<string, unknown>[]
  const mappedMessages: Message[] = messages.map(r => ({
    id: r.id as string,
    session_id: r.session_id as string,
    role: r.role as Message['role'],
    content: r.content as string,
    streaming_completed: (r.streaming_completed as number) === 1,
    created_at: r.created_at as string,
  }))

  res.json({
    success: true,
    data: {
      ...mapSessionRow(sessionRow),
      agent_name: sessionRow.agent_name,
      agent_status: sessionRow.agent_status,
      agent_type: sessionRow.agent_type,
      messages: mappedMessages,
    },
  })
})

// POST /api/sessions — create new session
router.post('/', (req, res) => {
  const { agent_id, source, title } = req.body as { agent_id: string; source?: 'web' | 'feishu'; title?: string }

  const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(agent_id) as { id: string } | undefined
  if (!agent) {
    res.status(404).json({ success: false, error: 'Agent 不存在' })
    return
  }

  const now = new Date().toISOString()
  const id = generateId()
  db.prepare(`INSERT INTO sessions (id, agent_id, source, status, title, created_at, last_active_at) VALUES (?, ?, ?, 'active', ?, ?, ?)`)
    .run(id, agent_id, source || 'web', title || null, now, now)

  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown>
  res.status(201).json({ success: true, data: mapSessionRow(row) })
})

// POST /api/sessions/:id/messages — send message and stream response via SSE
router.post('/:id/messages', async (req, res) => {
  const sessionRow = db.prepare(`
    SELECT s.*, a.name as agent_name, a.status as agent_status, a.type as agent_type,
      a.endpoint, a.auth_config
    FROM sessions s LEFT JOIN agents a ON s.agent_id = a.id
    WHERE s.id = ?
  `).get(req.params.id) as (Record<string, unknown>) | undefined

  if (!sessionRow) {
    res.status(404).json({ success: false, error: 'Session 不存在' })
    return
  }

  if (sessionRow.status !== 'active') {
    res.status(400).json({ success: false, error: 'Session 已归档，无法发送消息' })
    return
  }

  if (!sessionRow.agent_id) {
    res.status(400).json({ success: false, error: 'Session 关联的 Agent 已被删除，不可用' })
    return
  }

  if (sessionRow.agent_status !== 'online') {
    res.status(400).json({ success: false, error: `Agent 当前状态为 ${sessionRow.agent_status}，不可用` })
    return
  }

  const { content } = req.body as { content: string }
  if (!content || !content.trim()) {
    res.status(400).json({ success: false, error: '消息内容不能为空' })
    return
  }

  // Store user message
  const now = new Date().toISOString()
  const userMsgId = generateId()
  db.prepare(`INSERT INTO messages (id, session_id, role, content, streaming_completed, created_at) VALUES (?, ?, 'user', ?, 1, ?)`)
    .run(userMsgId, req.params.id, content, now)
  db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(now, req.params.id)

  // Get message history for context
  const historyRows = db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(req.params.id) as { role: string; content: string }[]
  const messages = historyRows.map(r => ({ role: r.role as 'user' | 'assistant', content: r.content }))

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })

  const assistantMsgId = generateId()
  let assistantContent = ''
  let connectionInterrupted = false

  // Insert placeholder assistant message
  db.prepare(`INSERT INTO messages (id, session_id, role, content, streaming_completed, created_at) VALUES (?, ?, 'assistant', ?, 0, ?)`)
    .run(assistantMsgId, req.params.id, '', now)

  try {
    const agentObj: Parameters<typeof getAdapterForAgent>[0] = {
      id: sessionRow.agent_id as string,
      name: sessionRow.agent_name as string,
      type: sessionRow.agent_type as 'codex_appserver' | 'trae_cli',
      endpoint: sessionRow.endpoint as string,
      auth_config: sessionRow.auth_config as string | null,
      note: null,
      status: sessionRow.agent_status as 'online' | 'offline' | 'error',
      last_check_at: null,
      created_at: '',
      updated_at: '',
    }

    const adapter = getAdapterForAgent(agentObj)
    const auth = sessionRow.auth_config ? decryptAuth(sessionRow.auth_config as string) : undefined

    for await (const chunk of adapter.sendMessage(agentObj.endpoint, auth, messages)) {
      assistantContent += chunk
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
    }

    // Check for connection interruption in content
    if (assistantContent.includes('[连接中断')) {
      connectionInterrupted = true
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : '未知错误'
    assistantContent += `\n[连接中断: ${errMsg}]`
    connectionInterrupted = true
    res.write(`data: ${JSON.stringify({ type: 'chunk', content: `\n[连接中断: ${errMsg}]` })}\n\n`)
  }

  // Update assistant message content
  const completedAt = new Date().toISOString()
  db.prepare('UPDATE messages SET content = ?, streaming_completed = 1, created_at = ? WHERE id = ?')
    .run(assistantContent, completedAt, assistantMsgId)
  db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(completedAt, req.params.id)

  // Send completion event
  res.write(`data: ${JSON.stringify({
    type: 'done',
    message_id: assistantMsgId,
    content: assistantContent,
    interrupted: connectionInterrupted,
  })}\n\n`)
  res.end()

  // Feishu notification for session completion
  if (await isEventEnabled('session_completed')) {
    sendFeishuNotification(`对话 Session 已完成 (${sessionRow.agent_name})`, 'session_completed').catch(console.error)
  }
})

// POST /api/sessions/:id/archive — archive session
router.post('/:id/archive', (req, res) => {
  const session = db.prepare('SELECT id, status FROM sessions WHERE id = ?').get(req.params.id) as { id: string; status: string } | undefined
  if (!session) {
    res.status(404).json({ success: false, error: 'Session 不存在' })
    return
  }

  const now = new Date().toISOString()
  db.prepare('UPDATE sessions SET status = ?, archived_at = ? WHERE id = ?')
    .run('archived', now, req.params.id)

  res.json({ success: true })
})

// POST /api/sessions/:id/restore — restore archived session
router.post('/:id/restore', (req, res) => {
  const session = db.prepare('SELECT id, status FROM sessions WHERE id = ?').get(req.params.id) as { id: string; status: string } | undefined
  if (!session) {
    res.status(404).json({ success: false, error: 'Session 不存在' })
    return
  }

  db.prepare('UPDATE sessions SET status = ?, archived_at = NULL WHERE id = ?')
    .run('active', req.params.id)

  res.json({ success: true })
})

// DELETE /api/sessions/:id — delete session
router.delete('/:id', (req, res) => {
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(req.params.id) as { id: string } | undefined
  if (!session) {
    res.status(404).json({ success: false, error: 'Session 不存在' })
    return
  }

  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id)
  res.json({ success: true })
})

export default router
