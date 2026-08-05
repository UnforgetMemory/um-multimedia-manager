import { test, expect } from '@playwright/test'
import {
  storeKey,
  calcThreshold,
  parseYoutubeVideoId,
  parseYoutubeSearchId,
  parseBilibiliBvid,
  parseBilibiliBvidFromHref,
} from '@/entrypoints/content/ui/video-overlay'

/**
 * 共享 video-overlay 模块纯函数单元测试（T18，决策-3）。
 *
 * 锁定 bilibili ↔ youtube 抽取前逐字一致的行为：
 * - storeKey：decision-3 规定统一 'movie::' 前缀（v13 迁移已归一化 store key）
 * - calcThreshold：两端 VideoProgressTracker 共用同一套按时长分档阈值
 * - URL 解析：youtube /watch?v= + bilibili /video/BV 与 /list/?bvid= 识别
 */

test.describe('storeKey (decision-3: movie:: prefix)', () => {
  test('bilibili bvid → movie::BV…', () => {
    expect(storeKey('BV1xx411c7mD')).toBe('movie::BV1xx411c7mD')
  })

  test('youtube videoId → movie::<id>', () => {
    expect(storeKey('dQw4w9WgXcQ')).toBe('movie::dQw4w9WgXcQ')
  })

  test('idempotent under normalizeVideoKey (v13 migration)', () => {
    // normalizeVideoKey 是幂等迁移函数；storeKey 产出的 key 必须保持 movie:: 前缀
    expect(storeKey('BV1xx411c7mD').startsWith('movie::')).toBe(true)
  })
})

test.describe('calcThreshold', () => {
  test('<=0 / <5min → 55', () => {
    expect(calcThreshold(0)).toBe(55)
    expect(calcThreshold(1)).toBe(55)
    expect(calcThreshold(120)).toBe(55)
    expect(calcThreshold(299)).toBe(55)
  })

  test('5-15min → 60', () => {
    expect(calcThreshold(300)).toBe(60)
    expect(calcThreshold(899)).toBe(60)
  })

  test('15-45min → 65', () => {
    expect(calcThreshold(900)).toBe(65)
    expect(calcThreshold(2699)).toBe(65)
  })

  test('45-60min → 70', () => {
    expect(calcThreshold(2700)).toBe(70)
    expect(calcThreshold(3599)).toBe(70)
  })

  test('>60min → 70', () => {
    expect(calcThreshold(3600)).toBe(70)
    expect(calcThreshold(7200)).toBe(70)
  })
})

test.describe('parseYoutubeVideoId (card href → 11 位 videoId)', () => {
  test('相对 /watch?v= 链接', () => {
    expect(parseYoutubeVideoId('/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  test('完整 URL + 多余参数', () => {
    expect(parseYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123')).toBe('dQw4w9WgXcQ')
  })

  test('v= 参数在中间位置', () => {
    expect(parseYoutubeVideoId('https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ&t=10s')).toBe('dQw4w9WgXcQ')
  })

  test('shorts 链接（无 v= 参数）→ null', () => {
    expect(parseYoutubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share')).toBeNull()
  })

  test('id 长度非法 → null', () => {
    expect(parseYoutubeVideoId('/watch?v=short')).toBeNull()
    expect(parseYoutubeVideoId('/watch?v=1234567890123')).toBeNull()
  })

  test('无 v 参数 → null', () => {
    expect(parseYoutubeVideoId('/watch?list=PL123')).toBeNull()
    expect(parseYoutubeVideoId('')).toBeNull()
  })
})

test.describe('parseYoutubeSearchId (location.search → 11 位 videoId)', () => {
  test('裸 ?v=11 字符', () => {
    expect(parseYoutubeSearchId('?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  test('与其他参数混排', () => {
    expect(parseYoutubeSearchId('?list=PL123&v=dQw4w9WgXcQ&t=30s')).toBe('dQw4w9WgXcQ')
  })

  test('非法/缺失 → null', () => {
    expect(parseYoutubeSearchId('?v=abc')).toBeNull()
    expect(parseYoutubeSearchId('?list=PL123')).toBeNull()
    expect(parseYoutubeSearchId('')).toBeNull()
  })
})

test.describe('parseBilibiliBvid (location.pathname + search)', () => {
  test('/video/BVxxx 标准详情页', () => {
    expect(parseBilibiliBvid('/video/BV1xx411c7mD')).toBe('BV1xx411c7mD')
    expect(parseBilibiliBvid('/video/BV1xx411c7mD/')).toBe('BV1xx411c7mD')
  })

  test('/list/ 合集页取 ?bvid= 参数', () => {
    expect(parseBilibiliBvid('/list/pl123456', '?bvid=BV1xx411c7mD')).toBe('BV1xx411c7mD')
  })

  test('/list/ 无 bvid 参数 → null', () => {
    expect(parseBilibiliBvid('/list/pl123456')).toBeNull()
    expect(parseBilibiliBvid('/list/pl123456', '?bvid=notabvid')).toBeNull()
  })

  test('非视频路径 → null', () => {
    expect(parseBilibiliBvid('/')).toBeNull()
    expect(parseBilibiliBvid('/video/')).toBeNull()
    expect(parseBilibiliBvid('/search/BV1xx411c7mD')).toBeNull()
  })
})

test.describe('parseBilibiliBvidFromHref (推荐位卡片链接)', () => {
  test('相对 /video/BVxxx href（带查询串）', () => {
    expect(parseBilibiliBvidFromHref('/video/BV1xx411c7mD?from=search')).toBe('BV1xx411c7mD')
  })

  test('绝对 URL href', () => {
    expect(parseBilibiliBvidFromHref('https://www.bilibili.com/video/BV1xx411c7mD/?spm_id_from=333.999')).toBe('BV1xx411c7mD')
  })

  test('非 /video/ 链接 → null', () => {
    expect(parseBilibiliBvidFromHref('https://www.bilibili.com/list/pl123456')).toBeNull()
    expect(parseBilibiliBvidFromHref('https://www.bilibili.com/')).toBeNull()
  })
})
