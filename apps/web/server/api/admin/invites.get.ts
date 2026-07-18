import { inviteCodes } from '@umm/database/schema'
import { desc } from 'drizzle-orm'
import { getSessionUser } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { forbidden } from '../../utils/api'

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event)
  if (!user || user.role !== 'admin') {
    forbidden('仅管理员可查看邀请码')
  }

  const db = useDb(event)
  const rows = await db
    .select({
      code: inviteCodes.code,
      createdBy: inviteCodes.createdBy,
      expiresAt: inviteCodes.expiresAt,
      usedAt: inviteCodes.usedAt,
      usedBy: inviteCodes.usedBy,
    })
    .from(inviteCodes)
    .orderBy(desc(inviteCodes.expiresAt))
    .all()

  return rows
})
