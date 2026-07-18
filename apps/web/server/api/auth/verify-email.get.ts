import { users, accounts, sessions } from '@umm/database/schema'
import { eq, and } from 'drizzle-orm'
import { badRequest, notFound } from '../../utils/api'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const token = query.token as string | undefined

  if (!token) {
    badRequest('缺少验证令牌')
  }

  const db = useDb(event)

  // Look up user by verification token stored in accounts
  const credential = await db
    .select()
    .from(accounts)
    .where(
      and(eq(accounts.provider, 'email_verification'), eq(accounts.accessToken, token)),
    )
    .limit(1)
    .then(rows => rows[0])

  if (!credential) {
    notFound('验证令牌无效或已过期')
  }

  const now = new Date().toISOString()

  // Mark email as verified
  await db
    .update(users)
    .set({ emailVerified: now })
    .where(eq(users.id, credential.userId))

  // Remove the verification token
  await db
    .delete(accounts)
    .where(eq(accounts.id, credential.id))

  // Create a session and log the user in
  const { generateSessionToken, setSessionCookie } = await import('../../utils/auth')

  const sessionToken = generateSessionToken()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    sessionToken,
    userId: credential.userId,
    expiresAt,
  })

  setSessionCookie(event, sessionToken)

  return sendRedirect(event, '/dashboard')
})