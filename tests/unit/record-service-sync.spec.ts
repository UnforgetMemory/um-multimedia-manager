import { test, expect } from '@playwright/test'
import { RecordService } from '@/domain/record/RecordService'
import type { IRecordRepository } from '@/domain/record/IRecordRepository'
import { StoreRecord } from '@/domain/record/StoreRecord'
import { UrlResolverBuilder } from '@/shared/identity'
import type { StoreRecordSnapshot } from '@/types'

/**
 * RecordService.syncRecord 直接规则测试（C1, 2026-08-07）。
 *
 * 此前 syncRecord 规则（create-if-missing / update-if-not-watched /
 * skip-if-watched）零直接测试——旧内联规则的 340L 特征测试锁的是
 * 已被删除的死影子（decideNeoDBTargetSync / mergeTargetLinkedIds）。
 * 本 spec 用内存 fake repo 直接锁定活实现的 4 条规则。
 */

class MemoryRepo implements IRecordRepository {
  private store = new Map<string, StoreRecord>()

  constructor(seed?: Array<[string, string, StoreRecord]>) {
    for (const [storeName, key, record] of seed ?? []) {
      this.store.set(`${storeName}::${key}`, record)
    }
  }

  async findByKey(storeName: string, key: string): Promise<StoreRecord | null> {
    return this.store.get(`${storeName}::${key}`) ?? null
  }

  /** Mirror RecordRepositoryAdapter.save: derive key from the record URL. */
  async save(storeName: string, record: StoreRecord): Promise<void> {
    const identity = UrlResolverBuilder.fromUrl(record.url)
    if (!identity || !identity.providerId) {
      throw new Error(`Cannot resolve storage key for URL: ${record.url}`)
    }
    this.store.set(`${storeName}::${identity.type}::${identity.providerId}`, record)
  }

  snapshot(storeName: string, key: string): StoreRecordSnapshot | null {
    return this.store.get(`${storeName}::${key}`)?.toSnapshot() ?? null
  }
}

function doneRecord(url: string, rating = 8.5, comment = ''): StoreRecord {
  return StoreRecord.fromSnapshot({
    url,
    status: 2,
    rating,
    comment,
    updatedAt: '2026-08-07T00:00:00.000Z',
    linkedIds: {},
    schemaVersion: 1,
    recordVersion: 1,
  })
}

function wishRecord(url: string, rating = 0, comment = ''): StoreRecord {
  return StoreRecord.fromSnapshot({
    url,
    status: 1,
    rating,
    comment,
    updatedAt: '2026-08-07T00:00:00.000Z',
    linkedIds: {},
    schemaVersion: 1,
    recordVersion: 1,
  })
}

const NEO_RECORD = doneRecord('https://neodb.social/movie/c1/')
const DOUBAN_TARGET = { platform: 'douban', key: 'movie::1292052', url: 'https://movie.douban.com/subject/1292052/' }

