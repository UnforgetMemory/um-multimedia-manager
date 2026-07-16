import { mediaItems, userMarks, users } from '@umm/database/schema'
import { sql } from 'drizzle-orm'

export default defineEventHandler(async () => {
  const db = useDb()
  const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users)
  const [itemCount] = await db.select({ count: sql<number>`count(*)` }).from(mediaItems)
  const [markCount] = await db.select({ count: sql<number>`count(*)` }).from(userMarks)
  return { userCount: userCount.count, itemCount: itemCount.count, markCount: markCount.count }
})