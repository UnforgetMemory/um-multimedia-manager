import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import {
  extractBreadcrumb,
  extractTypeTabs,
  extractPagination,
  resolveJumpUrl,
  clampPage,
  buildBreadcrumbBar,
  buildTabsBar,
  buildPager,
  buildActions,
  mountSehuatangControls,
  paintSehuatangBackground,
  countSehuatangCardStates,
  markCardsViewed,
  type PaginationData,
} from '@/entrypoints/content/handlers/sehuatang-controls'
import { openSehuatangMenu, type SehuatangMenuAction } from '@/entrypoints/content/handlers/sehuatang-menu'

/**
 * 色花堂 forumdisplay 控件重建（sehuatang-controls）单元测试。
 *
 * 夹具结构来自 .localref/高清中文字幕 - 98堂[原色花堂] - Powered by Discuz!.html
 * （#pt .z 面包屑、#pgt/#fd_page_top 分页、#thread_types 选项卡、
 * #fd_page_bottom 底部分页、#newspecial 发新帖），仅做必要裁剪。
 */

const BASE_URL = 'https://www.sehuatang.net/forum-103-1.html'

function pgHtml(opts: { current: number; withPrev?: boolean; withNext?: boolean; withTotalTitle?: boolean }): string {
  const prev = opts.withPrev ? '<a href="https://www.sehuatang.net/forum-103-1.html" class="prev">上一页</a>' : ''
  const next = opts.withNext ? '<a href="https://www.sehuatang.net/forum-103-2.html" class="nxt">下一页</a>' : ''
  const titleSpan = opts.withTotalTitle === false ? '' : '<span title="共 1495 页"> / 1495 页</span>'
  const links = [2, 3, 4, 5, 6, 7, 8, 9, 10]
    .map((n) => `<a href="https://www.sehuatang.net/forum-103-${n}.html">${n}</a>`)
    .join('')
  const last = '<a href="https://www.sehuatang.net/forum-103-1495.html" class="last">... 1495</a>'
  const label = `<label><input type="text" name="custompage" class="px" size="2" title="输入页码，按回车快速跳转" value="${opts.current}" onkeydown="if(event.keyCode==13) {window.location='forum.php?mod=forumdisplay&amp;fid=103&amp;page='+this.value;; doane(event);}">${titleSpan}</label>`
  return `<div class="pg">${prev}<strong>${opts.current}</strong>${links}${last}${label}${next}</div>`
}

function pgFromHtml(html: string): Element | null {
  const dom = new JSDOM(`<body>${html}</body>`, { url: BASE_URL })
  return dom.window.document.querySelector('.pg')
}

const PAGE1_PG = pgHtml({ current: 1, withNext: true })

test.describe('extractBreadcrumb', () => {
  const BREADCRUMB_HTML = `
    <div class="z">
      <a href="https://www.sehuatang.net/" class="nvhm" title="首页">98堂[原色花堂]</a><em>»</em>
      <a href="https://www.sehuatang.net/forum.php">论坛</a> <em>›</em>
      <a href="https://www.sehuatang.net/forum.php?gid=1">原创BT电影</a><em>›</em>
      <a href="https://www.sehuatang.net/forum-103-1.html">高清中文字幕</a>
    </div>`

  test('四段面包屑：末位 current、href 原样保留', () => {
    const dom = new JSDOM(BREADCRUMB_HTML)
    const items = extractBreadcrumb(dom.window.document.querySelector('.z'))
    expect(items.map((i) => i.text)).toEqual(['98堂[原色花堂]', '论坛', '原创BT电影', '高清中文字幕'])
    expect(items.map((i) => i.current)).toEqual([false, false, false, true])
    expect(items[0]!.href).toBe('https://www.sehuatang.net/')
    expect(items[3]!.href).toBe('https://www.sehuatang.net/forum-103-1.html')
  })

  test('null / 空容器 → 空数组', () => {
    expect(extractBreadcrumb(null)).toEqual([])
    const dom = new JSDOM('<div class="z"></div>')
    expect(extractBreadcrumb(dom.window.document.querySelector('.z'))).toEqual([])
  })
})

