import { Router } from 'express'
import db, { generateId, encryptAuth, decryptAuth } from '../db/database.js'
import type { Agent, AgentInput, AgentWithSkills, Skill } from '../types/index.js'
import { getAdapter, getAdapterForAgent } from '../adapters/AgentAdapter.js'
import { checkAgentHealth } from '../services/HealthMonitor.js'
import { sendFeishuNotification, isEventEnabled } from '../services/FeishuService.js'

const router = Router()

function mapAgentRow(row: Record<string, unknown>): Agent {
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

// GET /api/agents — list all agents with skill count
router.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT a.*, (SELECT COUNT(*) FROM skills s WHERE s.agent_id = a.id) as skill_count
    FROM agents a ORDER BY a.created_at DESC
  `).all() as (Record<string, unknown> & { skill_count: number })[]

  const agents: AgentWithSkills[] = rows.map(r => ({
    ...mapAgentRow(r),
    skill_count: r.skill_count,
  }))

  res.json({ success: true, data: agents })
})

// GET /api/agents/:id — agent detail
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT a.*, (SELECT COUNT(*) FROM skills s WHERE s.agent_id = a.id) as skill_count
    FROM agents a WHERE a.id = ?
  `).get(req.params.id) as (Record<string, unknown> & { skill_count: number }) | undefined

  if (!row) {
    res.status(404).json({ success: false, error: 'Agent 不存在' })
    return
  }

  const agent: AgentWithSkills = { ...mapAgentRow(row), skill_count: row.skill_count }
  res.json({ success: true, data: agent })
})

// POST /api/agents — register new agent with connection validation
router.post('/', async (req, res) => {
  const input = req.body as AgentInput
  if (!input.name || !input.type || !input.endpoint) {
    res.status(400).json({ success: false, error: '缺少必填字段: name, type, endpoint' })
    return
  }

  // Check name uniqueness
  const existing = db.prepare('SELECT id FROM agents WHERE name = ?').get(input.name) as { id: string } | undefined
  if (existing) {
    res.status(409).json({ success: false, error: `Agent 名称 "${input.name}" 已存在` })
    return
  }

  // Validate endpoint
  const adapter = getAdapter(input.type)
  const auth = input.auth_config || undefined
  const healthStatus = await adapter.healthCheck(input.endpoint, auth)

  // If connection fails, create with 'error' status but allow creation
  const now = new Date().toISOString()
  const id = generateId()
  const encryptedAuth = input.auth_config ? encryptAuth(input.auth_config) : null

  db.prepare(`INSERT INTO agents (id, name, type, endpoint, auth_config, note, status, last_check_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.name, input.type, input.endpoint, encryptedAuth, input.note || null,
      healthStatus, now, now, now)

  // Try to sync skills from agent
  if (healthStatus === 'online') {
    try {
      const skills = await adapter.getSkills(input.endpoint, auth)
      for (const skill of skills) {
        db.prepare(`INSERT INTO skills (id, agent_id, name, description, config, enabled, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(generateId(), id, skill.name, skill.description, skill.config, skill.enabled ? 1 : 0, now)
      }
    } catch {
      // Skill sync is non-blocking
    }
  }

  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Record<string, unknown>
  const agent = mapAgentRow(row)

  // Feishu notification on agent online
  if (healthStatus === 'online' && await isEventEnabled('agent_online')) {
    await sendFeishuNotification(`Agent "${input.name}" 已上线`, 'agent_online')
  }

  res.status(201).json({ success: true, data: agent })
})

// PUT /api/agents/:id — edit agent config
router.put('/:id', async (req, res) => {
  const existing = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!existing) {
    res.status(404).json({ success: false, error: 'Agent 不存在' })
    return
  }

  const input = req.body as Partial<AgentInput>
  const now = new Date().toISOString()

  // Check name uniqueness if changed
  if (input.name && input.name !== existing.name) {
    const nameConflict = db.prepare('SELECT id FROM agents WHERE name = ? AND id != ?').get(input.name, req.params.id) as { id: string } | undefined
    if (nameConflict) {
      res.status(409).json({ success: false, error: `Agent 名称 "${input.name}" 已存在` })
      return
    }
  }

  const name = input.name ?? existing.name
  const type = input.type ?? existing.type
  const endpoint = input.endpoint ?? existing.endpoint
  const note = input.note !== undefined ? input.note : existing.note
  const authConfig = input.auth_config !== undefined
    ? (input.auth_config ? encryptAuth(input.auth_config) : null)
    : existing.auth_config

  db.prepare(`UPDATE agents SET name = ?, type = ?, endpoint = ?, auth_config = ?, note = ?, updated_at = ? WHERE id = ?`)
    .run(name, type, endpoint, authConfig, note, now, req.params.id)

  // Re-check health after config change
  checkAgentHealth(req.params.id).catch(console.error)

  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as Record<string, unknown>
  res.json({ success: true, data: mapAgentRow(row) })
})

