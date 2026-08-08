import { test, expect } from '@playwright/test'
import {
  buildNeoDBLinkedIds,
  buildNeoDBSyncRecord,
  buildNeoDBSyncTargets,
  platformLabel,
  shouldSaveNeoDBPrimary,
} from '@/entrypoints/content/handlers/neodb-sync'
import type { StoreRecord, UrlIdentity } from '@/types'

/**
 * T12（audit §2.3）— neodb.ts onSave 委托 RecordService 前的输入构建器特征锁定。
 *
 * 旧内联目标决策（R1–R5）随 decideNeoDBTargetSync / mergeTargetLinkedIds 删除
 * （2026-08-07 C1 清理），其行为规则现由 tests/unit/record-service-sync.spec.ts
 * 直接锁定（create-if-missing / update-if-not-watched / skip-if-watched）。
 *
 *  R6  主记录保存门控：页面已完成→status/rating/linkedIds 变化才存；
 *      页面未完成→仅记录不存在或 linkedIds 变化才存
 */

const NOW = '2026-08-03T00:00:00.000Z'

const IDENTITY: UrlIdentity = {
  platform: 'neodb',
  type: 'movie',
  providerId: 'catalog-1',
  url: 'https://neodb.social/movie/catalog-1/',
}
const NEO_KEY = 'movie::catalog-1'
const TARGET_URL = 'https://movie.douban.com/subject/1292052/'

const LINKS = [
  { provider: 'douban', url: 'https://movie.douban.com/subject/1292052/' },
  { provider: 'imdb', url: 'https://www.imdb.com/title/tt0111161/' },
  { provider: 'tmdb', url: 'https://www.themoviedb.org/movie/550/' },
]

const DONE_PAGE = { status: 'done', rating: 8.5 }
const NONE_PAGE = { status: 'none', rating: 8.5 }

test.describe('buildNeoDBLinkedIds', () => {
  test('R: 解析 douban/imdb/tmdb 链接为 type::providerId 映射', () => {
    expect(buildNeoDBLinkedIds(LINKS)).toEqual({
      douban: 'movie::1292052',
      imdb: 'movie::tt0111161',
      tmdb: 'movie::550',
    })
  })

  test('无法解析的 URL 被跳过', () => {
    expect(
      buildNeoDBLinkedIds([
        { provider: 'douban', url: 'https://movie.douban.com/subject/1292052/' },
        { provider: 'imdb', url: 'https://example.com/not-an-imdb-link' },
      ]),
    ).toEqual({ douban: 'movie::1292052' })
  })

  test('空列表 → 空对象', () => {
    expect(buildNeoDBLinkedIds([])).toEqual({})
  })
})

test.describe('buildNeoDBSyncTargets', () => {
  test('解析为 RecordService SyncTarget（platform/key/url）', () => {
    expect(buildNeoDBSyncTargets(LINKS)).toEqual([
      { platform: 'douban', key: 'movie::1292052', url: 'https://movie.douban.com/subject/1292052/' },
      { platform: 'imdb', key: 'movie::tt0111161', url: 'https://www.imdb.com/title/tt0111161/' },
      { platform: 'tmdb', key: 'movie::550', url: 'https://www.themoviedb.org/movie/550/' },
    ])
  })

  test('无法解析的 URL 被跳过', () => {
    expect(
      buildNeoDBSyncTargets([{ provider: 'imdb', url: 'https://example.com/garbage' }]),
    ).toEqual([])
  })

  test('空列表 → 空数组', () => {
    expect(buildNeoDBSyncTargets([])).toEqual([])
  })
})

