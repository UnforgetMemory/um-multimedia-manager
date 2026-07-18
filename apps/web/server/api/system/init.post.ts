import { users, accounts, sessions } from '@umm/database/schema'
import { sql } from 'drizzle-orm'
import { hashPassword, generateSessionToken, setSessionCookie } from '../../utils/auth'
import { runMigration } from '../../utils/migrate'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    name?: string
    email?: string
    password?: string
  }>(event)

  if (!body.email || !body.password) {
    throw createError({ statusCode: 400, statusMessage: '邮箱和密码为必填项' })
  }
  if (body.password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: '密码至少需要 8 位字符' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    throw createError({ statusCode: 400, statusMessage: '邮箱格式不正确' })
  }

  const db = useDb(event)

  // Ensure tables exist before creating admin
  const migrateResult = await runMigration(event)
  if (!migrateResult.success) {
    throw createError({ statusCode: 500, statusMessage: `数据库初始化失败: ${migrateResult.error}` })
  }

  // Check if system already has users
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
  const userCount = rows[0]?.count ?? 0

  if (userCount > 0) {
    throw createError({ statusCode: 409, statusMessage: '系统已初始化，已有管理员用户' })
  }

  // Create admin user
  const userId = crypto.randomUUID()
  const now = new Date().toISOString()
  const passwordHash = await hashPassword(body.password)

  await db.insert(users).values({
    id: userId,
    name: body.name || body.email?.split('@')[0] || 'Admin',
    email: body.email,
    role: 'admin',
    emailVerified: now, // first admin auto-verified
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

  // Create session
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
    success: true,
    user: {
      id: userId,
      name: body.name || body.email?.split('@')[0] || 'Admin',
      email: body.email,
      role: 'admin',
    },
  }
})