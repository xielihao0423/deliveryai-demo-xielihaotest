import type { InterceptEvent, InterceptHandler } from '../../types.js'
import { tableAreas } from '../../types.js'
import { store } from '../../storage/memory-store.js'

export const tableBindValidator: InterceptHandler = {
  before(event: InterceptEvent): InterceptEvent | null {
    const tableId = event.metadata.tableId
    if (!tableId || !tableAreas[tableId]) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = '无效的餐桌号'
      return null
    }
    if (store.isTableBound(tableId)) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = '餐桌已被占用'
      return null
    }
    return event
  },
}
