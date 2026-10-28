import type { InterceptEvent, InterceptHandler } from '../../types.js'
import { store } from '../../storage/memory-store.js'
import { createLogEntry } from '../intercept-event.js'

export const eventLogger: InterceptHandler = {
  after(event: InterceptEvent, result: unknown): void {
    // 事件日志已在中间件中统一记录，此处可做额外的日志推送
    // 避免重复记录
  },
}
