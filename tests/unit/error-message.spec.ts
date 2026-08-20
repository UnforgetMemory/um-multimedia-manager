import { test, expect } from '@playwright/test'
import { errorMessage } from '@/utils/error-message'

/**
 * errorMessage — exception → safe string narrowing.
 *
 * Used across every SW handler to turn unknown thrown values into a
 * user-safe log/response string. Locks the boundary behaviour for the
 * value shapes that actually occur in catch blocks.
 */
test.describe('errorMessage', () => {
  test('Error instance → its message', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })

  test('string passes through unchanged', () => {
    expect(errorMessage('raw failure')).toBe('raw failure')
  })

  test('undefined → "undefined" (never returns empty)', () => {
    expect(errorMessage(undefined)).toBe('undefined')
  })

  test('null → "null"', () => {
    expect(errorMessage(null)).toBe('null')
  })

  test('number → decimal string', () => {
    expect(errorMessage(42)).toBe('42')
  })

  test('object with message property → its message', () => {
    expect(errorMessage({ message: 'obj message' })).toBe('obj message')
  })

  test('plain object without message → String() fallback', () => {
    expect(errorMessage({})).toBe('[object Object]')
  })
})