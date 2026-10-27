import { store } from '../storage/memory-store.js'

export function callService(tableId: string, serviceType: string) {
  return store.createService(tableId, serviceType)
}

export function respondServices(tableId: string) {
  return store.respondServices(tableId)
}

export function getServicesByTable(tableId: string) {
  return store.getServicesByTable(tableId)
}
