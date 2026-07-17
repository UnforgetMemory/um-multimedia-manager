import { drizzle } from 'drizzle-orm/d1'
import type { H3Event } from 'h3'

export function useDb(event?: H3Event) {
  if (event) {
    const { DB } = event.context.cloudflare?.env || {}
    if (DB) return drizzle(DB)
  }
  // Fallback: globalThis.__env__ set by Nitro's cloudflare-pages preset
  const env = (globalThis as any).__env__
  if (env?.DB) return drizzle(env.DB as D1Database)
  throw new Error('D1 database binding not available')
}