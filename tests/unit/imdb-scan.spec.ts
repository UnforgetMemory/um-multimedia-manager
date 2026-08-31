import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import { scanIMDbPageStatus, renderIMDbStatusChip } from '@/entrypoints/content/handlers/imdb'
import type { UrlIdentity } from '@/types'

/**
 * IMDb 详情页扫描逻辑回归锚点。
 *
 * 基准夹具取自 .localref 离线快照
 * `Jen hsuan chih jen tsao lang che (TV Series 2023– ) - IMDb.html`：
 * - 未评分按钮：aria-label "Rate <title>"，内含
 *   `hero-rating-bar__user-rating__unrated` → 文案 "Rate"；
 * - 未观看按钮：`data-testid="watched-button-tt26687035"`，
 *   aria-label "Mark <title> as watched"，文案 "Mark as watched"，
 *   且**没有** aria-pressed 属性。
 *
 * 历史缺陷（本测试锁定修复）：
 * 1. `/watched/i` 命中未观看 CTA 文案 "Mark as watched" → 未观看页面被误判 done；
 * 2. 评分正则对 "Rate <title>" 全文匹配数字 → 片名含数字（如 "1883"）时
 *    未评分页面被误读成评分。
 */

// 模块级全局（content-script 代码引用裸 document/window 全局标识符）
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'https://www.imdb.com/title/tt26687035/',
  pretendToBeVisual: true,
})
;(globalThis as { document?: unknown }).document = dom.window.document
;(globalThis as { window?: unknown }).window = dom.window

function installFixture(html: string): void {
  dom.window.document.body.innerHTML = html
}

/** 离线快照等价结构：标题 + 元信息行 + 未评分按钮 + 未观看按钮。 */
function offlineSnapshotHtml(): string {
  return `
    <div class="sc-dcbc0103-0 fRoBlK">
      <h1 data-testid="hero__pageTitle">Jen hsuan chih jen tsao lang che</h1>
      <ul class="ipc-inline-list ipc-inline-list--show-dividers" role="presentation">
        <li>TV Series</li><li>2023–</li><li>TV-MA</li><li>50m</li>
      </ul>
      <div data-testid="hero-rating-bar__user-rating">
        <button aria-label="Rate Jen hsuan chih jen tsao lang che">
          <div data-testid="hero-rating-bar__user-rating__unrated">Rate</div>
        </button>
      </div>
    </div>
    <button data-testid="watched-button-tt26687035"
      aria-label="Mark Jen hsuan chih jen tsao lang che as watched">
      <span>Mark as watched</span>
    </button>
  `
}

