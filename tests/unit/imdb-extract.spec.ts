import { test, expect } from '@playwright/test'
import { extractImdbIdFromText, extractImdbIdFromItem, type SearchItemLike } from '@/content/douban/shared/imdb-extract'

/**
 * 搜索组件 IMDb 链接识别 + tt-xxx ID 提取测试。
 *
 * 覆盖：imdb.com URL、豆瓣 "IMDb:" 标签文本、裸 tt-id、
 * 全角冒号、item 顶层 imdb 字段、以及无 IMDb 信息时的 null。
 */

test.describe('extractImdbIdFromText', () => {
  test('识别 imdb.com/title/ 完整 URL', () => {
    expect(extractImdbIdFromText('https://www.imdb.com/title/tt0111161/')).toBe('tt0111161')
    expect(extractImdbIdFromText('导演: A / IMDb: https://imdb.com/title/tt1375666/reference')).toBe('tt1375666')
  })

  test('识别豆瓣 "IMDb: ttxxx" 标签文本（半角冒号）', () => {
    expect(extractImdbIdFromText('IMDb: tt0111161')).toBe('tt0111161')
    expect(extractImdbIdFromText('1994 / 美国 / 犯罪 剧情 / IMDb: tt0111161')).toBe('tt0111161')
  })

  test('识别全角冒号 "IMDb：ttxxx"', () => {
    expect(extractImdbIdFromText('IMDb：tt0111161')).toBe('tt0111161')
  })

  test('识别裸 tt-id 文本', () => {
    expect(extractImdbIdFromText('tt0111161')).toBe('tt0111161')
    expect(extractImdbIdFromText('The Shawshank Redemption (tt0111161)')).toBe('tt0111161')
  })

  test('无 IMDb 信息 → null', () => {
    expect(extractImdbIdFromText('肖申克的救赎 / 1994 / 美国')).toBeNull()
    expect(extractImdbIdFromText('')).toBeNull()
  })

  test('拒绝畸形 id（缺 tt 前缀或过短）', () => {
    expect(extractImdbIdFromText('IMDb: tt123')).toBeNull()
    expect(extractImdbIdFromText('imdb.com/title/1234567')).toBeNull()
  })
})

test.describe('extractImdbIdFromItem', () => {
  const base: SearchItemLike = {
    id: 1292052,
    title: '肖申克的救赎',
    abstract: '1994 / 美国 / 犯罪 剧情',
    abstract_2: '',
    url: 'https://movie.douban.com/subject/1292052/',
  }

  test('从 abstract 提取', () => {
    expect(extractImdbIdFromItem({ ...base, abstract: 'IMDb: tt0111161' })).toBe('tt0111161')
  })

  test('从 abstract_2 提取（演职人员/别名行）', () => {
    expect(extractImdbIdFromItem({ ...base, abstract_2: 'IMDb: tt0111161' })).toBe('tt0111161')
  })

  test('优先使用顶层 imdb 字段', () => {
    expect(extractImdbIdFromItem({ ...base, imdb: 'tt0111161' })).toBe('tt0111161')
  })

  test('无 IMDb → null', () => {
    expect(extractImdbIdFromItem(base)).toBeNull()
  })
})