test.describe('extractTypeTabs', () => {
  const TABS_HTML = `
    <ul id="thread_types" class="ttp bm cl">
      <li id="ttp_all" class="xw1 a"><a href="https://www.sehuatang.net/forum-103-1.html">全部</a></li>
      <li><a href="https://www.sehuatang.net/forum.php?mod=forumdisplay&amp;fid=103&amp;filter=typeid&amp;typeid=480">有码高清<span class="xg1 num">37534</span></a></li>
      <li><a href="https://www.sehuatang.net/forum.php?mod=forumdisplay&amp;fid=103&amp;filter=typeid&amp;typeid=481">无码高清<span class="xg1 num">7301</span></a></li>
    </ul>`

  function tabsFromHtml(html: string, currentUrl: string) {
    const dom = new JSDOM(html, { url: currentUrl })
    return extractTypeTabs(dom.window.document.getElementById('thread_types'), currentUrl)
  }

  test('无 typeid URL → 全部激活，标签文本与计数分离', () => {
    const tabs = tabsFromHtml(TABS_HTML, BASE_URL)
    expect(tabs.map((t) => t.text)).toEqual(['全部', '有码高清', '无码高清'])
    expect(tabs.map((t) => t.count)).toEqual(['', '37534', '7301'])
    expect(tabs.map((t) => t.active)).toEqual([true, false, false])
  })

  test('typeid=481 URL → 无码高清激活，全部失活', () => {
    const url = 'https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103&filter=typeid&typeid=481'
    const tabs = tabsFromHtml(TABS_HTML, url)
    expect(tabs.map((t) => t.active)).toEqual([false, false, true])
  })

  test('未知 typeid → URL 语义无命中，回退 li.xw1 a 类名标记', () => {
    const url = 'https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103&filter=typeid&typeid=999'
    const tabs = tabsFromHtml(TABS_HTML, url)
    expect(tabs.map((t) => t.active)).toEqual([true, false, false])
  })

  test('null → 空数组；li 缺 a 跳过', () => {
    expect(extractTypeTabs(null, BASE_URL)).toEqual([])
    const dom = new JSDOM('<ul id="tt"><li></li><li><a>有码高清</a></li></ul>')
    expect(extractTypeTabs(dom.window.document.getElementById('tt'), BASE_URL)).toHaveLength(1)
  })
})

test.describe('extractPagination', () => {
  test('第 1 页：current=1、total=1495、无 prev、next/跳转模板齐备', () => {
    const data = extractPagination(pgFromHtml(PAGE1_PG))
    expect(data.current).toBe(1)
    expect(data.total).toBe(1495)
    expect(data.prevHref).toBe('')
    expect(data.nextHref).toBe('https://www.sehuatang.net/forum-103-2.html')
    expect(data.jumpTemplate).toBe('forum.php?mod=forumdisplay&fid=103&page=')
    expect(data.pages).toHaveLength(10) // 2..10 + last
    expect(data.pages[0]!.page).toBe(2)
    expect(data.pages[9]!.page).toBe(1495)
    expect(data.pages[9]!.last).toBe(true)
    expect(data.pages[9]!.label).toBe('... 1495')
  })

  test('第 2 页：prev 出现且指向第 1 页', () => {
    const data = extractPagination(pgFromHtml(pgHtml({ current: 2, withPrev: true, withNext: true })))
    expect(data.current).toBe(2)
    expect(data.prevHref).toBe('https://www.sehuatang.net/forum-103-1.html')
    expect(data.nextHref).toBe('https://www.sehuatang.net/forum-103-2.html')
  })

  test('末页：next 缺省为空串', () => {
    const data = extractPagination(pgFromHtml(pgHtml({ current: 1495, withPrev: true })))
    expect(data.nextHref).toBe('')
  })

  test('无「共 X 页」span → total 回退 .last 页码', () => {
    const data = extractPagination(pgFromHtml(pgHtml({ current: 1, withNext: true, withTotalTitle: false })))
    expect(data.total).toBe(1495)
  })

  test('null → 全零默认值', () => {
    expect(extractPagination(null)).toEqual({
      current: 0, total: 0, prevHref: '', nextHref: '', pages: [], jumpTemplate: '',
    })
  })
})

test.describe('resolveJumpUrl / clampPage', () => {
  test('相对模板 + 页码 → 相对当前页解析为绝对 URL', () => {
    expect(resolveJumpUrl('forum.php?mod=forumdisplay&fid=103&page=', 7, BASE_URL))
      .toBe('https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103&page=7')
  })

  test('空模板 / 非法模板 → null', () => {
    expect(resolveJumpUrl('', 7, BASE_URL)).toBeNull()
    expect(resolveJumpUrl('http://[invalid', 7, BASE_URL)).toBeNull()
  })

  test('非 http(s) 协议模板 → null（javascript:/file: 防御）', () => {
    expect(resolveJumpUrl('javascript:alert(1)', 1, BASE_URL)).toBeNull()
    expect(resolveJumpUrl('file:///etc/passwd?', 1, BASE_URL)).toBeNull()
  })

  test('clampPage：边界与 NaN', () => {
    expect(clampPage(0, 1495)).toBe(1)
    expect(clampPage(9999, 1495)).toBe(1495)
    expect(clampPage(-5, 1495)).toBe(1)
    expect(clampPage(2.9, 1495)).toBe(2)
    expect(clampPage(Number.NaN, 1495)).toBe(1)
    expect(clampPage(3, 0)).toBe(1)
  })
})

