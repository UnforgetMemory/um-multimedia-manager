import { test, expect } from '@playwright/test'
import { buildCrossPlatformTargets } from '@/content/douban/shared/cross-platform-links'

/**
 * buildCrossPlatformTargets 纯函数特征测试（2026-08-29，Wave 2.2）。
 *
 * 跨平台同步委托（useCrossPlatformSync → Store.dbSyncPageRecord）依赖
 * 该 helper 把 douban 记录的 linkedIds 映射为领域同步引擎的 target 列表。
 * 锁定 URL 构建与过滤规则，防委托重构时静默漂移。
 */

test.describe('buildCrossPlatformTargets', () => {
  test('imdb 链接 → 完整 imdb title URL', () => {
    const targets = buildCrossPlatformTargets({ imdb: 'movie::tt0111161' })
    expect(targets).toEqual([
      { platform: 'imdb', key: 'movie::tt0111161', url: 'https://www.imdb.com/title/tt0111161/' },
    ])
  })

  test('tmdb movie 链接 → /movie/ 路径', () => {
    const targets = buildCrossPlatformTargets({ tmdb: 'movie::550' })
    expect(targets).toEqual([
      { platform: 'tmdb', key: 'movie::550', url: 'https://www.themoviedb.org/movie/550/' },
    ])
  })

  test('tmdb tv 链接 → /tv/ 路径（URL 与 key 类型段一致）', () => {
    const targets = buildCrossPlatformTargets({ tmdb: 'tv::1399' })
    expect(targets).toEqual([
      { platform: 'tmdb', key: 'tv::1399', url: 'https://www.themoviedb.org/tv/1399/' },
    ])
  })

  test('imdb + tmdb 同时存在 → 两目标均产出（imdb 在前）', () => {
    const targets = buildCrossPlatformTargets({ imdb: 'movie::tt0111161', tmdb: 'movie::550' })
    expect(targets.map((t) => t.platform)).toEqual(['imdb', 'tmdb'])
    expect(targets.map((t) => t.url)).toEqual([
      'https://www.imdb.com/title/tt0111161/',
      'https://www.themoviedb.org/movie/550/',
    ])
  })

  test('无 imdb/tmdb 链接 → 空数组（neodb 等其它键被忽略）', () => {
    expect(buildCrossPlatformTargets({})).toEqual([])
    expect(buildCrossPlatformTargets({ neodb: 'movie::c1' })).toEqual([])
  })

  test('缺失的链接跳过、存在的正常产出', () => {
    const targets = buildCrossPlatformTargets({ tmdb: 'movie::550' })
    expect(targets).toHaveLength(1)
    expect(targets[0].platform).toBe('tmdb')
  })
})
