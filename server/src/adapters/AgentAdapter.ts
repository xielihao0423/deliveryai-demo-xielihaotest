import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { Agent, Skill, AgentType } from '../types/index.js'

// ─── Agent Adapter Interface ───

export interface AgentAdapter {
  type: AgentType
  healthCheck(endpoint: string, auth?: string): Promise<'online' | 'offline' | 'error'>
  sendMessage(
    endpoint: string,
    auth: string | undefined,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): AsyncGenerator<string, void, unknown>
  getSkills(endpoint: string, auth?: string): Promise<Omit<Skill, 'id' | 'agent_id' | 'synced_at'>[]>
  updateSkill(
    endpoint: string,
    auth: string | undefined,
    skillName: string,
    config: string,
    enabled: boolean,
  ): Promise<void>
}

// ─── Transport detection ───
// endpoint 以 http:// 或 https:// 开头 → HTTP mode
// 否则视为 stdio 命令路径（如 "traex" 或 "/usr/local/bin/traex"）

function isHttpEndpoint(endpoint: string): boolean {
  return endpoint.startsWith('http://') || endpoint.startsWith('https://')
}

// ─── JSON-RPC helpers ───

let rpcIdCounter = 0
function nextRpcId(): number { return ++rpcIdCounter }

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id?: number
  result?: Record<string, unknown>
  error?: { code: number; message: string; data?: unknown }
}

interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params: Record<string, unknown>
}

type JsonRpcMessage = JsonRpcResponse | JsonRpcNotification

// Safe property access for union types
function msgResult(msg: JsonRpcMessage): Record<string, unknown> | undefined {
  return 'result' in msg ? msg.result : undefined
}
function msgMethod(msg: JsonRpcMessage): string | undefined {
  return 'method' in msg ? msg.method : undefined
}
function msgParams(msg: JsonRpcMessage): Record<string, unknown> | undefined {
  return 'params' in msg ? msg.params : undefined
}


function makeRequest(method: string, params: Record<string, unknown>): JsonRpcRequest {
  return { jsonrpc: '2.0', id: nextRpcId(), method, params }
}

// ═══════════════════════════════════════════════════════════
// ACP over stdio (NDJSON — newline-delimited JSON)
// ═══════════════════════════════════════════════════════════

/** Parse endpoint as a command + args. Supports "traex" or "traex acp serve" style. */
function parseCommand(endpoint: string): { command: string; args: string[] } {
  const parts = endpoint.trim().split(/\s+/)
  const command = parts[0]
  // If only the binary is given (e.g. "traex"), default to "acp serve"
  const args = parts.length > 1 ? parts.slice(1) : ['acp', 'serve']
  return { command, args }
}

