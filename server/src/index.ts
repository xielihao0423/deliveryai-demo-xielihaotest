import express from 'express'
import cors from 'cors'
import agentsRouter from './routes/agents.js'
import sessionsRouter from './routes/sessions.js'
import feishuRouter from './routes/feishu.js'
import { startHealthMonitor } from './services/HealthMonitor.js'

const app = express()
const PORT = Number(process.env.PORT) || 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Health check endpoint
app.get('/ping', (_req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() })
})

// API routes
app.use('/api/agents', agentsRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/feishu', feishuRouter)

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response) => {
  console.error('[Server Error]', err)
  res.status(500).json({ success: false, error: err.message })
})

app.listen(PORT, () => {
  console.log(`[AgentHub Server] Running on http://localhost:${PORT}`)
  startHealthMonitor()
})