test.describe('构建器（JSDOM smoke）', () => {
  test('面包屑条：锚点 href/current 类名/分隔符', () => {
    const dom = new JSDOM('<body></body>', { url: BASE_URL })
    const bar = buildBreadcrumbBar(dom.window.document, [
      { text: '论坛', href: 'https://www.sehuatang.net/forum.php', current: false },
      { text: '高清中文字幕', href: 'https://www.sehuatang.net/forum-103-1.html', current: true },
    ])!
    const links = bar.querySelectorAll('a')
    expect(links).toHaveLength(2)
    expect(links[1]!.getAttribute('href')).toBe('https://www.sehuatang.net/forum-103-1.html')
    expect(links[1]!.className).toContain('umm-sht-crumb--current')
    expect(bar.querySelectorAll('.umm-sht-crumb-sep')).toHaveLength(1)
  })

  test('选项卡条：激活态 aria-current + 计数 span', () => {
    const dom = new JSDOM('<body></body>', { url: BASE_URL })
    const bar = buildTabsBar(dom.window.document, [
      { text: '全部', href: 'https://www.sehuatang.net/forum-103-1.html', count: '', active: true },
      { text: '有码高清', href: 'https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=103&filter=typeid&typeid=480', count: '37534', active: false },
    ])!
    const tabs = bar.querySelectorAll('a')
    expect(tabs[0]!.getAttribute('aria-current')).toBe('page')
    expect(tabs[1]!.querySelector('.umm-sht-tab-count')!.textContent).toBe('37534')
  })

  test('分页条：第 1 页 prev 禁用、窗口化 1 [2 3] … 1495、跳转输入与计数器', () => {
    const data = extractPagination(pgFromHtml(PAGE1_PG))!
    const dom = new JSDOM('<body></body>', { url: BASE_URL })
    const bar = buildPager(dom.window.document, data)!
    const first = bar.firstElementChild!
    expect(first.className).toContain('umm-sht-pg-nav--disabled')
    expect(first.getAttribute('href')).toBeNull()
    expect(bar.querySelector('.umm-sht-pg-page--current')!.textContent).toBe('1')
    expect(bar.querySelector('.umm-sht-pg-page--current')!.getAttribute('aria-current')).toBe('page')
    expect(bar.querySelector('.umm-sht-pg-gap')!.textContent).toBe('…')
    expect(Array.from(bar.querySelectorAll('a.umm-sht-pg-page')).map((a) => a.textContent)).toEqual(['2', '3', '1495'])
    expect(bar.querySelector('.umm-sht-pg-jump')!.getAttribute('inputmode')).toBe('numeric')
    expect((bar.querySelector('.umm-sht-pg-jump') as HTMLInputElement).value).toBe('1')
    expect(bar.querySelector('.umm-sht-pg-total')!.textContent).toBe('1 / 1495')
  })

  test('分页条：当前页=末页时胶囊代替链接，窗口推导邻页 href（模板来自原版 .last）', () => {
    const dom = new JSDOM('<body></body>', { url: BASE_URL })
    const data: PaginationData = {
      current: 1495, total: 1495, prevHref: 'https://www.sehuatang.net/forum-103-1494.html', nextHref: '',
      pages: [{ label: '... 1495', page: 1495, href: 'https://www.sehuatang.net/forum-103-1495.html', last: true }],
      jumpTemplate: '',
    }
    const bar = buildPager(dom.window.document, data)!
    expect(Array.from(bar.querySelectorAll('a.umm-sht-pg-page')).map((a) => a.textContent)).toEqual(['1', '1493', '1494'])
    expect(bar.querySelector('a.umm-sht-pg-page')!.getAttribute('href')).toBe('https://www.sehuatang.net/forum-103-1.html')
    expect(bar.querySelector('.umm-sht-pg-page--current')!.textContent).toBe('1495')
    expect(Array.from(bar.querySelectorAll('a.umm-sht-pg-page')).some((a) => a.textContent === '1495')).toBe(false)
  })

  test('空数据 → null；动作按钮：返回链接 + 发新帖按钮', () => {
    const dom = new JSDOM('<body></body>', { url: BASE_URL })
    const empty: PaginationData = { current: 0, total: 0, prevHref: '', nextHref: '', pages: [], jumpTemplate: '' }
    expect(buildPager(dom.window.document, empty)).toBeNull()
    expect(buildBreadcrumbBar(dom.window.document, [])).toBeNull()
    expect(buildTabsBar(dom.window.document, [])).toBeNull()

    const back = dom.window.document.createElement('a')
    back.setAttribute('href', 'https://www.sehuatang.net/forum.php')
    back.textContent = '返\u00a0回'
    const post = dom.window.document.createElement('a')
    post.setAttribute('title', '发新帖')
    const buttons = buildActions(dom.window.document, back, post)
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.getAttribute('href')).toBe('https://www.sehuatang.net/forum.php')
    expect(buttons[0]!.textContent).toBe('返 回')
    expect(buttons[1]!.textContent).toBe('发新帖')
  })
})

