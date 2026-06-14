# Sehuatang + JavDB Integration Plan (v3.9.9)

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate sehuatang.net list preview (card grid with magnet links) and JavDB viewed-item dimming into the existing UMM Chrome extension, reusing the existing IndexedDB + WebDAV sync infrastructure.

**Architecture:** New content handlers and enhancers added to the router. A new `sehuatang_avids` IndexedDB store holds AV ID viewing records (V2 format: id/rating/updatedAt). Two content UI panels (manual add, check viewed) are injected as floating DOM elements. i18n via a lightweight object map (no external library). Background message handlers added for new message types.

**Tech Stack:** WXT Manifest V3, Vue 3 (popup only), TypeScript, IndexedDB (mediaDB singleton), chrome.storage.local, chrome.runtime messaging

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/features/sehuatang/models.ts` | `SehuatangAvId` interface + DB schema constants |
| `src/features/sehuatang/index.ts` | Public API: `add`, `batchAdd`, `has`, `getAll`, `merge` |
| `src/entrypoints/content/handlers/sehuatang.ts` | Sehuatang list page → card grid with images, magnet links, copy-all |
| `src/entrypoints/content/handlers/javdb.ts` | JavDB enhancer: dim viewed items |
| `src/entrypoints/content/ui/manual-add-panel.ts` | Floating manual-add panel (single/batch JSON) |
| `src/entrypoints/content/ui/check-viewed-panel.ts` | Draggable check-viewed query panel |
| `src/entrypoints/content/i18n/index.ts` | Lightweight i18n with zh-CN/en-US/zh-HK/zh-TW |
| `src/entrypoints/content/i18n/locales.ts` | Translation strings |

### Modified Files
| File | Change |
|------|--------|
| `src/types/index.ts` | Add `SehuatangAvId` interface, new message types |
| `src/features/database/models.ts` | Add `SEHUATANG_AVIDS` store, bump DB_VERSION to 8 |
| `src/entrypoints/content.ts` | Add match patterns for sehuatang/javdb domains |
| `src/entrypoints/content/router.ts` | Add 2 route rules + imports |
| `src/entrypoints/background.ts` | Handle `SEHUATANG_*` message types |
| `wxt.config.ts` | Add host_permissions for sehuatang/javdb |

---

## Task 1: Types & Constants

**Covers:** Data model foundation

**Files:**
- Create: `src/features/sehuatang/models.ts`
- Modify: `src/types/index.ts:31` (RecordStoreName), `src/types/index.ts:101-122` (MessageType, MessagePayloadMap)

- [ ] **Step 1: Add SehuatangAvId interface to types**

In `src/types/index.ts`, after the `PtIdCacheEntry` interface (~line 97), add:

```typescript
// ==================== Sehuatang AV ID ====================

/** Sehuatang/JavDB viewed AV ID record (V2 format) */
export interface SehuatangAvId {
  id: string           // AV ID uppercase, e.g. "ABP-123"
  rating: number       // 0-10
  updatedAt: string    // ISO 8601
}
```

- [ ] **Step 2: Extend RecordStoreName**

In `src/types/index.ts:31`, change:

```typescript
export type RecordStoreName = 'douban_records' | 'imdb_records' | 'neodb_records' | 'tmdb_records' | 'sehuatang_avids'
```

- [ ] **Step 3: Add message types for sehuatang**

In `src/types/index.ts:101-122`, add to `MessageType`:

```typescript
export type MessageType =
  | 'SHOW_TOAST'
  // ... existing types ...
  | 'SEHUATANG_CHECK_VIEWED'
  | 'SEHUATANG_BATCH_ADD'
  | 'SEHUATANG_ADD'
  | 'SEHUATANG_GET_ALL'
```

Add to `MessagePayloadMap`:

```typescript
SEHUATANG_CHECK_VIEWED: { id: string }
SEHUATANG_BATCH_ADD: { items: SehuatangAvId[] }
SEHUATANG_ADD: { id: string; rating?: number }
SEHUATANG_GET_ALL: void
```

- [ ] **Step 4: Create sehuatang models.ts**

Create `src/features/sehuatang/models.ts`:

```typescript
import type { SehuatangAvId } from '@/types'

export const SEHUATANG_STORE_NAME = 'sehuatang_avids' as const

export function normalizeAvId(input: string): string {
  return input.toUpperCase().trim()
}

export function normalizeTime(inputTime?: string): string {
  if (!inputTime) return new Date().toISOString()
  try {
    const d = new Date(inputTime)
    if (isNaN(d.getTime())) return new Date().toISOString()
    return d.toISOString()
  } catch {
    return new Date().toISOString()
  }
}

