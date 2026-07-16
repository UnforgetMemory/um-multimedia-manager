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

/** Subscribe to an event type. Returns unsubscribe function. */
export function subscribe(event: EventType, callback: (data: unknown) => void): () => void {
  if (!subscribers.has(event)) {
    subscribers.set(event, new Set())
  }
  subscribers.get(event)!.add(callback)

  return () => {
    subscribers.get(event)?.delete(callback)
    if (subscribers.get(event)?.size === 0) {
      subscribers.delete(event)
    }
  }
}

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
        try { cb(msg.data) } catch (e) { console.error('[EventBus] Subscriber error:', e) }
      }
    }
  })
}
