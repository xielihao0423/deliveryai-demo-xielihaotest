import type { Request, Response, NextFunction, RequestHandler } from 'express'
import type { InterceptEvent } from '../types.js'
import { registry } from './interceptor-registry.js'
import { createEvent, runBefore, runAfter, createLogEntry } from './intercept-event.js'
import { store } from '../storage/memory-store.js'

export function createInterceptMiddleware(
  eventType: string,
  extractData: (req: Request) => { data: Record<string, unknown>; metadata: { tableId?: string; operator?: string; method: string; path: string } },
  serviceHandler: (data: Record<string, unknown>, metadata: Record<string, unknown>) => unknown
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { data, metadata } = extractData(req)
      const event: InterceptEvent = createEvent(eventType, req.path, data, metadata)
      const handlers = registry.getHandlers(eventType)

      const interceptResult = runBefore(event, handlers)

      if (interceptResult.intercepted) {
        const logEntry = createLogEntry(interceptResult.event, 'intercepted', interceptResult.reason)
        store.logEvent(logEntry)
        res.status(403).json({
          error: 'INTERCEPTED',
          eventType,
          eventId: event.eventId,
          reason: interceptResult.reason || '请求被拦截',
        })
        return
      }

      const finalEvent = interceptResult.event
      const result = serviceHandler(finalEvent.data, finalEvent.metadata as Record<string, unknown>)

      runAfter(finalEvent, result, handlers)

      const logEntry = createLogEntry(finalEvent, 'passed', undefined, result)
      store.logEvent(logEntry)

      res.json({ data: result })
    } catch (err) {
      next(err)
    }
  }
}
