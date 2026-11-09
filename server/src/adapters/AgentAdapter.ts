import type { Agent, Skill, AgentType } from '../types/index.js'

// ─── Agent Adapter Interface ───
// Each Agent type implements this interface. New Agent types only need to add an adapter here.

export interface AgentAdapter {
  type: AgentType

  // Health check — returns 'online' | 'offline' | 'error'
  healthCheck(endpoint: string, auth?: string): Promise<'online' | 'offline' | 'error'>

  // Send message and return async generator yielding text chunks (SSE streaming)
  sendMessage(
    endpoint: string,
    auth: string | undefined,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): AsyncGenerator<string, void, unknown>

  // Get skills from agent
  getSkills(endpoint: string, auth?: string): Promise<Omit<Skill, 'id' | 'agent_id' | 'synced_at'>[]>

  // Update skill config / enabled status
  updateSkill(
    endpoint: string,
    auth: string | undefined,
    skillName: string,
    config: string,
    enabled: boolean,
  ): Promise<void>
}

// ─── Codex AppServer Adapter ───

class CodexAppServerAdapter implements AgentAdapter {
  type: AgentType = 'codex_appserver'

  async healthCheck(endpoint: string, auth?: string): Promise<'online' | 'offline' | 'error'> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const headers: Record<string, string> = {}
      if (auth) headers['Authorization'] = `Bearer ${auth}`
      const resp = await fetch(`${endpoint.replace(/\/$/, '')}/health`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (resp.ok) return 'online'
      if (resp.status >= 500) return 'error'
      return 'error'
    } catch {
      return 'offline'
    }
  }

  async *sendMessage(
    endpoint: string,
    auth: string | undefined,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): AsyncGenerator<string, void, unknown> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (auth) headers['Authorization'] = `Bearer ${auth}`
      const resp = await fetch(`${endpoint.replace(/\/$/, '')}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages, stream: true }),
      })

      if (!resp.ok || !resp.body) {
        yield `[Agent 返回错误: ${resp.status} ${resp.statusText}]`
        return
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Parse SSE-style data lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6)
            if (data === '[DONE]') return
            try {
              const parsed = JSON.parse(data)
              if (parsed.content) yield parsed.content as string
              if (parsed.delta) yield parsed.delta as string
            } catch {
              // If not JSON, yield as plain text
              if (data) yield data
            }
          } else if (trimmed && !trimmed.startsWith(':')) {
            yield trimmed + '\n'
          }
        }
      }
    } catch (err) {
      yield `\n[连接中断: ${err instanceof Error ? err.message : '未知错误'}]`
    }
  }

  async getSkills(endpoint: string, auth?: string): Promise<Omit<Skill, 'id' | 'agent_id' | 'synced_at'>[]> {
    try {
      const headers: Record<string, string> = {}
      if (auth) headers['Authorization'] = `Bearer ${auth}`
      const resp = await fetch(`${endpoint.replace(/\/$/, '')}/skills`, { headers })
      if (!resp.ok) return []
      const data = await resp.json() as Array<{ name: string; description?: string; config?: string; enabled?: boolean }>
      return data.map(s => ({
        name: s.name,
        description: s.description || '',
        config: s.config || '{}',
        enabled: s.enabled !== false,
      }))
    } catch {
      return []
    }
  }

  async updateSkill(
    endpoint: string,
    auth: string | undefined,
    skillName: string,
    config: string,
    enabled: boolean,
  ): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (auth) headers['Authorization'] = `Bearer ${auth}`
    const resp = await fetch(`${endpoint.replace(/\/$/, '')}/skills/${encodeURIComponent(skillName)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ config, enabled }),
    })
    if (!resp.ok) {
      throw new Error(`Skill 更新失败: ${resp.status}`)
    }
  }
}

// ─── Trae CLI Adapter ───
// Trae CLI uses child process interaction

class TraeCliAdapter implements AgentAdapter {
  type: AgentType = 'trae_cli'

  async healthCheck(endpoint: string): Promise<'online' | 'offline' | 'error'> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const resp = await fetch(`${endpoint.replace(/\/$/, '')}/health`, {
        method: 'GET',
        signal: controller.signal,
      })
      clearTimeout(timeout)
      return resp.ok ? 'online' : 'error'
    } catch {
      return 'offline'
    }
  }

  async *sendMessage(
    endpoint: string,
    auth: string | undefined,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): AsyncGenerator<string, void, unknown> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (auth) headers['Authorization'] = `Bearer ${auth}`
      const resp = await fetch(`${endpoint.replace(/\/$/, '')}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages, stream: true }),
      })

      if (!resp.ok || !resp.body) {
        yield `[Agent 返回错误: ${resp.status} ${resp.statusText}]`
        return
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6)
            if (data === '[DONE]') return
            try {
              const parsed = JSON.parse(data)
              if (parsed.content) yield parsed.content as string
              if (parsed.delta) yield parsed.delta as string
            } catch {
              if (data) yield data
            }
          } else if (trimmed && !trimmed.startsWith(':')) {
            yield trimmed + '\n'
          }
        }
      }
    } catch (err) {
      yield `\n[连接中断: ${err instanceof Error ? err.message : '未知错误'}]`
    }
  }

  async getSkills(endpoint: string, auth?: string): Promise<Omit<Skill, 'id' | 'agent_id' | 'synced_at'>[]> {
    try {
      const headers: Record<string, string> = {}
      if (auth) headers['Authorization'] = `Bearer ${auth}`
      const resp = await fetch(`${endpoint.replace(/\/$/, '')}/skills`, { headers })
      if (!resp.ok) return []
      const data = await resp.json() as Array<{ name: string; description?: string; config?: string; enabled?: boolean }>
      return data.map(s => ({
        name: s.name,
        description: s.description || '',
        config: s.config || '{}',
        enabled: s.enabled !== false,
      }))
    } catch {
      return []
    }
  }

  async updateSkill(
    endpoint: string,
    auth: string | undefined,
    skillName: string,
    config: string,
    enabled: boolean,
  ): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (auth) headers['Authorization'] = `Bearer ${auth}`
    const resp = await fetch(`${endpoint.replace(/\/$/, '')}/skills/${encodeURIComponent(skillName)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ config, enabled }),
    })
    if (!resp.ok) {
      throw new Error(`Skill 更新失败: ${resp.status}`)
    }
  }
}

// ─── Adapter Registry ───

const adapters: Record<AgentType, AgentAdapter> = {
  codex_appserver: new CodexAppServerAdapter(),
  trae_cli: new TraeCliAdapter(),
}

export function getAdapter(type: AgentType): AgentAdapter {
  return adapters[type]
}

export function getAdapterForAgent(agent: Agent): AgentAdapter {
  return adapters[agent.type]
}
