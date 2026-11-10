/**
 * Mock Agent Server for E2E tests.
 * Simulates a Codex AppServer with /health, /chat (SSE), /skills endpoints.
 * Also provides /feishu-webhook for feishu test-connection success path.
 */
import http from 'http'

const PORT = 3999

const MOCK_SKILLS = [
  { name: 'code-search', description: 'Search code across repositories', config: '{"scope":"global"}', enabled: true },
  { name: 'auto-test', description: 'Generate automated tests', config: '{"framework":"playwright"}', enabled: true },
  { name: 'doc-gen', description: 'Generate documentation', config: '{}', enabled: false },
]

const MOCK_CHAT_RESPONSE = [
  '这是模拟 Agent 的回复。\n\n',
  '```typescript\n',
  'function quickSort(arr: number[]): number[] {\n',
  '  if (arr.length <= 1) return arr;\n',
  '  const pivot = arr[0];\n',
  '  const left = arr.slice(1).filter(x => x < pivot);\n',
  '  const right = arr.slice(1).filter(x => x >= pivot);\n',
  '  return [...quickSort(left), pivot, ...quickSort(right)];\n',
  '}\n',
  '```\n',
].join('')

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`)
  const path = parsedUrl.pathname.replace(/\/$/, '')

  // Health check
  if (path === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }

  // Get skills
  if (path === '/skills' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(MOCK_SKILLS))
    return
  }

  // Update skill
  if (path.startsWith('/skills/') && req.method === 'PUT') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    })
    return
  }

  // Chat (SSE streaming)
  if (path === '/chat' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      // Split response into small chunks for streaming simulation
      const chunkSize = 12
      const chunks = []
      for (let i = 0; i < MOCK_CHAT_RESPONSE.length; i += chunkSize) {
        chunks.push(MOCK_CHAT_RESPONSE.slice(i, i + chunkSize))
      }

      let idx = 0
      const interval = setInterval(() => {
        if (idx < chunks.length) {
          res.write(`data: ${JSON.stringify({ content: chunks[idx] })}\n\n`)
          idx++
        } else {
          res.write('data: [DONE]\n\n')
          res.end()
          clearInterval(interval)
        }
      }, 5)
    })
    return
  }

  // Feishu webhook mock (for feishu test-connection success path)
  if (path === '/feishu-webhook' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true }))
    return
  }

  // Default 404
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
  console.log(`[Mock Agent Server] Running on http://localhost:${PORT}`)
})
