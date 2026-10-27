import { Router } from 'express'
import { createInterceptMiddleware } from '../intercept/intercept-middleware.js'
import { checkout } from '../services/checkout-service.js'

export const checkoutRouter = Router()

checkoutRouter.post('/:tableId/checkout', createInterceptMiddleware(
  'checkout.pay',
  (req) => ({
    data: {},
    metadata: { tableId: String(req.params.tableId), method: req.method, path: req.path },
  }),
  (_data, metadata) => checkout(metadata.tableId as string)
))
