import { describe, it, expect, vi } from 'vitest'
import { applyStatements } from '../../../server/utils/migrate'

describe('applyStatements', () => {
  it('returns success when all statements execute', async () => {
    const run = vi.fn().mockResolvedValue({ success: true })
    const result = await applyStatements(run)
    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    expect(run).toHaveBeenCalledTimes(13) // 13 DDL statements
  })

  it('returns error when a statement fails', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('table already exists'))
    const result = await applyStatements(run)
    expect(result.success).toBe(false)
    expect(result.error).toBe('table already exists')
  })
})