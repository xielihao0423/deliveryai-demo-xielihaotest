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

// ─── ACP Protocol Constants ───
// ACP uses JSON-RPC 2.0 over HTTP with SSE for server→client streaming.

const ACP_HEADER_CONNECTION_ID = 'Acp-Connection-Id'
const ACP_HEADER_SESSION_ID = 'Acp-Session-Id'

let rpcIdCounter = 0
function nextRpcId(): number { return ++rpcIdCounter }

// ─── ACP Protocol Helpers ───

/** POST initialize to the ACP server; returns connection ID from response header. */
async function acpInitialize(
  serverUrl: string,
  authHeaders: Record<string, string>,
  timeoutMs = 5000,
): Promise<{ connectionId: string; protocolVersion: number }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: nextRpcId(),
        method: 'initialize',
        params: {
          protocolVersion: 1,
          clientCapabilities: {},
          clientInfo: { name: 'agenthub', title: 'AgentHub', version: '1.0.0' },
        },
      }),
      signal: controller.signal,
    })

    if (!resp.ok) throw new Error(`ACP initialize HTTP ${resp.status}`)

    const connectionId = resp.headers.get(ACP_HEADER_CONNECTION_ID)
    if (!connectionId) throw new Error('ACP initialize response missing Acp-Connection-Id header')

    const body = await resp.json() as { result?: { protocolVersion?: number } }
    const protocolVersion = body.result?.protocolVersion ?? 1

    return { connectionId, protocolVersion }
  } finally {
    clearTimeout(timeout)
  }
}

/** Open SSE GET stream for connection-level notifications; returns parsed JSON-RPC message generator. */
async function* openAcpSseStream(
  serverUrl: string,
  connectionId: string,
  sessionId: string | undefined,
  authHeaders: Record<string, string>,
  signal: AbortSignal,
): AsyncGenerator<Record<string, unknown>, void, unknown> {
  const headers: Record<string, string> = {
    'Accept': 'text/event-stream',
    [ACP_HEADER_CONNECTION_ID]: connectionId,
    ...authHeaders,
  }
  if (sessionId) headers[ACP_HEADER_SESSION_ID] = sessionId

  const resp = await fetch(serverUrl, {
    method: 'GET',
    headers,
    signal,
  })

  if (!resp.ok || !resp.body) throw new Error(`ACP SSE GET failed: ${resp.status}`)

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Parse SSE events (separated by \n\n)
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''

    for (const event of events) {
      // Extract data: lines
      const dataLines = event.split('\n')
        .filter(l => l.startsWith('data: '))
        .map(l => l.slice(6))
      const dataStr = dataLines.join('\n')
      if (!dataStr) continue

      try {
        const parsed = JSON.parse(dataStr) as Record<string, unknown>
        yield parsed
      } catch {
        // Non-JSON SSE data, skip
      }
    }
  }
}

/** POST a JSON-RPC message to the ACP server (body response is ignored for non-initialize). */
async function acpPost(
  serverUrl: string,
  connectionId: string,
  sessionId: string | undefined,
  method: string,
  params: Record<string, unknown>,
  authHeaders: Record<string, string>,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [ACP_HEADER_CONNECTION_ID]: connectionId,
    ...authHeaders,
  }
  if (sessionId) headers[ACP_HEADER_SESSION_ID] = sessionId

  const resp = await fetch(serverUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: nextRpcId(),
      method,
      params,
    }),
    signal,
  })

  if (!resp.ok) throw new Error(`ACP POST ${method} failed: HTTP ${resp.status}`)

  // Response body for non-initialize is ignored; actual response comes via SSE
  resp.body?.cancel().catch(() => {})
}

/** Delete ACP connection (cleanup). */
async function acpDeleteConnection(
  serverUrl: string,
  connectionId: string,
  authHeaders: Record<string, string>,
): Promise<void> {
  try {
    await fetch(serverUrl, {
      method: 'DELETE',
      headers: {
        [ACP_HEADER_CONNECTION_ID]: connectionId,
        ...authHeaders,
      },
    })
  } catch {
    // Best-effort cleanup
  }
}


// ─── Codex AppServer Adapter ───
// Uses simple REST endpoints: GET /health, POST /chat (SSE), GET /skills, PUT /skills/:name

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

// ─── Trae CLI (traex acp serve) Adapter ───
// Implements ACP (Agent Client Protocol) v1 over Streamable HTTP.
// Protocol: JSON-RPC 2.0 with SSE for server→client streaming.
//
// Connection flow:
//   1. POST initialize → response includes Acp-Connection-Id header
//   2. GET SSE stream with connection ID → receives all subsequent responses/notifications
//   3. POST session/new → response arrives via SSE (contains sessionId)
//   4. POST session/prompt → streaming text arrives via SSE as session/update notifications
//
// Endpoint: the base URL where `traex acp serve` is listening.
//   Example: http://localhost:8080/acp (or whatever path/port traex uses)

