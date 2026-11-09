import db, { generateId } from '../db/database.js'
import { decryptAuth } from '../db/database.js'

export interface FeishuTextMessage {
  msg_type: 'text'
  content: { text: string }
}

export async function sendFeishuNotification(message: string, eventType: string): Promise<boolean> {
  const config = db.prepare('SELECT * FROM feishu_config WHERE id = ?').get('default') as
    { webhook_url: string; enabled: number; bot_app_secret: string } | undefined

  if (!config || !config.enabled || !config.webhook_url) {
    return false
  }

  const payload: FeishuTextMessage = {
    msg_type: 'text',
    content: { text: `[AgentHub] ${message}` },
  }

  try {
    const resp = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const now = new Date().toISOString()
    const success = resp.ok

    db.prepare(`INSERT INTO push_logs (id, event_type, message, status, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(generateId(), eventType, message, success ? 'success' : 'failed', now)

    return success
  } catch (err) {
    const now = new Date().toISOString()
    const errMsg = err instanceof Error ? err.message : '未知错误'
    db.prepare(`INSERT INTO push_logs (id, event_type, message, status, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(generateId(), eventType, `${message} (${errMsg})`, 'failed', now)
    return false
  }
}

export async function isEventEnabled(eventType: string): Promise<boolean> {
  const row = db.prepare('SELECT enabled FROM feishu_events WHERE event_type = ?').get(eventType) as { enabled: number } | undefined
  return row ? row.enabled === 1 : false
}

// ─── Feishu Bot Webhook Handler ───
// Receives feishu callback, routes message to target Agent, pushes reply back to feishu

export async function handleFeishuWebhook(body: unknown): Promise<{ success: boolean; message?: string }> {
  const data = body as {
    msg_type?: string
    event_type?: string
    event?: {
      message?: { content?: string; chat_id?: string }
      sender?: { sender_id?: { open_id?: string } }
    }
    challenge?: string
  }

  // Feishu URL verification challenge
  if (data.challenge) {
    return { success: true, message: data.challenge }
  }

  // Event verification
  if (data.event_type === 'url_verification') {
    return { success: true }
  }

  const content = data.event?.message?.content
  if (!content) {
    return { success: false, message: 'No message content' }
  }

  // Parse message: expected format @Bot /agent <agent_name> <message>
  // or plain text with default agent
  let parsedContent = content
  try {
    const parsed = JSON.parse(content)
    parsedContent = parsed.text || content
  } catch {
    // not JSON, use as-is
  }

  // Extract agent name from message
  const agentMatch = parsedContent.match(/\/agent\s+(\S+)\s+(.*)/s)
  let agentName: string
  let userMessage: string

  if (agentMatch) {
    agentName = agentMatch[1]
    userMessage = agentMatch[2].trim()
  } else {
    // Use first online agent as default
    const agents = db.prepare("SELECT name FROM agents WHERE status = 'online' LIMIT 1").all() as { name: string }[]
    if (agents.length === 0) {
      await sendFeishuNotification('没有可用的在线 Agent', 'agent_error')
      return { success: false, message: 'No online agent available' }
    }
    agentName = agents[0].name
    userMessage = parsedContent.replace(/@\S+/g, '').trim()
  }

  if (!userMessage) {
    return { success: false, message: 'Empty message' }
  }

  // Find agent
  const agent = db.prepare('SELECT * FROM agents WHERE name = ?').get(agentName) as Record<string, unknown> | undefined
  if (!agent) {
    await sendFeishuNotification(`Agent "${agentName}" 不存在`, 'agent_error')
    return { success: false, message: `Agent "${agentName}" not found` }
  }

  if (agent.status !== 'online') {
    await sendFeishuNotification(`Agent "${agentName}" 当前状态为 ${agent.status}，不可用`, 'agent_error')
    return { success: false, message: `Agent "${agentName}" is ${agent.status}` }
  }

  // Create or reuse feishu session for this agent
  const sessionId = await getOrCreateFeishuSession(agent.id as string)

  // Store user message
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO messages (id, session_id, role, content, streaming_completed, created_at) VALUES (?, ?, 'user', ?, 1, ?)`)
    .run(generateId(), sessionId, userMessage, now)
  db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(now, sessionId)

  // Route to agent adapter and collect response
  const { getAdapterForAgent } = await import('../adapters/AgentAdapter.js')
  const adapter = getAdapterForAgent({
    id: agent.id as string,
    name: agent.name as string,
    type: agent.type as 'codex_appserver' | 'trae_cli',
    endpoint: agent.endpoint as string,
    auth_config: agent.auth_config as string | null,
    note: agent.note as string | null,
    status: agent.status as 'online' | 'offline' | 'error',
    last_check_at: agent.last_check_at as string | null,
    created_at: agent.created_at as string,
    updated_at: agent.updated_at as string,
  })

  const auth = agent.auth_config ? decryptAuth(agent.auth_config as string) : undefined

  // Get message history for context
  const historyRows = db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as { role: string; content: string }[]
  const messages = historyRows.map(r => ({ role: r.role as 'user' | 'assistant', content: r.content }))

  let responseText = ''
  try {
    for await (const chunk of adapter.sendMessage(agent.endpoint as string, auth, messages)) {
      responseText += chunk
    }
  } catch (err) {
    responseText = `[Agent 回复失败: ${err instanceof Error ? err.message : '未知错误'}]`
  }

  // Store assistant response
  const respNow = new Date().toISOString()
  db.prepare(`INSERT INTO messages (id, session_id, role, content, streaming_completed, created_at) VALUES (?, ?, 'assistant', ?, 1, ?)`)
    .run(generateId(), sessionId, responseText, respNow)
  db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(respNow, sessionId)

  // Push reply back to feishu
  await sendFeishuNotification(`Agent ${agentName} 回复:\n${responseText.slice(0, 2000)}`, 'session_completed')

  return { success: true }
}

async function getOrCreateFeishuSession(agentId: string): Promise<string> {
  // Reuse most recent active feishu session for this agent, or create new
  const existing = db.prepare("SELECT id FROM sessions WHERE agent_id = ? AND source = 'feishu' AND status = 'active' ORDER BY last_active_at DESC LIMIT 1").get(agentId) as { id: string } | undefined
  if (existing) return existing.id

  const now = new Date().toISOString()
  const id = generateId()
  db.prepare(`INSERT INTO sessions (id, agent_id, source, status, title, created_at, last_active_at) VALUES (?, ?, 'feishu', 'active', ?, ?, ?)`)
    .run(id, agentId, '飞书对话', now, now)
  return id
}
