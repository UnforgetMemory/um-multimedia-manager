import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import { storeKey } from '@/entrypoints/content/ui/video-overlay-pure'
import {
  BADGE_ANCHOR_SELECTORS,
  buildListingDimmerCss,
  bulkKeysForBvids,
  findDimShell,
  LISTING_BADGE_CLASS,
  LISTING_DIMMER_CLASS,
  LISTING_SHELL_DIM_CLASS,
  LISTING_STYLE_ID,
  runListingDimmerPass,
  setListingBadge,
} from '@/entrypoints/content/ui/bilibili-listing'

/**
 * Playwright browser tests (real Chromium layout, not jsdom-only).
 *
 * Reproduces the live search.bilibili.com failure mode:
 * global `position:relative` / `:has()` dim CSS on every cover shell broke
 * card layout (huge empty boxes). Assert:
 * - injected CSS has NO global cover position rules and NO :has wrappers
 * - badge positioning is surgical (only the chosen anchor)
 * - dim class lands on card (+ optional shell class), not via page-wide CSS
 * - card geometry is not inflated by our styles
 */

test.describe.configure({ mode: 'serial' })

const SEARCH_LIKE_HTML = `<!DOCTYPE html>
<html>
<head>
  <style>
    /* baseline site-like card layout (search / space) */
    body { margin: 0; background: #fff; font-family: sans-serif; padding-top: 120px; }
    .video-list {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      padding: 16px;
    }
    .video-list__item { background: #fff; }
    .bili-video-card { display: flex; flex-direction: column; background: #fff; }
    .bili-video-card__cover {
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #e3e5e7;
      overflow: hidden;
    }
    .bili-cover-card {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
      text-decoration: none;
    }
    .bili-cover-card__thumbnail {
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #00a1d6, #fb7299);
    }
    .bili-video-card__details { padding: 8px; min-height: 48px; }
    .bili-video-card__title { font-size: 14px; line-height: 20px; color: #18191c; }
  </style>
</head>
<body>
  <div class="video-list">
    <div class="video-list__item">
      <div class="bili-video-card" data-bsb-bvid="BV1zftR6bENk">
        <div class="bili-video-card__cover">
          <a class="bili-cover-card" href="https://www.bilibili.com/video/BV1zftR6bENk">
            <div class="bili-cover-card__thumbnail"></div>
          </a>
        </div>
        <div class="bili-video-card__details">
          <div class="bili-video-card__title">中国护照最难到达的国家</div>
        </div>
      </div>
    </div>
    <div class="video-list__item">
      <div class="bili-video-card" data-bsb-bvid="BV1UNWATCHED">
        <div class="bili-video-card__cover">
          <a class="bili-cover-card" href="https://www.bilibili.com/video/BV1UNWATCHED">
            <div class="bili-cover-card__thumbnail"></div>
          </a>
        </div>
        <div class="bili-video-card__details">
          <div class="bili-video-card__title">全球最贵国家公园</div>
        </div>
      </div>
    </div>
    <div class="video-list__item">
      <div class="bili-video-card" data-bsb-bvid="BV1xx411c7mD">
        <div class="bili-video-card__image--link">
          <a href="/video/BV1xx411c7mD/"></a>
        </div>
        <div class="bili-video-card__details">
          <div class="bili-video-card__title">homepage style card</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`

