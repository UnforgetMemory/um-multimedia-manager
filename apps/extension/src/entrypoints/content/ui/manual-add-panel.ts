/**
 * 手动添加已阅记录面板
 */

import { AdultAvStore } from '@/features/adult-av'
import { t } from '../i18n'
import type { AdultAvIdInput } from '@/types'

const PANEL_ID = 'umm-manual-add-overlay'

export function showManualAddPanel(): void {
  if (document.getElementById(PANEL_ID)) return

  const overlay = document.createElement('div')
  overlay.id = PANEL_ID
  overlay.className = 'umm-overlay'

  const panel = document.createElement('div')
  panel.className = 'umm-panel'
  panel.style.cssText = 'padding:25px;width:400px;display:flex;flex-direction:column;gap:15px'

  const ratingOptions = Array.from({ length: 11 }, (_, i) =>
    `<option value="${i}" ${i === 5 ? 'selected' : ''}>${i}</option>`
  ).join('')

  panel.innerHTML = `
    <h3 class="umm-panel-title">${t('Panel Title')}</h3>
    <div class="umm-flex-col">
      <input type="text" id="umm-add-input" placeholder="${t('ID Placeholder')}" class="umm-input" />
    </div>
    <div class="umm-flex-col">
      <label class="umm-label-text">${t('Rating Label')}</label>
      <select id="umm-add-rating" class="umm-input">${ratingOptions}</select>
    </div>
    <div class="umm-flex-row umm-flex-end umm-mt">
      <button id="umm-add-close" class="umm-btn umm-btn--secondary">${t('Close')}</button>
      <button id="umm-add-save" class="umm-btn umm-btn--primary">${t('Save')}</button>
    </div>
  `

  overlay.appendChild(panel)
  document.body.appendChild(overlay)

  const input = document.getElementById('umm-add-input') as HTMLInputElement
  const ratingSelect = document.getElementById('umm-add-rating') as HTMLSelectElement
  const saveBtn = document.getElementById('umm-add-save')!
  const closeBtn = document.getElementById('umm-add-close')!

  input.focus()

  const close = () => overlay.remove()
  closeBtn.onclick = close
  overlay.onclick = (e) => { if (e.target === overlay) close() }
  input.onkeydown = (e) => {
    if (e.key === 'Enter') saveBtn.click()
    if (e.key === 'Escape') close()
  }

  saveBtn.onclick = async () => {
    const val = input.value.trim()
    if (!val) return

    let count = 0
    if (val.startsWith('[') && val.endsWith(']')) {
      try {
        const parsed = JSON.parse(val) as AdultAvIdInput[]
        if (Array.isArray(parsed)) {
          count = await AdultAvStore.batchAdd('manual', parsed)
        }
      } catch {
        alert(t('Invalid JSON'))
        return
      }
    } else {
      await AdultAvStore.add('manual', val, parseInt(ratingSelect.value))
      count = 1
    }

    if (count > 0) {
      console.log(`[UMM] ${t('Added Msg', { count: String(count) })}`)
      input.value = ''
      input.focus()
    }
  }
}
