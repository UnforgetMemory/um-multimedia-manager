import { mediaItems, userMarks } from '@umm/database/schema'
import { eq, like, and, desc, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const db = useDb()
  const userId = event.context.userId

  const conditions: ReturnType<typeof eq>[] = []
  if (query.q) conditions.push(like(mediaItems.title, `%${query.q}%`))
  if (query.platform) conditions.push(eq(mediaItems.platform, query.platform as string))
  if (query.mediaType) conditions.push(eq(mediaItems.mediaType, query.mediaType as string))

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(Number(query.limit) || 20, 100)
  const offset = (page - 1) * limit

  const items = await db.select({
    id: mediaItems.id,
    platform: mediaItems.platform,
    mediaType: mediaItems.mediaType,
    title: mediaItems.title,
    coverUrl: mediaItems.coverUrl,
    status: userMarks.status,
    rating: userMarks.rating,
  })
    .from(mediaItems)
    .leftJoin(userMarks, and(eq(mediaItems.id, userMarks.mediaItemId), eq(userMarks.userId, userId)))
    .where(where)
    .orderBy(desc(mediaItems.updatedAt))
    .limit(limit)
    .offset(offset)
    .all()

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(mediaItems).where(where)

  return { items, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } }
})