test.describe('mountSehuatangControls 编排', () => {
  const FULL_HTML = `
    <div id="pt" class="bm cl"><div class="z">
      <a href="https://www.sehuatang.net/" class="nvhm" title="首页">98堂[原色花堂]</a><em>»</em>
      <a href="https://www.sehuatang.net/forum.php">论坛</a> <em>›</em>
      <a href="https://www.sehuatang.net/forum.php?gid=1">原创BT电影</a><em>›</em>
      <a href="https://www.sehuatang.net/forum-103-1.html">高清中文字幕</a></div>
    </div>
    <div id="pgt" class="bm bw0 pgs cl">
      <span id="fd_page_top">${PAGE1_PG}</span>
      <span class="pgb y" id="visitedforums"><a href="https://www.sehuatang.net/forum.php">返&nbsp;回</a></span>
      <a href="javascript:;" id="newspecial" title="发新帖"><img src="pn_post.png" alt="发新帖"></a>
    </div>
    <ul id="thread_types" class="ttp bm cl">
      <li id="ttp_all" class="xw1 a"><a href="https://www.sehuatang.net/forum-103-1.html">全部</a></li>
      <li><a href="https://www.sehuatang.net/forum.php?mod=forumdisplay&amp;fid=103&amp;filter=typeid&amp;typeid=480">有码高清<span class="xg1 num">37534</span></a></li>
      <li><a href="https://www.sehuatang.net/forum.php?mod=forumdisplay&amp;fid=103&amp;filter=typeid&amp;typeid=481">无码高清<span class="xg1 num">7301</span></a></li>
    </ul>
    <div id="threadlisttableid"><table><tbody><tr><td>x</td></tr></tbody></table></div>
    <div class="bm bw0 pgs cl">
      <span id="fd_page_bottom">${PAGE1_PG}</span>
      <span id="visitedforumstmp" class="pgb y"><a href="https://www.sehuatang.net/forum.php">返&nbsp;回</a></span>
      <a href="javascript:;" id="newspecialtmp" title="发新帖"><img src="pn_post.png" alt="发新帖"></a>
    </div>
    <div id="hdr" class="umm-sehuatang-header">
      <div class="umm-header-info">info</div>
      <div><button class="umm-copy-btn">copy</button><button class="umm-sht-action">☰</button></div>
    </div>`

  function mountedDom(html: string = FULL_HTML) {
    const dom = new JSDOM(`<body>${html}</body>`, { url: BASE_URL })
    const header = dom.window.document.getElementById('hdr') as HTMLElement
    return { dom, header }
  }

  test('原版元素全部隐藏；双行 header 结构（上下文行 + 导航行）；底部灵动岛齐备', () => {
    const { dom, header } = mountedDom()
    mountSehuatangControls(dom.window.document, header)
    const doc = dom.window.document

    for (const sel of ['#pt', '#thread_types', '#pgt']) {
      expect((doc.querySelector(sel) as HTMLElement).style.display).toBe('none')
    }
    const bottomPgs = doc.getElementById('fd_page_bottom')!.closest('.pgs') as HTMLElement
    expect(bottomPgs.style.display).toBe('none')

    // 双行结构：上行 = 面包屑 + 统计信息；下行 = 选项卡 + 操作组。
    const rows = Array.from(header.children)
    expect(rows).toHaveLength(2)
    const rowContext = rows[0] as HTMLElement
    const rowNav = rows[1] as HTMLElement
    expect(rowContext.className).toContain('umm-sht-row--context')
    expect(rowContext.querySelector('.umm-sht-breadcrumb')).not.toBeNull()
    expect(rowContext.querySelector('.umm-header-info')).not.toBeNull()
    expect(rowNav.className).toContain('umm-sht-row--nav')
    expect(rowNav.querySelector('.umm-sht-tabs')).not.toBeNull()
    expect(header.querySelectorAll('a.umm-sht-action')).toHaveLength(1)
    expect(header.querySelectorAll('button.umm-sht-action')).toHaveLength(2)
    // 操作组内次要动作置前（返回/发新帖在复制磁力之前；☰ 菜单殿后）。
    const navActions = header.querySelector('.umm-sht-row--nav')!.lastElementChild!
    const actionNodes = Array.from(navActions.children)
    expect(actionNodes.map((n) => (n as HTMLElement).className)).toEqual(['umm-sht-action', 'umm-sht-action', 'umm-copy-btn', 'umm-sht-action'])

    const pill = doc.getElementById('umm-sht-floatbar')!
    expect(pill.querySelector('.umm-sht-pager')).not.toBeNull()
    expect(pill.querySelectorAll('.umm-sht-action')).toHaveLength(2)
    expect(doc.getElementById('umm-sht-controls-styles')).not.toBeNull()

    // 令牌基准断言：样式消费 --usl-* 语义令牌，零调色板 hex。
    const css = doc.getElementById('umm-sht-controls-styles')!.textContent!
    expect(css).toContain('var(--usl-surface')
    expect(css).toContain('var(--usl-fill-primary)')
    expect(css).not.toContain('#1e1e1e')
    expect(css).not.toContain('#03dac6')
  })

  test('发新帖按钮 → 原版元素 click()（触发站点 showWindow 的接线点）', () => {
    const { dom, header } = mountedDom()
    mountSehuatangControls(dom.window.document, header)
    const doc = dom.window.document
    let clicked = false
    ;(doc.getElementById('newspecial') as HTMLElement).click = () => { clicked = true }
    const postBtn = header.querySelector('button.umm-sht-action') as HTMLButtonElement
    postBtn.click()
    expect(clicked).toBe(true)
  })

  test('守卫：无 #thread_types → 完全 no-op（详情/搜索页不注入）', () => {
    const html = `<div id="pt"><div class="z"><a href="https://www.sehuatang.net/forum.php">论坛</a></div></div><div id="hdr"><div></div><div></div></div>`
    const { dom, header } = mountedDom(html)
    mountSehuatangControls(dom.window.document, header)
    const doc = dom.window.document
    expect(header.getAttribute('data-umm-sht-mounted')).toBeNull()
    expect(doc.getElementById('umm-sht-floatbar')).toBeNull()
    expect((doc.querySelector('#pt') as HTMLElement).style.display).toBe('')
  })

  test('幂等：重复调用不重复挂载（header 标志位 + 样式/悬浮栏单例）', () => {
    const { dom, header } = mountedDom()
    mountSehuatangControls(dom.window.document, header)
    mountSehuatangControls(dom.window.document, header)
    const doc = dom.window.document
    expect(header.getAttribute('data-umm-sht-mounted')).toBe('1')
    expect(header.children).toHaveLength(2)
    expect(header.querySelectorAll('.umm-sht-row--context')).toHaveLength(1)
    expect(header.querySelectorAll('.umm-sht-row--nav')).toHaveLength(1)
    expect(doc.querySelectorAll('#umm-sht-floatbar')).toHaveLength(1)
    expect(doc.querySelectorAll('#umm-sht-controls-styles')).toHaveLength(1)
  })
})

