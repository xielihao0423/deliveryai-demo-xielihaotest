import type { InterceptEvent, InterceptHandler } from '../../types.js'
import { store } from '../../storage/memory-store.js'

export const cancelGuardInterceptor: InterceptHandler = {
  before(event: InterceptEvent): InterceptEvent | null {
    const orderId = event.data.orderId as string
    const itemId = event.data.itemId as string
    const order = store.getOrder(orderId)
    if (!order) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = '订单不存在'
      return null
    }
    const item = order.items.find((i) => i.uid === itemId)
    if (!item) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = '订单项不存在'
      return null
    }
    if (item.stage === 'served') {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = '已上菜订单项不可取消'
      return null
    }
    return event
  },
}
