import type {
  Agent, AgentInput, Skill, Session, SessionDetail,
  FeishuConfig, FeishuEvent, PushLog, ApiResponse,
} from '../types'

const API_BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  const json = await resp.json() as ApiResponse<T>
  if (!json.success) {
    throw new Error(json.error || '请求失败')
  }
  return json.data as T
}

// ── Agent API ──

export const agentApi = {
  list: () => request<Agent[]>('/agents'),

  get: (id: string) => request<Agent>(`/agents/${id}`),

  create: (input: AgentInput) =>
    request<Agent>('/agents', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  update: (id: string, input: Partial<AgentInput>) =>
    request<Agent>(`/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  delete: (id: string) =>
    request<void>(`/agents/${id}`, { method: 'DELETE' }),

  getSkills: (id: string) => request<Skill[]>(`/agents/${id}/skills`),

  updateSkill: (agentId: string, skillId: string, data: { config?: string; enabled?: boolean }) =>
    request<Skill>(`/agents/${agentId}/skills/${skillId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  syncSkills: (id: string) =>
    request<{ synced: number }>(`/agents/${id}/skills/sync`, { method: 'POST' }),
}

// ── Session API ──

export const sessionApi = {
  list: (status?: 'active' | 'archived' | 'all') =>
    request<Session[]>(`/sessions${status ? `?status=${status}` : ''}`),

  get: (id: string) => request<SessionDetail>(`/sessions/${id}`),

  create: (agentId: string, title?: string) =>
    request<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId, source: 'web', title }),
    }),

  archive: (id: string) =>
    request<void>(`/sessions/${id}/archive`, { method: 'POST' }),

  restore: (id: string) =>
    request<void>(`/sessions/${id}/restore`, { method: 'POST' }),

  delete: (id: string) =>
    request<void>(`/sessions/${id}`, { method: 'DELETE' }),
}

// ── SSE Message Stream ──

export function streamMessage(
  sessionId: string,
  content: string,
  onChunk: (text: string) => void,
  onDone: (data: { messageId: string; content: string; interrupted: boolean }) => void,
  onError: (err: Error) => void,
): AbortController {
  const controller = new AbortController()

  fetch(`${API_BASE}/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
    signal: controller.signal,
  }).then(async (resp) => {
    if (!resp.ok || !resp.body) {
      const errData = await resp.json().catch(() => ({ error: '请求失败' }))
      onError(new Error(errData.error || `HTTP ${resp.status}`))
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
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'chunk') {
              onChunk(parsed.content)
            } else if (parsed.type === 'done') {
              onDone(parsed)
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onError(err instanceof Error ? err : new Error(String(err)))
    }
  })

  return controller
}

// ── Feishu API ──

export const feishuApi = {
  getConfig: () => request<{ config: FeishuConfig; events: FeishuEvent[] }>('/feishu/config'),

  updateConfig: (data: Partial<FeishuConfig>) =>
    request<void>('/feishu/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  toggleEvent: (eventType: string, enabled: boolean) =>
    request<void>(`/feishu/events/${eventType}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),

  test: () => request<{ success: boolean }>('/feishu/test', { method: 'POST' }),

  getLogs: () => request<PushLog[]>('/feishu/logs'),

  clearLogs: () => request<void>('/feishu/logs', { method: 'DELETE' }),
}
