#!/usr/bin/env node
/**
 * Design token consistency gate (ADR-018).
 *
 * Verifies the three-tier token model stays aligned:
 *   Tier 1  src/shared/styles/tokens.static.css      — the ONLY raw palette
 *   Tier 2  src/shared/styles/style.css              — alias layer (no literals)
 *           src/content/douban/styles/design-tokens.css — alias layer (no palette literals)
 *   Tier 3  src/entrypoints/content/styles/tokens.ts — derived constants (spot-checked)
 *
 * Usage: npm run ds:check   (exit 1 on any violation)
 */
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

const failures = []
const ok = (msg) => console.log(`  ok  ${msg}`)

// ---------- 1. Tier-1 static palette parses ----------
const staticCss = read('src/shared/styles/tokens.static.css')
const staticVars = new Map()
for (const m of staticCss.matchAll(/--umm-static-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
  staticVars.set(`--umm-static-${m[1]}`, m[2].toLowerCase())
}
// Motion statics: durations/easings carry non-color values (ms / cubic-bezier)
for (const m of staticCss.matchAll(/--umm-static-(duration-[a-z0-9-]+|ease-[a-z0-9-]+):\s*([^;]+);/g)) {
  staticVars.set(`--umm-static-${m[1]}`, m[2].trim())
}
// Overlay statics: white-alpha / ink-tint / wish-dark carry rgba()/rgb() values
for (const m of staticCss.matchAll(/--umm-static-(white-a\d+|ink(?:-island)?-[a-z0-9-]+|wish-[a-z0-9-]+):\s*([^;]+);/g)) {
  staticVars.set(`--umm-static-${m[1]}`, m[2].trim())
}
if (staticVars.size < 80) failures.push(`tokens.static.css: expected >=80 static vars, parsed ${staticVars.size}`)
else ok(`tokens.static.css parsed (${staticVars.size} vars)`)

// Duplicate definitions inside static file = drift risk
const seen = new Set()
for (const m of staticCss.matchAll(/(--umm-static-[a-z0-9-]+):/g)) {
  if (seen.has(m[1])) failures.push(`tokens.static.css: duplicate definition ${m[1]}`)
  seen.add(m[1])
}
ok('tokens.static.css: no duplicate definitions')

// ---------- 2. Tier-2 layers contain no raw palette literals ----------
const styleCss = read('src/shared/styles/style.css')
const designTokens = read('src/content/douban/styles/design-tokens.css')

const hexIn = (name, css) => [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])
const styleHex = hexIn('style.css', styleCss)
if (styleHex.length) failures.push(`style.css: raw hex literals not allowed (Tier-2): ${styleHex.join(', ')}`)
else ok('style.css: zero raw hex')

const dtHex = hexIn('design-tokens.css', designTokens)
if (dtHex.length) failures.push(`design-tokens.css: raw hex literals not allowed (Tier-2): ${dtHex.join(', ')}`)
else ok('design-tokens.css: zero raw hex')