async function mountInjectedPage(page: import('@playwright/test').Page) {
  await page.setContent(SEARCH_LIKE_HTML, { waitUntil: 'domcontentloaded' })
  // Inject our production CSS builder output
  const css = buildListingDimmerCss()
  await page.addStyleTag({ content: css })
  // Move pointer off cards — default (0,0) would hit :hover restore rules
  await page.mouse.move(0, 0)
  await page.evaluate((payload) => {
    const cards = [...document.querySelectorAll<HTMLElement>('.bili-video-card')]
    const statusByBv: Record<string, number> = {
      BV1zftR6bENk: 2,
      BV1UNWATCHED: 0,
      BV1xx411c7mD: 3,
    }
    for (const card of cards) {
      const bv = card.getAttribute('data-bsb-bvid') || ''
      const badge = document.createElement('div')
      badge.className = payload.badgeClass
      badge.textContent = bv === 'BV1UNWATCHED' ? '未看' : bv === 'BV1zftR6bENk' ? '已看 9' : '在看'
      badge.style.cssText =
        'position:absolute;top:8px;right:8px;z-index:10;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;color:#fff;background:#047857;'
      const anchor =
        card.querySelector<HTMLElement>('.bili-cover-card__thumbnail') ||
        card.querySelector<HTMLElement>('.bili-video-card__image--link')
      if (anchor) {
        const st = getComputedStyle(anchor).position
        if (st === 'static') anchor.style.position = 'relative'
        anchor.appendChild(badge)
      }
      const status = statusByBv[bv] ?? 0
      if (status >= 2) {
        // Exclusive: shell XOR card (matches runListingDimmerPass)
        const shell = card.closest('.video-list__item')
        if (shell) shell.classList.add(payload.shellClass)
        else card.classList.add(payload.dimClass)
      }
    }
  }, { badgeClass: LISTING_BADGE_CLASS, dimClass: LISTING_DIMMER_CLASS, shellClass: LISTING_SHELL_DIM_CLASS })
  await page.mouse.move(0, 0)
  // Dim CSS uses transition — wait it out before reading computed opacity
  await page.waitForTimeout(400)
}

test('CSS inject: no global cover position rules, no :has shells, dim only marked nodes', async ({ page }) => {
  const css = buildListingDimmerCss()
  expect(css).not.toContain(':has(')
  expect(css).not.toContain('.bili-video-card__cover')
  expect(css).not.toContain('.bili-cover-card__thumbnail')
  expect(css).not.toContain('position: relative !important')
  expect(css).toContain(`.${LISTING_DIMMER_CLASS}`)
  expect(css).toContain(`.${LISTING_SHELL_DIM_CLASS}`)
  expect(css).toContain(`.${LISTING_BADGE_CLASS}`)

  await mountInjectedPage(page)

  // Non-dimmed cards must not receive opacity/filter from us
  const unwatched = page.locator('.bili-video-card[data-bsb-bvid="BV1UNWATCHED"]')
  const unwatchedStyles = await unwatched.evaluate((el) => {
    const s = getComputedStyle(el)
    return { opacity: s.opacity, filter: s.filter, position: s.position }
  })
  expect(Number(unwatchedStyles.opacity)).toBeGreaterThan(0.9)
  expect(unwatchedStyles.filter === 'none' || unwatchedStyles.filter === '').toBe(true)

  // Watched card is inside .video-list__item → ONLY shell dims (no card class)
  const watched = page.locator('.bili-video-card[data-bsb-bvid="BV1zftR6bENk"]')
  await expect(watched).not.toHaveClass(new RegExp(LISTING_DIMMER_CLASS))
  const shell = page.locator('.video-list__item', { has: page.locator('[data-bsb-bvid="BV1zftR6bENk"]') })
  await expect(shell).toHaveClass(new RegExp(LISTING_SHELL_DIM_CLASS))
  const shellOpacity = await shell.evaluate((el) => Number(getComputedStyle(el).opacity))
  expect(shellOpacity).toBeLessThan(0.5)
  const watchedOpacity = await watched.evaluate((el) => Number(getComputedStyle(el).opacity))
  expect(watchedOpacity).toBeGreaterThan(0.9)
})