/** Spawn traex process and run a full ACP session (initialize → session/new → session/prompt → stream). */
async function* acpStdioSession(
  endpoint: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  auth?: string,
): AsyncGenerator<string, void, unknown> {
  const { command, args } = parseCommand(endpoint)
  const env: Record<string, string> = { ...process.env as Record<string, string> }
  if (auth) env.AGENTNATIVE_ACP_AUTH_TOKEN = auth

  let child: ChildProcessWithoutNullStreams
  try {
    child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (err) {
    yield `\n[无法启动进程: ${err instanceof Error ? err.message : String(err)}]`
    return
  }

  // Wait for process to actually spawn
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve)
    child.once('error', reject)
    setTimeout(() => resolve(), 3000) // timeout fallback
  })

  if (typeof child.pid !== 'number') {
    yield '\n[进程启动失败]'
    child.kill()
    return
  }

  // NDJSON line buffer for stdout
  let stdoutBuffer = ''
  let stderrText = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => { stderrText += chunk })

  // Read one JSON-RPC message from stdout (blocking via promise)
  function readMessage(timeoutMs = 30000): Promise<JsonRpcMessage | null> {
    return new Promise((resolve) => {
      let settled = false

      const timer = setTimeout(() => {
        if (!settled) { settled = true; child.stdout.removeListener('data', onData); resolve(null) }
      }, timeoutMs)

      function onData(chunk: Buffer) {
        stdoutBuffer += chunk.toString('utf8')
        while (true) {
          const nlIdx = stdoutBuffer.indexOf('\n')
          if (nlIdx === -1) break
          const line = stdoutBuffer.slice(0, nlIdx).trim()
          stdoutBuffer = stdoutBuffer.slice(nlIdx + 1)
          if (!line) continue
          try {
            const msg = JSON.parse(line) as JsonRpcMessage
            if (!settled) {
              settled = true
              clearTimeout(timer)
              child.stdout.removeListener('data', onData)
              resolve(msg)
              // Re-attach for subsequent reads if there's remaining data
              if (stdoutBuffer) {
                // Put remaining data back — it will be picked up by next readMessage
              }
              return
            }
          } catch {
            // Not valid JSON, skip
          }
        }
      }

      // If there's already buffered data, process it
      if (stdoutBuffer) {
        onData(Buffer.alloc(0))
        if (!settled) {
          // No complete line yet, listen for more
          child.stdout.on('data', onData)
        }
      } else {
        child.stdout.on('data', onData)
      }
    })
  }

  // Write a JSON-RPC message to stdin (NDJSON)
  function writeMessage(msg: JsonRpcRequest): void {
    child.stdin.write(JSON.stringify(msg) + '\n')
  }

  // Notification handler for session/update messages
  let pendingNotifications: JsonRpcNotification[] = []
  let notificationResolver: ((msg: JsonRpcNotification | null) => void) | null = null

  function onStdoutData(chunk: Buffer) {
    stdoutBuffer += chunk.toString('utf8')
    while (true) {
      const nlIdx = stdoutBuffer.indexOf('\n')
      if (nlIdx === -1) break
      const line = stdoutBuffer.slice(0, nlIdx).trim()
      stdoutBuffer = stdoutBuffer.slice(nlIdx + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line) as JsonRpcMessage
        if ('method' in msg && !('id' in msg)) {
          // It's a notification
          if (notificationResolver) {
            notificationResolver(msg as JsonRpcNotification)
            notificationResolver = null
          } else {
            pendingNotifications.push(msg as JsonRpcNotification)
          }
        }
      } catch {
        // skip
      }
    }
  }

  function readNotification(timeoutMs = 30000): Promise<JsonRpcNotification | null> {
    if (pendingNotifications.length > 0) {
      return Promise.resolve(pendingNotifications.shift()!)
    }
    return new Promise((resolve) => {
      notificationResolver = resolve
      setTimeout(() => {
        if (notificationResolver === resolve) {
          notificationResolver = null
          resolve(null)
        }
      }, timeoutMs)
    })
  }

  try {
    // Attach persistent data listener for notifications
    child.stdout.on('data', onStdoutData)

    // 1. initialize
    writeMessage(makeRequest('initialize', {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: 'agenthub', title: 'AgentHub', version: '1.0.0' },
    }))
    const initResp = await readMessage(10000)
    if (!initResp || !msgResult(initResp)) {
      yield '\n[ACP initialize 失败]'
      child.kill()
      return
    }

    // 2. session/new
    writeMessage(makeRequest('session/new', {
      cwd: process.cwd(),
      mcpServers: [],
    }))
    const sessionResp = await readMessage(10000)
    if (!sessionResp || !msgResult(sessionResp)?.sessionId) {
      yield '\n[ACP session/new 失败]'
      child.kill()
      return
    }
    const sessionId = msgResult(sessionResp)!.sessionId as string

    // 3. session/prompt with last user message
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUserMsg) {
      yield '[没有用户消息可发送]'
      child.kill()
      return
    }

    writeMessage(makeRequest('session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text: lastUserMsg.content }],
    }))

    // 4. Read notifications — yield agent_message_chunk text until prompt response
    //    The prompt response (with stopReason) comes as a JSON-RPC response (has id).
    //    Streaming chunks come as session/update notifications (no id).
    let promptDone = false
    while (!promptDone) {
      // Check for response (non-notification message with matching id or stopReason)
      const respPromise = readMessage(60000)
      const notifPromise = readNotification(100)

      // Race: notification arrives first (streaming chunk), or response (prompt done)
      const result = await Promise.race([
        respPromise.then(r => ({ type: 'response' as const, msg: r })),
        notifPromise.then(n => ({ type: 'notification' as const, msg: n })),
      ])

      if (result.type === 'notification' && result.msg) {
        // Process session/update notification
        const notif = result.msg
        if (notif.method === 'session/update') {
          const update = notif.params?.update as Record<string, unknown> | undefined
          if (update) {
            const sessionUpdate = update.sessionUpdate as string
            const content = update.content as Record<string, unknown>
            if (sessionUpdate === 'agent_message_chunk' && content?.type === 'text') {
              yield content.text as string
            }
          }
        }
        // Cancel the pending response read since we consumed a notification
        // (the response will come later)
      } else if (result.type === 'response') {
        if (msgResult(result.msg as JsonRpcMessage)?.stopReason) {
          promptDone = true
        }
      }
    }
  } catch (err) {
    yield `\n[连接中断: ${err instanceof Error ? err.message : '未知错误'}]`
    if (stderrText) {
      yield `\n[stderr: ${stderrText.slice(-500)}]`
    }
  } finally {
    child.stdout.removeListener('data', onStdoutData)
    try { child.stdin.end() } catch {}
    child.kill()
  }
}

