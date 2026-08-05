import { test, expect } from '@playwright/test'
import {
  buildNeoDBLinkedIds,
  buildNeoDBSyncRecord,
  buildNeoDBSyncTargets,
  decideNeoDBTargetSync,
  mergeTargetLinkedIds,
  platformLabel,
  shouldSaveNeoDBPrimary,
  type NeoDBTargetSyncDecision,
} from '@/entrypoints/content/handlers/neodb-sync'
import type { StoreRecord, UrlIdentity } from '@/types'

/**
 * T12（audit §2.3）— neodb.ts 内联跨平台同步的行为特征锁定（characterization）。
 *
 * 在将 onSave 内联 sync 改写为 RecordService.syncRecord 委托之前，
 * 用本 spec 锁定**旧内联规则**（抽取自 neodb.ts onSave 的纯函数）：
 *
 *  R1  linkedIds 始终写回目标记录（含已完成目标 —— 仅更新关联）
 *  R2  目标不存在 → create（使用 NeoDB 状态/评分，页面未完成也用页面评分）
 *  R3  目标存在且未完成 → update（页面未完成时保留目标 status，空评分才填充）
 *  R4  目标存在且已完成 → links-only（不覆盖状态/评分）
 *  R5  不覆盖已存在的目标评分（existing.rating 有值时不写 pageRating）
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

test.describe('mergeTargetLinkedIds', () => {
  test('目标无 linkedIds → 仅 neodb 回链', () => {
    expect(mergeTargetLinkedIds(undefined, NEO_KEY)).toEqual({ neodb: NEO_KEY })
  })

  test('目标已有 linkedIds → 合并且保留，neodb 键覆盖', () => {
    expect(
      mergeTargetLinkedIds({ douban: 'movie::1292052', neodb: 'movie::stale' }, NEO_KEY),
    ).toEqual({ douban: 'movie::1292052', neodb: NEO_KEY })
  })
})

test.describe('decideNeoDBTargetSync (R1–R5 目标决策)', () => {
  const base = { targetUrl: TARGET_URL, neodbKey: NEO_KEY, now: NOW, comment: undefined }

  function decision(existing: Pick<StoreRecord, 'status' | 'rating' | 'comment' | 'linkedIds'> | null, isPageDone: boolean, pageRating = 8.5): NeoDBTargetSyncDecision {
    return decideNeoDBTargetSync({ ...base, existing, isPageDone, pageRating })
  }

  test('R2: 目标不存在 + 页面已完成 → create（status 2 + 页面评分 + neodb 回链）', () => {
    const d = decision(null, true)
    expect(d).toEqual({
      action: 'create',
      record: {
        url: TARGET_URL,
        status: 2,
        rating: 8.5,
        comment: '',
        updatedAt: NOW,
        linkedIds: { neodb: NEO_KEY },
      },
    })
  })

  test('R2: 目标不存在 + 页面未完成 → create（status 0，但评分仍为页面评分）', () => {
    const d = decision(null, false)
    expect(d).toMatchObject({ action: 'create', record: { status: 0, rating: 8.5, linkedIds: { neodb: NEO_KEY } } })
  })

  test('R3+F4: 目标未完成(status 1) + 页面未完成 → update 且保留目标 status', () => {
    const d = decision({ status: 1, rating: 0, comment: 'old', linkedIds: {} }, false)
    expect(d).toEqual({
      action: 'update',
      updates: {
        status: 1,
        rating: 8.5,
        comment: 'old',
        updatedAt: NOW,
        linkedIds: { neodb: NEO_KEY },
      },
    })
  })

  test('R3: 目标未完成(status 1) + 页面已完成 → update 且 status 提升为 2', () => {
    const d = decision({ status: 1, rating: 0, comment: '', linkedIds: {} }, true)
    expect(d).toMatchObject({ action: 'update', updates: { status: 2, rating: 8.5 } })
  })

  test('R5: 目标未完成但已有评分 → 不覆盖目标评分', () => {
    const d = decision({ status: 1, rating: 6, comment: '', linkedIds: {} }, false)
    expect(d).toMatchObject({ action: 'update', updates: { status: 1, rating: 6 } })
  })

  test('R3: 目标未完成且无任何变化 → skip', () => {
    const d = decision(
      { status: 1, rating: 8.5, comment: '', linkedIds: { neodb: NEO_KEY } },
      false,
    )
    expect(d).toEqual({ action: 'skip' })
  })

  test('R3: linkedIds 变化触发 update（即使 status/rating 未变）', () => {
    const d = decision(
      { status: 1, rating: 8.5, comment: '', linkedIds: { douban: 'movie::1292052' } },
      false,
    )
    expect(d).toEqual({
      action: 'update',
      updates: {
        status: 1,
        rating: 8.5,
        comment: '',
        updatedAt: NOW,
        linkedIds: { douban: 'movie::1292052', neodb: NEO_KEY },
      },
    })
  })

  test('R1: 目标已完成且缺 neodb 回链 → links-only（刷新关联，不碰状态/评分）', () => {
    const d = decision({ status: 2, rating: 8, comment: '', linkedIds: { douban: 'movie::1292052' } }, true)
    expect(d).toEqual({ action: 'links-only', linkedIds: { douban: 'movie::1292052', neodb: NEO_KEY } })
  })

  test('R1: 目标已完成且回链已存在 → skip', () => {
    const d = decision(
      { status: 2, rating: 8, comment: '', linkedIds: { douban: 'movie::1292052', neodb: NEO_KEY } },
      true,
    )
    expect(d).toEqual({ action: 'skip' })
  })
})

test.describe('platformLabel', () => {
  test('imdb/tmdb/其他 平台展示名', () => {
    expect(platformLabel('imdb')).toBe('IMDb')
    expect(platformLabel('tmdb')).toBe('TMDB')
    expect(platformLabel('douban')).toBe('豆瓣')
  })
})
