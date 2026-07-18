import { describe, it, expect } from 'vitest'
import { apiSuccess, apiError, parsePagination } from '../../../server/utils/api'

function mockEvent(query: Record<string, string> = {}): any {
  const url = new URL('http://localhost/api/test')
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  const fullUrl = url.pathname + url.search
  return {
    path: fullUrl,
    node: { req: { url: fullUrl, headers: { host: 'localhost' } } },
    headers: new Headers(),
    context: {},
  }
}

describe('apiSuccess', () => {
  it('returns success: true with data', () => {
    expect(apiSuccess({ id: 1 })).toEqual({ success: true, data: { id: 1 } })
  })
  it('handles null data', () => {
    expect(apiSuccess(null)).toEqual({ success: true, data: null })
  })
  it('handles array data', () => {
    expect(apiSuccess([1, 2, 3])).toEqual({ success: true, data: [1, 2, 3] })
  })
})

describe('apiError', () => {
  it('returns error with code and message', () => {
    const r = apiError('NOT_FOUND', 'Resource not found')
    expect(r).toEqual({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found', details: undefined } })
  })
  it('includes optional details', () => {
    const r = apiError('VALIDATION', 'Invalid input', { field: 'email' })
    expect(r.error.details).toEqual({ field: 'email' })
  })
})

describe('parsePagination', () => {
  it('returns default values', () => {
    expect(parsePagination(mockEvent({}))).toEqual({ page: 1, limit: 20, offset: 0 })
  })
  it('parses custom page and limit', () => {
    expect(parsePagination(mockEvent({ page: '3', limit: '10' }))).toEqual({ page: 3, limit: 10, offset: 20 })
  })
  it('clamps page to minimum 1', () => {
    const r = parsePagination(mockEvent({ page: '0', limit: '20' }))
    expect(r.page).toBe(1); expect(r.offset).toBe(0)
  })
  it('clamps limit to maximum 100', () => {
    expect(parsePagination(mockEvent({ page: '1', limit: '999' })).limit).toBe(100)
  })
  it('clamps limit to minimum 1', () => {
    expect(parsePagination(mockEvent({ page: '1', limit: '0' })).limit).toBe(1)
  })
})