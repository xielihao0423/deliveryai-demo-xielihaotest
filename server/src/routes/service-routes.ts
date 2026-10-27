import { Router } from 'express'
import { createInterceptMiddleware } from '../intercept/intercept-middleware.js'
import { callService, respondServices } from '../services/service-call-service.js'

export const serviceRouter = Router()

serviceRouter.post('/:tableId/services', createInterceptMiddleware(
  'service.call',
  (req) => ({
    data: { serviceType: req.body.serviceType as string },
    metadata: { tableId: String(req.params.tableId), method: req.method, path: req.path },
  }),
  (data, metadata) => callService(metadata.tableId as string, data.serviceType as string)
))

serviceRouter.patch('/:tableId/services/respond', createInterceptMiddleware(
  'service.respond',
  (req) => ({
    data: {},
    metadata: { tableId: String(req.params.tableId), method: req.method, path: req.path },
  }),
  (_data, metadata) => respondServices(metadata.tableId as string)
))
