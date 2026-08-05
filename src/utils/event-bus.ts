export type EventType = 'record:updated' | 'record:deleted' | 'settings:changed' | 'sync:completed'

export interface EventBusMessage {
  type: 'EVENT_BUS'
  event: EventType
  data?: unknown
}

// ==================== Background 端 ====================

/** Broadcast an event to all content scripts */
export function broadcast(event: EventType, data?: unknown): void {
  try {
    chrome.runtime.sendMessage({ type: 'EVENT_BUS', event, data })
  } catch {
    // Content scripts may not be listening — fire and forget
  }
}

// ==================== Content Script 端 ====================

const subscribers = new Map<EventType, Set<(data: unknown) => void>>()
let initialized = false

/** Initialize the message listener (call once in content script main) */
export function initEventBus(): void {
  if (initialized) return
  initialized = true
  chrome.runtime.onMessage.addListener((message: unknown, sender: chrome.runtime.MessageSender) => {
    if (sender.id !== chrome.runtime.id) return
    const msg = message as EventBusMessage
    if (msg.type !== 'EVENT_BUS') return
    const callbacks = subscribers.get(msg.event)
    if (callbacks) {
      for (const cb of callbacks) {
        try { cb(msg.data) } catch (e: unknown) { console.error('[EventBus] Subscriber error:', e) }
      }
    }
  })
}

/** Subscribe to a background event. Returns an unsubscribe function. */
export function onEvent(event: EventType, callback: (data: unknown) => void): () => void {
  const set = subscribers.get(event) ?? new Set<(data: unknown) => void>()
  set.add(callback)
  subscribers.set(event, set)
  return () => {
    set.delete(callback)
  }
}
