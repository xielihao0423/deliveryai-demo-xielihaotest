import type { InterceptEvent, InterceptHandler } from '../../types.js'
import { store } from '../../storage/memory-store.js'

const THROTTLE_MS = 30_000

export const serviceThrottleInterceptor: InterceptHandler = {
  before(event: InterceptEvent): InterceptEvent | null {
    const tableId = event.metadata.tableId
    const serviceType = event.data.serviceType as string
    if (!tableId || !serviceType) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = '缺少餐桌号或服务类型'
      return null
    }
    const services = store.getServicesByTable(tableId)
    const now = Date.now()
    const recent = services.find(
      (s) => s.type === serviceType && s.status === 'waiting' &&
        now - new Date(s.createdAt).getTime() < THROTTLE_MS
    )
    if (recent) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = `同餐桌 30 秒内不可重复呼叫同类服务: ${serviceType}`
      return null
    }
    return event
  },
}
