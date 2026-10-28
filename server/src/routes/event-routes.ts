import { Router } from 'express'
import { store } from '../storage/memory-store.js'

export const eventRouter = Router()

eventRouter.get('/', (req, res) => {
  const filter: { eventType?: string; tableId?: string } = {}
  if (req.query.eventType) filter.eventType = req.query.eventType as string
  if (req.query.tableId) filter.tableId = req.query.tableId as string
  const logs = store.getEventLogs(filter)
  res.json({ data: logs })
})

eventRouter.get('/:eventId', (req, res) => {
  const log = store.getEventLog(req.params.eventId)
  if (!log) {
    res.status(404).json({ error: 'NOT_FOUND', message: '事件不存在' })
    return
  }
  res.json({ data: log })
})
