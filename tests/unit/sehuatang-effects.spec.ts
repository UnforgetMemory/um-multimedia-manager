import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import { initImageReveal, runCardEntrance } from '@/entrypoints/content/handlers/sehuatang-effects'

/**
 * 色花堂动效层（sehuatang-effects）单元测试。
 *
 * 覆盖：图片模糊遮罩揭示的防抖语义（悬停超延迟才揭示、延迟内移出取消、
 * 移出即恢复模糊）、**作用域=图片区**（标题/日期等文字区域悬停不触发）、
 * 事件委托（图片子元素进入命中卡片）、幂等标志位、卡片入场级联。
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function gridDom(cardsHtml: string) {
  const dom = new JSDOM(`<body><div class="umm-preview-grid">${cardsHtml}</div></body>`, {
    url: 'https://www.sehuatang.net/forum-103-1.html',
  })
  const container = dom.window.document.querySelector('.umm-preview-grid') as HTMLElement
  return { dom, container }
}

const TWO_CARDS = `
  <div class="umm-card">
    <div class="umm-card-image"><img src="https://x.test/a.jpg"></div>
    <div class="umm-card-content">
      <h3 class="umm-card-title"><a href="https://x.test/1">标题 A</a></h3>
      <p class="umm-card-meta">2026-01-01</p>
    </div>
  </div>
  <div class="umm-card">
    <div class="umm-card-image"><img src="https://x.test/b.jpg"></div>
    <div class="umm-card-content">
      <h3 class="umm-card-title"><a href="https://x.test/2">标题 B</a></h3>
    </div>
  </div>`

const enter = (dom: JSDOM, el: Element) => el.dispatchEvent(new dom.window.MouseEvent('mouseenter'))
const leave = (dom: JSDOM, el: Element) => el.dispatchEvent(new dom.window.MouseEvent('mouseleave'))

test.describe('initImageReveal — 模糊遮罩揭示与防抖（作用域=图片区）', () => {
  test('图片区悬停超过延迟 → 揭示；移出图片区 → 立即恢复模糊', async () => {
    const { dom, container } = gridDom(TWO_CARDS)
    initImageReveal(container, 20)
    const imageArea = container.querySelector('.umm-card-image') as HTMLElement
    const card = imageArea.closest('.umm-card') as HTMLElement
    enter(dom, imageArea)
    expect(card.classList.contains('umm-sht-revealed')).toBe(false)
    await sleep(50)
    expect(card.classList.contains('umm-sht-revealed')).toBe(true)
    leave(dom, imageArea)
    expect(card.classList.contains('umm-sht-revealed')).toBe(false)
  })

  test('防抖：延迟内移出 → 定时器取消，不揭示', async () => {
    const { dom, container } = gridDom(TWO_CARDS)
    initImageReveal(container, 60)
    const imageArea = container.querySelector('.umm-card-image') as HTMLElement
    const card = imageArea.closest('.umm-card') as HTMLElement
    enter(dom, imageArea)
    await sleep(20)
    leave(dom, imageArea)
    await sleep(80)
    expect(card.classList.contains('umm-sht-revealed')).toBe(false)
  })

  test('防抖：进入-离开-再进入 → 以最后一次进入重新计时', async () => {
    const { dom, container } = gridDom(TWO_CARDS)
    initImageReveal(container, 50)
    const imageArea = container.querySelector('.umm-card-image') as HTMLElement
    const card = imageArea.closest('.umm-card') as HTMLElement
    enter(dom, imageArea)
    await sleep(20)
    leave(dom, imageArea)
    enter(dom, imageArea)
    await sleep(70)
    expect(card.classList.contains('umm-sht-revealed')).toBe(true)
  })

  test('作用域：标题文字区悬停不触发揭示（回归锚点）', async () => {
    const { dom, container } = gridDom(TWO_CARDS)
    initImageReveal(container, 20)
    const title = container.querySelector('.umm-card-title a')!
    const card = title.closest('.umm-card') as HTMLElement
    enter(dom, title)
    await sleep(50)
    expect(card.classList.contains('umm-sht-revealed')).toBe(false)
  })

  test('作用域：日期/元信息区悬停不触发揭示', async () => {
    const { dom, container } = gridDom(TWO_CARDS)
    initImageReveal(container, 20)
    const meta = container.querySelector('.umm-card-meta')!
    const card = meta.closest('.umm-card') as HTMLElement
    enter(dom, meta)
    await sleep(50)
    expect(card.classList.contains('umm-sht-revealed')).toBe(false)
  })

  test('事件委托：图片子元素（img）进入同样命中图片区并揭示', async () => {
    const { dom, container } = gridDom(TWO_CARDS)
    initImageReveal(container, 20)
    const img = container.querySelector('img')!
    enter(dom, img)
    await sleep(50)
    expect((img.closest('.umm-card') as HTMLElement).classList.contains('umm-sht-revealed')).toBe(true)
  })

  test('幂等：重复初始化不重复挂监听（标志位 + 样式单例）', () => {
    const { dom, container } = gridDom(TWO_CARDS)
    initImageReveal(container, 20)
    initImageReveal(container, 20)
    expect(container.getAttribute('data-umm-sht-reveal')).toBe('1')
    expect(dom.window.document.querySelectorAll('#umm-sht-effects-styles')).toHaveLength(1)
  })

  test('揭示后再进入图片区：保持揭示不闪烁（已揭示不重新计时）', async () => {
    const { dom, container } = gridDom(TWO_CARDS)
    initImageReveal(container, 20)
    const imageArea = container.querySelector('.umm-card-image') as HTMLElement
    const card = imageArea.closest('.umm-card') as HTMLElement
    enter(dom, imageArea)
    await sleep(50)
    expect(card.classList.contains('umm-sht-revealed')).toBe(true)
    enter(dom, imageArea)
    await sleep(5)
    expect(card.classList.contains('umm-sht-revealed')).toBe(true)
  })
})

test.describe('runCardEntrance — 卡片入场级联', () => {
  test('逐卡追加入场类名并递增 animation-delay', () => {
    const { dom, container } = gridDom('<div class="umm-card">1</div><div class="umm-card">2</div><div class="umm-card">3</div>')
    runCardEntrance(container, 45)
    const cards = Array.from(container.querySelectorAll('.umm-card')) as HTMLElement[]
    expect(cards.map((c) => c.style.animationDelay)).toEqual(['0ms', '45ms', '90ms'])
    for (const card of cards) {
      expect(card.classList.contains('umm-sht-enter')).toBe(true)
    }
    expect(dom.window.document.getElementById('umm-sht-effects-styles')).not.toBeNull()
  })

  test('无卡片 → 不抛错；样式仍注入', () => {
    const { dom, container } = gridDom('')
    expect(() => runCardEntrance(container)).not.toThrow()
    expect(dom.window.document.getElementById('umm-sht-effects-styles')).not.toBeNull()
  })

  test('newOnly：AJAX 分页追加时不重播已入场卡片（延迟保持不变）', () => {
    const { dom, container } = gridDom('<div class="umm-card">1</div><div class="umm-card">2</div>')
    const [existing, fresh] = Array.from(container.querySelectorAll('.umm-card')) as HTMLElement[]
    existing!.classList.add('umm-sht-enter')
    existing!.style.animationDelay = '45ms'

    runCardEntrance(container, 45, true)
    // 已入场卡片不受影响；仅新卡获得入场类与从 0 起的级联延迟。
    expect(existing!.style.animationDelay).toBe('45ms')
    expect(fresh!.classList.contains('umm-sht-enter')).toBe(true)
    expect(fresh!.style.animationDelay).toBe('0ms')
  })
})