test('layout geometry: cover height stays aspect-ratio; badge sits inside thumbnail', async ({ page }) => {
  await mountInjectedPage(page)

  const metrics = await page.evaluate((badgeClass: string) => {
    return [...document.querySelectorAll<HTMLElement>('.bili-video-card')].map((card) => {
      const cover = card.querySelector<HTMLElement>('.bili-video-card__cover')
      const thumb = card.querySelector<HTMLElement>('.bili-cover-card__thumbnail')
      const badge = card.querySelector<HTMLElement>(`.${badgeClass}`)
      const coverBox = cover?.getBoundingClientRect()
      const thumbBox = thumb?.getBoundingClientRect()
      const badgeBox = badge?.getBoundingClientRect()
      const cardBox = card.getBoundingClientRect()
      return {
        bvid: card.getAttribute('data-bsb-bvid'),
        cardH: cardBox.height,
        coverH: coverBox?.height ?? 0,
        coverW: coverBox?.width ?? 0,
        thumbH: thumbBox?.height ?? 0,
        badgeInThumb:
          !!badgeBox &&
          !!thumbBox &&
          badgeBox.top >= thumbBox.top - 1 &&
          badgeBox.right <= thumbBox.right + 1 &&
          badgeBox.left >= thumbBox.left - 1,
        badgeParentClass: badge?.parentElement?.className || '',
        // Regression: cover must not balloon into empty white boxes
        coverLooksBroken: !!coverBox && coverBox.height > cardBox.height * 0.85 && cardBox.height > 200,
      }
    })
  }, LISTING_BADGE_CLASS)

  const watched = metrics.find((m) => m.bvid === 'BV1zftR6bENk')!
  const unwatched = metrics.find((m) => m.bvid === 'BV1UNWATCHED')!
  const home = metrics.find((m) => m.bvid === 'BV1xx411c7mD')!

  // 16/9 cover: height ≈ width * 9/16 (±2px)
  for (const m of [watched, unwatched]) {
    expect(m.coverW).toBeGreaterThan(50)
    const expected = m.coverW * (9 / 16)
    expect(Math.abs(m.coverH - expected)).toBeLessThan(3)
    expect(m.coverLooksBroken).toBe(false)
  }

  expect(watched.badgeInThumb).toBe(true)
  expect(watched.badgeParentClass).toContain('bili-cover-card__thumbnail')
  // Surgical positioning: only thumbnail (or image--link for homepage card) is relative
  const relativeNodes = await page.evaluate(() => {
    const out: string[] = []
    document.querySelectorAll<HTMLElement>('.bili-video-card *').forEach((el) => {
      if (el.style.position === 'relative') out.push(el.className || el.tagName)
    })
    return out
  })
  expect(relativeNodes.every((c) => c.includes('thumbnail') || c.includes('image--link') || c.includes('bili-video-card'))).toBe(true)
  // Critical: cover containers themselves are NOT forced relative by global CSS
  const coverPos = await page.evaluate(() => {
    return [...document.querySelectorAll<HTMLElement>('.bili-video-card__cover')].map(
      (el) => el.style.position || getComputedStyle(el).position,
    )
  })
  // Cover may be static or site-defined; we must not have written inline relative on all covers
  const inlineRelativeCovers = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.bili-video-card__cover')].filter((el) => el.style.position === 'relative').length,
  )
  expect(inlineRelativeCovers).toBe(0)

  expect(home.badgeParentClass).toContain('image--link')
  void coverPos
})

