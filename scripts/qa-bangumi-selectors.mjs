/**
 * Bangumi P1 选择器一致性 QA（无浏览器环境兜底方案）：
 * 解析离线 HTML（真实 bgm.tv 详情页快照），验证代码中使用的全部 CSS 选择器
 * 与真实页面结构匹配 —— 弥补无法加载真实 Chrome 扩展的缺口。
 *
 * 用法: node scripts/qa-bangumi-selectors.mjs
 * 退出码 0 = 全部选择器命中；1 = 有未命中。
 */
import fs from 'node:fs'
import path from 'node:path'

const HTML_PATH = path.resolve('.localref/bangumi/カウボーイビバップ _ Bangumi 番组计划.html')
const html = fs.readFileSync(HTML_PATH, 'utf-8')

// [选择器, 说明] —— 全部来自 bangumi.ts / bangumi-extract.ts / router.ts
const checks = [
  ['id="headerSubject"', '详情页判定 #headerSubject'],
  ['id="bangumiInfo"', '详情页判定 #bangumiInfo'],
  ['id="infobox"', '类型推断 #infobox'],
  ['class="nameSingle"', '标题锚点 h1.nameSingle'],
  ['id="panelInterestWrapper"', '登录态收藏盒容器'],
  ['class="SidePanel png_bg"', '收藏盒 SidePanel（多类名）'],
  ['name="rate-now"', '评分表单 form[name=rate-now]'],
  ['name="rate"', '评分 radio name=rate'],
  ['class="interest_now"', '状态文本 .interest_now'],
  ['class="subjectNav"', '兜底锚点 .subjectNav'],
  ['class="tip"', 'infobox 标签 span.tip'],
  ['var INTEREST_TYPE = 2', '内联状态变量 INTEREST_TYPE'],
  ['href="https://bgm.tv/subject/253"', 'subject id 链接'],
]

// 列表页样品（真实抓取）
const LIST_HTML = fs.existsSync('.localref/bangumi/pages/anime_browser.html')
  ? fs.readFileSync('.localref/bangumi/pages/anime_browser.html', 'utf-8')
  : ''
const listChecks = [
  ['browserFull browser-list', '列表容器 ul.browserFull'],
  ['id="item_545465"', '卡片 li#item_{id}（id 直接含 subject id）'],
  ['class="item odd clearit"', '卡片 li.item'],
  ['class="inner"', '卡片注入区 .inner'],
  ['/subject/545465', '相对 subject 链接'],
]

const files = [
  { name: '详情页离线快照', html, checks },
  { name: '列表页真实样品', html: LIST_HTML, checks: listChecks },
]

let total = 0
let pass = 0
const allFails = []
for (const { name, html, checks: cks } of files) {
  for (const [selector, desc] of cks) {
    total++
    if (html && html.includes(selector)) pass++
    else allFails.push(`${name}: ${desc} (${selector})`)
  }
}

console.log(`选择器一致性检查: ${pass}/${total} 命中（详情页 ${checks.length} + 列表页 ${listChecks.length}）`)
if (allFails.length) {
  console.log('❌ 未命中:')
  for (const f of allFails) console.log('  - ' + f)
  process.exit(1)
} else {
  console.log('✅ 全部选择器与真实页面结构一致')
  process.exit(0)
}