export function createAvId(
  id: string,
  rating: number = 0,
  time?: string
): SehuatangAvId {
  return {
    id: normalizeAvId(id),
    rating: Math.max(0, Math.min(10, Math.round(rating))),
    updatedAt: normalizeTime(time),
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/features/sehuatang/models.ts
git commit -m "feat(sehuatang): add SehuatangAvId type and models"
```

---

## Task 2: Database Schema Upgrade (v7 → v8)

**Covers:** New IndexedDB store for AV IDs

**Files:**
- Modify: `src/features/database/models.ts:25-35` (STORE_NAMES), `src/features/database/models.ts:38-43` (RECORD_STORES), `src/features/database/models.ts:66-100` (onupgradeneeded)

- [ ] **Step 1: Add SEHUATANG_AVIDS to STORE_NAMES**

In `src/features/database/models.ts`, change `STORE_NAMES`:

```typescript
export const STORE_NAMES = {
  DOUBAN: 'douban_records',
  IMDB: 'imdb_records',
  NEODB: 'neodb_records',
  TMDB: 'tmdb_records',
  TTL_CACHE: 'ttl_cache',
  SYNC_LOGS: 'sync_logs',
  PT_ID_CACHE: 'pt_id_cache',
  SEHUATANG_AVIDS: 'sehuatang_avids',
} as const
```

- [ ] **Step 2: Add to RECORD_STORES**

```typescript
export const RECORD_STORES: readonly string[] = [
  STORE_NAMES.DOUBAN,
  STORE_NAMES.IMDB,
  STORE_NAMES.NEODB,
  STORE_NAMES.TMDB,
  STORE_NAMES.SEHUATANG_AVIDS,
]
```

- [ ] **Step 3: Bump DB_VERSION to 8**

```typescript
export const DB_VERSION = 8
```

- [ ] **Step 4: Add upgrade handler for v8**

In the `onupgradeneeded` handler, after the v6→v7 block (~line 99), add:

```typescript
// v7→v8: add sehuatang_avids store
if (oldVersion < 8) {
  if (!db.objectStoreNames.contains(STORE_NAMES.SEHUATANG_AVIDS)) {
    const avStore = db.createObjectStore(STORE_NAMES.SEHUATANG_AVIDS)
    avStore.createIndex('updatedAt', 'updatedAt', { unique: false })
    console.log('[DB] Added sehuatang_avids store')
  }
}
```

- [ ] **Step 5: Run type-check**

```bash
npm run type-check
```

Expected: PASS (no type errors)

- [ ] **Step 6: Commit**

```bash
git add src/features/database/models.ts
git commit -m "feat(db): add sehuatang_avids store, bump to v8"
```

---

## Task 3: Sehuatang AV ID Store API

**Covers:** CRUD operations for viewed AV IDs

**Files:**
- Create: `src/features/sehuatang/index.ts`

- [ ] **Step 1: Create the store API**

Create `src/features/sehuatang/index.ts`:

```typescript
/**
 * Sehuatang AV ID Store API
 * Wraps background message passing for sehuatang_avids IndexedDB operations
 */

import type { SehuatangAvId } from '@/types'
import { safeSendMessage } from '@/utils/context'

async function sendMsg(type: string, payload?: any): Promise<any> {
  const res = await safeSendMessage({ type, payload }, { timeout: 8000, retries: 1 })
  if (!res?.success) throw new Error(res?.error || `${type} failed`)
  return res
}

export const SehuatangStore = {
  async getAll(): Promise<SehuatangAvId[]> {
    const res = await sendMsg('SEHUATANG_GET_ALL')
    return res.items || []
  },

  async has(id: string): Promise<boolean> {
    const res = await sendMsg('SEHUATANG_CHECK_VIEWED', { id })
    return !!res.exists
  },

  async add(id: string, rating: number = 0): Promise<void> {
    await sendMsg('SEHUATANG_ADD', { id, rating })
  },

  async batchAdd(items: SehuatangAvId[]): Promise<number> {
    const res = await sendMsg('SEHUATANG_BATCH_ADD', { items })
    return res.addedCount || 0
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/sehuatang/index.ts
git commit -m "feat(sehuatang): add SehuatangStore API"
```

---

## Task 4: Background Message Handlers

**Covers:** Server-side processing for sehuatang data operations

**Files:**
- Modify: `src/entrypoints/background.ts` (add 4 case blocks in handleMessage switch)

- [ ] **Step 1: Import sehuatang models**

In `src/entrypoints/background.ts`, after existing imports (~line 25), add:

```typescript
import { SEHUATANG_STORE_NAME, createAvId, normalizeAvId } from '@/features/sehuatang/models'
import type { SehuatangAvId } from '@/types'
```

- [ ] **Step 2: Add message handlers**

In the `handleMessage` switch statement (before `default:`), add:

```typescript
// ==================== Sehuatang AV ID Operations ====================
case 'SEHUATANG_CHECK_VIEWED': {
  const { id } = message.payload
  if (!id) { sendResponse({ success: false, error: 'Missing id' }); break }
  const cleanId = normalizeAvId(id)
  const record = await mediaDB.get(SEHUATANG_STORE_NAME, cleanId)
  sendResponse({ success: true, exists: !!record, record })
  break
}
case 'SEHUATANG_ADD': {
  const { id, rating = 0 } = message.payload
  if (!id) { sendResponse({ success: false, error: 'Missing id' }); break }
  const avId = createAvId(id, rating)
  await mediaDB.put(SEHUATANG_STORE_NAME, avId.id, {
    url: '',
    status: 2,
    rating: avId.rating,
    updatedAt: avId.updatedAt,
    linkedIds: {},
  } as any)
  sendResponse({ success: true })
  break
}
case 'SEHUATANG_BATCH_ADD': {
  const { items } = message.payload
  if (!Array.isArray(items) || items.length === 0) {
    sendResponse({ success: false, error: 'Invalid items' }); break
  }
  let addedCount = 0
  for (const item of items) {
    if (!item.id) continue
    const avId = createAvId(item.id, item.rating, item.updatedAt)
    await mediaDB.put(SEHUATANG_STORE_NAME, avId.id, {
      url: '',
      status: 2,
      rating: avId.rating,
      updatedAt: avId.updatedAt,
      linkedIds: {},
    } as any)
    addedCount++
  }
  sendResponse({ success: true, addedCount })
  break
}
case 'SEHUATANG_GET_ALL': {
  const entries = await mediaDB.getAll(SEHUATANG_STORE_NAME)
  const items: SehuatangAvId[] = entries.map(e => ({
    id: e.key,
    rating: (e.record as any).rating || 0,
    updatedAt: e.record.updatedAt,
  }))
  sendResponse({ success: true, items })
  break
}
```

- [ ] **Step 3: Add SEHUATANG_AVIDS to ALLOWED_DB_STORES**

In `src/entrypoints/background.ts:17-21`, add to `ALLOWED_DB_STORES`:

```typescript
const ALLOWED_DB_STORES = new Set<string>([
  ...RECORD_STORES,
  STORE_NAMES.TTL_CACHE,
  STORE_NAMES.PT_ID_CACHE,
  STORE_NAMES.SEHUATANG_AVIDS,
])
```

- [ ] **Step 4: Run type-check**

```bash
npm run type-check
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/background.ts
git commit -m "feat(bg): add sehuatang message handlers"
```

---

## Task 5: Content Script Match Patterns + Router

**Covers:** Route sehuatang/javdb URLs to handlers

**Files:**
- Modify: `src/entrypoints/content.ts:32-75` (matches array)
- Modify: `src/entrypoints/content/router.ts:8-14` (imports), `src/entrypoints/content/router.ts:30-130` (ROUTES)
- Modify: `wxt.config.ts:14-38` (host_permissions)

- [ ] **Step 1: Add match patterns to content.ts**

In `src/entrypoints/content.ts` matches array, add before the closing `]`:

```typescript
'*://www.sehuatang.net/forum*',
'*://www.sehuatang.org/forum*',
'*://sehuatang.net/forum*',
'*://sehuatang.org/forum*',
'*://javdb.com/*',
```

- [ ] **Step 2: Add host_permissions to wxt.config.ts**

In `wxt.config.ts` host_permissions array, add:

```typescript
'*://www.sehuatang.net/*',
'*://www.sehuatang.org/*',
'*://sehuatang.net/*',
'*://sehuatang.org/*',
'*://javdb.com/*',
```

- [ ] **Step 3: Add router imports**

In `src/entrypoints/content/router.ts`, after existing imports (~line 14), add:

```typescript
import { handleSehuatangListPage } from './handlers/sehuatang'
import { handleJavDBPage } from './handlers/javdb'
```

- [ ] **Step 4: Add route rules to ROUTES array**

In `src/entrypoints/content/router.ts`, after the PT Dimmer route (before the closing `]` of ROUTES), add:

```typescript
// JavDB 已阅淡化
{
  match: (url) => url.includes('javdb.com'),
  handler: async () => {
    await handleJavDBPage()
  },
},

// 色花堂论坛列表页
{
  match: (url) =>
    (url.includes('sehuatang.net/forum') || url.includes('sehuatang.org/forum')),
  handler: async () => {
    await handleSehuatangListPage()
  },
},
```

- [ ] **Step 5: Run type-check**

```bash
npm run type-check
```

Expected: PASS (handlers don't exist yet, but imports will resolve after Task 6 & 7)

- [ ] **Step 6: Commit**

```bash
git add src/entrypoints/content.ts src/entrypoints/content/router.ts wxt.config.ts
git commit -m "feat(router): add sehuatang/javdb route rules and match patterns"
```

---

## Task 6: i18n Module

**Covers:** Internationalization for content UI

**Files:**
- Create: `src/entrypoints/content/i18n/locales.ts`
- Create: `src/entrypoints/content/i18n/index.ts`

- [ ] **Step 1: Create locales**

Create `src/entrypoints/content/i18n/locales.ts`:

```typescript
export type Locale = 'en-US' | 'zh-CN' | 'zh-HK' | 'zh-TW'

const locales: Record<Locale, Record<string, string>> = {
  'en-US': {
    Language: 'Language',
    'Hide Viewed': 'Hide Viewed',
    'Manual Add': 'Manual Add',
    'Check Viewed Status': 'Check Viewed Status',
    'Panel Title': 'Add Record',
    'ID Placeholder': 'AV ID or JSON [{id,rating,time}...]',
    'Rating Label': 'Rating (0-10):',
    'Added Msg': 'Added {{count}} items.',
    'Invalid JSON': 'Invalid JSON format',
    'Close': 'Close',
    'Save': 'Save',
    'Check Viewed Title': 'Check Viewed Status',
    'Check ID Placeholder': 'Enter AV ID',
    'Check Btn': 'Check',
    'Status': 'Status',
    'Not Viewed': 'Not Viewed',
    'Viewed On': 'Viewed on',
    'Rating': 'Rating',
    'Copy All Magnets': 'Copy All Magnets',
    'Copy Done': 'Copied {{count}} magnet links!',
    'No New Magnets': 'No new magnet links found.',
    'Header Info': 'Hidden: {{hidden}} | History: {{total}}',
    'JavDB Detected': 'JavDB: {{count}} items dimmed.',
  },
  'zh-CN': {
    Language: '语言（简体）',
    'Hide Viewed': '隐藏已阅',
    'Manual Add': '手动添加记录',
    'Check Viewed Status': '查询已阅状态',
    'Panel Title': '添加浏览记录',
    'ID Placeholder': '输入番号 或 JSON数组',
    'Rating Label': '评分 (0-10):',
    'Added Msg': '已添加 {{count}} 条记录',
    'Invalid JSON': '无效的 JSON 格式',
    'Close': '关闭',
    'Save': '保存',
    'Check Viewed Title': '查询已阅状态',
    'Check ID Placeholder': '输入 AV 番号',
    'Check Btn': '查询',
    'Status': '状态',
    'Not Viewed': '未阅',
    'Viewed On': '已阅于',
    'Rating': '评分',
    'Copy All Magnets': '一键复制磁力',
    'Copy Done': '已复制 {{count}} 个磁力链接!',
    'No New Magnets': '未发现新的磁力链接',
    'Header Info': '本页隐藏: {{hidden}} | 历史总阅: {{total}}',
    'JavDB Detected': 'JavDB检测: 已淡化 {{count}} 个已阅条目。',
  },
  'zh-HK': {
    Language: '語言（繁體）',
    'Hide Viewed': '隱藏已閱',
    'Manual Add': '手動添加記錄',
    'Check Viewed Status': '查詢已閱狀態',
    'Panel Title': '添加瀏覽記錄',
    'ID Placeholder': '輸入番號 或 JSON數組',
    'Rating Label': '評分 (0-10):',
    'Added Msg': '已添加 {{count}} 條記錄',
    'Invalid JSON': '無效的 JSON 格式',
    'Close': '關閉',
    'Save': '保存',
    'Check Viewed Title': '查詢已閱狀態',
    'Check ID Placeholder': '輸入 AV 番號',
    'Check Btn': '查詢',
    'Status': '狀態',
    'Not Viewed': '未閱',
    'Viewed On': '已閱於',
    'Rating': '評分',
    'Copy All Magnets': '一鍵複製磁力',
    'Copy Done': '已複製 {{count}} 個磁力鏈接!',
    'No New Magnets': '未發現新的磁力鏈接',
    'Header Info': '本頁隱藏: {{hidden}} | 歷史總閱: {{total}}',
    'JavDB Detected': 'JavDB檢測: 已淡化 {{count}} 個已閱條目。',
  },
  'zh-TW': {
    Language: '語言（繁體）',
    'Hide Viewed': '隱藏已閱',
    'Manual Add': '手動新增記錄',
    'Check Viewed Status': '查詢已閱狀態',
    'Panel Title': '新增瀏覽記錄',
    'ID Placeholder': '輸入番號 或 JSON陣列',
    'Rating Label': '評分 (0-10):',
    'Added Msg': '已新增 {{count}} 筆記錄',
    'Invalid JSON': '無效的 JSON 格式',
    'Close': '關閉',
    'Save': '儲存',
    'Check Viewed Title': '查詢已閱狀態',
    'Check ID Placeholder': '輸入 AV 番號',
    'Check Btn': '查詢',
    'Status': '狀態',
    'Not Viewed': '未閱',
    'Viewed On': '已閱於',
    'Rating': '評分',
    'Copy All Magnets': '一鍵複製磁力',
    'Copy Done': '已複製 {{count}} 個磁力連結!',
    'No New Magnets': '未發現新的磁力連結',
    'Header Info': '本頁隱藏: {{hidden}} | 歷史總閱: {{total}}',
    'JavDB Detected': 'JavDB偵測: 已淡化 {{count}} 個已閱條目。',
  },
}

export default locales
```

- [ ] **Step 2: Create i18n index**

Create `src/entrypoints/content/i18n/index.ts`:

```typescript
import locales, { type Locale } from './locales'

const STORAGE_KEY = 'umm:locale'

let currentLocale: Locale = 'zh-CN'

function detectLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
  if (stored && stored in locales) return stored
  const lang = navigator.language
  if (lang.startsWith('zh')) {
    if (lang.includes('TW') || lang.includes('HK')) return lang.includes('TW') ? 'zh-TW' : 'zh-HK'
    return 'zh-CN'
  }
  return 'en-US'
}

export function initI18n(): void {
  currentLocale = detectLocale()
}

export function setLocale(locale: Locale): void {
  currentLocale = locale
  localStorage.setItem(STORAGE_KEY, locale)
}

export function getLocale(): Locale {
  return currentLocale
}

export function t(key: string, params?: Record<string, string | number>): string {
  const str = locales[currentLocale]?.[key] || locales['en-US']?.[key] || key
  if (!params) return str
  return Object.entries(params).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
    str
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/entrypoints/content/i18n/
git commit -m "feat(i18n): add lightweight i18n module for content UI"
```

---

## Task 7: JavDB Enhancer

**Covers:** Dim viewed items on JavDB pages

**Files:**
- Create: `src/entrypoints/content/handlers/javdb.ts`

- [ ] **Step 1: Create JavDB handler**

Create `src/entrypoints/content/handlers/javdb.ts`:

```typescript
/**
 * JavDB 已阅淡化增强器
 * 功能：在 JavDB 页面中淡化已阅条目
 */

import { SehuatangStore } from '@/features/sehuatang'
import { t, initI18n } from '../i18n'

let observer: MutationObserver | null = null

function processItem(item: Element): void {
  if (item.getAttribute('data-umm-processed')) return

  const titleStrong = item.querySelector('.video-title strong')
  if (!titleStrong) return

  const avid = titleStrong.textContent?.trim().toUpperCase()
  if (!avid) return

  item.setAttribute('data-umm-processed', 'true')
  item.setAttribute('data-umm-avid', avid)

  // Check viewed status
  SehuatangStore.has(avid).then(viewed => {
    if (viewed) {
      (item as HTMLElement).classList.add('umm-viewed')
    }
  })

  // Mark as viewed on click
  item.addEventListener('click', () => {
    SehuatangStore.add(avid, 0)
    ;(item as HTMLElement).classList.add('umm-viewed')
  }, { once: true })
}

function run(): void {
  const items = document.querySelectorAll('.item, .grid-item')
  let count = 0
  items.forEach(item => {
    if (!item.getAttribute('data-umm-processed')) {
      processItem(item)
      count++
    }
  })
}

export async function handleJavDBPage(): Promise<void> {
  initI18n()
  console.log('[UMM] JavDB enhancer activated')

  // Add CSS
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

  // Initial run
  run()

  // Watch for new items
  observer = new MutationObserver(() => run())
  const container = document.querySelector('.movie-list') || document.body
  observer.observe(container, { childList: true, subtree: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/entrypoints/content/handlers/javdb.ts
git commit -m "feat(javdb): add viewed items dimmer enhancer"
```

---

## Task 8: Content UI Panels

**Covers:** Manual add panel + Check viewed panel

**Files:**
- Create: `src/entrypoints/content/ui/manual-add-panel.ts`
- Create: `src/entrypoints/content/ui/check-viewed-panel.ts`

- [ ] **Step 1: Create manual add panel**

Create `src/entrypoints/content/ui/manual-add-panel.ts`:

```typescript
/**
 * 手动添加已阅记录面板
 */

import { SehuatangStore } from '@/features/sehuatang'
import { t } from '../i18n'
import type { SehuatangAvId } from '@/types'

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

  panel.innerHTML = `
    <h3 style="margin:0; color:#03dac6; text-align:center">${t('Panel Title')}</h3>
    <div style="display:flex; flex-direction:column; gap:5px">
      <input type="text" id="umm-add-input" placeholder="${t('ID Placeholder')}"
        style="background:#2a2a2a; border:1px solid #444; color:white; padding:10px; border-radius:6px; outline:none; width:100%; box-sizing:border-box" />
    </div>
    <div style="display:flex; flex-direction:column; gap:5px">
      <label style="font-size:0.9rem; color:#aaa">${t('Rating Label')}</label>
      <select id="umm-add-rating" style="background:#2a2a2a; border:1px solid #444; color:white; padding:10px; border-radius:6px">
        ${Array.from({ length: 11 }, (_, i) =>
          `<option value="${i}" ${i === 5 ? 'selected' : ''}>${i}</option>`
        ).join('')}
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
        const parsed = JSON.parse(val) as SehuatangAvId[]
        if (Array.isArray(parsed)) {
          count = await SehuatangStore.batchAdd(parsed)
        }
      } catch {
        alert(t('Invalid JSON'))
        return
      }
    } else {
      await SehuatangStore.add(val, parseInt(ratingSelect.value))
      count = 1
    }

    if (count > 0) {
      console.log(`[UMM] ${t('Added Msg', { count: String(count) })}`)
      input.value = ''
      input.focus()
    }
  }
}
```

- [ ] **Step 2: Create check viewed panel**

Create `src/entrypoints/content/ui/check-viewed-panel.ts`:

```typescript
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

    const record = await SehuatangStore.getAll()
    const found = record.find(r => r.id === avid)

    resultDiv.innerHTML = ''
    const row = (label: string, value: string, cls?: string) => {
      const div = document.createElement('div')
      div.style.cssText = 'display:flex; justify-content:space-between; padding:5px 0'
      div.innerHTML = `<span style="font-weight:bold; color:#aaa">${label}</span><span style="color:${cls === 'viewed' ? '#4caf50' : cls === 'not-viewed' ? '#f44336' : '#e0e0e0'}">${value}</span>`
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

  // Drag logic
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
```

- [ ] **Step 3: Commit**

```bash
git add src/entrypoints/content/ui/
git commit -m "feat(ui): add manual-add and check-viewed content panels"
```

---

## Task 9: Sehuatang List Page Handler

**Covers:** Card grid preview with images, magnet links, copy-all

**Files:**
- Create: `src/entrypoints/content/handlers/sehuatang.ts`

- [ ] **Step 1: Create sehuatang handler**

Create `src/entrypoints/content/handlers/sehuatang.ts`:

```typescript
/**
 * 色花堂论坛列表页处理器
 * 功能：替换原始帖子列表为卡片网格预览，支持磁力一键复制
 */

import { SehuatangStore } from '@/features/sehuatang'
import { t, initI18n } from '../i18n'
import { showManualAddPanel } from '../ui/manual-add-panel'
import { showCheckViewedPanel } from '../ui/check-viewed-panel'

const AVID_REGEX = /[a-zA-Z]{2,6}[-\s]?\d{2,5}/gi

interface ThreadInfo {
  url: string
  title: string
  avId: string | null
  releaseDate: string
}

let totalTasks = 0
let finishedTasks = 0

function updateHeaderInfo(headerEl: HTMLElement, hiddenCount: number, totalViewed: number) {
  const infoEl = headerEl.querySelector('.umm-header-info') as HTMLElement
  const btnEl = headerEl.querySelector('.umm-copy-btn') as HTMLButtonElement
  if (infoEl) {
    infoEl.textContent = t('Header Info', {
      hidden: String(hiddenCount),
      total: String(totalViewed),
    })
  }
  if (btnEl) {
    if (totalTasks > 0 && finishedTasks >= totalTasks) {
      const magnets = document.querySelectorAll('.umm-card:not(.umm-viewed) .umm-magnet-link').length
      btnEl.disabled = false
      btnEl.textContent = `⚡ ${t('Copy All Magnets')} (${magnets})`
    } else {
      btnEl.disabled = true
      btnEl.textContent = t('Copy All Magnets')
    }
  }
}

function createCard(info: ThreadInfo, container: HTMLElement, headerEl: HTMLElement) {
  const isViewedSynced = info.avId ? false : false // will check async
  const card = document.createElement('div')
  card.className = 'umm-card'
  if (info.avId) card.setAttribute('data-avid', info.avId)
  card.setAttribute('data-title', info.title)

  card.innerHTML = `
    <div class="umm-card-image"></div>
    <div class="umm-card-content">
      <h3 class="umm-card-title"><a href="${info.url}" target="_blank">${escapeHtml(info.title)}</a></h3>
      <p class="umm-card-meta">${escapeHtml(info.releaseDate)}</p>
      <div class="umm-card-links"></div>
    </div>
  `
  container.appendChild(card)

  // Check viewed status
  if (info.avId) {
    SehuatangStore.has(info.avId).then(viewed => {
      if (viewed) card.classList.add('umm-viewed')
    })
  }

  // Fetch detail page for image + magnet
  totalTasks++
  updateHeaderInfo(headerEl, 0, 0)

  fetchDetailPage(info.url).then(({ imageUrl, magnetLink }) => {
    const imgContainer = card.querySelector('.umm-card-image')!
    if (imageUrl) {
      const img = document.createElement('img')
      img.src = imageUrl
      img.loading = 'lazy'
      img.onclick = () => window.open(info.url, '_blank')
      imgContainer.appendChild(img)
    }

    if (magnetLink) {
      const a = document.createElement('a')
      a.href = magnetLink
      a.className = 'umm-magnet-link'
      a.textContent = '⚡'
      a.title = 'Copy Magnet'
      a.onclick = (e) => {
        e.preventDefault()
        navigator.clipboard.writeText(magnetLink)
        if (info.avId) SehuatangStore.add(info.avId, 0)
        card.classList.add('umm-viewed')
      }
      card.querySelector('.umm-card-links')?.appendChild(a)
    }
  }).catch(console.error).finally(() => {
    finishedTasks++
    updateHeaderInfo(headerEl, 0, 0)
  })
}

async function fetchDetailPage(url: string): Promise<{ imageUrl: string | null; magnetLink: string | null }> {
  try {
    const res = await fetch(url, { credentials: 'include' })
    const html = await res.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')

    const imgEl = doc.querySelector('ignore_js_op > img')
    const imageUrl = imgEl?.getAttribute('zoomfile') || imgEl?.getAttribute('file') || null

    const magnetEl = doc.querySelector('.blockcode > div > ol > li')
    const magnetLink = magnetEl?.textContent?.trim() || null

    return { imageUrl, magnetLink }
  } catch {
    return { imageUrl: null, magnetLink: null }
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function parseThreadList(): ThreadInfo[] {
  const threads: ThreadInfo[] = []
  const rows = document.querySelectorAll('tbody[id^="normalthread_"]')

  rows.forEach(row => {
    const linkEl = row.querySelector('th a.s.xst') as HTMLAnchorElement | null
    if (!linkEl) return

    const title = linkEl.innerText.trim()
    const match = title.match(AVID_REGEX)

    threads.push({
      url: linkEl.href,
      title,
      avId: match ? match[0].toUpperCase() : null,
      releaseDate: (row.querySelector('td.by em span') as HTMLElement)?.innerText || 'N/A',
    })
  })

  return threads
}

function injectStyles() {
  if (document.getElementById('umm-sehuatang-styles')) return

  const style = document.createElement('style')
  style.id = 'umm-sehuatang-styles'
  style.textContent = `
    .umm-preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 25px; padding: 25px; }
    .umm-card { background: #1e1e1e; border-radius: 12px; border: 1px solid #333; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 4px 15px rgba(0,0,0,0.4); transition: transform 0.3s ease; }
    .umm-card:hover { transform: translateY(-8px); }
    .umm-card.umm-viewed { opacity: 0.6; }
    .umm-card.umm-viewed:hover { opacity: 1; }
    .umm-card-image { aspect-ratio: 16/10; background: #2a2a2a; overflow: hidden; }
    .umm-card-image img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease; cursor: pointer; }
    .umm-card:hover .umm-card-image img { transform: scale(1.05); }
    .umm-card-content { padding: 15px; display: flex; flex-direction: column; flex-grow: 1; }
    .umm-card-title a { color: #e0e0e0; text-decoration: none; font-size: 1.1rem; font-weight: 600; }
    .umm-card-meta { color: #888; font-size: 0.85rem; margin-top: 4px; }
    .umm-card-links { margin-top: auto; display: flex; justify-content: flex-end; gap: 15px; padding-top: 10px; }
    .umm-magnet-link { font-size: 1.5rem; padding: 6px 12px; border-radius: 8px; text-decoration: none; background: #443b17; color: #ffc107; }
    .umm-sehuatang-header { background: #1e1e1e; color: #a0a0a0; padding: 10px 25px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #333; position: sticky; top: 0; z-index: 1000; }
    .umm-copy-btn { background: #03dac6; color: #000; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-weight: bold; }
    .umm-copy-btn:disabled { background: #3a3a3a; color: #888; }
  `
  document.head.appendChild(style)
}

function injectHeader(container: HTMLElement): HTMLElement {
  const header = document.createElement('div')
  header.className = 'umm-sehuatang-header'

  const info = document.createElement('div')
  info.className = 'umm-header-info'
  header.appendChild(info)

  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex; gap:8px; align-items:center'

  const copyBtn = document.createElement('button')
  copyBtn.className = 'umm-copy-btn'
  copyBtn.disabled = true
  copyBtn.onclick = () => {
    const links = Array.from(document.querySelectorAll('.umm-card:not(.umm-viewed) .umm-magnet-link'))
    if (links.length) {
      const magnets = links.map(l => (l as HTMLAnchorElement).href).join('\r\n')
      navigator.clipboard.writeText(magnets)
      links.forEach(l => {
        const card = l.closest('.umm-card')
        const avid = card?.getAttribute('data-avid')
        if (avid) SehuatangStore.add(avid, 0)
        card?.classList.add('umm-viewed')
      })
    }
  }
  actions.appendChild(copyBtn)

  // Menu buttons
  const menuBtn = document.createElement('button')
  menuBtn.className = 'umm-copy-btn'
  menuBtn.textContent = '☰'
  menuBtn.title = 'Menu'
  menuBtn.onclick = () => {
    const choice = prompt('1 = Manual Add\n2 = Check Viewed\n3 = Toggle Hide Viewed')
    if (choice === '1') showManualAddPanel()
    else if (choice === '2') showCheckViewedPanel()
  }
  actions.appendChild(menuBtn)

  header.appendChild(actions)
  document.body.prepend(header)
  return header
}

export async function handleSehuatangListPage(): Promise<void> {
  initI18n()
  console.log('[UMM] Sehuatang handler activated')

  injectStyles()

  // Hide original thread list
  const threadList = document.getElementById('threadlisttableid')
  if (threadList) threadList.style.display = 'none'

  // Create card grid container
  const container = document.createElement('div')
  container.className = 'umm-preview-grid'
  document.body.prepend(container)

  // Inject header
  const headerEl = injectHeader(container)

  // Parse and render threads
  const threads = parseThreadList()
  console.log(`[UMM] Found ${threads.length} threads`)
  const totalViewed = (await SehuatangStore.getAll()).length

  let hiddenCount = 0
  threads.forEach(info => {
    createCard(info, container, headerEl)
  })

  updateHeaderInfo(headerEl, hiddenCount, totalViewed)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/entrypoints/content/handlers/sehuatang.ts
git commit -m "feat(sehuatang): add list page handler with card grid preview"
```

---

## Task 10: Update Content Script fullInit to Register Menu

**Covers:** Register content menu commands for sehuatang/javdb pages

**Files:**
- Modify: `src/entrypoints/content.ts:184` (after initRouter)

- [ ] **Step 1: Add menu registration after router init**

In `src/entrypoints/content.ts`, after `initRouter()` call (~line 185), add:

```typescript
// Register sehuatang menu commands if on sehuatang domain
if (location.hostname.includes('sehuatang.net') || location.hostname.includes('sehuatang.org')) {
  const { showManualAddPanel } = await import('./content/ui/manual-add-panel')
  const { showCheckViewedPanel } = await import('./content/ui/check-viewed-panel')

  chrome.runtime?.onMessage?.addListener((message) => {
    if (message.type === 'SEHUATANG_SHOW_MANUAL_ADD') showManualAddPanel()
    if (message.type === 'SEHUATANG_SHOW_CHECK_VIEWED') showCheckViewedPanel()
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/entrypoints/content.ts
git commit -m "feat(content): register sehuatang menu commands"
```

---

## Task 11: Version Bump & Build

**Covers:** Version 3.9.9, type-check, build verification

**Files:**
- Modify: `package.json` (version)
- Modify: `wxt.config.ts:12` (manifest version)

- [ ] **Step 1: Bump version in package.json**

```bash
npm version 3.9.9 --no-git-tag-version
```

- [ ] **Step 2: Bump version in wxt.config.ts**

In `wxt.config.ts:12`:

```typescript
version: '3.9.9',
```

- [ ] **Step 3: Run type-check**

```bash
npm run type-check
```

Expected: PASS

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: PASS (build completes successfully)

- [ ] **Step 5: Commit**

```bash
git add package.json wxt.config.ts
git commit -m "chore: bump version to 3.9.9"
```

---

## Task 12: Final Verification

**Covers:** End-to-end verification

- [ ] **Step 1: Full type-check**

```bash
npm run type-check
```

Expected: PASS

- [ ] **Step 2: Full build**

```bash
npm run build
```

Expected: PASS, output in `dist/chrome-mv3/`

- [ ] **Step 3: Verify manifest**

Check `dist/chrome-mv3/manifest.json`:
- `matches` array includes sehuatang/javdb patterns
- `host_permissions` includes sehuatang/javdb domains
- Version is `3.9.9`

- [ ] **Step 4: Final commit with all changes**

```bash
git add -A
git commit -m "feat(v3.9.9): integrate sehuatang.net + JavDB support

- Add sehuatang_avids IndexedDB store (v8 schema)
- Add JavDB viewed items dimmer
- Add sehuatang card grid preview with magnet links
- Add manual add and check viewed panels
- Add lightweight i18n (zh-CN/en-US/zh-HK/zh-TW)"
```
