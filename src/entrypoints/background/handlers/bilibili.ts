/**
 * Bilibili message handlers for background Service Worker.
 */

import type { DataScheduler } from '@/features/data-scheduler/data-scheduler'
import type { MediaDatabase } from '@/features/database/models'
import { STORE_NAMES } from '@/features/database/models'
import { broadcast } from '@/utils/event-bus'

export interface BiliHandlerContext {
  db: MediaDatabase
  scheduler: DataScheduler
}

export async function handleBilibiliInject(
  payload: { tabId?: number } | undefined,
  _sender: chrome.runtime.MessageSender,
): Promise<{ success: boolean; error?: string }> {
  const { tabId } = payload ?? {}
  if (!tabId) return { success: false, error: 'Missing tabId' }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const d = document.createElement('div')
        d.setAttribute('data-umm-bili-float', '')
        d.textContent = 'UMM'
        Object.assign(d.style, {
          position: 'fixed', left: '20px', top: '20px',
          zIndex: '2147483647',
          width: '50px', height: '50px', borderRadius: '50%',
          background: '#22c55e', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: '14px', fontWeight: '700',
          fontFamily: 'Arial,sans-serif',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          userSelect: 'none',
        })
        document.body.appendChild(d)
      },
    })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) }
  }
}

export async function handleBilibiliSave(
  payload: { bvid?: string; status?: number; rating?: number },
  ctx: BiliHandlerContext,
): Promise<{ success: boolean; error?: string }> {
  const { bvid, status, rating } = payload ?? {}
  if (!bvid) return { success: false, error: 'Missing bvid' }

  try {
    const record = {
      url: `https://www.bilibili.com/video/${bvid}/`,
      status: status ?? 0,
      rating: Math.min(10, Math.max(0, rating ?? 0)),
      comment: '',
      updatedAt: new Date().toISOString(),
      linkedIds: {},
    }
    await ctx.scheduler.schedule(
      () => ctx.db.put(STORE_NAMES.BILIBILI, bvid, record),
      { priority: 'HIGH', storeName: STORE_NAMES.BILIBILI, cacheKey: `put:${STORE_NAMES.BILIBILI}:${bvid}`, invalidateCache: true },
    )
    ctx.scheduler.cacheManager?.invalidate('scheduler', `get:${STORE_NAMES.BILIBILI}:${bvid}`)
    broadcast('record:updated', { storeName: STORE_NAMES.BILIBILI, key: bvid })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) }
  }
}