test.describe('RecordService.syncRecord — 主记录规则', () => {
  test('规则1: 主记录不存在 → 写入 + changed + syncedPlatforms', async () => {
    const repo = new MemoryRepo()
    const svc = new RecordService(repo)

    const result = await svc.syncRecord('neodb', 'movie::c1', NEO_RECORD)

    expect(result.changed).toBe(true)
    expect(result.syncedPlatforms).toEqual(['neodb'])
    expect(repo.snapshot('neodb', 'movie::c1')?.status).toBe(2)
  })

  test('规则1: 主记录存在且 status 变化 → merge 后写入（linkedIds 并集）', async () => {
    const existing = wishRecord('https://neodb.social/movie/c1/')
    const repo = new MemoryRepo([['neodb', 'movie::c1', existing]])
    const svc = new RecordService(repo)

    const result = await svc.syncRecord('neodb', 'movie::c1', NEO_RECORD)

    expect(result.changed).toBe(true)
    const saved = repo.snapshot('neodb', 'movie::c1')
    expect(saved?.status).toBe(2)
    expect(saved?.rating).toBe(8.5)
  })

  test('规则1: 主记录存在且无变化 → 不写主记录', async () => {
    const repo = new MemoryRepo([['neodb', 'movie::c1', NEO_RECORD]])
    const svc = new RecordService(repo)

    const result = await svc.syncRecord('neodb', 'movie::c1', NEO_RECORD)

    expect(result.changed).toBe(false)
    expect(result.syncedPlatforms).toEqual([])
  })

  test('规则1: 主记录 status/rating/comment 不变但新增链接 → linkedIds 并集落库', async () => {
    // umreview D1 回归锁：仅链接变化时主记录必须写入，否则目标记录拿到
    // 回链而主记录丢失正向链接（不对称漂移）。
    const existing = doneRecord('https://movie.douban.com/subject/1292052/', 9)
    const repo = new MemoryRepo([['douban', 'movie::1292052', existing]])
    const svc = new RecordService(repo)

    const incoming = StoreRecord.fromSnapshot({
      ...existing.toSnapshot(),
      linkedIds: { imdb: 'movie::tt0111161' },
    })
    const result = await svc.syncRecord('douban', 'movie::1292052', incoming)

    expect(result.changed).toBe(true)
    expect(result.syncedPlatforms).toEqual(['douban'])
    expect(repo.snapshot('douban', 'movie::1292052')?.linkedIds).toEqual({ imdb: 'movie::tt0111161' })
  })

  test('规则1: 主记录存在但 rating 变化 → 触发写入', async () => {
    const existing = doneRecord('https://neodb.social/movie/c1/', 6)
    const repo = new MemoryRepo([['neodb', 'movie::c1', existing]])
    const svc = new RecordService(repo)

    const result = await svc.syncRecord('neodb', 'movie::c1', NEO_RECORD)

    expect(result.changed).toBe(true)
    expect(repo.snapshot('neodb', 'movie::c1')?.rating).toBe(8.5)
  })
})

