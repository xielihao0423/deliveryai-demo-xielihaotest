import type { CartItem, OrderStage } from '../types.js'
import { store } from '../storage/memory-store.js'

export function createOrder(tableId: string, items: CartItem[]) {
  return store.createOrder(tableId, items)
}

export function getOrder(orderId: string) {
  return store.getOrder(orderId)
}

export function updateOrderStage(orderId: string, stage: OrderStage) {
  return store.updateOrderStage(orderId, stage)
}

export function requestCancelItem(orderId: string, itemId: string) {
  return store.requestCancelItem(orderId, itemId)
}