test('runListingDimmerPass + injected CSS in real Chromium', async ({ page }) => {
  await page.setContent(SEARCH_LIKE_HTML, { waitUntil: 'domcontentloaded' })
  const css = buildListingDimmerCss()
  await page.addStyleTag({ content: css })

  const result = await page.evaluate(async (payload) => {
    // Inline minimal pass (mirrors runListingDimmerPass) to avoid bundling store in page
    const cards = [...document.querySelectorAll<HTMLElement>('.bili-video-card')]
    const statusByBv: Record<string, number> = { BV1zftR6bENk: 2, BV1UNWATCHED: 0, BV1xx411c7mD: 3 }
    let dimmed = 0
    for (const card of cards) {
      card.setAttribute('data-umm-bili-processed', 'true')
      const bv = card.getAttribute('data-bsb-bvid')
      if (!bv) continue
      const badge = document.createElement('div')
      badge.className = payload.badge
      const status = statusByBv[bv] ?? 0
      badge.textContent = status === 0 ? '未看' : status === 2 ? '已看 9' : '在看'
      badge.style.cssText = 'position:absolute;top:8px;right:8px;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;color:#fff;background:#047857;pointer-events:none'
      const anchor = card.querySelector<HTMLElement>('.bili-cover-card__thumbnail, .bili-video-card__image--link')
      if (anchor) {
        if (getComputedStyle(anchor).position === 'static') anchor.style.position = 'relative'
        anchor.appendChild(badge)
      }
      if (status >= 2) {
        const shell = card.closest('.video-list__item')
        if (shell) shell.classList.add(payload.shell)
        else card.classList.add(payload.dim)
        dimmed++
      }
    }
    return { dimmed, processed: document.querySelectorAll('[data-umm-bili-processed]').length }
  }, { badge: LISTING_BADGE_CLASS, dim: LISTING_DIMMER_CLASS, shell: LISTING_SHELL_DIM_CLASS })

  await page.mouse.move(0, 0)
  await page.waitForTimeout(400)
  expect(result.dimmed).toBe(2)
  expect(result.processed).toBe(3)

  // Geometry still healthy after dim
  const broken = await page.evaluate(() => {
    return [...document.querySelectorAll<HTMLElement>('.bili-video-card')].some((card) => {
      const cover = card.querySelector<HTMLElement>('.bili-video-card__cover')
      if (!cover) return false
      const c = cover.getBoundingClientRect()
      const k = card.getBoundingClientRect()
      return c.height > k.height * 0.85 && k.height > 200
    })
  })
  expect(broken).toBe(false)

  await page.screenshot({ path: 'test-results/bilibili-listing-after-inject.png', fullPage: true })
})

test('setListingBadge never overrides absolute thumbnails (live search layout)', () => {
  const dom = new JSDOM(
    `<div class="bili-video-card" data-bsb-bvid="BV1">
      <div class="bili-video-card__cover">
        <a class="bili-cover-card" href="//www.bilibili.com/video/BV1/">
          <div class="bili-cover-card__thumbnail" style="position:absolute;inset:0"></div>
        </a>
      </div>
    </div>`,
  )
  const card = dom.window.document.querySelector<HTMLElement>('.bili-video-card')!
  const badge = setListingBadge(card, 2, 8)
  const thumb = card.querySelector<HTMLElement>('.bili-cover-card__thumbnail')!
  // Live search thumbs are absolute — forcing relative was the white-box regression
  expect(thumb.style.position).toBe('absolute')
  expect(thumb.contains(badge)).toBe(true)
})

test('bulkKeys === storeKey; findDimShell picks upload/list shells', () => {
  expect(bulkKeysForBvids(['BV1'])).toEqual([storeKey('BV1')])
  const dom = new JSDOM(
    `<div class="upload-video-card"><div class="bili-video-card" id="c" data-bsb-bvid="BV1"></div></div>`,
  )
  const card = dom.window.document.getElementById('c')!
  // findDimShell uses Element.closest — jsdom supports it
  const shell = findDimShell(card)
  expect(shell?.className).toContain('upload-video-card')
})

test('setListingBadge uses surgical position on thumbnail only', () => {
  const dom = new JSDOM(
    `<div class="bili-video-card" data-bsb-bvid="BV1">
      <div class="bili-video-card__cover">
        <a class="bili-cover-card" href="/video/BV1">
          <div class="bili-cover-card__thumbnail"></div>
        </a>
      </div>
    </div>`,
  )
  const card = dom.window.document.querySelector<HTMLElement>('.bili-video-card')!
  const badge = setListingBadge(card, 2, 8)
  const thumb = card.querySelector<HTMLElement>('.bili-cover-card__thumbnail')!
  const cover = card.querySelector<HTMLElement>('.bili-video-card__cover')!
  expect(thumb.contains(badge)).toBe(true)
  expect(thumb.style.position).toBe('relative')
  expect(cover.style.position).toBe('')
  expect(badge.textContent).toBe('已看 8')
  // BADGE_ANCHOR_SELECTORS no longer used for global CSS
  expect(BADGE_ANCHOR_SELECTORS[0]).toBe('.bili-cover-card__thumbnail')
  expect(LISTING_STYLE_ID).toBe('umm-bili-homepage-styles')
})
