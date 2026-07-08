/**
 * MemoryManager — type definitions for resource lifecycle tracking.
 */

export interface ObserverEntry {
  observer: MutationObserver
  target: Node
  createdAt: number
}

export interface ListenerEntry {
  target: EventTarget
  event: string
  handler: EventListenerOrEventListenerObject
  options?: AddEventListenerOptions
}

export interface TimerEntry {
  id: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>
  kind: 'timeout' | 'interval'
  createdAt: number
}