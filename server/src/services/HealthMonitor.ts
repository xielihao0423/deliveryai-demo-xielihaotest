import db, { decryptAuth } from '../db/database.js'
import type { Agent } from '../types/index.js'
import { getAdapterForAgent } from '../adapters/AgentAdapter.js'
import { sendFeishuNotification, isEventEnabled } from './FeishuService.js'

const CHECK_INTERVAL_MS = 30000 // 30s polling per spec recommendation
let monitorTimer: ReturnType<typeof setInterval> | null = null

function mapAgent(row: Record<string, unknown>): Agent {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as Agent['type'],
    endpoint: row.endpoint as string,
    auth_config: row.auth_config as string | null,
    note: row.note as string | null,
    status: row.status as Agent['status'],
    last_check_at: row.last_check_at as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export async function checkAgentHealth(agentId: string): Promise<Agent['status']> {
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as Record<string, unknown> | undefined
  if (!row) return 'offline'

  const agent = mapAgent(row)
  const adapter = getAdapterForAgent(agent)
  const auth = agent.auth_config ? decryptAuth(agent.auth_config) : undefined
  const newStatus = await adapter.healthCheck(agent.endpoint, auth)
  const now = new Date().toISOString()

  const oldStatus = agent.status
  db.prepare('UPDATE agents SET status = ?, last_check_at = ?, updated_at = ? WHERE id = ?')
    .run(newStatus, now, now, agentId)

  // Send feishu notification on status change
  if (oldStatus !== newStatus) {
    const eventType = newStatus === 'online' ? 'agent_online' : newStatus === 'offline' ? 'agent_offline' : 'agent_error'
    if (await isEventEnabled(eventType)) {
      await sendFeishuNotification(`Agent ${agent.name} 状态变更: ${oldStatus} → ${newStatus}`, eventType)
    }
  }

  return newStatus
}

export async function checkAllAgents(): Promise<void> {
  const agents = db.prepare('SELECT id FROM agents').all() as { id: string }[]
  for (const a of agents) {
    try {
      await checkAgentHealth(a.id)
    } catch (err) {
      console.error(`[HealthMonitor] Error checking agent ${a.id}:`, err)
    }
  }
}

export function startHealthMonitor(): void {
  if (monitorTimer) return
  // Initial check after 5s to let server start
  setTimeout(() => { checkAllAgents().catch(console.error) }, 5000)
  monitorTimer = setInterval(() => {
    checkAllAgents().catch(console.error)
  }, CHECK_INTERVAL_MS)
  console.log(`[HealthMonitor] Started, interval=${CHECK_INTERVAL_MS}ms`)
}

export function stopHealthMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer)
    monitorTimer = null
  }
}
