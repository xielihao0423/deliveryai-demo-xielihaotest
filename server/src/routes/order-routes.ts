import { Router } from 'express'
import { createInterceptMiddleware } from '../intercept/intercept-middleware.js'
import { updateOrderStage, requestCancelItem } from '../services/order-service.js'
import type { OrderStage } from '../types.js'

export const orderRouter = Router()

orderRouter.patch('/:orderId/stage', createInterceptMiddleware(
  'order.stage_change',
  (req) => ({
    data: { orderId: req.params.orderId, stage: req.body.stage as OrderStage },
    metadata: { method: req.method, path: req.path },
  }),
  (data) => updateOrderStage(data.orderId as string, data.stage as OrderStage)
))

orderRouter.post('/:orderId/cancel', createInterceptMiddleware(
  'order.cancel',
  (req) => ({
    data: { orderId: req.params.orderId, itemId: req.body.itemId as string },
    metadata: { method: req.method, path: req.path },
  }),
  (data) => requestCancelItem(data.orderId as string, data.itemId as string)
))
