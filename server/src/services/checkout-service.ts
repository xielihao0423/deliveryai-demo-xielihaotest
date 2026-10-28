import { store } from '../storage/memory-store.js'

export function checkout(tableId: string) {
  return store.checkout(tableId)
}
