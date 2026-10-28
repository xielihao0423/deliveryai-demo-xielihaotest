import type { InterceptHandler } from '../types.js'

interface RegistryEntry {
  handler: InterceptHandler
  priority: number
}

class InterceptorRegistry {
  private handlers = new Map<string, RegistryEntry[]>()

  register(eventType: string, handler: InterceptHandler, priority = 0): void {
    const existing = this.handlers.get(eventType) || []
    existing.push({ handler, priority })
    existing.sort((a, b) => b.priority - a.priority)
    this.handlers.set(eventType, existing)
  }

  unregister(eventType: string, handler: InterceptHandler): void {
    const existing = this.handlers.get(eventType)
    if (!existing) return
    const filtered = existing.filter((e) => e.handler !== handler)
    this.handlers.set(eventType, filtered)
  }

  /**
   * 获取某事件类型的所有拦截器（按 priority 降序）
   * 同时返回特定 eventType 和通配 '*' 注册的 handler（评审修订项 4）
   */
  getHandlers(eventType: string): InterceptHandler[] {
    const specific = this.handlers.get(eventType) || []
    const wildcard = this.handlers.get('*') || []
    const merged = [...specific, ...wildcard]
    merged.sort((a, b) => b.priority - a.priority)
    return merged.map((e) => e.handler)
  }

  listEventTypes(): string[] {
    return Array.from(this.handlers.keys())
  }
}

export const registry = new InterceptorRegistry()