class TraeCliAdapter implements AgentAdapter {
  type: AgentType = 'trae_cli'

  async healthCheck(endpoint: string, auth?: string): Promise<'online' | 'offline' | 'error'> {
    const authHeaders: Record<string, string> = {}
    if (auth) authHeaders['Authorization'] = `Bearer ${auth}`

    try {
      // ACP health check = POST initialize and check for connection ID
      const { connectionId } = await acpInitialize(endpoint, authHeaders, 5000)
      // Clean up the connection
      await acpDeleteConnection(endpoint, connectionId, authHeaders)
      return 'online'
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // If we got a connection ID but failed on cleanup, still online
      if (msg.includes('ACP DELETE')) return 'online'
      // Connection refused / timeout = offline; HTTP error = error
      if (msg.includes('fetch') || msg.includes('abort') || msg.includes('ECONNREFUSED')) return 'offline'
      return 'error'
    }
  }

  async *sendMessage(
    endpoint: string,
    auth: string | undefined,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): AsyncGenerator<string, void, unknown> {
    const authHeaders: Record<string, string> = {}
    if (auth) authHeaders['Authorization'] = `Bearer ${auth}`

    let connectionId: string | null = null
    const controller = new AbortController()

    try {
      // 1. Initialize ACP connection
      const initResult = await acpInitialize(endpoint, authHeaders, 10000)
      connectionId = initResult.connectionId

      // 2. Open SSE stream for connection-level messages (responses + notifications)
      const sseStream = openAcpSseStream(endpoint, connectionId, undefined, authHeaders, controller.signal)

      // 3. Create a new session
      //    The session/new response arrives via the SSE stream
      acpPost(endpoint, connectionId, undefined, 'session/new', {
        cwd: process.cwd(),
        mcpServers: [],
      }, authHeaders, controller.signal).catch(() => {})

      // Read SSE stream to find session/new response and then session/prompt response
      let sessionId: string | null = null

      for await (const message of sseStream) {
        const result = message.result as Record<string, unknown> | undefined

        // Check if this is the session/new response (has sessionId in result)
        if (!sessionId && result && result.sessionId) {
          sessionId = result.sessionId as string

          // 4. Now POST session/prompt with the last user message
          //    Build the prompt from message history
          const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
          if (!lastUserMsg) {
            yield '[没有用户消息可发送]'
            break
          }

          // Open session-scoped SSE stream
          const sessionSse = openAcpSseStream(endpoint, connectionId, sessionId, authHeaders, controller.signal)

          // POST session/prompt
          acpPost(endpoint, connectionId, sessionId, 'session/prompt', {
            sessionId,
            prompt: [{ type: 'text', text: lastUserMsg.content }],
          }, authHeaders, controller.signal).catch(() => {})

          // Read session SSE for streaming chunks and prompt response
          for await (const sessionMsg of sessionSse) {
            const sMethod = sessionMsg.method as string | undefined
            const sParams = sessionMsg.params as Record<string, unknown> | undefined
            const sResult = sessionMsg.result as Record<string, unknown> | undefined

            // session/update notification → extract agent_message_chunk
            if (sMethod === 'session/update' && sParams) {
              const update = sParams.update as Record<string, unknown> | undefined
              if (update) {
                const sessionUpdate = update.sessionUpdate as string | undefined
                const content = update.content as Record<string, unknown> | undefined

                if (sessionUpdate === 'agent_message_chunk' && content) {
                  const contentType = content.type as string
                  if (contentType === 'text') {
                    const text = content.text as string
                    if (text) yield text
                  }
                }
              }
            }

            // Check for prompt response (has stopReason in result)
            if (sResult && sResult.stopReason) {
              // Prompt complete
              break
            }
          }
          break
        }
      }
    } catch (err) {
      yield `\n[连接中断: ${err instanceof Error ? err.message : '未知错误'}]`
    } finally {
      // Cleanup: abort SSE reader and delete connection
      controller.abort()
      if (connectionId) {
        await acpDeleteConnection(endpoint, connectionId, authHeaders)
      }
    }
  }

  async getSkills(): Promise<Omit<Skill, 'id' | 'agent_id' | 'synced_at'>[]> {
    // ACP does not have a skills management concept.
    // Skill management is not supported via ACP; return empty list.
    // The platform UI will show "暂无 Skill" for Trae CLI agents.
    return []
  }

  async updateSkill(
    _endpoint: string,
    _auth: string | undefined,
    _skillName: string,
    _config: string,
    _enabled: boolean,
  ): Promise<void> {
    void _endpoint; void _auth; void _skillName; void _config; void _enabled
    // ACP does not support skill management operations.
    throw new Error('Trae CLI (ACP) 不支持 Skill 管理，ACP 协议无 Skill 操作接口')
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
