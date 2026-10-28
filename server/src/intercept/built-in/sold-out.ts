import type { InterceptEvent, InterceptHandler } from '../../types.js'
import { getSoldOutProductIds } from '../../data/menu.js'
import { store } from '../../storage/memory-store.js'

export const soldOutInterceptor: InterceptHandler = {
  before(event: InterceptEvent): InterceptEvent | null {
    // BUG-003 fix: 校验餐桌是否已绑定
    const tableId = event.metadata.tableId
    if (!tableId || !store.isTableBound(tableId)) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = '餐桌未绑定，请先绑定餐桌'
      return null
    }

    const items = event.data.items as Array<{ productId: string }> | undefined
    if (!items || !Array.isArray(items) || items.length === 0) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = '购物车为空'
      return null
    }
    const soldOutIds = new Set(getSoldOutProductIds())
    const soldOutItems = items.filter((item) => soldOutIds.has(item.productId))
    if (soldOutItems.length > 0) {
      ;(event as InterceptEvent & { _interceptReason?: string })._interceptReason = `购物车中包含售罄菜品: ${soldOutItems.map((i) => i.productId).join(', ')}`
      return null
    }
    return event
  },
}
