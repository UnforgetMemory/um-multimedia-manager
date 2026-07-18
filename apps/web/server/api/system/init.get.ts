import { users } from '@umm/database/schema'
import { sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const status: Record<string, unknown> = { initialized: false, hasUsers: false }

  // Check D1 connectivity
  try {
    await db.run(sql`SELECT 1`)
    status.database = { connected: true }
  } catch (error) {
    status.database = {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
    return status
  }

  // Check if any users exist
  try {
    const [{ count: userCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
    status.hasUsers = userCount > 0
    status.initialized = userCount > 0
    status.userCount = userCount
  } catch {
    // Table may not exist yet
    status.hasUsers = false
    status.initialized = false
  }

  return status
})