const dtHsl = [...designTokens.matchAll(/hsla?\(/g)]
if (dtHsl.length) failures.push(`design-tokens.css: hsl() literals not allowed (${dtHsl.length}) — use var(--umm-static-*)`)
else ok('design-tokens.css: zero hsl() literals')

const rgbCount = (css) => [...css.matchAll(/rgba?\(/g)].length
const styleRgb = rgbCount(styleCss)
if (styleRgb) failures.push(`style.css: rgb() literals not allowed (${styleRgb}) — use var(--umm-static-*)`)
else ok('style.css: zero rgb() literals')
const dtRgb = rgbCount(designTokens)
if (dtRgb) failures.push(`design-tokens.css: rgb() literals not allowed (${dtRgb}) — use var(--umm-static-*)`)
else ok('design-tokens.css: zero rgb() literals')

// Every var() a Tier-2 file references must exist (static, local, or reka runtime)
const runtimeVars = new Set(['--reka-accordion-content-height', '--tw-enter-opacity', '--tw-exit-opacity', '--tw-enter-scale', '--tw-exit-scale', '--tw-enter-translate-x', '--tw-enter-translate-y', '--tw-enter-rotate', '--tw-exit-translate-x', '--tw-exit-translate-y', '--tw-exit-rotate'])
const checkRefs = (name, css) => {
  const localVars = new Set([...css.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]))
  for (const m of css.matchAll(/var\((--[a-z0-9-]+)/g)) {
    const v = m[1]
    if (!staticVars.has(v) && !localVars.has(v) && !runtimeVars.has(v)) {
      failures.push(`${name}: unresolved var reference ${v}`)
    }
  }
}
checkRefs('style.css', styleCss)
checkRefs('design-tokens.css', designTokens)
ok('Tier-2 var() references all resolve')

// ---------- 3. Tier-3 tokens.ts spot-check against static ----------
// Expected values resolve from staticVars (single source) — no duplicated hex here.
const tokensTs = read('src/entrypoints/content/styles/tokens.ts')
const SPOT_CHECKS = [
  ['COLOR_PRIMARY_START', 'brand-500'],
  ['COLOR_PRIMARY_END', 'brand-600'],
  ['COLOR_PRIMARY_START_DARK', 'brand-600'],
  ['COLOR_WISH_START', 'amber-400'],
  ['COLOR_WISH_END', 'amber-500'],
  ['COLOR_WISH_TEXT', 'wish-ink'],
  ['COLOR_WISH_FILL_DARK', 'wish-fill-dark'],
  ['COLOR_WISH_INK_DARK', 'wish-ink-dark'],
  ['COLOR_WISH_BORDER_DARK', 'wish-border-dark'],
  ['COLOR_DOING_START', 'blue-600'],
  ['COLOR_MINUS_START', 'amber-600'],
  ['COLOR_MINUS_END', 'amber-700'],
  ['COLOR_PLUS_START', 'green-600'],
  ['COLOR_PLUS_END', 'green-700'],
  ['COLOR_ORIGINAL_START', 'indigo-600'],
  ['COLOR_ORIGINAL_END', 'indigo-700'],
  ['COLOR_RATING_TEXT', 'neutral-950'],
  ['COLOR_RATING_TEXT_DARK', 'neutral-25'],
]
for (const [name, staticName] of SPOT_CHECKS) {
  const re = new RegExp(`export const ${name} = '([^']+)'`)
  const m = tokensTs.match(re)
  const expected = staticVars.get(`--umm-static-${staticName}`)
  if (!expected) { failures.push(`spot-check: unknown static ${staticName}`); continue }
  if (!m) { failures.push(`tokens.ts: missing export ${name}`); continue }
  if (m[1].toLowerCase() !== expected) failures.push(`tokens.ts: ${name}=${m[1]} != static ${staticName} (${expected})`)
}
ok(`tokens.ts spot-checks (${SPOT_CHECKS.length})`)

// Semantic map guard: wish must be amber family, never blue (ADR-018 D3 regression guard)
if (/COLOR_WISH_START\s*=\s*'#(3b82f6|2563eb|1d4ed8)'/i.test(tokensTs)) {
  failures.push('tokens.ts: COLOR_WISH_* regressed to blue — wish semantic is amber')
}
ok('wish=amber semantic guard')

// ---------- 4. WCAG contrast assertions on key role pairs (ADR-019 D2) ----------
// Fail-closed: only 6-digit hex reaches lum(); anything else is a failure.
function lum(hex) {
  const h = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(h)) return NaN
  const ch = [0, 2, 4].map((i) => {
    let c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}
function contrast(fg, bg) {
  const l1 = lum(fg); const l2 = lum(bg)
  if (Number.isNaN(l1) || Number.isNaN(l2)) return NaN
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}
const S = (n) => { const v = staticVars.get(n); if (!v) failures.push(`contrast module: missing static ${n}`); return v }
const PAIRS = [
  ['L primary/on-primary', '--umm-static-neutral-00', '--umm-static-brand-600', 4.5],
  ['L on-surface/surface', '--umm-static-neutral-900', '--umm-static-neutral-50', 4.5],
  ['L muted-fg/card', '--umm-static-neutral-600', '--umm-static-neutral-00', 4.5],
  ['L success-text/surface', '--umm-static-green-700', '--umm-static-neutral-50', 4.5],
  ['L warning-text/surface', '--umm-static-amber-700', '--umm-static-neutral-50', 4.5],
  ['L error-text/surface', '--umm-static-red-700', '--umm-static-neutral-50', 4.5],
  ['L info-text/surface', '--umm-static-blue-700', '--umm-static-neutral-50', 4.5],
  ['D primary/on-primary', '--umm-static-brand-400', '--umm-static-neutral-1000', 4.5],
  ['D on-surface/surface', '--umm-static-neutral-100', '--umm-static-neutral-900', 4.5],
  ['D muted-fg/card', '--umm-static-neutral-400', '--umm-static-neutral-850', 4.5],
  ['D success-text/card', '--umm-static-green-300', '--umm-static-neutral-850', 4.5],
  ['D warning-text/card', '--umm-static-amber-300', '--umm-static-neutral-850', 4.5],
  ['D error-text/card', '--umm-static-red-300', '--umm-static-neutral-850', 4.5],
  ['D info-text/card', '--umm-static-blue-300', '--umm-static-neutral-850', 4.5],
  // ADR-020 D1/D2/D3: on-accent flips & deepened light accents & bright-fill ink
  ['L on-accent/brand600', '--umm-static-neutral-00', '--umm-static-brand-600', 4.5],
  ['L on-accent/indigo600', '--umm-static-neutral-00', '--umm-static-indigo-600', 4.5],
  ['L on-accent/rose600', '--umm-static-neutral-00', '--umm-static-rose-600', 4.5],
  ['D on-accent/brand400', '--umm-static-neutral-1000', '--umm-static-brand-400', 4.5],
  ['D on-accent/indigo400', '--umm-static-neutral-1000', '--umm-static-indigo-400', 4.5],
  ['D on-accent/rose400', '--umm-static-neutral-1000', '--umm-static-rose-400', 4.5],
  ['ink/amber500-solid', '--umm-static-neutral-1000', '--umm-static-amber-500', 4.5],
  // Status badge ink (2026-08-30 C1): all four badges carry WHITE ink on
  // AA-dark fills; wish = violet-600→700 gradient (light) / flat violet-700
  // (dark). CIEDE2000 proof: all warm fills are red-adjacent (ΔE 30-41);
  // violet reaches ΔE 42-43 vs red. Deep ink on amber, the v6 gold strip,
  // and warm amber/gold fills are all user-rejected and banned.
  ['L white/violet700-badge', '--umm-static-neutral-00', '--umm-static-violet-700', 4.5],
  ['L white/violet600-badge-top', '--umm-static-neutral-00', '--umm-static-violet-600', 4.5],
  ['L white/red600-badge', '--umm-static-neutral-00', '--umm-static-red-600', 4.5],
  ['D white/red700-badge', '--umm-static-neutral-00', '--umm-static-red-700', 4.5],
  ['L wish-ink/amber500-chip', '--umm-static-wish-ink', '--umm-static-amber-500', 4.5],
  // Gold TEXT tier (ADR-019 D2): small gold text must clear AA on its surface
  ['L gold-text/white', '--umm-static-gold-800', '--umm-static-neutral-00', 4.5],
  ['D gold-text/card', '--umm-static-amber-400', '--umm-static-neutral-850', 4.5],
  ['ink/gold500-solid', '--umm-static-neutral-1000', '--umm-static-gold-500', 4.5],
  ['L gold-text/surface', '--umm-static-gold-800', '--umm-static-neutral-50', 4.5],
  ['L muted-fg/white-card', '--umm-static-neutral-550', '--umm-static-neutral-00', 4.5],
  ['D muted-fg/card', '--umm-static-neutral-400', '--umm-static-neutral-850', 4.5],
  ['L ink-white/amber700-btn', '--umm-static-neutral-00', '--umm-static-amber-700', 4.5],
  // macOS Vibrancy dark adoption (STYLEKIT macos-vibrancy / ADR-021)
  ['D link-apple/vibrancy0', '--umm-static-apple-blue', '--umm-static-vibrancy-0', 4.5],
  ['D link-apple-bright/vibrancy1', '--umm-static-apple-blue-bright', '--umm-static-vibrancy-1', 4.5],
  ['D white/vibrancy2-btn', '--umm-static-neutral-00', '--umm-static-vibrancy-2', 4.5],
  // NeoDB dark buttons — Primer/Radix desaturated fills x WHITE ink (Wave-F)
  ['D white/neodb-amber-dark', '--umm-static-neutral-00', '--umm-static-neodb-amber-dark', 4.5],
  ['D white/neodb-green-dark', '--umm-static-neutral-00', '--umm-static-neodb-green-dark', 4.5],
  ['D white/neodb-indigo-dark', '--umm-static-neutral-00', '--umm-static-neodb-indigo-dark', 4.5],
  ['D white/neodb-violet-dark', '--umm-static-neutral-00', '--umm-static-neodb-violet-dark', 4.5],
]
for (const [label, fgN, bgN, min] of PAIRS) {
  const fg = S(fgN); const bg = S(bgN)
  if (!fg || !bg) continue
  const r = contrast(fg, bg)
  if (r < min) failures.push(`contrast ${label}: ${r.toFixed(2)} < ${min} (${fg} on ${bg})`)
  else console.log(`  ok  contrast ${label}: ${r.toFixed(2)}:1`)
}
ok(`WCAG pair assertions (${PAIRS.length})`)

// ---------- 4b. Status badge ink source guard (2026-08-30 regression lock) ----------
// base.css badge variants must declare their ink token explicitly.
// FINAL design (round-4 matrix C1, user-approved 2026-08-30): wish = VIOLET —
// light = vertical violet-600→700 gradient, dark = flat violet-700, both x
// WHITE ink with the shared translucent-white border. Rationale (CIEDE2000):
// every warm fill (amber/gold) measures ΔE 30-41 vs the red none badge —
// "more similar than different"; violet reaches ΔE 42-43 (Primer
// merged-purple precedent). Supersedes the 2026-08-22 wish=amber decision
// (explicit user override). Banned for wish: warm amber/gold fills (ΔE-proven
// red-adjacent), deep ink text (rejected twice), the v6 90deg gold strip
// (family-breaking). none = RED (既定设计，锁死不可改).
const baseCssRaw = read('src/content/douban/styles/base.css')
// Strip comments BEFORE matching: a `}` inside a comment would truncate the
// [^}]* block capture, and comment text must never satisfy/trip a guard.
const baseCss = baseCssRaw.replace(/\/\*[\s\S]*?\*\//g, '')
const wishBlocks = [...baseCss.matchAll(/\.umm-status--wish\s*\{([^}]*)\}/gs)].map((m) => m[1])
if (wishBlocks.length === 0) {
  failures.push('base.css: .umm-status--wish rule missing')
} else {
  const lightWish = wishBlocks.find((b) => /linear-gradient\(180deg,\s*var\(--umm-static-violet-600\)/.test(b) && /var\(--umm-static-violet-700\)/.test(b))
  const darkWish = wishBlocks.find((b) => /background:\s*var\(--umm-static-violet-700\)/.test(b) && !/linear-gradient/.test(b))
  if (!lightWish || !/color:\s*var\(--umm-static-neutral-00\)/.test(lightWish)) {
    failures.push('base.css: light .umm-status--wish must be vertical violet-600→700 gradient x WHITE ink (round-4 C1)')
  }
  if (!darkWish || !/color:\s*var\(--umm-static-neutral-00\)/.test(darkWish)) {
    failures.push('base.css: dark .umm-status--wish must be flat violet-700 x WHITE ink (dark family flat-solid convention)')
  }
  if (wishBlocks.some((b) => /var\(--umm-static-(amber|gold)-/.test(b))) {
    failures.push('base.css: .umm-status--wish must NOT use warm amber/gold fills (CIEDE2000-proven red-adjacent, user-rejected x3)')
  }
  if (wishBlocks.some((b) => /90deg|var\(--umm-static-wish-ink-dark\)/.test(b))) {
    failures.push('base.css: .umm-status--wish must NOT use the v6 90deg gold strip (user-rejected as family-breaking)')
  }
  if (wishBlocks.some((b) => /color:\s*var\(--umm-static-wish-ink\)|color:\s*var\(--umm-static-neutral-1000\)/.test(b))) {
    failures.push('base.css: .umm-status--wish must NOT use deep ink text (user-rejected as 墨色-blends-with-fill)')
  }
}
const noneBlocks = [...baseCss.matchAll(/\.umm-status--none\s*\{([^}]*)\}/gs)]
const redNoneLight = noneBlocks.some((m) => /background:\s*linear-gradient\([^)]*var\(--umm-static-red-600\)/.test(m[1]))
const redNoneDark = noneBlocks.some((m) => /background:\s*var\(--umm-static-red-700\)/.test(m[1]))
if (noneBlocks.length === 0 || !redNoneLight || !redNoneDark) {
  failures.push('base.css: .umm-status--none MUST stay red (light red-gradient / dark red-700) — 既定设计，禁止改动')
}
for (const variant of ['done', 'none', 'wish', 'doing']) {
  const blocks = [...baseCss.matchAll(new RegExp(`\\.umm-status--${variant}\\s*\\{([^}]*)\\}`, 'gs'))].map((m) => m[1])
  if (blocks.length === 0 || blocks.some((b) => !/color:\s*var\(--umm-static-neutral-00\)/.test(b))) {
    failures.push(`base.css: every .umm-status--${variant} block (light AND dark) must declare white ink explicitly (ink discipline)`)
  }
}
ok('status badge ink source guards')

// Status chip theme adaptation (2026-08-29 sweep): series doing chip must keep
// its dark-theme override (translucent dark-amber fill x amber-300 ink) —
// a static light fill without a dark counterpart is the adaptation regression.
const seriesCss = read('src/content/douban/styles/series.css')
if (!/\.umm-series-status--doing\s*\{[^}]*\}/s.test(seriesCss) ||
    !/:host\(\.umm-theme--dark\)\s*\.umm-series-status--doing\s*\{[^}]*color:\s*var\(--umm-static-amber-300\)/s.test(seriesCss)) {
  failures.push('series.css: .umm-series-status--doing must keep a dark-theme override with amber-300 ink')
}
ok('series status chip dark-adaptation guard')

// Colored-TEXT tier guards (ADR-019 D2, 2026-08-29): light colored small text
// needs the 700+ ramp. gold-500/600/700 on white measure 2.70/3.22/4.18 — the
// shared rating badge must use the dedicated --umm-rating-gold-text token.
if (!/--umm-rating-gold-text:\s*var\(--umm-static-gold-800\)/.test(designTokens)) {
  failures.push('design-tokens.css: light --umm-rating-gold-text must be gold-800 (D2 text tier)')
}
if (!/--umm-rating-gold-text:\s*var\(--umm-static-amber-400\)/.test(designTokens)) {
  failures.push('design-tokens.css: dark --umm-rating-gold-text must be amber-400 (D2 text tier)')
}
for (const m of baseCss.matchAll(/\.umm-rating-score\.umm-rating--gold-\w+\s*\{([^}]*)\}/g)) {
  if (!/color:\s*var\(--umm-rating-gold-text\)/.test(m[1])) {
    failures.push('base.css: rating gold text classes must use var(--umm-rating-gold-text) (gold-500/600/700 fail AA on white)')
    break
  }
}
const personageCss = read('src/content/douban/styles/personage.css')
const personageLight = personageCss.match(/:host\s*\{([^}]*)\}/s)
if (personageLight && /--umm-rating-score:\s*var\(--umm-static-gold-(4|5|6)00\)/.test(personageLight[1])) {
  failures.push('personage.css: light --umm-rating-score must be gold-800 (gold-500 measures 2.70:1 on white)')
}
ok('colored-text tier guards (D2)')

// ---------- result ----------
if (failures.length) {
  console.error(`\n✗ ds:check FAILED (${failures.length})`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('\n✓ ds:check passed — token tiers aligned')
