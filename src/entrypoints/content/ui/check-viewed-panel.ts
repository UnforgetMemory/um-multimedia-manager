/**
 * 查询已阅状态面板（可拖拽）
 */

import { SehuatangStore } from '@/features/sehuatang'
import { t } from '../i18n'

const PANEL_ID = 'umm-check-viewed-panel'

export function showCheckViewedPanel(): void {
  if (document.getElementById(PANEL_ID)) return

  const panel = document.createElement('div')
  panel.id = PANEL_ID
  panel.style.cssText = `
    position: fixed; top: 50px; left: 50%; transform: translateX(-50%);
    background: #1e1e1e; padding: 20px; border-radius: 12px;
    border: 1px solid #333; width: 350px; display: flex;
    flex-direction: column; gap: 15px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 10001; cursor: move;
  `

  panel.innerHTML = `
    <h3 style="margin:0; color:#03dac6; text-align:center; padding-bottom:10px; border-bottom:1px solid #333">${t('Check Viewed Title')}</h3>
    <button id="umm-cv-close" style="position:absolute; top:10px; right:10px; background:none; border:none; color:#aaa; font-size:20px; cursor:pointer">&times;</button>
    <div style="display:flex; align-items:center; gap:10px">
      <input type="text" id="umm-cv-input" placeholder="${t('Check ID Placeholder')}"
        style="flex-grow:1; background:#2a2a2a; border:1px solid #444; color:white; padding:10px; border-radius:6px; outline:none" />
      <button id="umm-cv-check" style="padding:8px 16px; border-radius:6px; border:none; cursor:pointer; background:#03dac6; color:#000; font-weight:bold">${t('Check Btn')}</button>
    </div>
    <div id="umm-cv-result" style="margin-top:15px; padding-top:15px; border-top:1px solid #333"></div>
  `

  document.body.appendChild(panel)

  const input = document.getElementById('umm-cv-input') as HTMLInputElement
  const checkBtn = document.getElementById('umm-cv-check')!
  const closeBtn = document.getElementById('umm-cv-close')!
  const resultDiv = document.getElementById('umm-cv-result')!

  input.focus()

  const close = () => panel.remove()
  closeBtn.onclick = close

  const doCheck = async () => {
    const avid = input.value.trim().toUpperCase()
    if (!avid) return

    const items = await SehuatangStore.getAll()
    const found = items.find(r => r.id === avid)

    resultDiv.innerHTML = ''
    const row = (label: string, value: string, cls?: string) => {
      const div = document.createElement('div')
      div.style.cssText = 'display:flex; justify-content:space-between; padding:5px 0'
      const color = cls === 'viewed' ? '#4caf50' : cls === 'not-viewed' ? '#f44336' : '#e0e0e0'
      div.innerHTML = `<span style="font-weight:bold; color:#aaa">${label}</span><span style="color:${color}">${value}</span>`
      resultDiv.appendChild(div)
    }

    row(t('Status'), found ? t('Viewed On') : t('Not Viewed'), found ? 'viewed' : 'not-viewed')
    if (found) {
      row('', new Date(found.updatedAt).toLocaleDateString())
      row(t('Rating'), `${found.rating} / 10`)
    }
  }

  checkBtn.onclick = doCheck
  input.onkeydown = (e) => { if (e.key === 'Enter') doCheck() }

  let isDragging = false
  let offsetX = 0, offsetY = 0

  panel.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).id === 'umm-cv-close') return
    isDragging = true
    offsetX = e.clientX - panel.getBoundingClientRect().left
    offsetY = e.clientY - panel.getBoundingClientRect().top
    panel.style.userSelect = 'none'
  })

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return
    panel.style.left = `${e.clientX - offsetX}px`
    panel.style.top = `${e.clientY - offsetY}px`
    panel.style.transform = 'none'
  })

  document.addEventListener('mouseup', () => {
    isDragging = false
    panel.style.userSelect = ''
  })
}
