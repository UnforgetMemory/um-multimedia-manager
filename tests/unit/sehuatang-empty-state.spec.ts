import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import { buildEmptyState, isEmptyHiddenState, syncEmptyHiddenState } from '@/content/sehuatang/empty-state'

/**
 * 色花堂列表页「全部已看过」空态测试（empty-state）。
 *
 * 隐藏语义三态（与 sehuatang-controls 的既定契约一致，不可混淆）：
 *   - 初始隐藏 = 不渲染（hiddenAtMount 计数，grid 中无 DOM 痕迹）；
 *   - 运行时隐藏 = setGridHideViewed 的内联 display:none（仅作用 .umm-viewed）；
 *   - 运行时标记（点击跳转/记录同步）= 只 dim 不隐藏 → 计为可见，不触发空态。
 * 空版块防误报：grid 为空且 hiddenAtMount = 0（本就无条目）不触发空态。
 */

function makeCard(doc: Document, opts: { viewed?: boolean; displayNone?: boolean; skel?: boolean } = {}): HTMLElement {
  const card = doc.createElement('div')
  card.className = 'umm-card' + (opts.skel ? ' umm-sht-skel' : '') + (opts.viewed ? ' umm-viewed' : '')
  if (opts.displayNone) card.style.display = 'none'
  return card
}

test.describe('isEmptyHiddenState — 空态判定真值表', () => {
  test('hide ON + 初始全隐（grid 空 + hiddenAtMount > 0）→ true', () => {
    const doc = new JSDOM().window.document
    const grid = doc.createElement('div')
    expect(isEmptyHiddenState(grid, true, 3)).toBe(true)
  })

  test('hide ON + 渲染卡全为运行时隐藏（display:none）→ true', () => {
    const doc = new JSDOM().window.document
    const grid = doc.createElement('div')
    grid.appendChild(makeCard(doc, { viewed: true, displayNone: true }))
    grid.appendChild(makeCard(doc, { viewed: true, displayNone: true }))
    expect(isEmptyHiddenState(grid, true, 0)).toBe(true)
  })

  test('任一渲染卡可见（未看卡 / 仅 dim 的已看卡）→ false', () => {
    const doc = new JSDOM().window.document
    const grid = doc.createElement('div')
    grid.appendChild(makeCard(doc, { viewed: true, displayNone: true }))
    grid.appendChild(makeCard(doc, {}))
    expect(isEmptyHiddenState(grid, true, 2)).toBe(false)
    // 运行时标记只 dim 不隐藏：.umm-viewed 无 display:none 计为可见。
    const grid2 = doc.createElement('div')
    grid2.appendChild(makeCard(doc, { viewed: true }))
    expect(isEmptyHiddenState(grid2, true, 0)).toBe(false)
  })

  test('hide OFF 恒 false（dim 卡仍可见，页面不空）', () => {
    const doc = new JSDOM().window.document
    const grid = doc.createElement('div')
    grid.appendChild(makeCard(doc, { viewed: true, displayNone: true }))
    expect(isEmptyHiddenState(grid, false, 5)).toBe(false)
  })

  test('空版块/骨架期防误报：grid 空 + hiddenAtMount = 0 → false', () => {
    const doc = new JSDOM().window.document
    const grid = doc.createElement('div')
    expect(isEmptyHiddenState(grid, true, 0)).toBe(false)
    // 骨架卡（.umm-sht-skel）是检查期占位，不计入可见/隐藏事实。
    grid.appendChild(makeCard(doc, { skel: true }))
    grid.appendChild(makeCard(doc, { skel: true }))
    expect(isEmptyHiddenState(grid, true, 0)).toBe(false)
  })
})

test.describe('syncEmptyHiddenState — 挂/撤幂等', () => {
  test('true → 挂一个空态节点；重复调用幂等（仍一个）', () => {
    const doc = new JSDOM().window.document
    const shell = doc.createElement('div')
    const grid = doc.createElement('div')
    grid.classList.add('umm-sht-hide-viewed')
    syncEmptyHiddenState(shell, grid, 4)
    expect(shell.querySelectorAll('.umm-sht-empty').length).toBe(1)
    syncEmptyHiddenState(shell, grid, 4)
    expect(shell.querySelectorAll('.umm-sht-empty').length).toBe(1)
  })

  test('false → 撤销已挂节点；null shell 不抛', () => {
    const doc = new JSDOM().window.document
    const shell = doc.createElement('div')
    const grid = doc.createElement('div')
    grid.classList.add('umm-sht-hide-viewed')
    syncEmptyHiddenState(shell, grid, 1)
    expect(shell.querySelector('.umm-sht-empty')).not.toBeNull()
    // 菜单切 OFF：网格类摘除 → 空态撤销。
    grid.classList.remove('umm-sht-hide-viewed')
    syncEmptyHiddenState(shell, grid, 1)
    expect(shell.querySelector('.umm-sht-empty')).toBeNull()
    expect(() => syncEmptyHiddenState(null, grid, 1)).not.toThrow()
  })

  test('true → false → true：节点重建', () => {
    const doc = new JSDOM().window.document
    const shell = doc.createElement('div')
    const grid = doc.createElement('div')
    grid.classList.add('umm-sht-hide-viewed')
    syncEmptyHiddenState(shell, grid, 1)
    grid.classList.remove('umm-sht-hide-viewed')
    syncEmptyHiddenState(shell, grid, 1)
    grid.classList.add('umm-sht-hide-viewed')
    syncEmptyHiddenState(shell, grid, 1)
    expect(shell.querySelectorAll('.umm-sht-empty').length).toBe(1)
  })
})

test.describe('buildEmptyState — 结构与文案', () => {
  test('svg + 标题 + 提示齐备（模块默认 locale zh-CN）', () => {
    const doc = new JSDOM().window.document
    const node = buildEmptyState(doc)
    expect(node.className).toBe('umm-sht-empty')
    expect(node.getAttribute('role')).toBe('status')
    expect(node.querySelector('svg')).not.toBeNull()
    expect(node.querySelector('.umm-sht-empty-title')?.textContent).toBe('全部已看过')
    expect(node.querySelector('.umm-sht-empty-hint')?.textContent).toContain('隐藏已阅')
  })
})
