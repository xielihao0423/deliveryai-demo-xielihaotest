import type { InterceptEvent, InterceptHandler, OrderStage } from '../../types.js'
import { store } from '../../storage/memory-store.js'

const stageOrder: OrderStage[] = ['submitted', 'accepted', 'cooking', 'served']

export const stageFlowInterceptor: InterceptHandler = {
  before(event: InterceptEvent): InterceptEvent | null {
    const orderId = event.data.orderId as string
    const targetStage = event.data.stage as OrderStage
    const order = store.getOrder(orderId)
    if (!order) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = '订单不存在'
      return null
    }
    const currentStage = order.items[0]?.stage
    if (!currentStage) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = '订单无当前阶段'
      return null
    }
    const currentIndex = stageOrder.indexOf(currentStage)
    const targetIndex = stageOrder.indexOf(targetStage)
    if (targetIndex !== currentIndex + 1) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = `非法阶段流转: ${currentStage} → ${targetStage}（仅允许顺序流转: submitted → accepted → cooking → served）`
      return null
    }
    return event
  },
}
