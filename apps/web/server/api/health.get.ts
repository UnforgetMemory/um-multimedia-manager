import { sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const status: Record<string, unknown> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }

  // Check D1 database connectivity
  try {
    const db = useDb(event)
    const result = await db.run(sql`SELECT 1`)
    status.database = { connected: true }
  } catch (error) {
    status.database = {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
    status.status = 'degraded'
  }

  // Check environment
  status.environment = {
    cloudflare: !!event.context.cloudflare,
    cfPages: !!process.env.CF_PAGES,
    cfPagesUrl: process.env.CF_PAGES_URL || null,
  }

  return status
})