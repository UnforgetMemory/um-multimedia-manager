import { eq, and } from 'drizzle-orm'
import { users, sessions, accounts } from '@umm/database/schema'
import { useDb } from './db'
import type { H3Event } from 'h3'
import { getCookie, setCookie, deleteCookie } from 'h3'

// ── Session token management ──

export function generateSessionToken(): string {
  return crypto.randomUUID()
}

export function getSessionCookie(event: H3Event): string | undefined {
  const cookie = getCookie(event, 'umm-session')
  return cookie || undefined
}

export function setSessionCookie(event: H3Event, token: string) {
  setCookie(event, 'umm-session', token, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
}

export function clearSessionCookie(event: H3Event) {
  deleteCookie(event, 'umm-session', { path: '/' })
}

// ── Session validation ──

export interface AuthUser {
  id: string
  name: string | null
  email: string | null
  role: string
  image: string | null
}

export async function getSessionUser(event: H3Event): Promise<AuthUser | null> {
  const token = getSessionCookie(event)
  if (!token) return null

  try {
    const db = useDb(event)

    // Look up session
    const session = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionToken, token))
      .limit(1)
      .then(rows => rows[0])

    if (!session) return null

    // Check expiration
    if (new Date(session.expiresAt) < new Date()) {
      // Session expired, clean it up
      await db.delete(sessions).where(eq(sessions.sessionToken, token))
      return null
    }

    // Look up user
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1)
      .then(rows => rows[0])

    if (!user) return null

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      image: user.image,
    }
  } catch {
    return null
  }
}

// ── Password hashing ──

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return hex
}

// ── Login ──

export async function loginUser(
  event: H3Event,
  email: string,
  password: string,
): Promise<{ success: true; user: AuthUser } | { success: false; error: string }> {
  const db = useDb(event)

  // Find user by email
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
    .then(rows => rows[0])

  if (!user) {
    return { success: false, error: '邮箱或密码错误' }
  }

  // Find password in accounts table
  const credential = await db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, user.id),
        eq(accounts.provider, 'credentials'),
        eq(accounts.type, 'credentials'),
      ),
    )
    .limit(1)
    .then(rows => rows[0])

  if (credential?.accessToken) {
    const passwordHash = await hashPassword(password)
    if (credential.accessToken !== passwordHash) {
      return { success: false, error: '邮箱或密码错误' }
    }
  } else {
    // No password set yet — allow registration via this login
    // First-time login: create credential
    const passwordHash = await hashPassword(password)
    await db.insert(accounts).values({
      id: crypto.randomUUID(),
      userId: user.id,
      type: 'credentials',
      provider: 'credentials',
      providerAccountId: user.id,
      accessToken: passwordHash,
    })
  }

  // Create session
  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    sessionToken: token,
    userId: user.id,
    expiresAt,
  })

  setSessionCookie(event, token)

  return {
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      image: user.image,
    },
  }
}

// ── Logout ──

export async function logoutUser(event: H3Event): Promise<void> {
  const token = getSessionCookie(event)
  if (token) {
    try {
      const db = useDb(event)
      await db.delete(sessions).where(eq(sessions.sessionToken, token))
    } catch {
      // Ignore DB errors during logout
    }
  }
  clearSessionCookie(event)
}