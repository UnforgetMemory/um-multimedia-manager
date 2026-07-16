import { userMarks } from '@umm/database/schema'
import { eq, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const userId = event.context.userId

  const marks = await db.select({
    id: userMarks.id,
    mediaItemId: userMarks.mediaItemId,
    status: userMarks.status,
    rating: userMarks.rating,
    comment: userMarks.comment,
    createdAt: userMarks.createdAt,
    updatedAt: userMarks.updatedAt,
  }).from(userMarks).where(eq(userMarks.userId, userId)).orderBy(desc(userMarks.updatedAt)).all()

  return { marks, serverTime: new Date().toISOString() }
})