test.describe('openSehuatangMenu — ☰ 居中菜单对话框', () => {
  function menuDom() {
    const dom = new JSDOM('<body><button id="anchor">☰</button></body>', { url: BASE_URL })
    const anchor = dom.window.document.getElementById('anchor') as HTMLElement
    return { dom, anchor }
  }

  const baseActions = (): SehuatangMenuAction[] => [
    { label: 'Manual Add', onClick: () => {} },
    { label: 'Check Viewed Status', onClick: () => {} },
  ]

  test('打开 → overlay + role=dialog + 规范 header（标题+close）+ 菜单项齐备 + 首项聚焦', () => {
    const { dom, anchor } = menuDom()
    openSehuatangMenu(dom.window.document, anchor, 'Menu', baseActions())
    const doc = dom.window.document
    const overlay = doc.getElementById('umm-sht-menu-overlay')!
    expect(overlay.className).toBe('umm-overlay')
    const panel = overlay.querySelector('.umm-sht-menu-panel') as HTMLElement
    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.getAttribute('aria-modal')).toBe('true')
    // Header：标题 + close icon button 均在其内（规范 UIUX）。
    const header = panel.querySelector('.umm-sht-menu-header') as HTMLElement
    expect(header).not.toBeNull()
    expect(header.querySelector('.umm-sht-menu-title')!.textContent).toBe('Menu')
    const closeBtn = header.querySelector('.umm-sht-menu-close') as HTMLButtonElement
    expect(closeBtn.getAttribute('aria-label')).toBe('Close')
    expect(closeBtn.textContent).toBe('×')
    expect(panel.firstElementChild).toBe(header)
    expect(Array.from(overlay.querySelectorAll('.umm-sht-menu-item')).map((b) => b.textContent))
      .toEqual(['Manual Add', 'Check Viewed Status'])
    expect(doc.activeElement).toBe(overlay.querySelector('.umm-sht-menu-item'))
  })

  test('普通项点击 → 回调执行 + 菜单关闭 + 焦点归还 anchor', () => {
    const { dom, anchor } = menuDom()
    let clicked = ''
    openSehuatangMenu(dom.window.document, anchor, 'Menu', [
      { label: 'A', onClick: () => { clicked = 'A' } },
    ])
    const doc = dom.window.document
    ;(doc.querySelector('.umm-sht-menu-item') as HTMLButtonElement).click()
    expect(clicked).toBe('A')
    expect(doc.getElementById('umm-sht-menu-overlay')).toBeNull()
    expect(doc.activeElement).toBe(anchor)
  })

  test('toggle 项点击 → 回调执行 + 文案/激活态刷新 + 菜单保持打开', () => {
    const { dom, anchor } = menuDom()
    let hidden = false
    const label = () => `${hidden ? '✓ ' : ''}Hide Viewed`
    openSehuatangMenu(dom.window.document, anchor, 'Menu', [
      {
        label: label(),
        onClick: () => { hidden = !hidden },
        refreshLabel: label,
        active: () => hidden,
        keepOpen: true,
      },
    ])
    const doc = dom.window.document
    const item = doc.querySelector('.umm-sht-menu-item') as HTMLButtonElement
    expect(item.classList.contains('umm-sht-menu-item--active')).toBe(false)
    item.click()
    expect(doc.getElementById('umm-sht-menu-overlay')).not.toBeNull()
    expect(item.textContent).toBe('✓ Hide Viewed')
    expect(item.classList.contains('umm-sht-menu-item--active')).toBe(true)
  })

  test('初始激活态：active()=true 打开即带 --active 类', () => {
    const { dom, anchor } = menuDom()
    openSehuatangMenu(dom.window.document, anchor, 'Menu', [
      { label: 'Hide Viewed', onClick: () => {}, active: () => true, keepOpen: true },
    ])
    const item = dom.window.document.querySelector('.umm-sht-menu-item') as HTMLButtonElement
    expect(item.classList.contains('umm-sht-menu-item--active')).toBe(true)
  })

  test('外部点击（overlay 空白处）→ 关闭；Escape → 关闭；× → 关闭', () => {
    const { dom, anchor } = menuDom()
    const doc = dom.window.document
    openSehuatangMenu(doc, anchor, 'Menu', baseActions())
    const overlay = doc.getElementById('umm-sht-menu-overlay')!
    overlay.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }))
    expect(doc.getElementById('umm-sht-menu-overlay')).toBeNull()

    openSehuatangMenu(doc, anchor, 'Menu', baseActions())
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
    expect(doc.getElementById('umm-sht-menu-overlay')).toBeNull()

    openSehuatangMenu(doc, anchor, 'Menu', baseActions())
    ;(doc.querySelector('.umm-sht-menu-close') as HTMLButtonElement).click()
    expect(doc.getElementById('umm-sht-menu-overlay')).toBeNull()
  })

  test('重复打开幂等：旧实例销毁，单一 overlay，无残留监听', () => {
    const { dom, anchor } = menuDom()
    const doc = dom.window.document
    openSehuatangMenu(doc, anchor, 'Menu', baseActions())
    const first = doc.getElementById('umm-sht-menu-overlay')
    openSehuatangMenu(doc, anchor, 'Menu', baseActions())
    expect(doc.querySelectorAll('#umm-sht-menu-overlay')).toHaveLength(1)
    expect(doc.getElementById('umm-sht-menu-overlay')).not.toBe(first)
    // 旧实例的监听已被清理：关闭新实例后，再发 Escape 不产生任何效果/报错。
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
    expect(doc.getElementById('umm-sht-menu-overlay')).toBeNull()
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }))
    expect(doc.getElementById('umm-sht-menu-overlay')).toBeNull()
  })

  test('样式令牌基准：菜单样式消费 --usl-* 语义令牌（独立样式表）', () => {
    const { dom, anchor } = menuDom()
    openSehuatangMenu(dom.window.document, anchor, 'Menu', baseActions())
    const css = dom.window.document.getElementById('umm-sht-menu-styles')!.textContent!
    expect(css).toContain('.umm-sht-menu-item')
    expect(css).toContain('var(--usl-surface-raised)')
    expect(css).not.toContain('#1e1e1e')
  })

  test('焦点陷阱：末元素 Tab → 回绕首元素；首元素 Shift+Tab → 回绕末元素', () => {
    const { dom, anchor } = menuDom()
    openSehuatangMenu(dom.window.document, anchor, 'Menu', baseActions())
    const doc = dom.window.document
    const focusables = Array.from(doc.querySelectorAll('.umm-sht-menu-panel button, .umm-sht-menu-item'))
    const first = focusables[0] as HTMLElement
    const last = focusables[focusables.length - 1] as HTMLElement
    expect(focusables.length).toBeGreaterThan(1)

    last.focus()
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(doc.activeElement).toBe(first)

    first.focus()
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    expect(doc.activeElement).toBe(last)
  })
})

