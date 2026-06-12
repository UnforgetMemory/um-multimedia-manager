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
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7); z-index: 9999;
    display: flex; justify-content: center; align-items: center;
  `

  const panel = document.createElement('div')
  panel.style.cssText = `
    background: #1e1e1e; padding: 25px; border-radius: 12px;
    border: 1px solid #333; width: 400px; display: flex;
    flex-direction: column; gap: 15px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  `

  const ratingOptions = Array.from({ length: 11 }, (_, i) =>
    `<option value="${i}" ${i === 5 ? 'selected' : ''}>${i}</option>`
  ).join('')

  panel.innerHTML = `
    <h3 style="margin:0; color:#03dac6; text-align:center">${t('Panel Title')}</h3>
    <div style="display:flex; flex-direction:column; gap:5px">
      <input type="text" id="umm-add-input" placeholder="${t('ID Placeholder')}"
        style="background:#2a2a2a; border:1px solid #444; color:white; padding:10px; border-radius:6px; outline:none; width:100%; box-sizing:border-box" />
    </div>
    <div style="display:flex; flex-direction:column; gap:5px">
      <label style="font-size:0.9rem; color:#aaa">${t('Rating Label')}</label>
      <select id="umm-add-rating" style="background:#2a2a2a; border:1px solid #444; color:white; padding:10px; border-radius:6px">
        ${ratingOptions}
      </select>
    </div>
    <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:10px">
      <button id="umm-add-close" style="padding:8px 16px; border-radius:6px; border:none; cursor:pointer; background:#444; color:#ccc; font-weight:bold">${t('Close')}</button>
      <button id="umm-add-save" style="padding:8px 16px; border-radius:6px; border:none; cursor:pointer; background:#03dac6; color:#000; font-weight:bold">${t('Save')}</button>
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
