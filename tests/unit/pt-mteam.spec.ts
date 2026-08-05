import { test, expect } from '@playwright/test'
import {
  isMTeamRowMatched,
  getMTeamRowOutcome,
  type MTeamRowIds,
} from '@/entrypoints/content/enhancers/pt/dimmer/mteam-match'

/**
 * M-Team 行匹配决策单元测试。
 *
 * 背景（audit docs/audit/architecture-scan-2026-08-03.md §3.3-M3）：
 * processMTeamRows 此前无条件对每一行设置 data-umm-mteam-resolved=true，
 * 导致 process() 中 unresolved 过滤恒为空 → applyCacheFallback 恒不执行
 * → M-Team 永不查询 pt_id_cache（扫描器写入的数据在该站没有消费者）。
 *
 * 本 spec 锁定两个契约：
 * 1. isMTeamRowMatched —— 行匹配行为（修复前后语义不变，行为锁定）；
 * 2. getMTeamRowOutcome —— 修复契约：仅 matched 行 resolved=true，
 *    未匹配行保持 unresolved，使兜底路径可达。
 *
 * 端到端流（process → processMTeamRows → applyCacheFallback）：
 * - 匹配行：resolved=true + dim → 后续周期被 dedup 跳过，不重复查询；
 * - 未匹配行：resolved 保持未设置 → 进入 unresolved → applyCacheFallback
 *   按 detail URL 批量查 pt_id_cache，命中已看则 dim，随后也标记 resolved
 *   （cache.ts 命中/未命中两分支都标记），因此每行兜底只查一次，无查询循环；
 * - 无 detail URL 的行：fallback 提前 return（urlMap 为空），不触发 DB 查询。
 */

test.describe('isMTeamRowMatched', () => {
  const movie = new Set(['1001', '2002'])
  const music = new Set(['5001'])
  const imdb = new Set(['tt1234567', 'tt7654321'])

  const ids = (over: Partial<MTeamRowIds> = {}): MTeamRowIds => ({
    movieDoubanId: null,
    musicDoubanId: null,
    imdbId: null,
    ...over,
  })

  test('电影豆瓣 ID 命中 → true', () => {
    expect(isMTeamRowMatched(ids({ movieDoubanId: '1001' }), movie, music, imdb)).toBe(true)
  })

  test('音乐豆瓣 ID 命中 → true', () => {
    expect(isMTeamRowMatched(ids({ musicDoubanId: '5001' }), movie, music, imdb)).toBe(true)
  })

  test('IMDb ID 命中 → true', () => {
    expect(isMTeamRowMatched(ids({ imdbId: 'tt1234567' }), movie, music, imdb)).toBe(true)
  })

  test('三个平台 ID 全部命中 → true', () => {
    expect(
      isMTeamRowMatched(
        ids({ movieDoubanId: '2002', musicDoubanId: '5001', imdbId: 'tt7654321' }),
        movie,
        music,
        imdb,
      )
    ).toBe(true)
  })

  test('任一平台 ID 不在集合中 → false（互不影响）', () => {
    expect(isMTeamRowMatched(ids({ movieDoubanId: '9999' }), movie, music, imdb)).toBe(false)
    expect(isMTeamRowMatched(ids({ musicDoubanId: '9999' }), movie, music, imdb)).toBe(false)
    expect(isMTeamRowMatched(ids({ imdbId: 'tt0000000' }), movie, music, imdb)).toBe(false)
    // 一个命中 + 一个未命中 → 仍为 true（或语义）
    expect(
      isMTeamRowMatched(ids({ movieDoubanId: '1001', imdbId: 'tt0000000' }), movie, music, imdb)
    ).toBe(true)
  })

  test('所有 ID 均为 null（行内无平台链接）→ false', () => {
    expect(isMTeamRowMatched(ids(), movie, music, imdb)).toBe(false)
  })

  test('空集合 → false（即使有 ID）', () => {
    expect(isMTeamRowMatched(ids({ movieDoubanId: '1001' }), new Set(), new Set(), new Set())).toBe(
      false
    )
  })

  test('非数字电影 ID（如空串）→ false', () => {
    expect(isMTeamRowMatched(ids({ movieDoubanId: '' }), movie, music, imdb)).toBe(false)
  })
})

test.describe('getMTeamRowOutcome（resolved 契约 — 修复锁定）', () => {
  const movie = new Set(['1001'])
  const music = new Set(['5001'])
  const imdb = new Set(['tt1234567'])

  test('匹配行 → { matched: true, resolved: true }', () => {
    const out = getMTeamRowOutcome(
      { movieDoubanId: '1001', musicDoubanId: null, imdbId: null },
      movie,
      music,
      imdb,
    )
    expect(out).toEqual({ matched: true, resolved: true })
  })

  test('未匹配行 → { matched: false, resolved: false }（关键回归锁）', () => {
    // 回归锁：未匹配行绝不能标记 resolved=true，
    // 否则 unresolved 过滤恒空、applyCacheFallback 恒不执行（audit M3）。
    const out = getMTeamRowOutcome(
      { movieDoubanId: null, musicDoubanId: null, imdbId: null },
      movie,
      music,
      imdb,
    )
    expect(out).toEqual({ matched: false, resolved: false })
  })

  test('无链接行（全 null）→ 同样保持 unresolved', () => {
    const out = getMTeamRowOutcome(
      { movieDoubanId: null, musicDoubanId: '9999', imdbId: null },
      movie,
      music,
      imdb,
    )
    expect(out).toEqual({ matched: false, resolved: false })
  })

  test('resolved 与 matched 恒等（不变量）', () => {
    const cases: MTeamRowIds[] = [
      { movieDoubanId: '1001', musicDoubanId: null, imdbId: null },
      { movieDoubanId: null, musicDoubanId: '5001', imdbId: null },
      { movieDoubanId: null, musicDoubanId: null, imdbId: 'tt1234567' },
      { movieDoubanId: null, musicDoubanId: null, imdbId: null },
      { movieDoubanId: '0000', musicDoubanId: '0000', imdbId: 'tt0000000' },
    ]
    for (const c of cases) {
      const out = getMTeamRowOutcome(c, movie, music, imdb)
      expect(out.resolved).toBe(out.matched)
    }
  })
})
