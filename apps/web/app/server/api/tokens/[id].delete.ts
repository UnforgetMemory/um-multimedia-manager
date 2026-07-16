import { apiTokens } from '@umm/database/schema'
import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  const tokenId = getRouterParam(event, 'id')
  const db = useDb()

  const result = await db.delete(apiTokens)
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)))
    .run()

  if (result.meta.changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Token not found' })
  }

  return { status: 'revoked' }
})