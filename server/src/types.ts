// ============ 基础类型 ============

/** 订单阶段 */
export type OrderStage = 'submitted' | 'accepted' | 'cooking' | 'served'

/** 订单项 */
export interface OrderItem {
  uid: string
  productId: string
  name: string
  price: number
  quantity: number
  spec: string
  orderedBy: string
  stage: OrderStage
  cancelState?: 'requested' | 'approved'
}

/** 订单 */
export interface Order {
  id: string
  tableId: string
  items: OrderItem[]
  createdAt: string
  status: 'active' | 'cancelled' | 'paid'
}

/** 餐桌会话 */
export interface TableSession {
  tableId: string
  boundAt: string
  orders: string[]
  services: ServiceRequest[]
  paid: boolean
}

/** 服务请求 */
export interface ServiceRequest {
  id: string
  tableId: string
  type: string
  createdAt: string
  status: 'waiting' | 'responded'
}

/** 菜品（服务端版，去除 image 字段，新增 soldOut 字段） */
export interface Product {
  id: string
  name: string
  description: string
  category: string
  price: number
  badge?: string
  options?: {
    portion?: string[]
    flavor?: string[]
    spicy?: string[]
  }
  soldOut: boolean
}

/** 购物车项（提交订单时使用） */
export interface CartItem {
  uid: string
  productId: string
  name: string
  price: number
  quantity: number
  spec: string
  orderedBy: string
}

// ============ 拦截事件类型 ============

/** 拦截事件 */
export interface InterceptEvent {
  eventId: string
  eventType: string
  timestamp: string
  source: string
  data: Record<string, unknown>
  metadata: {
    tableId?: string
    operator?: string
    method: string
    path: string
  }
}

/** 拦截器接口 */
export interface InterceptHandler {
  before?(event: InterceptEvent): InterceptEvent | null
  after?(event: InterceptEvent, result: unknown): void
}

/** 拦截结果 */
export interface InterceptResult {
  intercepted: boolean
  event: InterceptEvent
  reason?: string
  modifiedData?: Record<string, unknown>
}

/** 事件日志记录 */
export interface EventLogEntry {
  eventId: string
  eventType: string
  timestamp: string
  source: string
  data: Record<string, unknown>
  metadata: Record<string, unknown>
  result: 'passed' | 'intercepted'
  reason?: string
  responseSnapshot?: unknown
}

/** 餐桌区域映射 */
export const tableAreas: Record<string, string> = {
  'A08': '大厅',
  'B12': '卡座',
  'C06': '包间',
  'D03': '靠窗',
}
