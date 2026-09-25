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

/**
 * Response callback signature for chrome.runtime.sendMessage handlers.
 *
 * Generic over the response shape; the authoritative per-message response
 * contract is `ResponseMessageMap` (types/messages.ts) — see also
 * `MessageSuccess` for the client-side resolved member.
 */
export type SendResponse = <T = unknown>(response?: T) => void
