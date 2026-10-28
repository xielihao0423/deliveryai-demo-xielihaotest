import type { InterceptEvent, InterceptHandler, InterceptResult, EventLogEntry } from '../types.js'

export function createEvent(
  eventType: string,
  source: string,
  data: Record<string, unknown>,
  metadata: { tableId?: string; operator?: string; method: string; path: string }
): InterceptEvent {
  return {
    eventId: `evt_${randomHex(8)}`,
    eventType,
    timestamp: new Date().toISOString(),
    source,
    data,
    metadata,
  }
}

export function runBefore(
  event: InterceptEvent,
  handlers: InterceptHandler[]
): InterceptResult {
  let currentEvent = event
  for (const handler of handlers) {
    if (!handler.before) continue
    const result = handler.before(currentEvent)
    if (result === null) {
      // Extract the intercept reason set by the handler
      const reason = (currentEvent as InterceptEvent & { _interceptReason?: string })._interceptReason
      return { intercepted: true, event: currentEvent, reason }
    }
    // 修改后的 event 传递给下一个 handler（评审修订项 5）
    if (result) {
      currentEvent = result
    }
  }
  return { intercepted: false, event: currentEvent }
}

export function runAfter(
  event: InterceptEvent,
  result: unknown,
  handlers: InterceptHandler[]
): void {
  for (const handler of handlers) {
    if (handler.after) {
      handler.after(event, result)
    }
  }
}

export function createLogEntry(
  event: InterceptEvent,
  result: 'passed' | 'intercepted',
  reason?: string,
  responseSnapshot?: unknown
): EventLogEntry {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    timestamp: event.timestamp,
    source: event.source,
    data: event.data,
    metadata: event.metadata as Record<string, unknown>,
    result,
    reason,
    responseSnapshot,
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