/** Quick stdio health check: spawn, initialize, kill. */
async function acpStdioHealthCheck(endpoint: string, auth?: string): Promise<'online' | 'offline' | 'error'> {
  const { command, args } = parseCommand(endpoint)
  const env: Record<string, string> = { ...process.env as Record<string, string> }
  if (auth) env.AGENTNATIVE_ACP_AUTH_TOKEN = auth

  return new Promise((resolve) => {
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(command, args, {
        cwd: process.cwd(),
        env,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch {
      resolve('offline')
      return
    }

    let stdoutBuffer = ''
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) { settled = true; child.kill(); resolve('offline') }
    }, 8000)

    child.once('error', () => {
      if (!settled) { settled = true; clearTimeout(timer); resolve('offline') }
    })

    child.stdout.on('data', (chunk: Buffer) => {
      if (settled) return
      stdoutBuffer += chunk.toString('utf8')
      const nlIdx = stdoutBuffer.indexOf('\n')
      if (nlIdx !== -1) {
        const line = stdoutBuffer.slice(0, nlIdx).trim()
        try {
          const msg = JSON.parse(line)
          if (msgResult(msg) && msgResult(msg)!.protocolVersion !== undefined) {
            settled = true
            clearTimeout(timer)
            child.stdin.end()
            child.kill()
            resolve('online')
          }
        } catch {
          // not JSON yet
        }
      }
    })

    // Send initialize
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: nextRpcId(),
      method: 'initialize',
      params: {
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: 'agenthub', version: '1.0.0' },
      },
    }) + '\n')
  })
}

// ═══════════════════════════════════════════════════════════
// ACP over HTTP (Streamable HTTP + SSE)
// ═══════════════════════════════════════════════════════════

const ACP_HEADER_CONNECTION_ID = 'Acp-Connection-Id'
const ACP_HEADER_SESSION_ID = 'Acp-Session-Id'

async function acpHttpInitialize(
  serverUrl: string,
  authHeaders: Record<string, string>,
  timeoutMs = 5000,
): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(makeRequest('initialize', {
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: 'agenthub', title: 'AgentHub', version: '1.0.0' },
      })),
      signal: controller.signal,
    })
    if (!resp.ok) throw new Error(`ACP initialize HTTP ${resp.status}`)
    const connectionId = resp.headers.get(ACP_HEADER_CONNECTION_ID)
    if (!connectionId) throw new Error('ACP initialize response missing Acp-Connection-Id header')
    return connectionId
  } finally {
    clearTimeout(timeout)
  }
}

async function* acpHttpSseStream(
  serverUrl: string,
  connectionId: string,
  sessionId: string | undefined,
  authHeaders: Record<string, string>,
  signal: AbortSignal,
): AsyncGenerator<JsonRpcMessage, void, unknown> {
  const headers: Record<string, string> = {
    'Accept': 'text/event-stream',
    [ACP_HEADER_CONNECTION_ID]: connectionId,
    ...authHeaders,
  }
  if (sessionId) headers[ACP_HEADER_SESSION_ID] = sessionId

  const resp = await fetch(serverUrl, { method: 'GET', headers, signal })
  if (!resp.ok || !resp.body) throw new Error(`ACP SSE GET failed: ${resp.status}`)

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''
    for (const event of events) {
      const dataLines = event.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6))
      const dataStr = dataLines.join('\n')
      if (!dataStr) continue
      try { yield JSON.parse(dataStr) as JsonRpcMessage } catch { /* skip */ }
    }
  }
}

