import { syncLogs } from '@umm/database/schema'
import { desc } from 'drizzle-orm'

export default defineEventHandler(async () => {
  const db = useDb()
  const logs = await db.select().from(syncLogs).orderBy(desc(syncLogs.createdAt)).limit(100).all()
  return { logs }
})