import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import { runSehuatangSearchApp } from '@/content/sehuatang/app-search'
import { runSehuatangIndexApp } from '@/content/sehuatang/app-home'

/**
 * 色花堂页面端到端渲染测试（app-search / app-home，灵动岛统一布局）。
 *
 * 诉求「全面渲染测试输出，拒绝无测试的 UI 布局与组件堆砌」的落地点：
 * jsdom 全局注入（document / window / Element / MutationObserver /
 * requestAnimationFrame / chrome）后真实运行编排入口，断言 shadow overlay
 * 内的最终 DOM 形态——
 *   - 灵动岛组成（搜索框 / 分页 / 动作）随场景正确合成（buildFloatbar）；
 *   - header 不再持有搜索框（岛是全站唯一搜索入口）；
 *   - shell 带 --island 修饰类（底部遮挡补偿 padding 挂钩）；
 *   - 分区过滤 / 空态两分支 / DOM 守卫 dismiss 全链路。
 *
 * jsdom 陷阱（见 MEMORY.md）：serial 模式（config fullyParallel: true，防
 * 全局注入竞态）+ Element realm 对齐——生产代码 `target instanceof Element`
 * 在 Node 下 Element 为 undefined，监听器被 jsdom 静默吞掉。
 * chrome stub：storage.local.get 返回 zh-CN（i18n 确定性）；
 * runtime.sendMessage 回 {success:true,watched:[]}（batchCheckExists 得空集，
 * 规避 1s 退避与 background 依赖）。
 */

test.describe.configure({ mode: 'serial' })

const BASE_URL = 'https://www.sehuatang.net/search.php?mod=forum&searchsubmit=yes&srchtxt=ABC'
const OVERLAY_ID = 'umm-sht-overlay'

function installGlobals(dom: JSDOM): void {
  const g = globalThis as unknown as Record<string, unknown>
  g.document = dom.window.document
  g.window = dom.window
  g.Element = dom.window.Element
  g.MutationObserver = dom.window.MutationObserver
  g.requestAnimationFrame = (cb: (time: number) => void) => setTimeout(() => cb(0), 0)
  // jsdom 未实现 matchMedia（overlay.ts 主题探测消费 .matches）——stub 恒 light。
  ;(dom.window as unknown as { matchMedia: (query: string) => { matches: boolean; media: string } }).matchMedia =
    (query: string) => ({ matches: false, media: query })
  g.chrome = {
    storage: { local: { get: async () => ({ language: 'zh-CN' }) } },
    runtime: {
      id: 'test-ext',
      // 按消息类型路由：ADULT_AV_STATS → 全局三段计数（定值便于断言；
      // 响应必须带 success:true——sendMsg 会校验后丢弃非 success 响应）；
      // 其余（批量已看检查等）→ {success, watched:[]}（空已看集，规避 1s 退避）。
      sendMessage: (msg: { type?: string }, cb: (response: unknown) => void) => {
        if (msg?.type === 'ADULT_AV_STATS') cb({ success: true, jp: 9638, us: 0, tid: 36 })
        else cb({ success: true, watched: [] })
      },
    },
  }
}

/**
 * 预置 overlay host + 挂载页面（生产由 sehuatang-early.content 在
 * document_start 建壳；测试显式建壳并附 open shadow root）。
 */