test.describe('paintSehuatangBackground — 首帧背景预载', () => {
  test('dark：注入 style 元素，html,body 双覆盖 + 暗面表面色', () => {
    const dom = new JSDOM('<body><p>x</p></body>', { url: BASE_URL })
    paintSehuatangBackground(dom.window.document, 'dark')
    const style = dom.window.document.getElementById('umm-sht-early-bg') as HTMLStyleElement
    expect(style).not.toBeNull()
    expect(style.textContent).toContain('html, body')
    expect(style.textContent).toContain('#1c1c1e')
    expect(style.textContent).toContain('!important')
  })

  test('light：亮面表面色', () => {
    const dom = new JSDOM('<body></body>', { url: BASE_URL })
    paintSehuatangBackground(dom.window.document, 'light')
    expect(dom.window.document.getElementById('umm-sht-early-bg')!.textContent).toContain('#f7f9fc')
  })

  test('幂等：重复调用更新同一 style 元素（不产生第二个）', () => {
    const dom = new JSDOM('<body></body>', { url: BASE_URL })
    paintSehuatangBackground(dom.window.document, 'dark')
    paintSehuatangBackground(dom.window.document, 'light')
    const styles = dom.window.document.querySelectorAll('#umm-sht-early-bg')
    expect(styles).toHaveLength(1)
    expect(styles[0]!.textContent).toContain('#f7f9fc')
    expect(styles[0]!.textContent).not.toContain('#1c1c1e')
  })
})

