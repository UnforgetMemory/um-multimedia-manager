import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import { handleIMDbDetailPage, stopIMDbStateObserver } from '@/entrypoints/content/handlers/imdb'
import type { UrlIdentity } from '@/types'

/**
 * IMDb 动态状态观察回归锚点。
 *
 * 背景（.localref 已评分快照实证）：观看按钮 / 用户评分是客户端水合后才
 * 渲染、用户操作会原地变化。仅首轮扫描会留下过期 chip——快照中页面已
 * 「Watched + Your rating: 8」，chip 却是「📦 已看(本地)」。
 *
 * 本套测试锁定：状态节点出现/文案变化/评分出现/状态撤销均触发重扫并
 * 重跑完整管线（scan→merge→render→save），无关 DOM 变更不触发。
 */

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://www.imdb.com/title/tt26687035/',
  pretendToBeVisual: true,
})
;(globalThis as { document?: unknown }).document = dom.window.document
;(globalThis as { window?: unknown }).window = dom.window
;(globalThis as { Element?: unknown }).Element = dom.window.Element
;(globalThis as { MutationObserver?: unknown }).MutationObserver = dom.window.MutationObserver
if (typeof (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame === 'undefined') {
  ;(globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame =
    dom.window.requestAnimationFrame.bind(dom.window)
  ;(globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame =
    dom.window.cancelAnimationFrame.bind(dom.window)
}

const identity: UrlIdentity = {
  platform: 'imdb',
  type: 'tv',
  providerId: 'tt26687035',
  url: 'https://www.imdb.com/title/tt26687035/',
}

interface SentMessage {
  type: string
  payload?: Record<string, unknown>
}

interface StubOptions {
  localRecord?: { status: number; rating: number } | null
}

/** chrome.runtime stub：DB_GET 回放 localRecord，DB_PUT 捕获消息。 */
function installChromeStub(opts: StubOptions = {}): { sent: SentMessage[] } {
  const sent: SentMessage[] = []
  const chromeStub = {
    runtime: {
      id: 'test-extension',
      lastError: undefined,
      sendMessage: (msg: SentMessage, cb?: (res: unknown) => void) => {
        sent.push(msg)
        let response: unknown = { success: true }
        if (msg.type === 'DB_GET') {
          response = { success: true, record: opts.localRecord ?? null }
        }
        cb?.(response)
      },
      onMessage: { addListener: () => {} },
    },
  }
  ;(globalThis as { chrome?: unknown }).chrome = chromeStub
  return { sent }
}

function clearChromeStub(): void {
  ;(globalThis as { chrome?: unknown }).chrome = undefined
}

/** 标题 + 元信息行（chip 锚点）。 */
const TITLE_BLOCK = `
  <div class="sc-dcbc0103-0 fRoBlK">
    <h1 data-testid="hero__pageTitle">Jen hsuan chih jen tsao lang che</h1>
    <ul class="ipc-inline-list ipc-inline-list--show-dividers" role="presentation">
      <li>TV Series</li>
    </ul>
  </div>
`

const WATCHED_BUTTON = `
  <button data-testid="watched-button-tt26687035" aria-label="Watched Jen hsuan chih jen tsao lang che">
    <span>Watched</span>
  </button>
`

const UNWATCHED_BUTTON = `
  <button data-testid="watched-button-tt26687035" aria-label="Mark Jen hsuan chih jen tsao lang che as watched">
    <span>Mark as watched</span>
  </button>
`

const RATED_BAR = `
  <div data-testid="hero-rating-bar__user-rating">
    <button aria-label="Your rating: 8">
      <span><div data-testid="hero-rating-bar__user-rating__score"><span>8</span>/10</div></span>
    </button>
  </div>
`

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function chipStatus(): string | null {
  return dom.window.document.querySelector('.umm-status-chip[data-umm-owner]')?.getAttribute('data-status') ?? null
}

test.beforeEach(async () => {
  stopIMDbStateObserver()
  dom.window.document.body.innerHTML = ''
})

test.afterEach(async () => {
  stopIMDbStateObserver()
  clearChromeStub()
})

test.describe('handleIMDbDetailPage — 动态状态观察', () => {
  test('水合补扫：页面已看（本地无记录）→ 首轮 none，观看按钮随后出现 → 自动变 done 并写库', async () => {
    const { sent } = installChromeStub({ localRecord: null })
    dom.window.document.body.innerHTML = TITLE_BLOCK

    await handleIMDbDetailPage(identity)
    expect(chipStatus()).toBe('none')

    // 模拟客户端水合：观看按钮晚于首轮扫描出现
    dom.window.document.body.insertAdjacentHTML('beforeend', WATCHED_BUTTON)
    await sleep(100)

    expect(chipStatus()).toBe('done')
    const puts = sent.filter((m) => m.type === 'DB_PUT')
    expect(puts.length).toBe(1)
    const record = (puts[0]?.payload as { record?: { status?: number } })?.record
    expect(record?.status).toBe(2)
  })

  test('本地已看 + 页面水合为已看 → chip 从「已看(本地)」翻转为无缓存提示的 done（快照场景修复）', async () => {
    installChromeStub({ localRecord: { status: 2, rating: 0 } })
    dom.window.document.body.innerHTML = TITLE_BLOCK

    await handleIMDbDetailPage(identity)
    // 首轮：页面状态未水合 → 本地 done 呈现为缓存提示（锁定缓存提示路径）
    const labelBefore = dom.window.document.querySelector('.umm-status-chip .umm-label')?.textContent ?? ''
    expect(chipStatus()).toBe('done')
    expect(labelBefore).toContain('本地')

    dom.window.document.body.insertAdjacentHTML('beforeend', WATCHED_BUTTON)
    await sleep(100)

    expect(chipStatus()).toBe('done')
    const label = dom.window.document.querySelector('.umm-status-chip .umm-label')?.textContent ?? ''
    expect(label).not.toContain('本地')
  })

  test('属性原位变化（aria-pressed 置 true，不替换节点）→ 重扫为 done', async () => {
    installChromeStub({ localRecord: null })
    dom.window.document.body.innerHTML = TITLE_BLOCK + UNWATCHED_BUTTON

    await handleIMDbDetailPage(identity)
    expect(chipStatus()).toBe('none')

    // attributes 通道：仅改属性、不增删节点
    dom.window.document.querySelector('[data-testid^="watched-button-"]')?.setAttribute('aria-pressed', 'true')
    await sleep(100)

    expect(chipStatus()).toBe('done')
  })

  test('文案原位变化（characterData 通道）→ 重扫为 done', async () => {
    installChromeStub({ localRecord: null })
    dom.window.document.body.innerHTML = TITLE_BLOCK + UNWATCHED_BUTTON

    await handleIMDbDetailPage(identity)
    expect(chipStatus()).toBe('none')

    // characterData 通道：文本节点原地 nodeValue 变更，不增删节点
    const span = dom.window.document.querySelector('[data-testid^="watched-button-"] span')
    const textNode = span?.firstChild
    if (textNode) {
      ;(textNode as Text).nodeValue = 'Watched'
    }
    await sleep(100)

    expect(chipStatus()).toBe('done')
  })

  test('点击切换：Mark as watched → Watched（子节点整体替换）→ 重扫为 done', async () => {
    installChromeStub({ localRecord: null })
    dom.window.document.body.innerHTML = TITLE_BLOCK + UNWATCHED_BUTTON

    await handleIMDbDetailPage(identity)
    expect(chipStatus()).toBe('none')

    // 模拟 IMDb 点击后重渲染按钮（旧节点移除 + 新节点插入）
    const old = dom.window.document.querySelector('[data-testid^="watched-button-"]')
    old?.remove()
    dom.window.document.body.insertAdjacentHTML('beforeend', WATCHED_BUTTON)
    await sleep(100)

    expect(chipStatus()).toBe('done')
  })

  test('评分出现：未评分 → Your rating: 8 → 重扫 done + rating 8', async () => {
    installChromeStub({ localRecord: null })
    dom.window.document.body.innerHTML = TITLE_BLOCK

    await handleIMDbDetailPage(identity)
    expect(chipStatus()).toBe('none')

    dom.window.document.body.insertAdjacentHTML('beforeend', RATED_BAR)
    await sleep(100)

    expect(chipStatus()).toBe('done')
    const rating = dom.window.document.querySelector('.umm-status-chip .umm-rating')?.textContent ?? ''
    expect(rating).toBe('8/10')
  })

  test('状态撤销：Watched → Mark as watched（本地无记录）→ 重扫回 none', async () => {
    installChromeStub({ localRecord: null })
    dom.window.document.body.innerHTML = TITLE_BLOCK + WATCHED_BUTTON

    await handleIMDbDetailPage(identity)
    expect(chipStatus()).toBe('done')

    const old = dom.window.document.querySelector('[data-testid^="watched-button-"]')
    old?.remove()
    dom.window.document.body.insertAdjacentHTML('beforeend', UNWATCHED_BUTTON)
    await sleep(100)

    expect(chipStatus()).toBe('none')
  })

  test('无关 DOM 变更不触发重扫（DB_GET 次数不变）', async () => {
    const { sent } = installChromeStub({ localRecord: null })
    dom.window.document.body.innerHTML = TITLE_BLOCK + UNWATCHED_BUTTON

    await handleIMDbDetailPage(identity)
    const getsBefore = sent.filter((m) => m.type === 'DB_GET').length

    // 与状态载体无关的节点变更
    dom.window.document.body.insertAdjacentHTML('beforeend', '<div class="random">hello</div>')
    await sleep(100)

    const getsAfter = sent.filter((m) => m.type === 'DB_GET').length
    expect(getsAfter).toBe(getsBefore)
    expect(chipStatus()).toBe('none')
  })
})
