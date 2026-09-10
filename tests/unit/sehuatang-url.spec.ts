import { test, expect } from '@playwright/test'
import {
  isForumDisplayUrl,
  isThreadUrl,
  isIndexUrl,
  isSearchUrl,
  classifyPage,
  isOverlayPage,
  extractThreadTidFromUrl,
} from '@/content/sehuatang/url'

/**
 * 色花堂 URL 判型（document_start 早期入口建壳 / document_idle 主入口
 * 静默记录的唯一判定依据）。
 * 回归锚点：① forum.php?mod=viewthread 等非列表页不得建覆盖层；
 * ② 帖子详情页必须被判型为帖子（否则访问帖子页不记录已看，
 * 列表页 dimmer 的 TID 兜底链断裂）。
 */

test.describe('isForumDisplayUrl', () => {
  test('伪静态列表页命中', () => {
    expect(isForumDisplayUrl('https://www.sehuatang.net/forum-103-1.html')).toBe(true)
    expect(isForumDisplayUrl('https://www.sehuatang.org/forum-2-1495.html')).toBe(true)
    expect(isForumDisplayUrl('https://sehuatang.net/forum-103-1.html?extra=1')).toBe(true)
  })

  test('动态 forumdisplay 命中', () => {
    expect(isForumDisplayUrl('https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103')).toBe(true)
    expect(isForumDisplayUrl('https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103&filter=typeid&typeid=480')).toBe(true)
  })

  test('非列表页不命中（viewthread / 论坛首页 / 分区页）', () => {
    expect(isForumDisplayUrl('https://www.sehuatang.net/forum.php?mod=viewthread&tid=3664524')).toBe(false)
    expect(isForumDisplayUrl('https://www.sehuatang.net/forum.php')).toBe(false)
    expect(isForumDisplayUrl('https://www.sehuatang.net/forum.php?gid=1')).toBe(false)
  })

  test('非 forum 路径不命中', () => {
    expect(isForumDisplayUrl('https://www.sehuatang.net/thread-3664524-1-1.html')).toBe(false)
    expect(isForumDisplayUrl('https://www.sehuatang.net/')).toBe(false)
    expect(isForumDisplayUrl('https://www.sehuatang.net/search.php?mod=forum')).toBe(false)
  })

  test('非法 URL 防御 → false', () => {
    expect(isForumDisplayUrl('not-a-url')).toBe(false)
    expect(isForumDisplayUrl('')).toBe(false)
  })
})

test.describe('extractThreadTidFromUrl — 帖子 TID 键提取（唯一提取源）', () => {
  test('伪静态 /thread-<tid>-... 命中', () => {
    expect(extractThreadTidFromUrl('https://www.sehuatang.net/thread-3664524-1-1.html')).toBe('TID-3664524')
    expect(extractThreadTidFromUrl('https://sehuatang.org/thread-88-2-1.html')).toBe('TID-88')
  })

  test('动态 viewthread&tid= 命中', () => {
    expect(extractThreadTidFromUrl('https://www.sehuatang.net/forum.php?mod=viewthread&tid=3664524')).toBe('TID-3664524')
    expect(extractThreadTidFromUrl('https://www.sehuatang.net/forum.php?mod=viewthread&tid=99&extra=page%3D1')).toBe('TID-99')
  })

  test('列表页 / 论坛首页 / 搜索页 → null（不可误判为帖子）', () => {
    expect(extractThreadTidFromUrl('https://www.sehuatang.net/forum-103-1.html')).toBeNull()
    expect(extractThreadTidFromUrl('https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103')).toBeNull()
    expect(extractThreadTidFromUrl('https://www.sehuatang.net/forum.php')).toBeNull()
    expect(extractThreadTidFromUrl('https://www.sehuatang.net/search.php?mod=forum')).toBeNull()
  })

  test('viewthread 但 tid 非法/缺失 → null（防御脏参数）', () => {
    expect(extractThreadTidFromUrl('https://www.sehuatang.net/forum.php?mod=viewthread')).toBeNull()
    expect(extractThreadTidFromUrl('https://www.sehuatang.net/forum.php?mod=viewthread&tid=abc')).toBeNull()
  })

  test('非法 URL 防御 → null', () => {
    expect(extractThreadTidFromUrl('')).toBeNull()
    expect(extractThreadTidFromUrl('not-a-url')).toBeNull()
  })
})

test.describe('isThreadUrl — 帖子页判型（与列表页互斥）', () => {
  test('帖子页命中（两种形态）', () => {
    expect(isThreadUrl('https://www.sehuatang.net/thread-3664524-1-1.html')).toBe(true)
    expect(isThreadUrl('https://www.sehuatang.net/forum.php?mod=viewthread&tid=3664524')).toBe(true)
  })

  test('列表页不命中（两条分支互斥，不会同时建壳又记录）', () => {
    expect(isThreadUrl('https://www.sehuatang.net/forum-103-1.html')).toBe(false)
    expect(isThreadUrl('https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103')).toBe(false)
  })
})

