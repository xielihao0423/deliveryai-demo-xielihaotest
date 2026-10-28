import type { InterceptEvent, InterceptHandler } from '../../types.js'
import { store } from '../../storage/memory-store.js'

export const checkoutValidator: InterceptHandler = {
  before(event: InterceptEvent): InterceptEvent | null {
    const tableId = event.metadata.tableId
    if (!tableId) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = '缺少餐桌号'
      return null
    }
    const orders = store.getOrdersByTable(tableId)
    const hasActiveOrders = orders.some((o) => o.status === 'active')
    if (!hasActiveOrders) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = '不存在已提交的订单'
      return null
    }
    if (store.hasPendingCancelRequests(tableId)) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = '存在待处理的取消请求，请先处理'
      return null
    }
    return event
  },
}