// DELETE /api/agents/:id — delete agent
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id) as { id: string } | undefined
  if (!existing) {
    res.status(404).json({ success: false, error: 'Agent 不存在' })
    return
  }

  db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id)
  // Sessions will have agent_id SET NULL due to foreign key constraint

  res.json({ success: true })
})

// GET /api/agents/:id/skills — get agent skills
router.get('/:id/skills', (req, res) => {
  const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get(req.params.id) as { id: string } | undefined
  if (!agent) {
    res.status(404).json({ success: false, error: 'Agent 不存在' })
    return
  }

  const rows = db.prepare('SELECT * FROM skills WHERE agent_id = ? ORDER BY name').all(req.params.id) as Record<string, unknown>[]
  const skills: Skill[] = rows.map(r => ({
    id: r.id as string,
    agent_id: r.agent_id as string,
    name: r.name as string,
    description: r.description as string,
    config: r.config as string,
    enabled: r.enabled as number === 1,
    synced_at: r.synced_at as string,
  }))

  res.json({ success: true, data: skills })
})

// PUT /api/agents/:id/skills/:skillId — update skill config / enabled
router.put('/:id/skills/:skillId', async (req, res) => {
  const skillRow = db.prepare('SELECT * FROM skills WHERE id = ? AND agent_id = ?').get(req.params.skillId, req.params.id) as Record<string, unknown> | undefined
  if (!skillRow) {
    res.status(404).json({ success: false, error: 'Skill 不存在' })
    return
  }

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!agent) {
    res.status(404).json({ success: false, error: 'Agent 不存在' })
    return
  }

  const { config, enabled } = req.body as { config?: string; enabled?: boolean }
  const now = new Date().toISOString()

  // Try to sync to agent
  try {
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
    await adapter.updateSkill(
      agent.endpoint as string,
      auth,
      skillRow.name as string,
      config ?? (skillRow.config as string),
      enabled ?? (skillRow.enabled as number) === 1,
    )
  } catch (err) {
    res.status(502).json({ success: false, error: `Skill 同步到 Agent 失败: ${err instanceof Error ? err.message : '未知错误'}` })
    return
  }

  // Update local db after successful sync
  const newConfig = config ?? skillRow.config
  const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : skillRow.enabled
  db.prepare('UPDATE skills SET config = ?, enabled = ?, synced_at = ? WHERE id = ?')
    .run(newConfig as string, newEnabled as number, now, req.params.skillId)

  const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(req.params.skillId) as Record<string, unknown>
  res.json({
    success: true,
    data: {
      id: row.id as string,
      agent_id: row.agent_id as string,
      name: row.name as string,
      description: row.description as string,
      config: row.config as string,
      enabled: (row.enabled as number) === 1,
      synced_at: row.synced_at as string,
    },
  })
})

// POST /api/agents/:id/skills/sync — sync skills from agent
router.post('/:id/skills/sync', async (req, res) => {
  const agentRow = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!agentRow) {
    res.status(404).json({ success: false, error: 'Agent 不存在' })
    return
  }

  const agent = mapAgentRow(agentRow)
  if (agent.status !== 'online') {
    res.status(400).json({ success: false, error: 'Agent 不在线，无法同步 Skill' })
    return
  }

  const adapter = getAdapterForAgent(agent)
  const auth = agent.auth_config ? decryptAuth(agent.auth_config) : undefined

  try {
    const remoteSkills = await adapter.getSkills(agent.endpoint, auth)
    const now = new Date().toISOString()

    // Get existing skills
    const existing = db.prepare('SELECT id, name FROM skills WHERE agent_id = ?').all(req.params.id) as { id: string; name: string }[]
    const existingMap = new Map(existing.map(s => [s.name, s.id]))

    for (const skill of remoteSkills) {
      const existingId = existingMap.get(skill.name)
      if (existingId) {
        // Update existing skill
        db.prepare('UPDATE skills SET description = ?, config = ?, synced_at = ? WHERE id = ?')
          .run(skill.description, skill.config, now, existingId)
        existingMap.delete(skill.name)
      } else {
        // Insert new skill
        db.prepare(`INSERT INTO skills (id, agent_id, name, description, config, enabled, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(generateId(), req.params.id, skill.name, skill.description, skill.config, skill.enabled ? 1 : 0, now)
      }
    }

    // Skills not in remote are kept (not deleted) as they might be locally managed

    res.json({ success: true, data: { synced: remoteSkills.length } })
  } catch (err) {
    res.status(502).json({ success: false, error: `Skill 同步失败: ${err instanceof Error ? err.message : '未知错误'}` })
  }
})

export default router