async function acpHttpPost(
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
    body: JSON.stringify(makeRequest(method, params)),
    signal,
  })
  if (!resp.ok) throw new Error(`ACP POST ${method} failed: HTTP ${resp.status}`)
  resp.body?.cancel().catch(() => {})
}

async function acpHttpDelete(
  serverUrl: string,
  connectionId: string,
  authHeaders: Record<string, string>,
): Promise<void> {
  try {
    await fetch(serverUrl, {
      method: 'DELETE',
      headers: { [ACP_HEADER_CONNECTION_ID]: connectionId, ...authHeaders },
    })
  } catch { /* best-effort */ }
}

/** HTTP ACP session: initialize → SSE → session/new → session/prompt → stream chunks */
async function* acpHttpSession(
  endpoint: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  auth?: string,
): AsyncGenerator<string, void, unknown> {
  const authHeaders: Record<string, string> = {}
  if (auth) authHeaders['Authorization'] = `Bearer ${auth}`

  let connectionId: string | null = null
  const controller = new AbortController()

  try {
    connectionId = await acpHttpInitialize(endpoint, authHeaders, 10000)
    const sseStream = acpHttpSseStream(endpoint, connectionId, undefined, authHeaders, controller.signal)

    // POST session/new (response comes via SSE)
    acpHttpPost(endpoint, connectionId, undefined, 'session/new', {
      cwd: process.cwd(), mcpServers: [],
    }, authHeaders, controller.signal).catch(() => {})

    let sessionId: string | null = null

    for await (const message of sseStream) {
      if (!sessionId && msgResult(message)?.sessionId) {
        sessionId = msgResult(message)!.sessionId as string
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
        if (!lastUserMsg) { yield '[没有用户消息可发送]'; break }

        const sessionSse = acpHttpSseStream(endpoint, connectionId, sessionId, authHeaders, controller.signal)
        acpHttpPost(endpoint, connectionId, sessionId, 'session/prompt', {
          sessionId,
          prompt: [{ type: 'text', text: lastUserMsg.content }],
        }, authHeaders, controller.signal).catch(() => {})

        for await (const sessionMsg of sessionSse) {
          if (msgMethod(sessionMsg) === 'session/update' && msgParams(sessionMsg)) {
            const update = msgParams(sessionMsg)!.update as Record<string, unknown> | undefined
            if (update?.sessionUpdate === 'agent_message_chunk') {
              const content = update.content as Record<string, unknown>
              if (content?.type === 'text') yield content.text as string
            }
          }
          if (msgResult(message)?.stopReason) break
        }
        break
      }
    }
  } catch (err) {
    yield `\n[连接中断: ${err instanceof Error ? err.message : '未知错误'}]`
  } finally {
    controller.abort()
    if (connectionId) await acpHttpDelete(endpoint, connectionId, authHeaders)
  }
}

// ═══════════════════════════════════════════════════════════
// Codex AppServer Adapter — simple REST endpoints
// ═══════════════════════════════════════════════════════════

class CodexAppServerAdapter implements AgentAdapter {
  type: AgentType = 'codex_appserver'

  async healthCheck(endpoint: string, auth?: string): Promise<'online' | 'offline' | 'error'> {
    // Support both HTTP REST and stdio (codex-acp binary)
    if (isHttpEndpoint(endpoint)) {
      try {
        const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const headers: Record<string, string> = {}
      if (auth) headers['Authorization'] = `Bearer ${auth}`
      try {
        const resp = await fetch(`${endpoint.replace(/\/$/, '')}/health`, {
          method: 'GET', headers, signal: controller.signal,
        })
        clearTimeout(timeout)
        return resp.ok ? 'online' : 'error'
      } catch {
        clearTimeout(timeout)
        return 'offline'
      }
      } catch { return 'offline' }
    }
    // stdio mode
    return acpStdioHealthCheck(endpoint, auth)
  }

