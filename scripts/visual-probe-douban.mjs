/* Screenshots the douban fixture: full dual-theme matrix + hover states. */
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'

const fixture = 'file://' + path.resolve('tmp-fixture/douban-fixture.html')
const out = 'tmp-fixture'
fs.mkdirSync(out, { recursive: true })

const ctx = await chromium.launchPersistentContext('', {
  headless: false,
  channel: 'msedge',
  viewport: { width: 1500, height: 1050 },
})
// Close browser even on probe failure — avoid a dangling Edge process
try {
const page = await ctx.newPage()
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)))
await page.goto(fixture)
await page.waitForTimeout(900)

await page.screenshot({ path: path.join(out, 'matrix-full.png'), fullPage: true })

// computed-style probe: paginator active vars
for (const [hid, tag] of [['host-light', 'light'], ['host-dark', 'dark']]) {
  const r = await page.locator(`#${hid}`).evaluate(async h => {
    const el = h.shadowRoot.querySelector('.umm-paginator-btn--active')
    const cs = getComputedStyle(el)
    const rules = []
    const walk = (list, media) => {
      for (const rule of list) {
        if (rule.type === 1) {
          const sel = rule.selectorText || ''
          if (sel.includes('umm-paginator-btn')) rules.push((media ? '@media ' + media + ' ' : '') + sel + '{' + rule.style.cssText.slice(0, 60) + '}')
        } else if (rule.cssRules && rule.cssRules.length) {
          walk(rule.cssRules, rule.conditionText || media)
        }
      }
    }
    let total = 0
    for (const st of h.shadowRoot.querySelectorAll('style')) {
      if (!st.sheet) continue
      walk(st.sheet.cssRules, null)
      total += st.sheet.cssRules.length
    }
    const probeInline = async () => {
      const el = h.shadowRoot.querySelector('.umm-paginator-btn--active')
      const tests = {}
      for (const [k, v] of Object.entries({ literal: '#7e9bf9', varStatic: 'var(--umm-static-brand-400)', varAccent: 'var(--umm-brand-accent)', varCard: 'var(--umm-card-bg)' })) {
        el.style.background = v
        await new Promise(r => setTimeout(r, 250))
        tests[k] = getComputedStyle(el).backgroundColor
      }
      el.style.background = ''
      const cs = getComputedStyle(el)
      return {
        tests,
        hostClass: h.className,
        vAccent: cs.getPropertyValue('--umm-brand-accent'),
        vCard: cs.getPropertyValue('--umm-card-bg'),
        vStatic400: cs.getPropertyValue('--umm-static-brand-400'),
      }
    }
    const probe = await probeInline()
    const done = h.shadowRoot.querySelector('.umm-series-status--done')
    const doneBg = done ? getComputedStyle(done).backgroundColor : 'n/a'
    return { totalRules: total, probe, doneBg, ruleCount: rules.length }
  })
  console.log(`[paginator-${tag}]`, JSON.stringify(r, null, 1))
}

// zoom: status badge matrix (.umm-status — the user-reported component)
for (const [hid, tag] of [['host-light', 'light'], ['host-dark', 'dark']]) {
  const h = page.locator(`#${hid}`)
  const badge = h.locator('.umm-status--wish').first()
  await badge.scrollIntoViewIfNeeded()
  const bb = await badge.boundingBox()
  if (bb) await page.screenshot({ path: path.join(out, `zoom-status-badges-${tag}.png`), clip: { x: bb.x - 20, y: bb.y - 60, width: 640, height: 160 } })
}

// zoom: paginator + creation badges (both hosts)
for (const [hid, tag] of [['host-light', 'light'], ['host-dark', 'dark']]) {
  const h = page.locator(`#${hid}`)
  const pg = h.locator('.umm-creations-paginator')
  await pg.scrollIntoViewIfNeeded()
  const b = await pg.boundingBox()
  await page.screenshot({ path: path.join(out, `zoom-paginator-${tag}.png`), clip: { x: b.x - 10, y: b.y - 90, width: 700, height: 150 } })
  const badge = h.locator('.umm-creation-badge--wish')
  const bb = await badge.boundingBox()
  if (bb) await page.screenshot({ path: path.join(out, `zoom-creation-${tag}.png`), clip: { x: bb.x - 10, y: bb.y - 46, width: 620, height: 90 } })
}

// hover states inside dark host shadow root
const dark = page.locator('#host-dark')
const hoverTab = dark.locator('#hover-tab')
await hoverTab.scrollIntoViewIfNeeded()
await hoverTab.hover()
await page.waitForTimeout(350)
const box = await hoverTab.boundingBox()
await page.screenshot({ path: path.join(out, 'dark-hover-tab.png'), clip: { x: box.x - 160, y: box.y - 60, width: 520, height: 200 } })

const hoverX = dark.locator('#hover-xbar')
await hoverX.hover()
await page.waitForTimeout(350)
const bx = await hoverX.boundingBox()
await page.screenshot({ path: path.join(out, 'dark-hover-xbar.png'), clip: { x: bx.x - 160, y: bx.y - 50, width: 480, height: 160 } })

const minusBtn = dark.locator('.umm-neodb-btn--minus').first()
await minusBtn.hover()
await page.waitForTimeout(300)
const mb = await minusBtn.boundingBox()
await page.screenshot({ path: path.join(out, 'dark-hover-neodb.png'), clip: { x: mb.x - 140, y: mb.y - 50, width: 560, height: 170 } })
} finally {
  await ctx.close()
}
console.log('shots →', out)
