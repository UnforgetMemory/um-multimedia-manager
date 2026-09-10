import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import { isRiskGateDocument, extractRiskGate } from '@/content/sehuatang/extract-risk'

/**
 * 色花堂风控页（年龄门）检测与提取测试（extract-risk）。
 *
 * 夹具复刻 .localref/风控校验.html 的核心结构：div.domain 大字标题 +
 * 两个 a.enter-btn（中/英）+ .line 分隔线 + .down-content 警告块
 * （h3 + 中文警告 p.c_red + 英文警告 p）。站点 mainv2.js 会把 enter-btn
 * click 绑定为「写 safeid cookie + 重载」——重建按钮必须委托原元素，
 * 提取层按文档序返回按钮（app-risk 按序委托）。
 */

const RISK_HTML = `
<div style="display: none;">为别人点一盏灯，照亮自己前行的路。 — 佛教谚语</div>
<div class="domain">SEHUATANG.NET</div>
<a href="https://www.sehuatang.net/" class="enter-btn">
  满18岁，请点此进入
</a>
<a href="https://www.sehuatang.net/" class="enter-btn">
  If you are over 18，please click here
</a>
<div class="line"></div>
<div class="row down-content">
  <h3>警告 / WARNING</h3>
  <p class="c_red">
    本物品內容可能令人反感；不可將本物品內容派發，傳閱，出售，出租，交給或出借予年齡未滿 18 歲的人士出示，播放或播映。
  </p>
  <p>This article contains material which may offernd and may not be distributed, circulated, sold, hired, given, lent, shown, played or projected to a person under the age of 18 years. All models are 18 or older.</p>
</div>
`

function docFrom(html: string): Document {
  return new JSDOM(html).window.document
}

test.describe('isRiskGateDocument — DOM 双标记判定', () => {
  test('风控页夹具命中（div.domain + a.enter-btn[href] 双 AND）', () => {
    expect(isRiskGateDocument(docFrom(RISK_HTML))).toBe(true)
  })

  test('正常 Discuz 列表页文档不命中', () => {
    const html =
      '<div id="wp"><div id="ct"><div id="threadlisttableid"><table><tbody><tr></tr></tbody></table></div></div></div>'
    expect(isRiskGateDocument(docFrom(html))).toBe(false)
  })

  test('单标记不命中（严防误判的双 AND 红线）', () => {
    expect(isRiskGateDocument(docFrom('<div class="domain">SEHUATANG.NET</div>'))).toBe(false)
    expect(
      isRiskGateDocument(docFrom('<a href="https://www.sehuatang.net/" class="enter-btn">进入</a>')),
    ).toBe(false)
  })

  test('domain 空文本不命中', () => {
    expect(
      isRiskGateDocument(
        docFrom('<div class="domain">   </div><a href="#" class="enter-btn">进入</a>'),
      ),
    ).toBe(false)
  })
})

test.describe('extractRiskGate — 风控页内容透传提取', () => {
  test('完整夹具：域名 / 双按钮（文档序）/ 警告标题与双段', () => {
    const gate = extractRiskGate(docFrom(RISK_HTML))
    expect(gate).not.toBeNull()
    expect(gate!.domain).toBe('SEHUATANG.NET')
    expect(gate!.enters).toHaveLength(2)
    expect(gate!.enters[0]).toEqual({
      label: '满18岁，请点此进入',
      href: 'https://www.sehuatang.net/',
    })
    expect(gate!.enters[1]).toEqual({
      label: 'If you are over 18，please click here',
      href: 'https://www.sehuatang.net/',
    })
    expect(gate!.warningTitle).toBe('警告 / WARNING')
    expect(gate!.warnings).toHaveLength(2)
    expect(gate!.warnings[0]).toContain('本物品內容可能令人反感')
    expect(gate!.warnings[1]).toContain('All models are 18 or older')
  })

  test('源码缩进换行被空白归一化（标签/警告文本不夹带换行）', () => {
    const gate = extractRiskGate(docFrom(RISK_HTML))!
    expect(gate.enters.every((e) => !/\n/.test(e.label))).toBe(true)
    expect(gate.warnings.every((w) => !/\n/.test(w))).toBe(true)
    expect(gate.warningTitle).not.toMatch(/\n/)
  })

  test('缺 down-content：警告标题 null、警告段空数组（域名/按钮不受影响）', () => {
    const html = '<div class="domain">SEHUATANG.NET</div><a href="#" class="enter-btn">进入</a>'
    const gate = extractRiskGate(docFrom(html))!
    expect(gate.domain).toBe('SEHUATANG.NET')
    expect(gate.warningTitle).toBeNull()
    expect(gate.warnings).toEqual([])
  })

  test('非风控文档 → null（编排层 dismiss 兜底依据）', () => {
    expect(extractRiskGate(docFrom('<div id="ct"></div>'))).toBeNull()
  })
})