test.describe('countSehuatangCardStates — 已看统计（本页已看=dimmer 数）', () => {
  test('null 网格 / 无已看卡片 → watched=0', () => {
    expect(countSehuatangCardStates(null)).toEqual({ watched: 0 })
    const dom = new JSDOM('<body><div class="umm-preview-grid"><div class="umm-card">1</div></div></body>', { url: BASE_URL })
    const grid = dom.window.document.querySelector('.umm-preview-grid') as HTMLElement
    expect(countSehuatangCardStates(grid)).toEqual({ watched: 0 })
  })

  test('已看计数正确；hide 类不影响 watched（隐藏由初始挂载过滤决定）', () => {
    const dom = new JSDOM(
      '<body><div class="umm-preview-grid"><div class="umm-card umm-viewed"></div><div class="umm-card umm-viewed"></div><div class="umm-card"></div></div></body>',
      { url: BASE_URL },
    )
    const grid = dom.window.document.querySelector('.umm-preview-grid') as HTMLElement
    expect(countSehuatangCardStates(grid)).toEqual({ watched: 2 })
    grid.classList.add('umm-sht-hide-viewed')
    expect(countSehuatangCardStates(grid)).toEqual({ watched: 2 })
  })

  test('开启隐藏的网格：watched 仍只计已看卡（隐藏卡不在 DOM 中）', () => {
    const dom = new JSDOM(
      '<body><div class="umm-preview-grid umm-sht-hide-viewed"><div class="umm-card umm-viewed"></div><div class="umm-card"></div></div></body>',
      { url: BASE_URL },
    )
    const grid = dom.window.document.querySelector('.umm-preview-grid') as HTMLElement
    expect(countSehuatangCardStates(grid)).toEqual({ watched: 1 })
  })
})

