import { loginUser } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    email?: string
    password?: string
    redirect?: boolean
    callbackUrl?: string
  }>(event)

  if (!body.email || !body.password) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password required' })
  }

  const result = await loginUser(event, body.email, body.password)

  if (!result.success) {
    throw createError({ statusCode: 401, statusMessage: result.error })
  }

  if (body.redirect !== false) {
    return sendRedirect(event, body.callbackUrl || '/dashboard')
  }

  return { user: result.user }
})