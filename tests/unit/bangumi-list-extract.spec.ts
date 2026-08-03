import { test, expect } from '@playwright/test'
import {
  extractListItemId,
  extractBrowserPathType,
  extractProviderIdFromKey,
  bangumiListMarkerSpec,
  bangumiListRatingText,
} from '@/entrypoints/content/handlers/bangumi-list-extract'

/**
 * Bangumi 浏览列表页纯提取函数单元测试。
 *
 * 覆盖：li id="item_{subjectId}" 识别、/(anime|book|music|game)/browser 路径识别
 * （路由门控）、"{type}::{providerId}" store key 的 providerId 提取（状态映射构建）。
 * DOM 事实来源：.localref/bangumi/pages/anime_browser.html（<li id="item_545465" class="item odd clearit">）。
 */

test.describe('extractListItemId', () => {
  test('item_{数字} → subjectId', () => {
    expect(extractListItemId('item_545465')).toBe('545465')
    expect(extractListItemId('item_123')).toBe('123')
    expect(extractListItemId('item_0')).toBe('0')
  })

  test('非数字 id → null', () => {
    expect(extractListItemId('item_abc')).toBeNull()
    expect(extractListItemId('item_12_34')).toBeNull()
    expect(extractListItemId('item_123x')).toBeNull()
  })

  test('缺前缀 / 大小写不符 → null', () => {
    expect(extractListItemId('Item_123')).toBeNull()
    expect(extractListItemId('545465')).toBeNull()
    expect(extractListItemId('subject_545465')).toBeNull()
  })

  test('空串 / 缺数字 → null', () => {
    expect(extractListItemId('')).toBeNull()
    expect(extractListItemId('item_')).toBeNull()
  })
})

test.describe('extractBrowserPathType', () => {
  test('四个浏览列表路径 → 对应类型', () => {
    expect(extractBrowserPathType('/anime/browser')).toBe('anime')
    expect(extractBrowserPathType('/book/browser')).toBe('book')
    expect(extractBrowserPathType('/music/browser')).toBe('music')
    expect(extractBrowserPathType('/game/browser')).toBe('game')
  })

  test('尾斜杠 / 子路径仍命中（分页等）', () => {
    expect(extractBrowserPathType('/anime/browser/')).toBe('anime')
    expect(extractBrowserPathType('/anime/browser/page/2')).toBe('anime')
  })

  test('/browser 单独出现 → null（404 页）', () => {
    expect(extractBrowserPathType('/browser')).toBeNull()
  })

  test('/anime 博客 feed → null（无 subject 卡片，禁止注入）', () => {
    expect(extractBrowserPathType('/anime')).toBeNull()
  })

  test('subject 详情页 → null', () => {
    expect(extractBrowserPathType('/subject/253')).toBeNull()
    expect(extractBrowserPathType('/subject/545465/ep')).toBeNull()
  })

  test('前缀/后缀干扰 → null', () => {
    expect(extractBrowserPathType('/xanime/browser')).toBeNull()
    expect(extractBrowserPathType('/anime/browserX')).toBeNull()
  })

  test('根路径 / 空串 → null', () => {
    expect(extractBrowserPathType('/')).toBeNull()
    expect(extractBrowserPathType('')).toBeNull()
  })
})

test.describe('extractProviderIdFromKey', () => {
  test('"{type}::{providerId}" → providerId', () => {
    expect(extractProviderIdFromKey('tv::545465')).toBe('545465')
    expect(extractProviderIdFromKey('book::253')).toBe('253')
    expect(extractProviderIdFromKey('movie::0')).toBe('0')
  })

  test('缺 :: 分隔 → null', () => {
    expect(extractProviderIdFromKey('545465')).toBeNull()
    expect(extractProviderIdFromKey('tv545465')).toBeNull()
  })

  test('空 providerId / 多余分隔 → null', () => {
    expect(extractProviderIdFromKey('tv::')).toBeNull()
    expect(extractProviderIdFromKey('::')).toBeNull()
    expect(extractProviderIdFromKey('tv::123::456')).toBeNull()
  })

  test('空串 → null', () => {
    expect(extractProviderIdFromKey('')).toBeNull()
  })
})

test.describe('bangumiListMarkerSpec', () => {
  test('status 0 → 未看（status.none / statusAttr none）', () => {
    expect(bangumiListMarkerSpec(0)).toEqual({ labelKey: 'status.none', statusAttr: 'none' })
  })

  test('status 1 → 想看（status.wish / statusAttr wish）', () => {
    expect(bangumiListMarkerSpec(1)).toEqual({ labelKey: 'status.wish', statusAttr: 'wish' })
  })

  test('status 2 → 已看（status.done / statusAttr done）', () => {
    expect(bangumiListMarkerSpec(2)).toEqual({ labelKey: 'status.done', statusAttr: 'done' })
  })

  test('status 3 → 在看（status.doing / statusAttr doing）', () => {
    expect(bangumiListMarkerSpec(3)).toEqual({ labelKey: 'status.doing', statusAttr: 'doing' })
  })

  test('未知值回退 未看/none（7、NaN、负数、越界）', () => {
    expect(bangumiListMarkerSpec(7)).toEqual({ labelKey: 'status.none', statusAttr: 'none' })
    expect(bangumiListMarkerSpec(NaN)).toEqual({ labelKey: 'status.none', statusAttr: 'none' })
    expect(bangumiListMarkerSpec(-1)).toEqual({ labelKey: 'status.none', statusAttr: 'none' })
    expect(bangumiListMarkerSpec(99)).toEqual({ labelKey: 'status.none', statusAttr: 'none' })
  })
})

