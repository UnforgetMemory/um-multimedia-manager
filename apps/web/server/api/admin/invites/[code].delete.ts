import { inviteCodes } from '@umm/database/schema'
import { eq } from 'drizzle-orm'
import { getSessionUser } from '../../../utils/auth'
import { useDb } from '../../../utils/db'
import { forbidden, notFound, requireParam } from '../../../utils/api'

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event)
  if (!user || user.role !== 'admin') {
    forbidden('仅管理员可删除邀请码')
  }

  const code = requireParam(event, 'code')
  const db = useDb(event)

  const result = await db
    .delete(inviteCodes)
    .where(eq(inviteCodes.code, code))
    .run()

  if (result.meta.changes === 0) {
    notFound('邀请码不存在')
  }

  return { success: true }
})
