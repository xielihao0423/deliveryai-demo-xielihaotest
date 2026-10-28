import type {
  Order, OrderItem, OrderStage, ServiceRequest, TableSession,
  CartItem, EventLogEntry,
} from '../types.js'
import { products } from '../data/menu.js'

class MemoryStore {
  private tables = new Map<string, TableSession>()
  private orders = new Map<string, Order>()
  private services = new Map<string, ServiceRequest>()
  private eventLogs: EventLogEntry[] = []
  private maxLogSize = 1000

  // ===== 餐桌操作 =====

  getTable(tableId: string): TableSession | undefined {
    return this.tables.get(tableId)
  }

  bindTable(tableId: string): TableSession {
    const session: TableSession = {
      tableId,
      boundAt: new Date().toISOString(),
      orders: [],
      services: [],
      paid: false,
    }
    this.tables.set(tableId, session)
    return session
  }

  isTableBound(tableId: string): boolean {
    return this.tables.has(tableId)
  }

  // ===== 订单操作 =====

  createOrder(tableId: string, cartItems: CartItem[]): Order {
    const orderId = `ord_${randomHex(8)}`
    const items: OrderItem[] = cartItems.map((item, idx) => ({
      ...item,
      uid: `item_${randomHex(8)}_${idx}`,
      stage: 'submitted' as const,
    }))
    const order: Order = {
      id: orderId,
      tableId,
      items,
      createdAt: new Date().toISOString(),
      status: 'active',
    }
    this.orders.set(orderId, order)
    const table = this.tables.get(tableId)
    if (table) {
      table.orders.push(orderId)
    }
    return order
  }

  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId)
  }

  getOrdersByTable(tableId: string): Order[] {
    const table = this.tables.get(tableId)
    if (!table) return []
    return table.orders
      .map((id) => this.orders.get(id))
      .filter((o): o is Order => o !== undefined)
  }

  updateOrderStage(orderId: string, stage: OrderStage): Order {
    const order = this.orders.get(orderId)
    if (!order) throw new Error('NOT_FOUND')
    order.items = order.items.map((item) => ({ ...item, stage }))
    return order
  }

  requestCancelItem(orderId: string, itemId: string): Order {
    const order = this.orders.get(orderId)
    if (!order) throw new Error('NOT_FOUND')
    order.items = order.items.map((item) =>
      item.uid === itemId ? { ...item, cancelState: 'requested' as const } : item
    )
    return order
  }

  hasPendingCancelRequests(tableId: string): boolean {
    const orders = this.getOrdersByTable(tableId)
    return orders.some((order) =>
      order.items.some((item) => item.cancelState === 'requested')
    )
  }

  // ===== 服务操作 =====

  createService(tableId: string, type: string): ServiceRequest {
    const service: ServiceRequest = {
      id: `svc_${randomHex(8)}`,
      tableId,
      type,
      createdAt: new Date().toISOString(),
      status: 'waiting',
    }
    this.services.set(service.id, service)
    const table = this.tables.get(tableId)
    if (table) {
      table.services.push(service)
    }
    return service
  }

  getServicesByTable(tableId: string): ServiceRequest[] {
    const table = this.tables.get(tableId)
    if (!table) return []
    return table.services
  }

  respondServices(tableId: string): ServiceRequest[] {
    const table = this.tables.get(tableId)
    if (!table) return []
    const updated: ServiceRequest[] = []
    for (const svc of table.services) {
      if (svc.status === 'waiting') {
        svc.status = 'responded'
        this.services.set(svc.id, svc)
        updated.push(svc)
      }
    }
    return updated
  }

  // ===== 结账操作 =====

  checkout(tableId: string): { total: number; orders: Order[] } {
    const orders = this.getOrdersByTable(tableId)
    const total = orders.reduce((sum, order) =>
      sum + order.items.reduce((s, item) => s + item.price * item.quantity, 0), 0
    )
    const table = this.tables.get(tableId)
    if (table) {
      table.paid = true
    }
    for (const order of orders) {
      order.status = 'paid'
    }
    return { total, orders }
  }

  // ===== 事件日志 =====

  logEvent(entry: EventLogEntry): void {
    this.eventLogs.push(entry)
    if (this.eventLogs.length > this.maxLogSize) {
      this.eventLogs.shift()
    }
  }

  getEventLogs(filter?: { eventType?: string; tableId?: string }): EventLogEntry[] {
    let logs = [...this.eventLogs]
    if (filter?.eventType) {
      logs = logs.filter((e) => e.eventType === filter.eventType)
    }
    if (filter?.tableId) {
      logs = logs.filter((e) => {
        const meta = e.metadata as Record<string, unknown>
        return meta.tableId === filter.tableId
      })
    }
    return logs
  }

  getEventLog(eventId: string): EventLogEntry | undefined {
    return this.eventLogs.find((e) => e.eventId === eventId)
  }

  // ===== 菜单 =====
  getProducts() {
    return products
  }
}

function randomHex(length: number): string {
  const chars = '0123456789abcdef'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * 16)]
  }
  return result
}

export const store = new MemoryStore()
