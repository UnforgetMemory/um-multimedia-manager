/**
 * JavDB 已阅淡化增强器
 * 功能：在 JavDB 页面中淡化已阅条目
 */

import { AdultAvStore } from '@/features/adult-av'
import { initI18n } from '../i18n'

let observer: MutationObserver | null = null

function processItem(item: Element): void {
  if (item.getAttribute('data-umm-processed')) return

  const titleStrong = item.querySelector('.video-title strong')
  if (!titleStrong) return

  const avid = titleStrong.textContent?.trim().toUpperCase()
  if (!avid) return

  item.setAttribute('data-umm-processed', 'true')
  item.setAttribute('data-umm-avid', avid)

  AdultAvStore.has(avid).then((viewed: boolean) => {
    if (viewed) {
      (item as HTMLElement).classList.add('umm-viewed')
    }
  })

  item.addEventListener('click', () => {
    AdultAvStore.add('javdb', avid, 0)
    ;(item as HTMLElement).classList.add('umm-viewed')
  }, { once: true })
}

function run(): void {
  const items = document.querySelectorAll('.item, .grid-item')
  items.forEach(item => {
    if (!item.getAttribute('data-umm-processed')) {
      processItem(item)
    }
  })
}

export async function handleJavDBPage(): Promise<void> {
  initI18n()
  console.log('[UMM] JavDB enhancer activated')

  if (!document.getElementById('umm-javdb-styles')) {
    const style = document.createElement('style')
    style.id = 'umm-javdb-styles'
    style.textContent = `
      body.javdb-enhanced .item.viewed,
      body.javdb-enhanced .item.umm-viewed {
        opacity: 0.3 !important;
        transition: opacity 0.3s ease-in-out;
        filter: grayscale(80%);
      }
      body.javdb-enhanced .item.viewed:hover,
      body.javdb-enhanced .item.umm-viewed:hover {
        opacity: 1 !important;
        filter: grayscale(0%);
      }
    `
    document.head.appendChild(style)
  }
  document.body.classList.add('javdb-enhanced')

  run()

  observer = new MutationObserver(() => run())
  const container = document.querySelector('.movie-list') || document.body
  observer.observe(container, { childList: true, subtree: true })
}
