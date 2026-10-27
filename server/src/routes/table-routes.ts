import { Router } from 'express'
import { createInterceptMiddleware } from '../intercept/intercept-middleware.js'
import { bindTable, getOrdersByTable } from '../services/table-service.js'
import { createOrder } from '../services/order-service.js'
import type { CartItem } from '../types.js'

export const tableRouter = Router()

tableRouter.post('/:tableId/bind', createInterceptMiddleware(
  'table.bind',
  (req) => ({
    data: {},
    metadata: { tableId: String(req.params.tableId), method: req.method, path: req.path },
  }),
  (data, metadata) => bindTable(metadata.tableId as string)
))

tableRouter.post('/:tableId/orders', createInterceptMiddleware(
  'order.submit',
  (req) => ({
    data: { items: req.body.items || [] },
    metadata: { tableId: String(req.params.tableId), operator: req.body.operator, method: req.method, path: req.path },
  }),
  (data, metadata) => {
    const items = data.items as CartItem[]
    return createOrder(metadata.tableId as string, items)
  }
))

tableRouter.get('/:tableId/orders', (req, res) => {
  const orders = getOrdersByTable(String(req.params.tableId))
  res.json({ data: orders })
})
