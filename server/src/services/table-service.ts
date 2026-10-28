import { store } from '../storage/memory-store.js'

export function bindTable(tableId: string) {
  return store.bindTable(tableId)
}

export function getTable(tableId: string) {
  return store.getTable(tableId)
}

export function getOrdersByTable(tableId: string) {
  return store.getOrdersByTable(tableId)
}
