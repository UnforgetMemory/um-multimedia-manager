import { logoutUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await logoutUser(event)
  return sendRedirect(event, '/auth/login')
})