/**
 * Data Scheduler — core type definitions
 *
 * Shared types, constants, and configurator interfaces for the
 * priority-queue / rate-limiter / retry-policy / monitor stack.
 */

// ==================== Priority ====================

export type PriorityLevel = 'HIGH' | 'MEDIUM' | 'LOW'

export const PRIORITY_ORDER: Record<PriorityLevel, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
}

// ==================== Task Types ====================

export interface SchedulerTask<T = unknown> {
  id: string
  priority: PriorityLevel
  /** The actual async work to perform */
  operation: () => Promise<T>
  /** Per-call timeout in ms (default: DEFAULT_TASK_TIMEOUT) */
  timeout: number
  /** ISO timestamp when the task was created */
  createdAt: number
}

export interface QueuedTask<T = unknown> extends SchedulerTask<T> {
  enqueuedAt: number
  attempts: number
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

// ==================== Scheduler Options ====================

export interface ScheduleOptions {
  priority?: PriorityLevel
  /** Task-level timeout in ms */
  timeout?: number
  /** If provided, results are cached under this key (caller opts in) */
  cacheKey?: string
  /** TTL for the cached entry in ms (default: CACHE_TTL) */
  cacheTTL?: number
  /** If true, invalidate (delete) the cache entry before executing */
  invalidateCache?: boolean
  /** Store name for cache key prefixing (optional, for namespacing) */
  storeName?: string
}

// ==================== Rate Limiter ====================

export interface RateLimitConfig {
  /** Max requests allowed per second */
  maxRequestsPerSecond: number
  /** Max burst size (how many tokens can accumulate) */
  burstSize: number
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxRequestsPerSecond: 10,
  burstSize: 5,
}

// ==================== Retry Policy ====================

export interface RetryConfig {
  maxRetries: number
  /** Base delay in ms for exponential backoff */
  baseDelay: number
  /** Max delay cap in ms */
  maxDelay: number
  /** If true, adds ±25% random jitter to each delay */
  jitter: boolean
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10_000,
  jitter: true,
}

/** Called before each retry attempt (attempt 1 = first retry) */
export type RetryCallback = (attempt: number, error: unknown) => void

// ==================== Monitor ====================

export interface MonitorMetrics {
  responseTime: { p50: number; p95: number; p99: number }
  errorRate: number
  cacheHitRate: number
  queueDepth: number
  totalRequests: number
  totalErrors: number
  totalCacheHits: number
  totalCacheMisses: number
}

export type SchedulerEventType =
  | 'task:completed'
  | 'task:failed'
  | 'task:retrying'
  | 'task:timeout'
  | 'cache:hit'
  | 'cache:miss'
  | 'rate:limited'

export interface SchedulerEvent {
  type: SchedulerEventType
  taskId?: string
  storeName?: string
  key?: string
  duration?: number
  attempt?: number
  error?: unknown
  timestamp: number
}

export type EventListener = (event: SchedulerEvent) => void

// ==================== Cache ====================

export interface CacheEntry<T = unknown> {
  data: T
  timestamp: number
  ttl: number
}

// ==================== Constants ====================

export const MAX_QUEUE_SIZE = 1000
export const DEFAULT_TASK_TIMEOUT = 8_000
export const CACHE_TTL = 5_000
export const DEFAULT_PRIORITY: PriorityLevel = 'MEDIUM'