test.describe('markCardsViewed — 统一已看标记路径（磁力/一键复制共用）', () => {
  function cardsFromHtml(html: string): HTMLElement[] {
    const dom = new JSDOM(`<body><div class="umm-preview-grid">${html}</div></body>`, { url: BASE_URL })
    return Array.from(dom.window.document.querySelectorAll('.umm-card')) as HTMLElement[]
  }

  // 异步落库断言只依赖微任务（store fake 无真实 IO）——用 setImmediate 刷新，
  // 消除 sleep 定时器在慢 CI 下的时序抖动。
  const sleep = () => new Promise<void>((resolve) => setImmediate(resolve))

  test('去重 + 单次批量落库 + 类立即落下（dimmer/隐藏即时生效）', async () => {
    const cards = cardsFromHtml(
      '<div class="umm-card" data-avid="ABC-123" data-url="https://x.test/1"></div>' +
      '<div class="umm-card umm-viewed" data-avid="XYZ-999"></div>' +
      '<div class="umm-card" data-avid="SSIS-001"></div>',
    )
    const calls: { source: string; items: { id: string; rating?: number; url?: string }[] }[] = []
    const store = {
      batchAdd: async (source: string, items: { id: string; rating?: number; url?: string }[]) => {
        calls.push({ source, items })
        return items.length
      },
    }
    let marked = 0
    let added = -1
    markCardsViewed(cards, 'sehuatang', store, () => { marked++ }, (n) => { added = n })
    // 类同步落下（不等异步落库）——隐藏/dimmer 立即生效的关键。
    expect(cards.map((c) => c.classList.contains('umm-viewed'))).toEqual([true, true, true])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.source).toBe('sehuatang')
    expect(calls[0]!.items.map((i) => i.id)).toEqual(['ABC-123', 'SSIS-001'])
    expect(calls[0]!.items[0]!.url).toBe('https://x.test/1')
    expect(marked).toBe(1)
    await sleep()
    expect(added).toBe(2)
  })

  test('全部已看 → 零落库调用，onMarked 仍触发（幂等）', () => {
    const cards = cardsFromHtml('<div class="umm-card umm-viewed" data-avid="A-1"></div>')
    let storeCalls = 0
    let marked = 0
    const store = { batchAdd: async () => { storeCalls++; return 0 } }
    markCardsViewed(cards, 'sehuatang', store, () => { marked++ })
    expect(storeCalls).toBe(0)
    expect(marked).toBe(1)
  })

  test('无番号卡片 → 类仍落下但不落库', () => {
    const cards = cardsFromHtml('<div class="umm-card"></div>')
    let storeCalls = 0
    const store = { batchAdd: async () => { storeCalls++; return 0 } }
    markCardsViewed(cards, 'sehuatang', store)
    expect(cards[0]!.classList.contains('umm-viewed')).toBe(true)
    expect(storeCalls).toBe(0)
  })

  test('落库失败 → onError 回调（保存失败诊断通道）', async () => {
    const cards = cardsFromHtml('<div class="umm-card" data-avid="A-1"></div>')
    const store = { batchAdd: async () => { throw new Error('db down') } }
    let errored = false
    markCardsViewed(cards, 'sehuatang', store, undefined, undefined, () => { errored = true })
    await sleep()
    expect(errored).toBe(true)
    // 类仍落下：dimmer 与落库解耦，保存失败不阻断 UI。
    expect(cards[0]!.classList.contains('umm-viewed')).toBe(true)
  })

  test('批量失败 → 逐条 add 兜底（提高保存可靠性）+ onError 触发', async () => {
    const cards = cardsFromHtml('<div class="umm-card" data-avid="A-1"></div><div class="umm-card" data-avid="B-2"></div>')
    const addedIds: string[] = []
    const store = {
      batchAdd: async () => { throw new Error('batch down') },
      add: async (_source: string, id: string) => { addedIds.push(id) },
    }
    let errored = false
    markCardsViewed(cards, 'sehuatang', store, undefined, undefined, () => { errored = true })
    await sleep()
    expect(addedIds).toEqual(['A-1', 'B-2'])
    expect(errored).toBe(true)
  })

  test('写入后读回自检：读不到 → onError(readback-mismatch)；读得到 → 静默', async () => {
    const cards = cardsFromHtml('<div class="umm-card" data-avid="A-1"></div>')
    const storeMiss = {
      batchAdd: async () => 1,
      has: async () => false,
    }
    let missError = ''
    markCardsViewed(cards, 'sehuatang', storeMiss, undefined, undefined, (e) => { missError = String(e) })
    await sleep()
    expect(missError).toContain('readback-mismatch: A-1')

    const cards2 = cardsFromHtml('<div class="umm-card" data-avid="B-2"></div>')
    const storeHit = {
      batchAdd: async () => 1,
      has: async () => true,
    }
    let hitError = ''
    markCardsViewed(cards2, 'sehuatang', storeHit, undefined, undefined, (e) => { hitError = String(e) })
    await sleep()
    expect(hitError).toBe('')
  })
})
