/**
 * PT 模块共享类型定义
 */

/** 列表页处理器上下文 */
export interface HandlerContext {
  debug: (...args: any[]) => void
  idCache: CachedIdSets | null
  cacheTimestamp: number
}

/** 缓存的 ID 集合 */
export interface CachedIdSets {
  movieDoubanIds: Set<string>
  musicDoubanIds: Set<string>
  imdbIds: Set<string>
}

/** 列表页处理器接口 */
export interface ListPageHandler {
  match(url: string): boolean
  getSelector(): string
  contentCheck?(el: Element): boolean
  process(context: HandlerContext): Promise<void>
  setup?(target: HTMLElement, process: () => Promise<void>): void
  teardown?(): void
}

/**
 * 站点扫描配置
 */
export interface SiteScannerConfig {
  domain: string
  isListPage: (url: string) => boolean
  isDetailPage: (url: string) => boolean
  extractDetailUrl: (row: Element) => string | null
  extractIdsFromDetail: (doc: Document) => { doubanId?: string; imdbId?: string }
  extractIdsFromRow?: (row: Element) => { doubanId?: string; imdbId?: string }
  rowSelector: string
  skipRowSelector?: string
  enableBackgroundScan: boolean
  scanConcurrency: number
  scanDelayRange: [number, number]
}
