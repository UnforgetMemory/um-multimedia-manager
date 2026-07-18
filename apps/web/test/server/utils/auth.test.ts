import { describe, it, expect } from 'vitest'

/* Test pure auth utilities without D1 dependency.
 * Functions that need D1 (getSessionUser, loginUser, logoutUser) must be tested
 * via API integration tests with a real/test D1 binding.
 */

const { generateSessionToken, hashPassword } = await import('../../../server/utils/auth')

describe('generateSessionToken', () => {
  it('returns a non-empty string', () => {
    const token = generateSessionToken()
    expect(token).toBeTruthy()
    expect(typeof token).toBe('string')
  })

  it('returns unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSessionToken()))
    expect(tokens.size).toBe(100)
  })
})

describe('hashPassword', () => {
  it('returns a hex string', async () => {
    const hash = await hashPassword('test123')
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('produces deterministic output', async () => {
    const h1 = await hashPassword('samepassword')
    const h2 = await hashPassword('samepassword')
    expect(h1).toBe(h2)
  })

  it('produces different output for different inputs', async () => {
    const h1 = await hashPassword('password1')
    const h2 = await hashPassword('password2')
    expect(h1).not.toBe(h2)
  })
})