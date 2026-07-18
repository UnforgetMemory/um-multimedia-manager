import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('GET /api/health', async () => {
  await setup({
    server: true,
    browser: false,
    setupTimeout: 30000,
  })

  it('returns 200 with status ok', async () => {
    const body = await $fetch<Record<string, unknown>>('/api/health')
    expect(body.status).toBe('ok')
    expect(body.timestamp).toBeTruthy()
    expect(body.uptime).toBeGreaterThan(0)
  })

  it('includes database status', async () => {
    const body = await $fetch<{ database: { connected: boolean } }>('/api/health')
    expect(body.database).toBeDefined()
    // D1 may or may not be connected in test env — just check the key exists
    expect('connected' in body.database).toBe(true)
  })
})