test.describe('isIndexUrl — 首页判型', () => {
  test('站点根 / index.php / forum.php 无 mod 命中', () => {
    expect(isIndexUrl('https://www.sehuatang.net/')).toBe(true)
    expect(isIndexUrl('https://www.sehuatang.net/index.php')).toBe(true)
    expect(isIndexUrl('https://www.sehuatang.net/forum.php')).toBe(true)
    expect(isIndexUrl('https://www.sehuatang.net/forum.php?mobile=no')).toBe(true)
    // mod 空值显式分支（url.ts: mod === ''）
    expect(isIndexUrl('https://www.sehuatang.net/forum.php?mod=')).toBe(true)
  })

  test('分类聚合页 forum.php?gid= 排除（无 category_ 容器，建壳即 dismiss 闪烁）', () => {
    expect(isIndexUrl('https://www.sehuatang.net/forum.php?gid=1')).toBe(false)
    expect(isIndexUrl('https://www.sehuatang.net/forum.php?gid=36&mobile=no')).toBe(false)
  })

  test('非首页不命中（列表 / 帖子 / 搜索 / portal）', () => {
    expect(isIndexUrl('https://www.sehuatang.net/forum-103-1.html')).toBe(false)
    expect(isIndexUrl('https://www.sehuatang.net/thread-3664524-1-1.html')).toBe(false)
    expect(isIndexUrl('https://www.sehuatang.net/search.php?mod=forum')).toBe(false)
    expect(isIndexUrl('https://www.sehuatang.net/portal.php')).toBe(false)
  })

  test('非法 URL 防御 → false', () => {
    expect(isIndexUrl('not-a-url')).toBe(false)
    expect(isIndexUrl('')).toBe(false)
  })
})

test.describe('isSearchUrl — 搜索页判型（仅论坛帖）', () => {
  test('search.php?mod=forum 命中（任意关键词/排序/页码）', () => {
    expect(isSearchUrl('https://www.sehuatang.net/search.php?mod=forum&searchid=0&kw=test')).toBe(true)
    expect(isSearchUrl('https://www.sehuatang.net/search.php?mod=forum&orderby=lastpost&page=3')).toBe(true)
  })

  test('mod=user / mod=curuser / 缺 mod / 大写 mod 不命中', () => {
    expect(isSearchUrl('https://www.sehuatang.net/search.php?mod=user&kw=test')).toBe(false)
    expect(isSearchUrl('https://www.sehuatang.net/search.php?kw=test')).toBe(false)
    expect(isSearchUrl('https://www.sehuatang.net/search.php?mod=curuser')).toBe(false)
    // 防御：Discuz 恒小写 mod，大写不命中（严格相等，不静默宽容）
    expect(isSearchUrl('https://www.sehuatang.net/search.php?mod=FORUM')).toBe(false)
  })

  test('非 search.php 路径不命中', () => {
    expect(isSearchUrl('https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103')).toBe(false)
    expect(isSearchUrl('https://www.sehuatang.net/')).toBe(false)
  })
})

test.describe('classifyPage — 四向分流（早期入口与主入口决策一致）', () => {
  test('帖子 > 列表 > 搜索 > 首页 优先级', () => {
    // thread 优先（即便 URL 同时匹配 forum.php?mod=viewthread）
    expect(classifyPage('https://www.sehuatang.net/forum.php?mod=viewthread&tid=1')).toBe('thread')
    // list 其次
    expect(classifyPage('https://www.sehuatang.net/forum-103-1.html')).toBe('forumdisplay')
    // search
    expect(classifyPage('https://www.sehuatang.net/search.php?mod=forum&kw=x')).toBe('search')
    // index（站点根 + index.php 形态）
    expect(classifyPage('https://www.sehuatang.net/')).toBe('index')
    expect(classifyPage('https://www.sehuatang.net/index.php')).toBe('index')
  })

  test('分类聚合页（gid）与大写 mod → other', () => {
    // gid 聚合页无 category_ 容器，不得判 index（否则建壳即 dismiss 闪烁）
    expect(classifyPage('https://www.sehuatang.net/forum.php?gid=1')).toBe('other')
    // 大写 mod 防御（Discuz 恒小写）
    expect(classifyPage('https://www.sehuatang.net/search.php?mod=FORUM')).toBe('other')
  })

  test('非受支持 URL → other', () => {
    expect(classifyPage('https://www.sehuatang.net/portal.php')).toBe('other')
    expect(classifyPage('https://www.sehuatang.net/home.php')).toBe('other')
  })
})

test.describe('isOverlayPage — overlay 接管判定（早期入口建壳依据）', () => {
  test('列表/搜索/首页均需建壳；帖子不建壳（静默记录路径）', () => {
    expect(isOverlayPage('forumdisplay')).toBe(true)
    expect(isOverlayPage('search')).toBe(true)
    expect(isOverlayPage('index')).toBe(true)
    expect(isOverlayPage('thread')).toBe(false)
    expect(isOverlayPage('other')).toBe(false)
  })
})
