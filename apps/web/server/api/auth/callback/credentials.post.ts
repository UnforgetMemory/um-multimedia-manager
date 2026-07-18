import { loginUser } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    username?: string
    password?: string
    redirect?: boolean
    callbackUrl?: string
  }>(event)

  if (!body.username || !body.password) {
    throw createError({ statusCode: 400, statusMessage: '用户名和密码为必填项' })
  }

  const result = await loginUser(event, body.username, body.password)

  if (!result.success) {
    throw createError({ statusCode: 401, statusMessage: result.error })
  }

  if (body.redirect !== false) {
    return sendRedirect(event, body.callbackUrl || '/dashboard')
  }

  return { user: result.user }
})
