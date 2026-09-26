/**
 * Sehuatang overlay header builder (split from ./app, 2026-09-26 god-file split).
 *
 * Pure DOM construction — no module state. The header stats refresh callbacks
 * (updateHeaderInfo / bumpStats, which own the page-level stats cache in ./app)
 * are injected by the caller to avoid a circular import.
 */

import { AdultAvStore } from '@/provider/adult-av'
import { settingsItems } from '@/engine/settings/items'
import { t } from '@/entrypoints/content/i18n'
import { showManualAddPanel } from '@/entrypoints/content/ui/manual-add-panel'
import { showCheckViewedPanel } from '@/entrypoints/content/ui/check-viewed-panel'
import { FloatingToast } from '@/entrypoints/content/utils/toast'
import { markCardsViewed, setGridHideViewed, buildHomeLink } from '@/entrypoints/content/handlers/sehuatang-controls'
import { openSehuatangMenu } from '@/entrypoints/content/handlers/sehuatang-menu'
import { reportSaveFailure } from './save-failure'
import type { DetailLoader } from './detail-loader'

export interface HeaderDeps {
  updateHeaderInfo: (headerEl: HTMLElement, grid: HTMLElement) => void
  bumpStats: (ids: string[]) => void
}

export function buildHeader(
  shell: HTMLElement,
  grid: HTMLElement,
  loader: DetailLoader,
  deps: HeaderDeps,
): HTMLElement {
  const header = document.createElement('div')
  header.className = 'umm-sehuatang-header'

  // 右上角统计区：两个 box div——本页状态（.umm-header-info）+ 全局三段
  // （.umm-sht-stats）；整组由 row--context 的 margin-left:auto 推至右上角
  // （mount 时整组入行）。置于 actions 之前：mount 以 lastElementChild 取 actions。
  const statArea = document.createElement('div')
  statArea.className = 'umm-sht-stat-area'
  const info = document.createElement('div')
  info.className = 'umm-header-info'
  const statsBox = document.createElement('div')
  statsBox.className = 'umm-sht-stats'
  statArea.appendChild(info)
  statArea.appendChild(statsBox)
  header.appendChild(statArea)

  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex; gap:8px; align-items:center'

  const copyBtn = document.createElement('button')
  copyBtn.className = 'umm-copy-btn'
  copyBtn.disabled = true
  copyBtn.onclick = () => {
    void (async () => {
      const cards = Array.from(grid.querySelectorAll('.umm-card:not(.umm-viewed)')) as HTMLElement[]
      if (cards.length === 0) return

      // 懒加载补抓：未载出磁力的卡片先并发补齐（同一缓存/队列通道），带进度。
      const pending = cards.filter((c) => !c.querySelector('.umm-magnet-link'))
      const baseLabel = t('Copy All Magnets')
      copyBtn.disabled = true
      copyBtn.setAttribute('data-umm-copying', '1')
      try {
        if (pending.length > 0) {
          let done = 0
          copyBtn.textContent = `⚡ ${baseLabel} (0/${pending.length})`
          await Promise.all(pending.map((card) => loader.loadNow(card).then(() => {
            done++
            copyBtn.textContent = `⚡ ${baseLabel} (${done}/${pending.length})`
          })))
        }
        const links = cards
          .map((c) => c.querySelector('.umm-magnet-link'))
          .filter((l): l is HTMLAnchorElement => l !== null)
        if (links.length > 0) {
          const magnets = links.map((l) => l.href).join('\r\n')
          navigator.clipboard.writeText(magnets).then(() => {
            // 复制反馈动效：全部复制按钮 pop + 计数 toast（仅复制成功时）。
            for (const link of links) {
              link.classList.add('umm-sht-copied')
              setTimeout(() => link.classList.remove('umm-sht-copied'), 650)
            }
            FloatingToast.success(t('Copy Done', { count: String(links.length) }))
          }).catch((error: unknown) => {
            console.warn('[UMM] Sehuatang clipboard write failed:', error)
          })
          // 统一标记路径：单次批量落库 + 类落下即 dimmer/统计即时刷新；失败 toast。
          const targetCards = links.map((l) => l.closest('.umm-card')).filter((c): c is HTMLElement => c !== null)
          markCardsViewed(
            targetCards, 'sehuatang', AdultAvStore,
            () => deps.updateHeaderInfo(header, grid),
            (added, ids) => {
              deps.bumpStats(ids)
              deps.updateHeaderInfo(header, grid)
              console.log(`[UMM] saved watched ids (${added}):`, ids.join(', ') || '(none)')
            },
            (error) => { reportSaveFailure(String(error)); FloatingToast.error(t('Magnet Save Failed')) },
          )
        }
      } finally {
        copyBtn.removeAttribute('data-umm-copying')
        deps.updateHeaderInfo(header, grid)
      }
    })()
  }
  actions.appendChild(copyBtn)

  const menuBtn = document.createElement('button')
  menuBtn.className = 'umm-sht-action'
  menuBtn.textContent = '☰'
  menuBtn.title = 'Menu'
  menuBtn.setAttribute('aria-haspopup', 'dialog')
  menuBtn.onclick = () => {
    const isHidden = () => grid.classList.contains('umm-sht-hide-viewed')
    const hideLabel = () => `${isHidden() ? '✓ ' : ''}${t('Hide Viewed')}`
    openSehuatangMenu(document, menuBtn, t('Menu Title'), [
      { label: t('Manual Add'), onClick: () => showManualAddPanel() },
      { label: t('Check Viewed Status'), onClick: () => showCheckViewedPanel() },
      {
        label: hideLabel(),
        onClick: () => {
          // 命令式显隐（非持久 CSS 规则）：ON 立即隐藏当前已看卡，OFF 复原；
          // 运行时标记「只 dim 不隐藏」语义不受影响。
          const nowHidden = !isHidden()
          setGridHideViewed(grid, nowHidden)
          settingsItems().sehuatangHideViewed.setValue(nowHidden).catch(() => {})
          // 隐藏切换后立即刷新本页已看/隐藏统计。
          deps.updateHeaderInfo(header, grid)
        },
        refreshLabel: hideLabel,
        active: isHidden,
        keepOpen: true,
      },
    ])
  }
  // 顶部居中簇（header top center）：🏠 首页 + ☰ 菜单——row--context 三列
  // 网格的中列；其余动作（返回/发新帖/复制磁力）留在 nav 行右对齐。
  const center = document.createElement('div')
  center.className = 'umm-sht-center'
  center.appendChild(buildHomeLink(document))
  center.appendChild(menuBtn)

  header.appendChild(center)
  header.appendChild(actions)
  shell.insertBefore(header, shell.firstChild)
  return header
}
