/**
 * Shared message helpers for the background Service Worker layer.
 *
 * - errorMessage(): normalize an unknown thrown value into a safe string.
 * - SendResponse: type of the chrome.runtime.sendMessage response callback.
 */

/** Extract a safe message from an unknown thrown value */
export function errorMessage(err: unknown): string {
  return (err as Error)?.message || String(err)
}

/** Response callback signature for chrome.runtime.sendMessage handlers */
export type SendResponse = (response?: unknown) => void
