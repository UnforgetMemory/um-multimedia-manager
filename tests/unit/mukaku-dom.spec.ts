import { test, expect } from '@playwright/test'
import { extractMvId, imageFileName, type MvIdSource } from '@/entrypoints/content/handlers/mukaku/dom'

/**
 * mvId extraction contract for mukaku cards.
 *
 * Verified against the real site (2026-08-07):
 *  - Detail URL:  /mv/{doub_id}              (string path)
 *  - Home/category cards: <a to="/mv/{doub_id}" class="video-card"> — the `to`
 *    attribute (native `<a>` rendered with `to` prop, NOT `href`)
 *  - Search cards: <div class="video-card"> with NO link at all — mvId lives
 *    only in Vue component state (onClick does be.push("/mv/"+doub_id)).
 *    Fallback for those: the list-API image-matching path (handler-level),
 *    NOT extractMvId.
 *
 * The source is a structural (duck-typed) shape so tests run in Node without
 * a DOM.
 */

const el = (attrs: Record<string, string>, text = '', children: string[] = []): MvIdSource => ({
  getAttribute: (name: string) => attrs[name] ?? null,
  querySelector: (selector: string) => {
    // Minimal fake: only supports 'a[href*="/mv/"]' and 'a[to*="/mv/"]'
    const hrefLink = children.find((c) => c.includes('/mv/'))
    if (!hrefLink) return null
    return {
      getAttribute: (name: string) => (name === 'href' || name === 'to' ? hrefLink : null),
    } as unknown as Element
  },
  textContent: text,
})

test.describe('extractMvId', () => {
  test('string URL with /mv/ pattern', () => {
    expect(extractMvId('/mv/36508122')).toBe('36508122')
  })

  test('full absolute URL', () => {
    expect(extractMvId('https://web5.mukaku.com/mv/36508122')).toBe('36508122')
  })

  test('href attribute (classic <a href>)', () => {
    expect(extractMvId(el({ href: '/mv/36508122' }))).toBe('36508122')
  })

  test('to attribute (site home/category cards: <a to="/mv/..."> without href)', () => {
    expect(extractMvId(el({ to: '/mv/36508122' }))).toBe('36508122')
  })

  test('to attribute with query string', () => {
    expect(extractMvId(el({ to: '/mv/36508122?from=search' }))).toBe('36508122')
  })

  test('descendant link with /mv/ href (wrapped card)', () => {
    const card = el({}, '瑞克和莫蒂 第八季', ['/mv/36508122'])
    expect(extractMvId(card)).toBe('36508122')
  })

  test('linkless search card (div.video-card) → null (handler falls back to list-API matching)', () => {
    const card = el({}, '瑞克和莫蒂 第八季', [])
    expect(extractMvId(card)).toBeNull()
  })

  test('textContent without /mv/ pattern → null', () => {
    const card = el({}, '瑞克和莫蒂 第八季')
    expect(extractMvId(card)).toBeNull()
  })

  test('empty string → null', () => {
    expect(extractMvId('')).toBeNull()
  })

  test('mvId with letters (non-numeric) rejected', () => {
    expect(extractMvId(el({ to: '/mv/abc123' }))).toBeNull()
  })
})

test.describe('imageFileName — card-matching key for list-API mapping', () => {
  test('absolute URL → filename', () => {
    expect(imageFileName('https://img.bbegge.com/i/2025/08/09/689719b68482c.png')).toBe('689719b68482c.png')
  })

  test('same filename on different domains/protocols → same key', () => {
    expect(imageFileName('https://a.com/x/abc.png')).toBe(imageFileName('http://b.com/y/abc.png'))
  })

  test('query string / hash suffix stripped before matching', () => {
    expect(imageFileName('https://cdn.com/i/abc.png?x-oss-process=style/thumb')).toBe('abc.png')
    expect(imageFileName('https://cdn.com/i/abc.png#frag')).toBe('abc.png')
  })

  test('trailing slash → null (no filename)', () => {
    expect(imageFileName('https://img.bbegge.com/i/')).toBeNull()
  })

  test('empty string → null', () => {
    expect(imageFileName('')).toBeNull()
  })
})