function mountPage(bodyHtml: string, url: string = BASE_URL): JSDOM {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${bodyHtml}</body></html>`, { url })
  installGlobals(dom)
  const doc = dom.window.document
  const host = doc.createElement('div')
  host.id = OVERLAY_ID
  doc.body.appendChild(host)
  host.attachShadow({ mode: 'open' })
  return dom
}

/** 取 overlay 内的内容根（shadow 边界：document 级查询不可达，须自 host 进入）。 */
function shellOf(dom: JSDOM): HTMLElement {
  const shell = dom.window.document.getElementById(OVERLAY_ID)!.shadowRoot!.querySelector('.umm-sht-shell')
  expect(shell, 'overlay 内应有 .umm-sht-shell 内容根').not.toBeNull()
  return shell as HTMLElement
}

// ---------------------------------------------------------------------------
// 搜索页夹具（结构经 .localref 搜索夹具核实：li.pbw[id] + 「结果:」h2 + .pgs .pg）
// ---------------------------------------------------------------------------

function searchRow(id: string, forumId: number): string {
  return `
    <li class="pbw" id="${id}">
      <h3 class="xs3"><a href="forum.php?mod=viewthread&amp;tid=${id}&amp;highlight=ABC">[测试] 标题 ${id}</a></h3>
      <p class="xg1">1 个回复 - 507 次查看</p>
      <p>内容隐藏需要，请点击进去查看</p>
      <p><span>2026-08-02 00:28</span><a href="space-uid-9.html">作者甲</a><a href="forum-${forumId}-1.html">分区</a></p>
    </li>`
}

const SEARCH_META = '<div id="ct"><h2>结果: <em>找到 "<span>ABC</span>" 相关内容 3 个</em></h2></div>'

const SEARCH_PGS = `
  <div class="pgs mbm"><div class="pg">
    <strong>1</strong>
    <a href="search.php?mod=forum&amp;searchsubmit=yes&amp;srchtxt=ABC&amp;page=2">2</a>
    <a href="search.php?mod=forum&amp;searchsubmit=yes&amp;srchtxt=ABC&amp;page=3" class="last">... 3</a>
    <span title="共 3 页"> / 3 页</span>
    <a class="nxt" href="search.php?mod=forum&amp;searchsubmit=yes&amp;srchtxt=ABC&amp;page=2">下一页</a>
  </div></div>`

test.describe('app-search 端到端渲染（灵动岛统一布局）', () => {
  test('正常结果：岛 = 搜索+分页（无场景动作）；header 无搜索框；噪音分区过滤；--island 生效', async () => {
    const dom = mountPage(
      `${SEARCH_META}<ul id="threadlist">${searchRow('111', 143)}${searchRow('222', 95)}${searchRow('333', 103)}</ul>${SEARCH_PGS}`,
    )
    await runSehuatangSearchApp()

    const shell = shellOf(dom)
    // --island：底部遮挡补偿 padding 的挂钩（原 --list 语义扩展为任何挂岛页面）
    expect(shell.className).toContain('umm-sht-shell--island')

    // header：无搜索框（岛是全站唯一搜索入口）；顶部居中簇 = 🏠 首页 + ☰ 菜单
    const header = shell.querySelector('.umm-sehuatang-header') as HTMLElement
    expect(header.querySelector('.umm-sht-searchbox')).toBeNull()
    expect(Array.from(header.querySelectorAll('.umm-sht-action')).map((n) => n.textContent)).toEqual(['🏠', '☰'])
    const center = header.querySelector('.umm-sht-center') as HTMLElement
    expect(center).not.toBeNull()
    expect(header.querySelector('a.umm-sht-home-btn')).not.toBeNull()
    const homeLink = header.querySelector('a.umm-sht-home-btn') as HTMLAnchorElement
    expect(homeLink.getAttribute('href')).toBe('forum.php')
    expect(homeLink.getAttribute('aria-label')).toBe('首页')

    // 过滤注记激活（回归锚点：filteredCount 必须传入 buildHeader，否则注记永不渲染）
    // —— 计数 + 注记现在挂在左侧上下文载体 .umm-sht-context。
    const contextText = header.querySelector('.umm-sht-context') as HTMLElement
    expect(contextText.textContent).toContain('找到 "ABC" 相关内容 3 个')
    expect(contextText.textContent).toContain('已过滤 1 条无关分区结果')

    // 卡片：forum-143（求片问答悬赏区）噪音不渲染，正常分区保留
    const grid = shell.querySelector('.umm-sht-search-grid') as HTMLElement
    expect(grid.querySelectorAll('.umm-card')).toHaveLength(2)
    // 旧内嵌分页容器已废除（分页入岛）
    expect(shell.querySelector('.umm-sht-search-pager')).toBeNull()

    // 灵动岛：搜索 + 分页统一入岛
    const pill = shell.querySelector('#umm-sht-floatbar') as HTMLElement
    expect(pill).not.toBeNull()
    expect(pill.querySelector('.umm-sht-searchbox')).not.toBeNull()
    expect(pill.querySelector('.umm-sht-pager')).not.toBeNull()
    expect(pill.querySelector('.umm-sht-search-input')!.getAttribute('aria-label')).toBe('搜索帖子…')
    // 搜索词回填：夹具 URL 带 srchtxt=ABC → 输入框预填当前关键词（可直接改词重搜）
    expect((pill.querySelector('.umm-sht-search-input') as HTMLInputElement).value).toBe('ABC')
    // 岛内 .umm-sht-action 仅 🔍 搜索按钮（搜索页无 返回/发新帖 场景动作）
    expect(pill.querySelectorAll('.umm-sht-action')).toHaveLength(1)
    expect(pill.querySelector('.umm-sht-search-btn')).not.toBeNull()

    // 摩天轮：有分页 → 策略性优先展示分页舱；搜索舱悬于上舱待轮替
    const stage = pill.querySelector('.umm-sht-island-stage') as HTMLElement
    expect(stage).not.toBeNull()
    expect(stage.children).toHaveLength(2)
    expect(pill.querySelector('.umm-sht-pager')!.getAttribute('data-umm-slot')).toBe('active')
    expect(pill.querySelector('.umm-sht-searchbox')!.getAttribute('data-umm-slot')).toBe('hidden-up')
    const switchBtn = pill.querySelector('.umm-sht-island-switch') as HTMLButtonElement
    expect(switchBtn.getAttribute('aria-label')).toBe('搜索 / 分页')
    switchBtn.click()
    expect(pill.querySelector('.umm-sht-searchbox')!.getAttribute('data-umm-slot')).toBe('active')
    expect(pill.querySelector('.umm-sht-pager')!.getAttribute('data-umm-slot')).toBe('hidden-down')

    // header 单行结构：row--context 三列（计数左 ｜ 居中簇 ｜ 统计区右）；
    // 搜索页动作已全部上移居中簇 → 不再有 nav 行。
    expect(shell.querySelector('.umm-sht-row--context')).not.toBeNull()
    expect(shell.querySelector('.umm-sht-row--nav')).toBeNull()
    const context = shell.querySelector('.umm-sht-context') as HTMLElement
    expect(context.textContent).toContain('找到 "ABC" 相关内容 3 个')
    // 右上角统计区 = 两个 box：本页状态（.umm-header-info）+ 全局三段（.umm-sht-stats）
    const statArea = shell.querySelector('.umm-sht-stat-area') as HTMLElement
    expect(statArea.children).toHaveLength(2)
    const pageBox = shell.querySelector('.umm-header-info') as HTMLElement
    const globalBox = shell.querySelector('.umm-sht-stats') as HTMLElement
    expect(pageBox.textContent).toBe('本页已看: 0')
    expect(globalBox.textContent).toContain('日系: 9638')
    expect(globalBox.textContent).toContain('欧美: 0')
    expect(globalBox.textContent).toContain('帖子: 36')
  })

  test('站点空结果：空态「没有搜索结果」；岛退化为仅搜索（无分页）', async () => {
    // #threadlist 在场（守卫通过）但无结果行
    const dom = mountPage('<div id="ct"></div><ul id="threadlist"></ul>')
    await runSehuatangSearchApp()

    const shell = shellOf(dom)
    expect(shell.querySelector('.umm-sht-empty-title')!.textContent).toBe('没有搜索结果')
    expect(shell.querySelector('.umm-sht-empty')!.className).toContain('umm-sht-empty')

    const pill = shell.querySelector('#umm-sht-floatbar') as HTMLElement
    expect(pill.querySelector('.umm-sht-searchbox')).not.toBeNull()
    expect(pill.querySelector('.umm-sht-pager')).toBeNull()
    // 单方入场 → 无摩天轮舞台与轮替控件（不可切换）
    expect(pill.querySelector('.umm-sht-island-stage')).toBeNull()
    expect(pill.querySelector('.umm-sht-island-switch')).toBeNull()
    // 空分支不渲染卡片
    expect(shell.querySelector('.umm-sht-search-grid')!.children).toHaveLength(0)
  })

  test('全噪音过滤：空态「结果均来自无关分区」；岛仍保留搜索入口', async () => {
    const dom = mountPage(
      `${SEARCH_META}<ul id="threadlist">${searchRow('444', 143)}${searchRow('555', 143)}</ul>${SEARCH_PGS}`,
    )
    await runSehuatangSearchApp()

    const shell = shellOf(dom)
    expect(shell.querySelector('.umm-sht-empty-title')!.textContent).toBe('结果均来自无关分区')

    const pill = shell.querySelector('#umm-sht-floatbar') as HTMLElement
    expect(pill.querySelector('.umm-sht-searchbox')).not.toBeNull()
    expect(pill.querySelector('.umm-sht-pager')).toBeNull()
  })

  test('DOM 守卫：无 #threadlist 且无「结果:」meta → dismiss 还原（overlay host 移除）', async () => {
    const dom = mountPage('<div id="ct"><p>非结果页内容</p></div>')
    await runSehuatangSearchApp()
    expect(dom.window.document.getElementById(OVERLAY_ID)).toBeNull()
  })

  test('搜索词回填：结果页 kw 优先（夹具实态 URL，百分号解码）→ 岛内输入框预填', async () => {
    // .localref 夹具 saved from url 的真实形态（结果页用 kw，非 srchtxt）
    const kwUrl = 'https://www.sehuatang.net/search.php?mod=forum&searchid=0&orderby=lastpost&ascdesc=desc&searchsubmit=yes&kw=%E8%87%AA%E8%A1%8C%E6%89%93%E5%8C%85'
    const dom = mountPage(
      '<div id="ct"><h2>结果: <em>找到 "<span>自行打包</span>" 相关内容 1 个</em></h2></div>' +
      `<ul id="threadlist">${searchRow('111', 95)}</ul>`,
      kwUrl,
    )
    await runSehuatangSearchApp()

    const shell = shellOf(dom)
    const input = shell.querySelector('.umm-sht-search-input') as HTMLInputElement
    expect(input.value).toBe('自行打包')
  })

  test('批量初检 dim：命中已看集的卡片落类（withDimBatch 路径）+ 免过渡类自动撤销 + 统计跟进', async () => {
    const dom = mountPage(
      `${SEARCH_META}<ul id="threadlist">${searchRow('111', 95)}${searchRow('222', 103)}</ul>`,
    )
    // 覆盖消息 stub：批量已看检查返回 TID-111 命中
    const g = globalThis as unknown as { chrome: { runtime: { sendMessage: (msg: { type?: string }, cb: (r: unknown) => void) => void } } }
    g.chrome.runtime.sendMessage = (msg, cb) => {
      if (msg?.type === 'ADULT_AV_STATS') cb({ success: true, jp: 1, us: 0, tid: 1 })
      else cb({ success: true, watched: ['TID-111'] })
    }

    await runSehuatangSearchApp()

    const shell = shellOf(dom)
    const cards = Array.from(shell.querySelectorAll('.umm-sht-search-card')) as HTMLElement[]
    const dimmed = cards.filter((c) => c.classList.contains('umm-viewed'))
    expect(dimmed).toHaveLength(1)
    expect(dimmed[0]!.getAttribute('data-tid')).toBe('TID-111')

    const grid = shell.querySelector('.umm-sht-search-grid') as HTMLElement
    // 免过渡类由 rAF 撤销（harness 中 rAF = setTimeout 0，等一轮宏任务）
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(grid.classList.contains('umm-sht-dim-batch')).toBe(false)
    // 统计行跟进：本页已看 = 命中数
    expect((shell.querySelector('.umm-header-info') as HTMLElement).textContent).toBe('本页已看: 1')
  })

  test('点击标题 dim → 统计行「本页已看」即时 0→1（onDim 刷新链路）', async () => {
    const dom = mountPage(
      `${SEARCH_META}<ul id="threadlist">${searchRow('111', 95)}${searchRow('222', 103)}</ul>`,
    )
    await runSehuatangSearchApp()

    const shell = shellOf(dom)
    const pageBox = shell.querySelector('.umm-header-info') as HTMLElement
    expect(pageBox.textContent).toBe('本页已看: 0')

    // 点击首条标题链接（事件委托：仅页面状态 dim，不落库）
    const firstTitle = shell.querySelector('.umm-sht-search-title a') as HTMLAnchorElement
    firstTitle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))

    const pageBoxAfter = shell.querySelector('.umm-header-info') as HTMLElement
    expect(pageBoxAfter.textContent).toBe('本页已看: 1')
  })
})

// ---------------------------------------------------------------------------
// 首页夹具（category_X 容器 + #chart .chart 统计，结构经 extract-home 契约核实）
// ---------------------------------------------------------------------------

const HOME_HTML = `
  <div id="ct">
    <div id="chart" class="y"><div class="chart"><em>今日: 123</em><em>昨日: 456</em><em>帖子: 789</em><em>会员: 12</em></div></div>
    <div class="bm bm_c">
      <h2 class="xs2"><span>原创BT电影</span></h2>
      <div id="category_1" class="bm_c">
        <table><tbody><tr>
          <td class="fl_g">
            <div class="fl_icn_g"><img src="forum_new.gif" alt=""></div>
            <dl>
              <dt><a href="forum-36-1.html">国产原创</a><em class="xw0 xi1">(5)</em></dt>
              <dd><em>主题: 1万</em><em>帖数: 247万</em></dd>
              <dd><a href="forum.php?mod=redirect&amp;tid=9&amp;goto=lastpost">1 小时前</a></dd>
            </dl>
          </td>
        </tr></tbody></table>
      </div>
    </div>
  </div>`

test.describe('app-home 端到端渲染（灵动岛统一布局）', () => {
  test('首页：岛 = 仅搜索（无分页/动作）；header 无搜索框；分区卡片照常渲染', async () => {
    const dom = mountPage(HOME_HTML, 'https://www.sehuatang.net/forum.php')
    await runSehuatangIndexApp()

    const shell = shellOf(dom)
    expect(shell.className).toContain('umm-sht-shell--island')

    // header：无搜索框；动作组 = 仅 ☰（当前页即首页，不加 🏠 自链按钮）
    const header = shell.querySelector('.umm-sehuatang-header') as HTMLElement
    expect(header.querySelector('.umm-sht-searchbox')).toBeNull()
    expect(Array.from(header.querySelectorAll('.umm-sht-action')).map((n) => n.textContent)).toEqual(['☰'])
    expect(header.querySelector('a.umm-sht-home-btn')).toBeNull()

    // 分区 + 子版块卡片（提取链路回归锚点）
    expect(shell.querySelectorAll('.umm-sht-home-section')).toHaveLength(1)
    expect(shell.querySelectorAll('.umm-sht-home-card')).toHaveLength(1)

    // 灵动岛：首页导航层仅搜索入口
    const pill = shell.querySelector('#umm-sht-floatbar') as HTMLElement
    expect(pill).not.toBeNull()
    expect(pill.querySelector('.umm-sht-searchbox')).not.toBeNull()
    expect(pill.querySelector('.umm-sht-pager')).toBeNull()
    // 岛内 .umm-sht-action 仅 🔍 搜索按钮
    expect(pill.querySelectorAll('.umm-sht-action')).toHaveLength(1)
    // 首页无分页 → 单方入场：无摩天轮舞台与轮替控件
    expect(pill.querySelector('.umm-sht-island-stage')).toBeNull()
    expect(pill.querySelector('.umm-sht-island-switch')).toBeNull()

    // header 单行结构：row--context 三列（站点统计左 ｜ 居中簇（仅 ☰）｜ 统计区右）
    expect(shell.querySelector('.umm-sht-row--context')).not.toBeNull()
    expect(shell.querySelector('.umm-sht-row--nav')).toBeNull()
    const center = shell.querySelector('.umm-sht-center') as HTMLElement
    expect(Array.from(center.querySelectorAll('.umm-sht-action')).map((n) => n.textContent)).toEqual(['☰'])
    const context = shell.querySelector('.umm-sht-context') as HTMLElement
    expect(context.textContent).toContain('今日: 123')
    // 右上统计区仅全局三段一个 box（首页是导航层，无本页已看/隐藏概念）
    const statArea = shell.querySelector('.umm-sht-stat-area') as HTMLElement
    expect(statArea.children).toHaveLength(1)
    const globalBox = shell.querySelector('.umm-sht-stats') as HTMLElement
    expect(globalBox.textContent).toContain('日系: 9638')
    expect(globalBox.textContent).toContain('欧美: 0')
    expect(globalBox.textContent).toContain('帖子: 36')
    expect(shell.querySelector('.umm-header-info')).toBeNull()
  })
})
