#!/usr/bin/env node
/* Builds a dual-theme component fixture: composes REAL douban CSS in preset
 * order (static→design-tokens→theme→base→pages) and inlines it into a
 * self-contained HTML with two shadow hosts (light | dark) × state matrix. */
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const DB = 'src/content/douban/styles'
const S = f => fs.readFileSync(path.join(root, f.startsWith('shared/') ? path.join('src', f) : path.join('src/content/douban/styles', f)), 'utf8')

const order = [
  ['static-tokens', 'shared/styles/tokens.static.css'],
  ['design-tokens', 'design-tokens.css'],
  ['theme', 'theme.css'],
  ['breakpoints', 'breakpoints.css'],
  ['page-layout', 'page-layout.css'],
  ['base', 'base.css'],
  ['statbar', 'statbar.css'],
  ['paginator', 'paginator.css'],
  ['media-chips', 'media-chips.css'],
  ['homepage', 'homepage.css'],
  ['series', 'series.css'],
  ['doulists', 'doulists.css'],
  ['personage-creations', 'personage-creations.css'],
  ['interest', 'interest.css'],
]
const css = order.map(([n, f]) => {
  let c = S(f)
  // Page-scoped :host token overrides must not leak into the multi-page fixture
  // (real composition loads homepage css only on homepage pages).
  if (n === 'homepage' || n === 'music-homepage' || n === 'book-homepage') {
    c = c.replace(/--umm-card-bg:\s*transparent;/g, '/* page-scoped override removed in fixture */')
  }
  return `/* === ${n} === */\n${c}`
}).join('\n')

const markup = `
<!-- 状态徽章（series） -->
<section>
  <h3>状态徽章</h3>
  <span class="umm-series-status umm-series-status--done">看过</span>
  <span class="umm-series-status umm-series-status--wish">想看</span>
  <span class="umm-series-status umm-series-status--doing">在看</span>
</section>

<!-- 创作徽章（personage-creations，absolute 需定位父级） -->
<section>
  <h3>创作徽章</h3>
  <div style="position:relative;display:inline-block;min-width:150px;height:30px;vertical-align:top;margin-right:16px;">
    <span class="umm-creation-badge umm-creation-badge--wish">想看</span>
  </div>
  <div style="position:relative;display:inline-block;min-width:150px;height:30px;vertical-align:top;margin-right:16px;">
    <span class="umm-creation-badge umm-creation-badge--do">在看</span>
  </div>
  <div style="position:relative;display:inline-block;min-width:150px;height:30px;vertical-align:top;margin-right:16px;">
    <span class="umm-creation-badge umm-creation-badge--collect">看过</span>
  </div>
  <span class="umm-creation-status">已推送 NeoDB</span>
</section>

<!-- NeoDB 按钮（interest） -->
<section>
  <h3>NeoDB 按钮</h3>
  <div class="umm-neodb-push-buttons" style="position:relative;display:flex;gap:8px;flex-wrap:wrap;padding:4px;">
    <button class="umm-neodb-btn umm-neodb-btn--minus">-1分 (7)</button>
    <button class="umm-neodb-btn umm-neodb-btn--plus">+1分 (9)</button>
    <button class="umm-neodb-btn umm-neodb-btn--original">原评 (8)</button>
    <a class="umm-neodb-btn umm-neodb-btn--open">打开 NeoDB</a>
    <button class="umm-neodb-btn umm-neodb-btn--minus" disabled>禁用态</button>
  </div>
</section>

<!-- 奖牌（homepage） -->
<section>
  <h3>榜单奖牌</h3>
  <span class="umm-billboard-order umm-billboard-order--gold">1</span>
  <span class="umm-billboard-order umm-billboard-order--silver">2</span>
  <span class="umm-billboard-order umm-billboard-order--bronze">3</span>
  <span class="umm-billboard-order">4</span>
</section>

<!-- 分类徽章（absolute 同样需要定位父级）+ statbar -->
<section>
  <h3>分类徽章 / StatBar</h3>
  <div style="position:relative;display:inline-block;min-width:70px;height:26px;vertical-align:top;margin-right:10px;">
    <span class="umm-doulist-cat-badge umm-doulist-cat--movie">电影</span>
  </div>
  <div style="position:relative;display:inline-block;min-width:70px;height:26px;vertical-align:top;margin-right:10px;">
    <span class="umm-doulist-cat-badge umm-doulist-cat--book">读书</span>
  </div>
  <div style="position:relative;display:inline-block;min-width:70px;height:26px;vertical-align:top;margin-right:10px;">
    <span class="umm-doulist-cat-badge umm-doulist-cat--thing_place">物品</span>
  </div>
  <div class="umm-statbar" style="display:inline-flex;margin-left:12px;">
    <span class="umm-statbar-item"><span class="umm-statbar-val">128</span><span class="umm-statbar-lbl">电影</span></span>
    <span class="umm-statbar-item umm-statbar-item--clickable"><span class="umm-statbar-val">64</span><span class="umm-statbar-lbl">音乐</span></span>
  </div>
</section>

<!-- Doulist 标签页（hover/active 下划线绘制） -->
<section>
  <h3>Doulist 标签页</h3>
  <div style="display:flex;gap:4px;border-bottom:1px solid var(--umm-color-border);width:fit-content;">
    <button class="umm-doulist-tab umm-doulist-tab--active">全部 <span class="umm-doulist-count">12</span></button>
    <button class="umm-doulist-tab" id="hover-tab">电影 <span class="umm-doulist-count">5</span></button>
    <button class="umm-doulist-tab">音乐</button>
  </div>
  <div style="display:flex;gap:4px;margin-top:10px;">
    <button class="umm-doulist-xbar-tab umm-doulist-xbar-tab--active">热门 <span class="umm-doulist-count">9</span></button>
    <button class="umm-doulist-xbar-tab" id="hover-xbar">最新 <span class="umm-doulist-count">3</span></button>
  </div>
</section>

<!-- 分页器 -->
<section>
  <h3>分页器</h3>
  <div class="umm-creations-paginator" style="display:flex;gap:6px;">
    <button class="umm-paginator-btn">‹</button>
    <button class="umm-paginator-btn umm-paginator-btn--active">1</button>
    <button class="umm-paginator-btn">2</button>
    <button class="umm-paginator-btn">3</button>
  </div>
</section>
`

