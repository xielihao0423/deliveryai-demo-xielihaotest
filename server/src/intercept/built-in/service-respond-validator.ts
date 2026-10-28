import type { InterceptEvent, InterceptHandler } from '../../types.js'
import { store } from '../../storage/memory-store.js'

export const serviceRespondValidator: InterceptHandler = {
  before(event: InterceptEvent): InterceptEvent | null {
    const tableId = event.metadata.tableId
    if (!tableId) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = '缺少餐桌号'
      return null
    }
    const services = store.getServicesByTable(tableId)
    const hasWaiting = services.some((s) => s.status === 'waiting')
    if (!hasWaiting) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = '当前没有待响应的服务请求'
      return null
    }
    return event
  },
}
