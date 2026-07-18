import { users, accounts, sessions, inviteCodes } from '@umm/database/schema'
import { eq } from 'drizzle-orm'
import { hashPassword, generateSessionToken, setSessionCookie } from '../../utils/auth'
import { useDb } from '../../utils/db'
import { badRequest } from '../../utils/api'
import { registerSchema } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    badRequest('参数无效', parsed.error.flatten())
  }

  const { username, password, inviteCode } = parsed.data!
  const db = useDb(event)
  const now = new Date().toISOString()

  // Verify invite code
  const codeRow = await db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.code, inviteCode))
    .limit(1)
    .then((rows) => rows[0])

  if (!codeRow) {
    badRequest('邀请码无效')
  }
  if (codeRow.usedAt) {
    badRequest('邀请码已被使用')
  }
  if (new Date(codeRow.expiresAt) < new Date()) {
    badRequest('邀请码已过期')
  }

  // Check username uniqueness
  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1)
    .then((rows) => rows[0])

  if (existingUser) {
    badRequest('用户名已被注册')
  }

  // Create user
  const userId = crypto.randomUUID()
  const passwordHash = await hashPassword(password)

  await db.insert(users).values({
    id: userId,
    name: username,
    username,
    role: 'user',
    createdAt: now,
  })

  // Create credential account
  await db.insert(accounts).values({
    id: crypto.randomUUID(),
    userId,
    type: 'credentials',
    provider: 'credentials',
    providerAccountId: userId,
    accessToken: passwordHash,
  })

  // Mark invite code as used
  await db
    .update(inviteCodes)
    .set({ usedAt: now, usedBy: userId })
    .where(eq(inviteCodes.code, inviteCode))

  // Create session and log in
  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    sessionToken: token,
    userId,
    expiresAt,
  })

  setSessionCookie(event, token)

  return {
    user: {
      id: userId,
      name: username,
      role: 'user',
    },
  }
})
