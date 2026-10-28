import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import { menuRouter } from './routes/menu-routes.js'
import { tableRouter } from './routes/table-routes.js'
import { orderRouter } from './routes/order-routes.js'
import { serviceRouter } from './routes/service-routes.js'
import { checkoutRouter } from './routes/checkout-routes.js'
import { eventRouter } from './routes/event-routes.js'
import { registry } from './intercept/interceptor-registry.js'
import { tableBindValidator } from './intercept/built-in/table-bind-validator.js'
import { soldOutInterceptor } from './intercept/built-in/sold-out.js'
import { stageFlowInterceptor } from './intercept/built-in/stage-flow.js'
import { cancelGuardInterceptor } from './intercept/built-in/cancel-guard.js'
import { serviceThrottleInterceptor } from './intercept/built-in/service-throttle.js'
import { serviceRespondValidator } from './intercept/built-in/service-respond-validator.js'
import { checkoutValidator } from './intercept/built-in/checkout-validator.js'
import { eventLogger } from './intercept/built-in/event-logger.js'

export function createApp() {
  const app = express()

  // Middleware
  app.use(express.json())

  // Register built-in interceptors
  registry.register('table.bind', tableBindValidator)
  registry.register('order.submit', soldOutInterceptor)
  registry.register('order.stage_change', stageFlowInterceptor)
  registry.register('order.cancel', cancelGuardInterceptor)
  registry.register('service.call', serviceThrottleInterceptor)
  registry.register('service.respond', serviceRespondValidator)
  registry.register('checkout.pay', checkoutValidator)
  // EventLogger registered for all events via wildcard '*'
  registry.register('*', eventLogger)

  // Health check (preserved)
  app.get('/ping', (_req: Request, res: Response) => {
    res.json({
      message: 'pong',
      timestamp: new Date().toISOString(),
    })
  })

  // API routes
  app.use('/api', menuRouter)
  app.use('/api/tables', tableRouter)
  app.use('/api/orders', orderRouter)
  app.use('/api/tables', serviceRouter)
  app.use('/api/tables', checkoutRouter)
  app.use('/api/events', eventRouter)

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err.message === 'NOT_FOUND') {
      res.status(404).json({ error: 'NOT_FOUND', message: '资源不存在' })
      return
    }
    if (err.message.startsWith('BAD_REQUEST')) {
      res.status(400).json({ error: 'BAD_REQUEST', message: err.message.replace('BAD_REQUEST: ', '') })
      return
    }
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message })
  })

  return app
}
