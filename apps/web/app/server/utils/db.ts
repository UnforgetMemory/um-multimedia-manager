import { drizzle } from 'drizzle-orm/d1'

export function useDb() {
  const { DB } = process.env as unknown as { DB: D1Database }
  if (!DB) throw new Error('D1 database binding not available')
  return drizzle(DB)
}