  async *sendMessage(
    endpoint: string,
    auth: string | undefined,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): AsyncGenerator<string, void, unknown> {
    if (isHttpEndpoint(endpoint)) {
      // HTTP REST mode: POST /chat with SSE response
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (auth) headers['Authorization'] = `Bearer ${auth}`
        const resp = await fetch(`${endpoint.replace(/\/$/, '')}/chat`, {
          method: 'POST', headers,
          body: JSON.stringify({ messages, stream: true }),
        })
        if (!resp.ok || !resp.body) { yield `[Agent 返回错误: ${resp.status}]`; return }
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
              } catch { if (data) yield data }
            }
          }
        }
      } catch (err) {
        yield `\n[连接中断: ${err instanceof Error ? err.message : '未知错误'}]`
      }
    } else {
      // stdio ACP mode (codex-acp binary)
      yield* acpStdioSession(endpoint, messages, auth)
    }
  }

  async getSkills(endpoint: string, auth?: string): Promise<Omit<Skill, 'id' | 'agent_id' | 'synced_at'>[]> {
    if (!isHttpEndpoint(endpoint)) return []
    try {
      const headers: Record<string, string> = {}
      if (auth) headers['Authorization'] = `Bearer ${auth}`
      const resp = await fetch(`${endpoint.replace(/\/$/, '')}/skills`, { headers })
      if (!resp.ok) return []
      const data = await resp.json() as Array<{ name: string; description?: string; config?: string; enabled?: boolean }>
      return data.map(s => ({
        name: s.name, description: s.description || '',
        config: s.config || '{}', enabled: s.enabled !== false,
      }))
    } catch { return [] }
  }

  async updateSkill(endpoint: string, auth: string | undefined, skillName: string, config: string, enabled: boolean): Promise<void> {
    if (!isHttpEndpoint(endpoint)) {
      throw new Error('ACP (stdio) 模式不支持 Skill 管理')
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (auth) headers['Authorization'] = `Bearer ${auth}`
    const resp = await fetch(`${endpoint.replace(/\/$/, '')}/skills/${encodeURIComponent(skillName)}`, {
      method: 'PUT', headers, body: JSON.stringify({ config, enabled }),
    })
    if (!resp.ok) throw new Error(`Skill 更新失败: ${resp.status}`)
  }
}

// ═══════════════════════════════════════════════════════════
// Trae CLI Adapter — ACP over stdio or HTTP
// ═══════════════════════════════════════════════════════════

class TraeCliAdapter implements AgentAdapter {
  type: AgentType = 'trae_cli'

  async healthCheck(endpoint: string, auth?: string): Promise<'online' | 'offline' | 'error'> {
    if (isHttpEndpoint(endpoint)) {
      // HTTP mode
      const authHeaders: Record<string, string> = {}
      if (auth) authHeaders['Authorization'] = `Bearer ${auth}`
      try {
        const connectionId = await acpHttpInitialize(endpoint, authHeaders, 5000)
        await acpHttpDelete(endpoint, connectionId, authHeaders)
        return 'online'
      } catch {
        return 'offline'
      }
    }
    // stdio mode
    return acpStdioHealthCheck(endpoint, auth)
  }

  async *sendMessage(
    endpoint: string,
    auth: string | undefined,
    messages: { role: 'user' | 'assistant'; content: string }[],
  ): AsyncGenerator<string, void, unknown> {
    if (isHttpEndpoint(endpoint)) {
      yield* acpHttpSession(endpoint, messages, auth)
    } else {
      yield* acpStdioSession(endpoint, messages, auth)
    }
  }

  async getSkills(): Promise<Omit<Skill, 'id' | 'agent_id' | 'synced_at'>[]> {
    return []
  }

  async updateSkill(
    _endpoint: string, _auth: string | undefined,
    _skillName: string, _config: string, _enabled: boolean,
  ): Promise<void> {
    void _endpoint; void _auth; void _skillName; void _config; void _enabled
    throw new Error('Trae CLI (ACP) 不支持 Skill 管理')
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
