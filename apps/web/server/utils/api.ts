import type { H3Event, H3Error } from 'h3'
import { createError, getQuery, getRouterParam } from 'h3'

// ── Typed API Response ──────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError

// ── Response helpers ────────────────────────────────────────────

export function apiSuccess<T>(data: T): ApiSuccess<T> {
  return { success: true, data }
}

export function apiError(
  code: string,
  message: string,
  details?: unknown,
): ApiError {
  return { success: false, error: { code, message, details } }
}

// ── HTTP error helpers ──────────────────────────────────────────

export function notFound(message = 'Resource not found'): never {
  throw createError({ statusCode: 404, statusMessage: 'Not Found', message })
}

export function badRequest(message: string, details?: unknown): never {
  throw createError({
    statusCode: 400,
    statusMessage: 'Bad Request',
    message,
    data: details,
  })
}

export function unauthorized(message = 'Unauthorized'): never {
  throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message })
}

export function forbidden(message = 'Forbidden'): never {
  throw createError({ statusCode: 403, statusMessage: 'Forbidden', message })
}

export function serverError(message = 'Internal server error', details?: unknown): never {
  throw createError({
    statusCode: 500,
    statusMessage: 'Internal Server Error',
    message,
    data: details,
  })
}

// ── Error handler ───────────────────────────────────────────────

export function handleApiError(error: unknown): ApiError {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const e = error as H3Error
    return apiError(
      `HTTP_${e.statusCode}`,
      e.message || e.statusMessage || 'Unknown error',
      e.data,
    )
  }

  if (error instanceof Error) {
    return apiError('INTERNAL_ERROR', error.message)
  }

  return apiError('UNKNOWN_ERROR', 'An unexpected error occurred')
}

// ── Request validation ──────────────────────────────────────────

export function requireParam(event: H3Event, name: string): string {
  const value = getRouterParam(event, name)
  if (!value) {
    throw badRequest(`Missing required parameter: ${name}`)
  }
  return value
}

export function requireQueryParam(event: H3Event, name: string): string {
  const query = getQuery(event)
  const value = query[name]
  if (!value || typeof value !== 'string') {
    throw badRequest(`Missing required query parameter: ${name}`)
  }
  return value
}

export function parsePagination(event: H3Event) {
  const query = getQuery(event)
  const rawPage = Number(query.page)
  const rawLimit = Number(query.limit)
  const page = Math.max(1, Number.isNaN(rawPage) ? 1 : rawPage)
  const limit = Math.min(Math.max(1, Number.isNaN(rawLimit) ? 20 : rawLimit), 100)
  const offset = (page - 1) * limit
  return { page, limit, offset }
}