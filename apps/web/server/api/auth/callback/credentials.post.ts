import { loginUser } from '../../../utils/auth'
import { badRequest, unauthorized } from '../../../utils/api'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    username?: string
    password?: string
    redirect?: boolean
    callbackUrl?: string
  }>(event)

  if (!body.username || !body.password) {
    badRequest('用户名和密码为必填项')
  }

  const result = await loginUser(event, body.username, body.password)

  if (!result.success) {
    unauthorized(result.error)
  }

  if (body.redirect !== false) {
    return sendRedirect(event, body.callbackUrl || '/dashboard')
  }

  return { user: result.user }
})
