import { users } from '@umm/database/schema'
import { sql } from 'drizzle-orm'
import { runMigration } from '../../utils/migrate'

interface InitStatus {
  initialized: boolean
  hasUsers: boolean
  userCount?: number
  migration?: string | null
  database?: { connected: boolean; error?: string | null; migrationError?: string | null }
}

export default defineEventHandler(async (event) => {
  const db = useDb(event)
  const status: InitStatus = { initialized: false, hasUsers: false }

  // Check D1 connectivity
  try {
    await db.run(sql`SELECT 1`)
    status.database = { connected: true, error: null, migrationError: null }
  } catch (error) {
    status.database = {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
    return status
  }

  // Check if any users exist
  try {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
    const userCount = rows[0]?.count ?? 0
    status.hasUsers = userCount > 0
    status.initialized = userCount > 0
    status.userCount = userCount
  } catch {
    // Table may not exist yet — try auto-migration
    const result = await runMigration(event)
    status.migration = result.success ? 'applied' : 'failed'
    status.database.migrationError = result.error || null

    if (result.success) {
      // Re-check after migration
      try {
        const rows = await db
          .select({ count: sql<number>`count(*)` })
          .from(users)
        status.hasUsers = (rows[0]?.count ?? 0) > 0
        status.initialized = true
        status.userCount = rows[0]?.count ?? 0
      } catch {
        status.hasUsers = false
        status.initialized = false
      }
    }
  }

  return status
})