import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import { parseSearchResultRow, isSearchNoiseForum } from '@/content/sehuatang/extract-search'
import { initSearchClickDimmer } from '@/content/sehuatang/app-search'

/**
 * 色花堂搜索页三件套单元测试：
 *   1. extract-search：forumId 提取（无关分区过滤的数据源）；
 *   2. extract-search：噪音分区判定真值表；
 *   3. app-search：点击 dimmer（点击标题 → 立即 dim，不落库）。
 *
 * li.pbw 结构来自 .localref/搜索 夹具（30 条逐条核实：forum-143 =
 * 求片问答悬赏区、forum-95 = 综合讨论区；标题链接形态
 * forum.php?mod=viewthread&tid=…&highlight=）。
 */

const BASE_URL = 'https://www.sehuatang.net/search.php?mod=forum'

function liHtml(opts: { tid: string; title: string; forumId?: number; forumName?: string }): string {
  const forumLink =
    opts.forumId !== undefined
      ? ` <a href="https://www.sehuatang.net/forum-${opts.forumId}-1.html" class="xi1">${opts.forumName ?? '某分区'}</a>`
      : ''
  return `
    <li class="pbw" id="${opts.tid}">
      <h3 class="xs3"><a href="https://www.sehuatang.net/forum.php?mod=viewthread&amp;tid=${opts.tid}&amp;highlight=ABC-123">${opts.title}</a></h3>
      <p class="xg1">1 个回复 - 507 次查看</p>
      <p>内容隐藏需要，请点击进去查看</p>
      <p><span>2026-08-02 00:28</span> <a href="https://www.sehuatang.net/space-uid-123.html">某人</a>${forumLink}</p>
    </li>`
}

function parse(html: string) {
  const dom = new JSDOM(`<body><ul id="threadlist">${html}</ul></body>`, { url: BASE_URL })
  const li = dom.window.document.querySelector('li.pbw')!
  return parseSearchResultRow(li)
}

test.describe('parseSearchResultRow — forumId 提取', () => {
  test('版块链接 forum-143-1.html → forumId 143（求片问答悬赏区，噪音数据源）', () => {
    const row = parse(liHtml({ tid: '3665220', title: 'ABC-123 某标题', forumId: 143, forumName: '求片问答悬赏区' }))
    expect(row).not.toBeNull()
    expect(row!.forumId).toBe(143)
    // 其余字段不受新增字段影响（回归）。
    expect(row!.tid).toBe('TID-3665220')
    expect(row!.avId).toBe('ABC-123')
    expect(row!.trackId).toBe('ABC-123')
    expect(row!.preview).toBe('内容隐藏需要，请点击进去查看')
    expect(row!.author).toBe('某人')
  })

  test('无版块链接 → forumId null（正常分区条目不受影响）', () => {
    const row = parse(liHtml({ tid: '3665221', title: 'XYZ-456 另一标题' }))
    expect(row).not.toBeNull()
    expect(row!.forumId).toBeNull()
    expect(row!.trackId).toBe('XYZ-456')
  })

  test('版块链接非 forum-N-page.html 形态 → forumId null（不猜测）', () => {
    const html = liHtml({ tid: '3665222', title: 'ABC-123 标题' }).replace(
      'forum-143-1.html',
      'forum.php?gid=143',
    )
    const row = parse(html)
    expect(row).not.toBeNull()
    expect(row!.forumId).toBeNull()
  })
})

test.describe('isSearchNoiseForum — 无关分区真值表', () => {
  test('forum-143（求片问答悬赏区）→ true；forum-95（综合讨论区）→ false', () => {
    expect(isSearchNoiseForum(143)).toBe(true)
    expect(isSearchNoiseForum(95)).toBe(false)
  })

  test('null → false（无分区信息不过滤）；清单外 id → false', () => {
    expect(isSearchNoiseForum(null)).toBe(false)
    expect(isSearchNoiseForum(103)).toBe(false)
  })
})

test.describe('initSearchClickDimmer — 点击 dim（不落库）', () => {
  // 监听器内的 `target instanceof Element` 依赖浏览器 realm 全局——Node 进程
  // 未定义 Element，jsdom 会把监听器异常静默吞掉（表现为「点击无效果」）。
  // serial（串行）+ mountGrid 逐用例注入当前 JSDOM realm 的 Element，
  // 让真实守卫链路（instanceof → closest → dim）完整可执行。
  test.describe.configure({ mode: 'serial' })

  function mountGrid(): { dom: JSDOM; grid: HTMLElement } {
    const dom = new JSDOM(
      `<body><div class="umm-sht-search-grid">
        <div class="umm-card umm-sht-search-card" data-tid="TID-3665220" data-title="t" data-url="https://www.sehuatang.net/forum.php?mod=viewthread&amp;tid=3665220">
          <div class="umm-sht-search-body">
            <h3 class="umm-sht-search-title"><a href="https://www.sehuatang.net/forum.php?mod=viewthread&amp;tid=3665220">标题</a></h3>
            <p class="umm-sht-search-meta">meta</p>
          </div>
        </div>
        <div class="umm-card umm-sht-search-card" data-tid="TID-2" data-title="t2" data-url="https://www.sehuatang.net/forum.php?mod=viewthread&amp;tid=2">
          <div class="umm-sht-search-body">
            <h3 class="umm-sht-search-title"><a href="https://www.sehuatang.net/forum.php?mod=viewthread&amp;tid=2">标题二</a></h3>
          </div>
        </div>
      </div></body>`,
      { url: BASE_URL },
    )
    const grid = dom.window.document.querySelector('.umm-sht-search-grid') as HTMLElement
    // 注入本 JSDOM realm 的 Element（serial 保证无并发覆盖）。
    ;(globalThis as unknown as { Element?: unknown }).Element = dom.window.Element
    return { dom, grid }
  }

  test('点击标题链接 → 卡片立即落 .umm-viewed（同 tick，跳转前生效）', () => {
    const { dom, grid } = mountGrid()
    initSearchClickDimmer(grid)
    const card = dom.window.document.querySelector('[data-tid="TID-3665220"]') as HTMLElement
    const link = card.querySelector('.umm-sht-search-title a') as HTMLAnchorElement
    link.click()
    expect(card.classList.contains('umm-viewed')).toBe(true)
  })

  test('点击非跳转面（meta 文本）→ 不 dim', () => {
    const { dom, grid } = mountGrid()
    initSearchClickDimmer(grid)
    const card = dom.window.document.querySelector('[data-tid="TID-3665220"]') as HTMLElement
    ;(card.querySelector('.umm-sht-search-meta') as HTMLElement).click()
    expect(card.classList.contains('umm-viewed')).toBe(false)
  })

  test('幂等：已 dim 卡再点击不重复计数；重复初始化不叠加监听器（守卫位）', () => {
    const { dom, grid } = mountGrid()
    initSearchClickDimmer(grid)
    initSearchClickDimmer(grid)
    expect(grid.getAttribute('data-umm-sht-dim')).toBe('1')
    const card = dom.window.document.querySelector('[data-tid="TID-3665220"]') as HTMLElement
    card.classList.add('umm-viewed')
    ;(card.querySelector('.umm-sht-search-title a') as HTMLAnchorElement).click()
    // 已 dim 卡：类保持（dimCardsVisually 幂等），无异常即通过。
    expect(card.classList.contains('umm-viewed')).toBe(true)
    // 未 dim 卡不受影响。
    const other = dom.window.document.querySelector('[data-tid="TID-2"]') as HTMLElement
    expect(other.classList.contains('umm-viewed')).toBe(false)
  })
})
