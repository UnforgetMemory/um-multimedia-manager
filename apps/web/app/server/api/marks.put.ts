import { userMarks } from '@umm/database/schema'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const userId = event.context.userId
  const body = await readBody(event)
  const now = new Date().toISOString()

  const existing = await db.select({ id: userMarks.id })
    .from(userMarks)
    .where(and(eq(userMarks.userId, userId), eq(userMarks.mediaItemId, body.mediaItemId)))
    .get()

  if (existing) {
    await db.update(userMarks)
      .set({ status: body.status, rating: body.rating ?? null, comment: body.comment ?? null, updatedAt: now })
      .where(eq(userMarks.id, existing.id))
    return { id: existing.id, updatedAt: now }
  }

  const id = crypto.randomUUID()
  await db.insert(userMarks).values({
    id, userId, mediaItemId: body.mediaItemId,
    status: body.status, rating: body.rating ?? null, comment: body.comment ?? null,
    createdAt: now, updatedAt: now,
  })
  return { id, updatedAt: now }
})