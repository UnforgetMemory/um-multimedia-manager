import { apiTokens } from '@umm/database/schema'
import { generateToken } from '../../utils/crypto'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null)
  const userId = event.context.userId
  const db = useDb()
  const { raw, hash } = await generateToken()

  await db.insert(apiTokens).values({
    id: crypto.randomUUID(), userId, tokenHash: hash,
    description: body?.description || null,
    createdAt: new Date().toISOString(),
  })

  return { token: raw }
})