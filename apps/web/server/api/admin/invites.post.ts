import { inviteCodes } from '@umm/database/schema'
import { getSessionUser } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { forbidden, badRequest } from '../../utils/api'
import { createInviteCodeSchema } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event)
  if (!user || user.role !== 'admin') {
    forbidden('仅管理员可生成邀请码')
  }

  const body = await readBody(event).catch(() => ({}))
  const parsed = createInviteCodeSchema.safeParse(body)
  if (!parsed.success) {
    badRequest('参数无效', parsed.error.flatten())
  }

  const { expiresInDays = 7 } = parsed.data!
  const code = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

  const db = useDb(event)
  await db.insert(inviteCodes).values({
    code,
    createdBy: user.id,
    expiresAt,
  })

  return { code, expiresAt }
})