test.describe('scanIMDbPageStatus — 离线快照基准', () => {
  test('未评分 + 未观看（离线快照原样）→ none / rating 0', async () => {
    installFixture(offlineSnapshotHtml())
    const result = await scanIMDbPageStatus()
    expect(result).toEqual({ status: 'none', rating: 0 })
  })

  test('未观看 CTA "Mark as watched"（无 aria-pressed）→ 不判 done（回归锚点）', async () => {
    installFixture(`
      <button data-testid="watched-button-tt26687035"
        aria-label="Mark Jen hsuan chih jen tsao lang che as watched">
        <span>Mark as watched</span>
      </button>
    `)
    expect(await scanIMDbPageStatus()).toEqual({ status: 'none', rating: 0 })
  })

  test('aria-pressed="true" → done', async () => {
    installFixture(`
      <button data-testid="watched-button-tt26687035" aria-pressed="true">
        <span>Watched</span>
      </button>
    `)
    expect(await scanIMDbPageStatus()).toEqual({ status: 'done', rating: 0 })
  })

  test('非 CTA 的 "Watched" 文案（无 aria-pressed）→ done', async () => {
    installFixture(`
      <button data-testid="watched-button-tt26687035">
        <span>Watched</span>
      </button>
    `)
    expect(await scanIMDbPageStatus()).toEqual({ status: 'done', rating: 0 })
  })

  test('已评分（aria-label "Your rating: 8/10"）→ done + rating 8', async () => {
    installFixture(`
      <div data-testid="hero-rating-bar__user-rating">
        <button aria-label="Your rating: 8/10"><span>8</span></button>
      </div>
    `)
    expect(await scanIMDbPageStatus()).toEqual({ status: 'done', rating: 8 })
  })

  test('已评分但 aria-label 非英文（无 unrated 节点）→ done + rating（locale 无关门控）', async () => {
    installFixture(`
      <div data-testid="hero-rating-bar__user-rating">
        <button aria-label="评分 8/10"><span>8</span></button>
      </div>
    `)
    expect(await scanIMDbPageStatus()).toEqual({ status: 'done', rating: 8 })
  })

  test('片名含数字的未评分按钮（Rate 1883）→ rating 0 / none（回归锚点）', async () => {
    installFixture(`
      <div data-testid="hero-rating-bar__user-rating">
        <button aria-label="Rate 1883">
          <div data-testid="hero-rating-bar__user-rating__unrated">Rate</div>
        </button>
      </div>
    `)
    expect(await scanIMDbPageStatus()).toEqual({ status: 'none', rating: 0 })
  })

  test('已评分+已观看（已评分快照等价夹具）→ done + rating 8', async () => {
    // .localref「IMDb 已评分」快照实证结构：
    // 观看按钮 aria-label "Watched <title>"、文案 "Watched"、无 aria-pressed；
    // 评分按钮 aria-label "Your rating: 8"、__score 节点、无 __unrated。
    installFixture(`
      <div data-testid="hero-rating-bar__user-rating">
        <button aria-label="Your rating: 8">
          <span><div data-testid="hero-rating-bar__user-rating__score"><span>8</span>/10</div></span>
        </button>
      </div>
      <button data-testid="watched-button-tt26687035" aria-label="Watched Jen hsuan chih jen tsao lang che">
        <span>Watched</span>
      </button>
    `)
    expect(await scanIMDbPageStatus()).toEqual({ status: 'done', rating: 8 })
  })
})

test.describe('renderIMDbStatusChip — 插入位置', () => {
  const identity: UrlIdentity = {
    platform: 'imdb',
    type: 'tv',
    providerId: 'tt26687035',
    url: 'https://www.imdb.com/title/tt26687035/',
  }

  test('chip 插在元信息行之后，不打断标题与元信息行的邻接（回归锚点）', async () => {
    installFixture(`
      <div class="sc-dcbc0103-0 fRoBlK">
        <h1 data-testid="hero__pageTitle">Jen hsuan chih jen tsao lang che</h1>
        <ul class="ipc-inline-list ipc-inline-list--show-dividers" role="presentation">
          <li>TV Series</li>
        </ul>
      </div>
    `)
    await renderIMDbStatusChip(identity, 0, 0)

    const h1 = dom.window.document.querySelector('[data-testid="hero__pageTitle"]')
    const meta = dom.window.document.querySelector('ul.ipc-inline-list')
    expect(h1?.nextElementSibling).toBe(meta)
    expect(meta?.nextElementSibling?.classList.contains('umm-status-chip')).toBe(true)
  })

  test('重复渲染替换旧 chip，不产生副本', async () => {
    installFixture(`
      <div class="sc-dcbc0103-0 fRoBlK">
        <h1 data-testid="hero__pageTitle">Jen hsuan chih jen tsao lang che</h1>
        <ul class="ipc-inline-list ipc-inline-list--show-dividers" role="presentation">
          <li>TV Series</li>
        </ul>
      </div>
    `)
    await renderIMDbStatusChip(identity, 0, 0)
    await renderIMDbStatusChip(identity, 2, 8)

    const chips = dom.window.document.querySelectorAll('.umm-status-chip[data-umm-owner]')
    expect(chips.length).toBe(1)
    expect(chips[0]?.getAttribute('data-status')).toBe('done')
  })
})