const hostScript = `
const css = document.getElementById('composed-css').textContent
const markup = document.getElementById('fixture-markup').innerHTML
for (const [id, dark] of [['host-light', false], ['host-dark', true]]) {
  const host = document.getElementById(id)
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = css
  shadow.appendChild(style)
  const wrap = document.createElement('div')
  wrap.innerHTML = markup
  shadow.appendChild(wrap)
  if (dark) host.classList.add('umm-theme--dark')
  host.setAttribute('data-theme', dark ? 'dark' : 'light')
}
document.getElementById('toggle').addEventListener('click', () => {
  const h = document.getElementById('host-dark')
  const dark = h.classList.toggle('umm-theme--dark')
  h.setAttribute('data-theme', dark ? 'dark' : 'light')
})
`

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #ffffff; display: flex; gap: 0; }
  .col { flex: 1; padding: 12px 16px; }
  .col h2 { font-size: 14px; margin: 0 0 8px; color: #666; }
  #host-light { background: #f7f9fc; }
  #host-dark { background: #1c1c1e; }
  .col-toggle { position: fixed; top: 6px; right: 10px; z-index: 9; }
  section { margin-bottom: 18px; }
  section h3 { font-size: 11px; margin: 0 0 6px; opacity: .55; text-transform: uppercase; letter-spacing: .05em; }
</style></head>
<body>
<button id="toggle" class="col-toggle">toggle dark host</button>
<div class="col"><h2>LIGHT</h2><div id="host-light"></div></div>
<div class="col"><h2>DARK</h2><div id="host-dark"></div></div>
<script type="text/css" id="composed-css">${css.replace(/<\/style/gi, '<\\/style')}</script>
<script type="text/html" id="fixture-markup">${markup.replace(/<\/script/gi, '<\\/script')}</script>
<script>${hostScript}</script>
</body></html>`

const outDir = path.join(root, 'tmp-fixture')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'douban-fixture.html'), html)
console.log('fixture →', path.join(outDir, 'douban-fixture.html'), `(${(html.length / 1024).toFixed(1)}kb)`)