test.describe('RecordService.syncRecord — 关联平台规则', () => {
  test('规则2: 目标不存在 → 创建副本（主 active 时提升 status/rating/comment + 回链）', async () => {
    const repo = new MemoryRepo([['neodb', 'movie::c1', NEO_RECORD]])
    const svc = new RecordService(repo)

    const result = await svc.syncRecord('neodb', 'movie::c1', NEO_RECORD, [DOUBAN_TARGET])

    expect(result.changed).toBe(true)
    expect(result.syncedPlatforms).toEqual(['douban'])
    const target = repo.snapshot('douban', 'movie::1292052')
    expect(target?.status).toBe(2)
    expect(target?.rating).toBe(8.5)
    expect(target?.linkedIds).toEqual({ neodb: 'movie::c1' })
  })

  test('规则3: 目标存在且未完成 → 同步 status/comment，保留目标 rating', async () => {
    const existingTarget = wishRecord(DOUBAN_TARGET.url, 6, 'old comment')
    const repo = new MemoryRepo([
      ['neodb', 'movie::c1', NEO_RECORD],
      ['douban', 'movie::1292052', existingTarget],
    ])
    const svc = new RecordService(repo)

    const incoming = doneRecord('https://neodb.social/movie/c1/', 9, 'new comment')
    const result = await svc.syncRecord('neodb', 'movie::c1', incoming, [DOUBAN_TARGET])

    expect(result.changed).toBe(true)
    const target = repo.snapshot('douban', 'movie::1292052')
    expect(target?.status).toBe(2)
    // 规则3: rating 绝不被覆盖
    expect(target?.rating).toBe(6)
    expect(target?.comment).toBe('new comment')
    expect(target?.linkedIds).toEqual({ neodb: 'movie::c1' })
  })

  test('规则4: 目标已 watched → 跳过（不覆盖、不改动）', async () => {
    const existingTarget = doneRecord(DOUBAN_TARGET.url, 7, 'my douban note')
    const repo = new MemoryRepo([
      ['neodb', 'movie::c1', NEO_RECORD],
      ['douban', 'movie::1292052', existingTarget],
    ])
    const svc = new RecordService(repo)

    const result = await svc.syncRecord('neodb', 'movie::c1', NEO_RECORD, [DOUBAN_TARGET])

    expect(result.changed).toBe(false)
    expect(result.syncedPlatforms).toEqual([])
    expect(repo.snapshot('douban', 'movie::1292052')?.rating).toBe(7)
    expect(repo.snapshot('douban', 'movie::1292052')?.comment).toBe('my douban note')
  })

  test('混合: 主无变化 + 目标不存在 → 仅目标被写入', async () => {
    const repo = new MemoryRepo([['neodb', 'movie::c1', NEO_RECORD]])
    const svc = new RecordService(repo)

    const result = await svc.syncRecord('neodb', 'movie::c1', NEO_RECORD, [DOUBAN_TARGET])

    expect(result.changed).toBe(true)
    expect(result.syncedPlatforms).toEqual(['douban'])
    expect(repo.snapshot('douban', 'movie::1292052')).not.toBeNull()
  })

  test('多目标: 一个存在未完成 + 一个不存在 → 两者都被处理', async () => {
    const imdbTarget = { platform: 'imdb', key: 'movie::tt0111161', url: 'https://www.imdb.com/title/tt0111161/' }
    const repo = new MemoryRepo([
      ['neodb', 'movie::c1', NEO_RECORD],
      ['douban', 'movie::1292052', wishRecord(DOUBAN_TARGET.url, 5)],
    ])
    const svc = new RecordService(repo)

    const result = await svc.syncRecord('neodb', 'movie::c1', NEO_RECORD, [DOUBAN_TARGET, imdbTarget])

    expect(result.syncedPlatforms).toContain('douban')
    expect(result.syncedPlatforms).toContain('imdb')
    expect(repo.snapshot('douban', 'movie::1292052')?.rating).toBe(5)
    expect(repo.snapshot('imdb', 'movie::tt0111161')?.status).toBe(2)
  })

  test('豆瓣侧委托路径 (2026-08-29 引擎统一): douban 主保存 → imdb 未完成目标同步 status、保留 rating', async () => {
    const imdbTarget = { platform: 'imdb', key: 'movie::tt0111161', url: 'https://www.imdb.com/title/tt0111161/' }
    const doubanPrimary = doneRecord('https://movie.douban.com/subject/1292052/', 9)
    const repo = new MemoryRepo([
      ['imdb', 'movie::tt0111161', wishRecord(imdbTarget.url, 7)],
    ])
    const svc = new RecordService(repo)

    const result = await svc.syncRecord('douban', 'movie::1292052', doubanPrimary, [imdbTarget])

    expect(result.changed).toBe(true)
    expect(result.syncedPlatforms).toContain('imdb')
    const imdb = repo.snapshot('imdb', 'movie::tt0111161')
    expect(imdb?.status).toBe(2)
    // 引擎统一的核心断言：豆瓣保存不再覆盖 IMDb 既有 rating
    expect(imdb?.rating).toBe(7)
    expect(imdb?.linkedIds).toEqual({ douban: 'movie::1292052' })
  })

  test('豆瓣侧委托路径: 目标已 watched → 跳过（不覆盖）', async () => {
    const imdbTarget = { platform: 'imdb', key: 'movie::tt0111161', url: 'https://www.imdb.com/title/tt0111161/' }
    const doubanPrimary = doneRecord('https://movie.douban.com/subject/1292052/', 9)
    const repo = new MemoryRepo([
      ['douban', 'movie::1292052', wishRecord(doubanPrimary.url, 4)],
      ['imdb', 'movie::tt0111161', doneRecord(imdbTarget.url, 8)],
    ])
    const svc = new RecordService(repo)

    const result = await svc.syncRecord('douban', 'movie::1292052', doubanPrimary, [imdbTarget])

    // 主记录写入；watched 的 imdb 目标被跳过。
    expect(result.syncedPlatforms).toEqual(['douban'])
    expect(result.syncedPlatforms).not.toContain('imdb')
    expect(repo.snapshot('imdb', 'movie::tt0111161')?.rating).toBe(8)
  })
})
