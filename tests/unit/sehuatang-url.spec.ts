import { test, expect } from '@playwright/test'
import { isForumDisplayUrl, isThreadUrl, extractThreadTidFromUrl } from '@/content/sehuatang/url'

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
