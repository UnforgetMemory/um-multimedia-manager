import { vi } from 'vitest'

// Mock D1Database for server utils
vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as Record<string, unknown>),
  }
})