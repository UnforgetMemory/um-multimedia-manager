/**
 * MemoryManager — centralized resource lifecycle management.
 *
 * Tracks MutationObservers, event listeners, and timers so they can
 * be bulk-disposed on page navigation or SW suspend.
 */

import type { ObserverEntry, ListenerEntry, TimerEntry } from './types'

export class MemoryManager {
  private readonly observers = new Map<string, ObserverEntry>()
  private readonly listeners = new Map<string, ListenerEntry>()
  private readonly timers = new Map<string, TimerEntry>()
  private disposed = false

  // ==================== Observers ====================

  /** Register a MutationObserver. Returns the same observer for chaining. */
  registerObserver(key: string, target: Node, observer: MutationObserver): MutationObserver {
    this.assertNotDisposed()
    this.observers.set(key, { observer, target, createdAt: Date.now() })
    return observer
  }

  /** Disconnect and remove a registered observer. */
  disconnectObserver(key: string): boolean {
    const entry = this.observers.get(key)
    if (!entry) return false
    entry.observer.disconnect()
    this.observers.delete(key)
    return true
  }

  // ==================== Listeners ====================

  /** Register an event listener. Returns the same target for chaining. */
  registerListener(
    key: string,
    target: EventTarget,
    event: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions,
  ): void {
    this.assertNotDisposed()
    target.addEventListener(event, handler, options)
    this.listeners.set(key, { target, event, handler, options })
  }

  /** Remove a registered listener. */
  removeListener(key: string): boolean {
    const entry = this.listeners.get(key)
    if (!entry) return false
    entry.target.removeEventListener(entry.event, entry.handler, entry.options)
    this.listeners.delete(key)
    return true
  }

  // ==================== Timers ====================

  /** Register a timeout or interval. */
  registerTimer(key: string, id: ReturnType<typeof setTimeout>): number
  registerTimer(key: string, id: ReturnType<typeof setInterval>, kind: 'interval'): number
  registerTimer(key: string, id: any, kind: 'timeout' | 'interval' = 'timeout'): number {
    this.assertNotDisposed()
    this.timers.set(key, { id, kind, createdAt: Date.now() })
    return id
  }

  /** Clear a registered timer. */
  clearTimer(key: string): boolean {
    const entry = this.timers.get(key)
    if (!entry) return false
    if (entry.kind === 'interval') clearInterval(entry.id)
    else clearTimeout(entry.id)
    this.timers.delete(key)
    return true
  }

  // ==================== Bulk Cleanup ====================

  /** Total tracked resources. */
  get size(): number {
    return this.observers.size + this.listeners.size + this.timers.size
  }

  /** Disconnect all observers, remove all listeners, clear all timers. */
  cleanup(): void {
    for (const key of this.observers.keys()) this.disconnectObserver(key)
    for (const key of this.listeners.keys()) this.removeListener(key)
    for (const key of this.timers.keys()) this.clearTimer(key)
    this.disposed = true
  }

  /** Cleanup only resources matching a key prefix. */
  cleanupByPrefix(prefix: string): number {
    let count = 0
    for (const key of this.observers.keys()) {
      if (key.startsWith(prefix)) { this.disconnectObserver(key); count++ }
    }
    for (const key of this.listeners.keys()) {
      if (key.startsWith(prefix)) { this.removeListener(key); count++ }
    }
    for (const key of this.timers.keys()) {
      if (key.startsWith(prefix)) { this.clearTimer(key); count++ }
    }
    return count
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('MemoryManager has been disposed')
  }
}

export type { ObserverEntry, ListenerEntry, TimerEntry } from './types'