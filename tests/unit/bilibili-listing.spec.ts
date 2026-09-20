import { test, expect } from '@playwright/test'
import { storeKey } from '@/entrypoints/content/ui/video-overlay-pure'
import {
  buildListingDimmerCss,
  bulkKeysForBvids,
  extractBvidFromCard,
  listingDimTargetSelectors,
  LISTING_DIMMER_CLASS,
  LISTING_SHELL_DIM_CLASS,
  parseBiliListingRoute,
  resolveBadgeAnchorSelector,
  shouldDimStatus,
  DIMMER_TRIGGER,
  type CardLike,
} from '@/entrypoints/content/ui/bilibili-listing'

function fakeCard(opts: {
  attrs?: Record<string, string>
  bySelector?: Record<string, string | null>
  hrefs?: string[]
}): CardLike {
  const attrs = opts.attrs || {}
  const bySelector = opts.bySelector || {}
  const hrefs = opts.hrefs || []
  return {
    getAttribute(name: string) {
      return name in attrs ? attrs[name]! : null
    },
    querySelector(sel: string) {
      if (sel in bySelector) {
        const href = bySelector[sel]
        return href === null ? null : { getAttribute: () => href }
      }
      if (sel.includes('/video/') && hrefs.length > 0) {
        return { getAttribute: () => hrefs[0]! }
      }
      return null
    },
    querySelectorAll(sel: string) {
      if (!sel.includes('/video/')) return []
      return hrefs.map((href) => ({ getAttribute: () => href }))
    },
  }
}

test.describe('extract / route / status (pure)', () => {
  test('space href + data-bsb-bvid precedence', () => {
    expect(
      extractBvidFromCard(
        fakeCard({
          attrs: { 'data-bsb-bvid': 'BV1Uh411e7px' },
          hrefs: ['https://www.bilibili.com/video/BVOTHER'],
        }),
      ),
    ).toBe('BV1Uh411e7px')
    expect(
      extractBvidFromCard(
        fakeCard({ hrefs: ['https://www.bilibili.com/video/BV1Ni8b6TE1u?x=1'] }),
      ),
    ).toBe('BV1Ni8b6TE1u')
  })

  test('badge anchor prefers thumbnail then homepage image class', () => {
    expect(
      resolveBadgeAnchorSelector(fakeCard({ bySelector: { '.bili-cover-card__thumbnail': 'x' } })),
    ).toBe('.bili-cover-card__thumbnail')
    expect(
      resolveBadgeAnchorSelector(fakeCard({ bySelector: { '.bili-video-card__image--link': 'x' } })),
    ).toBe('.bili-video-card__image--link')
  })

  test('space routes offline URLs', () => {
    expect(parseBiliListingRoute('https://space.bilibili.com/324086342')).toBe('space-home')
    expect(parseBiliListingRoute('https://space.bilibili.com/324086342/lists')).toBe('space-lists')
    expect(parseBiliListingRoute('https://space.bilibili.com/324086342/lists/943128?type=season')).toBe(
      'space-list-details',
    )
    expect(parseBiliListingRoute('https://space.bilibili.com/324086342/upload/video')).toBe('space-upload')
    expect(parseBiliListingRoute('https://search.bilibili.com/all?keyword=x')).toBe('www-listing')
  })

  test('status gate + storeKey bulk', () => {
    expect(shouldDimStatus(0)).toBe(false)
    expect(shouldDimStatus(DIMMER_TRIGGER)).toBe(true)
    expect(bulkKeysForBvids(['BV1'])).toEqual([storeKey('BV1')])
  })
})

test.describe('dim CSS contract (no global layout pollution)', () => {
  test('targets are card class + JS shell class only', () => {
    const { dim } = listingDimTargetSelectors()
    expect(dim).toContain(`.bili-video-card.${LISTING_DIMMER_CLASS}`)
    expect(dim).toContain(`.${LISTING_SHELL_DIM_CLASS}`)
    const css = buildListingDimmerCss()
    expect(css).not.toContain(':has(')
    expect(css).not.toContain('.upload-video-card')
    expect(css).not.toContain('.bili-video-card__cover {')
    expect(css).toContain('pointer-events: none')
  })
})

test.describe('runListingDimmerPass exclusive dim (shell XOR card)', () => {
  test('with wrapper: shell class only; without: card class only', async () => {
    const { JSDOM } = await import('jsdom')
    const { runListingDimmerPass } = await import('@/entrypoints/content/ui/bilibili-listing')

    const withShell = new JSDOM(
      `<div class="upload-video-card"><div class="bili-video-card" data-bsb-bvid="BV1"><a href="/video/BV1"></a></div></div>`,
    )
    const r1 = await runListingDimmerPass({
      root: withShell.window.document,
      storeName: 'bilibili_records',
      dbGetBulk: async () => [{ key: storeKey('BV1'), record: { status: 2 } }],
    })
    const card1 = withShell.window.document.querySelector('.bili-video-card')!
    const shell1 = withShell.window.document.querySelector('.upload-video-card')!
    expect(r1.dimmed).toBe(1)
    expect(shell1.classList.contains(LISTING_SHELL_DIM_CLASS)).toBe(true)
    expect(card1.classList.contains(LISTING_DIMMER_CLASS)).toBe(false)

    const bare = new JSDOM(
      `<div class="bili-video-card" data-bsb-bvid="BV2"><a href="/video/BV2"></a></div>`,
    )
    const r2 = await runListingDimmerPass({
      root: bare.window.document,
      storeName: 'bilibili_records',
      dbGetBulk: async () => [{ key: storeKey('BV2'), record: { status: 3 } }],
    })
    const card2 = bare.window.document.querySelector('.bili-video-card')!
    expect(r2.dimmed).toBe(1)
    expect(card2.classList.contains(LISTING_DIMMER_CLASS)).toBe(true)
  })
})