test.describe('buildNeoDBSyncRecord', () => {
  const localRecord: StoreRecord = {
    url: IDENTITY.url,
    status: 1,
    rating: 4,
    comment: 'hi',
    updatedAt: '2020-01-01T00:00:00.000Z',
    linkedIds: { douban: 'movie::1292052' },
  }

  test('页面已完成 → status 2 + pageState.rating，保留 comment/linkedIds', () => {
    const record = buildNeoDBSyncRecord({
      identity: IDENTITY,
      pageState: DONE_PAGE,
      localRecord,
      isPageDone: true,
      linkedIds: { douban: 'movie::1292052' },
      now: NOW,
    })
    expect(record).toEqual({
      url: IDENTITY.url,
      status: 2,
      rating: 8.5,
      comment: 'hi',
      updatedAt: NOW,
      linkedIds: { douban: 'movie::1292052' },
    })
  })

  test('页面未完成且无本地记录 → status 0 / rating 0 / comment 空串', () => {
    const record = buildNeoDBSyncRecord({
      identity: IDENTITY,
      pageState: NONE_PAGE,
      localRecord: null,
      isPageDone: false,
      linkedIds: {},
      now: NOW,
    })
    expect(record).toEqual({
      url: IDENTITY.url,
      status: 0,
      rating: 0,
      comment: '',
      updatedAt: NOW,
      linkedIds: {},
    })
  })

  test('页面未完成但有本地记录 → 保留本地 status/rating/comment', () => {
    const record = buildNeoDBSyncRecord({
      identity: IDENTITY,
      pageState: NONE_PAGE,
      localRecord,
      isPageDone: false,
      linkedIds: { douban: 'movie::1292052' },
      now: NOW,
    })
    expect(record.status).toBe(1)
    expect(record.rating).toBe(4)
    expect(record.comment).toBe('hi')
  })
})

test.describe('shouldSaveNeoDBPrimary (R6 主记录保存门控)', () => {
  const base = { pageState: DONE_PAGE, linkedIds: { douban: 'movie::1292052' } }

  test('已完成页 + 无本地记录 → 保存', () => {
    expect(shouldSaveNeoDBPrimary({ ...base, isPageDone: true, localRecord: null })).toBe(true)
  })

  test('已完成页 + 本地已同步（status/rating/links 均一致）→ 跳过', () => {
    expect(
      shouldSaveNeoDBPrimary({
        ...base,
        isPageDone: true,
        localRecord: { url: IDENTITY.url, status: 2, rating: 8.5, updatedAt: NOW, linkedIds: { douban: 'movie::1292052' } },
      }),
    ).toBe(false)
  })

  test('已完成页 + status 变化 → 保存', () => {
    expect(
      shouldSaveNeoDBPrimary({
        ...base,
        isPageDone: true,
        localRecord: { url: IDENTITY.url, status: 1, rating: 8.5, updatedAt: NOW, linkedIds: { douban: 'movie::1292052' } },
      }),
    ).toBe(true)
  })

  test('已完成页 + rating 变化 → 保存', () => {
    expect(
      shouldSaveNeoDBPrimary({
        ...base,
        isPageDone: true,
        localRecord: { url: IDENTITY.url, status: 2, rating: 6, updatedAt: NOW, linkedIds: { douban: 'movie::1292052' } },
      }),
    ).toBe(true)
  })

  test('已完成页 + 仅 linkedIds 变化 → 保存', () => {
    expect(
      shouldSaveNeoDBPrimary({
        pageState: DONE_PAGE,
        isPageDone: true,
        localRecord: { url: IDENTITY.url, status: 2, rating: 8.5, updatedAt: NOW, linkedIds: { imdb: 'movie::tt0111161' } },
        linkedIds: { douban: 'movie::1292052', imdb: 'movie::tt0111161' },
      }),
    ).toBe(true)
  })

  test('未完成页 + 无本地记录 → 保存', () => {
    expect(
      shouldSaveNeoDBPrimary({ pageState: NONE_PAGE, isPageDone: false, localRecord: null, linkedIds: {} }),
    ).toBe(true)
  })

  test('未完成页 + 本地存在且 linkedIds 一致 → 跳过', () => {
    expect(
      shouldSaveNeoDBPrimary({
        pageState: NONE_PAGE,
        isPageDone: false,
        localRecord: { url: IDENTITY.url, status: 0, rating: 0, updatedAt: NOW, linkedIds: { douban: 'movie::1292052' } },
        linkedIds: { douban: 'movie::1292052' },
      }),
    ).toBe(false)
  })

  test('未完成页 + 仅 linkedIds 变化 → 保存（确保关联不丢失）', () => {
    expect(
      shouldSaveNeoDBPrimary({
        pageState: NONE_PAGE,
        isPageDone: false,
        localRecord: { url: IDENTITY.url, status: 0, rating: 0, updatedAt: NOW, linkedIds: { douban: 'movie::1292052' } },
        linkedIds: { douban: 'movie::1292052', tmdb: 'movie::550' },
      }),
    ).toBe(true)
  })
})

test.describe('platformLabel', () => {
  test('imdb/tmdb/其他 平台展示名', () => {
    expect(platformLabel('imdb')).toBe('IMDb')
    expect(platformLabel('tmdb')).toBe('TMDB')
    expect(platformLabel('douban')).toBe('豆瓣')
  })
})