test.describe('bangumiListMarkerSpec (mediaType 参数)', () => {
  test('mediaType music → 全部状态用 _music 变体（已听/想听/在听/未听）', () => {
    expect(bangumiListMarkerSpec(0, 'music')).toEqual({
      labelKey: 'status.none_music',
      statusAttr: 'none',
    })
    expect(bangumiListMarkerSpec(1, 'music')).toEqual({
      labelKey: 'status.wish_music',
      statusAttr: 'wish',
    })
    expect(bangumiListMarkerSpec(2, 'music')).toEqual({
      labelKey: 'status.done_music',
      statusAttr: 'done',
    })
    expect(bangumiListMarkerSpec(3, 'music')).toEqual({
      labelKey: 'status.doing_music',
      statusAttr: 'doing',
    })
  })

  test('mediaType music 未知状态回退 none_music（statusAttr 仍 none）', () => {
    expect(bangumiListMarkerSpec(7, 'music')).toEqual({
      labelKey: 'status.none_music',
      statusAttr: 'none',
    })
    expect(bangumiListMarkerSpec(-1, 'music')).toEqual({
      labelKey: 'status.none_music',
      statusAttr: 'none',
    })
  })

  test('mediaType book → 全部状态用 _book 变体（已读/想读/在读/未读）', () => {
    expect(bangumiListMarkerSpec(0, 'book')).toEqual({
      labelKey: 'status.none_book',
      statusAttr: 'none',
    })
    expect(bangumiListMarkerSpec(1, 'book')).toEqual({
      labelKey: 'status.wish_book',
      statusAttr: 'wish',
    })
    expect(bangumiListMarkerSpec(2, 'book')).toEqual({
      labelKey: 'status.done_book',
      statusAttr: 'done',
    })
    expect(bangumiListMarkerSpec(3, 'book')).toEqual({
      labelKey: 'status.doing_book',
      statusAttr: 'doing',
    })
  })

  test('mediaType game → 全部状态用 _game 变体（已玩/想玩/在玩/未玩）', () => {
    expect(bangumiListMarkerSpec(0, 'game')).toEqual({
      labelKey: 'status.none_game',
      statusAttr: 'none',
    })
    expect(bangumiListMarkerSpec(1, 'game')).toEqual({
      labelKey: 'status.wish_game',
      statusAttr: 'wish',
    })
    expect(bangumiListMarkerSpec(2, 'game')).toEqual({
      labelKey: 'status.done_game',
      statusAttr: 'done',
    })
    expect(bangumiListMarkerSpec(3, 'game')).toEqual({
      labelKey: 'status.doing_game',
      statusAttr: 'doing',
    })
  })

  test('mediaType book/game 未知状态回退 _book/_game none（statusAttr 仍 none）', () => {
    expect(bangumiListMarkerSpec(7, 'book')).toEqual({
      labelKey: 'status.none_book',
      statusAttr: 'none',
    })
    expect(bangumiListMarkerSpec(-1, 'game')).toEqual({
      labelKey: 'status.none_game',
      statusAttr: 'none',
    })
  })

  test('非 music/book/game 类型（anime）→ 基础 labelKey，statusAttr 不变', () => {
    expect(bangumiListMarkerSpec(2, 'anime')).toEqual({ labelKey: 'status.done', statusAttr: 'done' })
    expect(bangumiListMarkerSpec(3, 'anime')).toEqual({ labelKey: 'status.doing', statusAttr: 'doing' })
    expect(bangumiListMarkerSpec(0, 'anime')).toEqual({ labelKey: 'status.none', statusAttr: 'none' })
  })

  test('任意其他值 / undefined → 基础 labelKey（向后兼容）', () => {
    expect(bangumiListMarkerSpec(2, undefined)).toEqual({ labelKey: 'status.done', statusAttr: 'done' })
    expect(bangumiListMarkerSpec(1, 'xyz')).toEqual({ labelKey: 'status.wish', statusAttr: 'wish' })
    expect(bangumiListMarkerSpec(3, '')).toEqual({ labelKey: 'status.doing', statusAttr: 'doing' })
  })
})

test.describe('bangumiListRatingText', () => {
  test('0 / 负数 / NaN → 空串（不显示评分徽章）', () => {
    expect(bangumiListRatingText(0)).toBe('')
    expect(bangumiListRatingText(-1)).toBe('')
    expect(bangumiListRatingText(NaN)).toBe('')
  })

  test('整数评分 → 无小数位', () => {
    expect(bangumiListRatingText(8)).toBe('8/10')
    expect(bangumiListRatingText(10)).toBe('10/10')
  })

  test('半星评分 → 保留 1 位小数', () => {
    expect(bangumiListRatingText(8.5)).toBe('8.5/10')
    expect(bangumiListRatingText(7.5)).toBe('7.5/10')
  })

  test('非半星小数按 0.5 步进钳制（与 Utils.formatRating10 输出一致）', () => {
    expect(bangumiListRatingText(7.55)).toBe('7.5/10')
    expect(bangumiListRatingText(9.3)).toBe('9.5/10')
    expect(bangumiListRatingText(10.5)).toBe('10/10')
  })
})
