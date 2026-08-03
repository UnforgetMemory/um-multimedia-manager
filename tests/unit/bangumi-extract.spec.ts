import { test, expect } from '@playwright/test'
import {
  extractBangumiSubjectId,
  inferBangumiMediaType,
  extractBangumiStatus,
  extractBangumiRating,
  inferBangumiInterestFromText,
} from '@/entrypoints/content/handlers/bangumi-extract'

/**
 * Bangumi 详情页纯提取函数单元测试。
 *
 * 覆盖：/subject/{id} 识别、infobox 媒体类型推断（话数/放送开始→tv、
 * 册数/ISBN/出版社/连载杂志→book、游戏平台/开发/发行→game、碟片数量→music、空→tv）、
 * INTEREST_TYPE→状态映射、评分解析、interest_now 文本→状态兜底。
 *
 * inferBangumiMediaType 用例以 .localref/bangumi/pages/ 真实页面标签为准：
 * music_subject_309686/444838/16885（发售日期/碟片数量）、
 * type_subject_599997 漫画（作者/出版社/连载杂志，无 ISBN/册数）、
 * game_subject_484230（开发/发行，无游戏平台）。
 */

test.describe('extractBangumiSubjectId', () => {
  test('识别 /subject/{数字} pathname', () => {
    expect(extractBangumiSubjectId('/subject/253')).toBe('253')
    expect(extractBangumiSubjectId('/subject/253/ep')).toBe('253')
    expect(extractBangumiSubjectId('/subject/1234567/')).toBe('1234567')
  })

  test('识别完整 URL 中的 /subject/{数字}', () => {
    expect(extractBangumiSubjectId('https://bgm.tv/subject/253')).toBe('253')
    expect(extractBangumiSubjectId('https://bangumi.tv/subject/253/characters')).toBe('253')
  })

  test('非 subject 路径 → null', () => {
    expect(extractBangumiSubjectId('/anime/253')).toBeNull()
    expect(extractBangumiSubjectId('/')).toBeNull()
    expect(extractBangumiSubjectId('')).toBeNull()
  })

  test('subject 后跟非数字 → null', () => {
    expect(extractBangumiSubjectId('/subject/abc')).toBeNull()
  })
})

test.describe('inferBangumiMediaType', () => {
  const row = (label: string, value = '') => ({ label, value })

  test('话数 → tv', () => {
    expect(inferBangumiMediaType([row('话数: ', '26')])).toBe('tv')
  })

  test('放送开始 → tv', () => {
    expect(inferBangumiMediaType([row('放送开始: ', '1998年10月23日')])).toBe('tv')
  })

  test('话数 + 放送开始（动漫）→ tv', () => {
    expect(
      inferBangumiMediaType([
        row('中文名: ', '星际牛仔'),
        row('话数: ', '26'),
        row('放送开始: ', '1998年10月23日'),
      ])
    ).toBe('tv')
  })

  test('册数 → book', () => {
    expect(inferBangumiMediaType([row('册数: ', '10')])).toBe('book')
  })

  test('ISBN → book', () => {
    expect(inferBangumiMediaType([row('ISBN: ', '9784041016888')])).toBe('book')
  })

  test('发售日 + 游戏平台 → game', () => {
    expect(
      inferBangumiMediaType([row('发售日: ', '2022-02-25'), row('游戏平台: ', 'PC')])
    ).toBe('game')
  })

  test('发售日 + 碟片数 → music', () => {
    expect(
      inferBangumiMediaType([row('发售日: ', '1998-05-21'), row('碟片数: ', '1')])
    ).toBe('music')
  })

  test('真实样本 music/309686：发售日期 + 碟片数量 → music', () => {
    expect(
      inferBangumiMediaType([row('中文名', 'xxx'), row('发售日期', '2012-05-23'), row('碟片数量', '1')])
    ).toBe('music')
  })

  test('真实样本 music/444838：作曲/发售日期/碟片数量 → music', () => {
    expect(
      inferBangumiMediaType([row('中文名'), row('作曲'), row('发售日期'), row('碟片数量')])
    ).toBe('music')
  })

  test('真实样本 music/16885：艺术家/版本特性/录音 + 碟片数量 → music', () => {
    expect(
      inferBangumiMediaType([
        row('艺术家'),
        row('作曲'),
        row('版本特性'),
        row('发售日期'),
        row('价格'),
        row('录音'),
        row('碟片数量'),
      ])
    ).toBe('music')
  })

  test('真实样本 book/599997 漫画：作者/出版社/连载杂志 → book（无 ISBN 无册数）', () => {
    expect(
      inferBangumiMediaType([row('中文名'), row('作者'), row('出版社'), row('连载杂志'), row('别名')])
    ).toBe('book')
  })

  test('真实样本 game/484230：开发/发行 → game（无游戏平台无发售日期）', () => {
    expect(inferBangumiMediaType([row('中文名'), row('开发'), row('发行'), row('别名'), row('英文名')])).toBe(
      'game'
    )
  })

  test('游戏平台 + 发售日期 → game', () => {
    expect(
      inferBangumiMediaType([row('游戏平台', 'Switch'), row('发售日期', '2023-05-12')])
    ).toBe('game')
  })

  test('发售日期单独出现 → tv（发售日期本身不具类型判别力）', () => {
    expect(inferBangumiMediaType([row('中文名', 'xxx'), row('发售日期', '2024-01-01')])).toBe('tv')
  })

  test('空 infobox → tv（默认回退）', () => {
    expect(inferBangumiMediaType([])).toBe('tv')
  })

  test('无判别标签的普通行 → tv（默认回退）', () => {
    expect(inferBangumiMediaType([row('中文名: ', '测试'), row('话数: ', '12')])).toBe('tv')
  })

  test('label 无冒号后缀也能识别', () => {
    expect(inferBangumiMediaType([row('话数', '26')])).toBe('tv')
    expect(inferBangumiMediaType([row('ISBN', '9784041016888')])).toBe('book')
  })
})

