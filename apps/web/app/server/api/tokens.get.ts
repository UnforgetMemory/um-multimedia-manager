import { apiTokens } from '@umm/database/schema'
import { eq, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  const db = useDb()

  const tokens = await db.select({
    id: apiTokens.id,
    description: apiTokens.description,
    lastUsedAt: apiTokens.lastUsedAt,
    expiresAt: apiTokens.expiresAt,
    createdAt: apiTokens.createdAt,
  }).from(apiTokens).where(eq(apiTokens.userId, userId)).orderBy(desc(apiTokens.createdAt)).all()

  return { tokens }
})