test.describe('extractBangumiStatus', () => {
  test('INTEREST_TYPE=1（想看）→ wish', () => {
    expect(extractBangumiStatus(1)).toBe('wish')
  })

  test('INTEREST_TYPE=2（看过）→ done', () => {
    expect(extractBangumiStatus(2)).toBe('done')
  })

  test('INTEREST_TYPE=3（在看）→ doing', () => {
    expect(extractBangumiStatus(3)).toBe('doing')
  })

  test('搁置/抛弃（4/5）→ none（不清空本地状态）', () => {
    expect(extractBangumiStatus(4)).toBe('none')
    expect(extractBangumiStatus(5)).toBe('none')
  })

  test('null（未登录/无收藏）→ none', () => {
    expect(extractBangumiStatus(null)).toBe('none')
  })
})

test.describe('extractBangumiRating', () => {
  test('解析 0-10 整数评分', () => {
    expect(extractBangumiRating('7')).toBe(7)
    expect(extractBangumiRating('10')).toBe(10)
    expect(extractBangumiRating('0')).toBe(0)
  })

  test('null（未评分）→ 0', () => {
    expect(extractBangumiRating(null)).toBe(0)
  })

  test('非法输入 → 0', () => {
    expect(extractBangumiRating('abc')).toBe(0)
    expect(extractBangumiRating('')).toBe(0)
    expect(extractBangumiRating('11')).toBe(0)
    expect(extractBangumiRating('-1')).toBe(0)
  })
})

test.describe('inferBangumiInterestFromText', () => {
  test('interest_now 文本 → INTEREST_TYPE', () => {
    expect(inferBangumiInterestFromText('我想看这部动画')).toBe(1)
    expect(inferBangumiInterestFromText('我看过这部动画')).toBe(2)
    expect(inferBangumiInterestFromText('我在看这部动画')).toBe(3)
    expect(inferBangumiInterestFromText('我搁置了这部动画')).toBe(4)
    expect(inferBangumiInterestFromText('我抛弃了这部动画')).toBe(5)
  })

  test('空文本/无关键词 → null', () => {
    expect(inferBangumiInterestFromText('')).toBeNull()
    expect(inferBangumiInterestFromText('这部动画')).toBeNull()
  })
})
