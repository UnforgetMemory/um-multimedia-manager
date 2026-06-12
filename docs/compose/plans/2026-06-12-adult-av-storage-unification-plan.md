# Adult AV ID Storage Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify adult AV ID storage (sehuatang/javdb) with the platform record architecture, supporting multiple sources and full WebDAV/export integration.

**Architecture:** Rename `sehuatang_avids` → `jav_ids`, adopt `source::id` key format, add `AdultAvStore` API, integrate with WebDAV sync and export/import, migrate existing data.

**Tech Stack:** TypeScript, IndexedDB (mediaDB), chrome.storage, WXT

**Spec:** `docs/compose/specs/2026-06-12-adult-av-storage-unification.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/features/adult-av/models.ts` | Types, constants, key parsing |
| `src/features/adult-av/index.ts` | AdultAvStore API |
| `src/features/adult-av/migration.ts` | v8→v9 data migration |

### Modified Files
| File | Change |
|------|--------|
| `src/features/database/models.ts` | Rename store, bump DB_VERSION to 9, add migration |
| `src/types/index.ts` | Add AdultAvId type, new message types |
| `src/entrypoints/background.ts` | New message handlers, WebDAV/export integration |
| `src/entrypoints/content/handlers/javdb.ts` | Use AdultAvStore |
| `src/entrypoints/content/handlers/sehuatang.ts` | Use AdultAvStore |
| `src/entrypoints/content/ui/check-viewed-panel.ts` | Use AdultAvStore |
| `src/entrypoints/popup/pages/DashboardPage.vue` | Use AdultAvStore |
| `src/entrypoints/options/tabs/OverviewTab.vue` | Use AdultAvStore |
| `src/features/webdav/api.ts` | Add jav-ids.json upload/download |

### Deleted Files
| File | Reason |
|------|--------|
| `src/features/sehuatang/models.ts` | Replaced by adult-av/models.ts |
| `src/features/sehuatang/index.ts` | Replaced by adult-av/index.ts |

---

## Task 1: Types and Constants

**Covers:** [S2]

**Files:**
- Create: `src/features/adult-av/models.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Create adult-av/models.ts**

Create `src/features/adult-av/models.ts`:

```typescript
export const JAV_IDS_STORE_NAME = 'jav_ids' as const
export const JAV_IDS_VERSION = 1

export type AdultAvSource = 'javdb' | 'sehuatang' | string

export interface AdultAvId {
  source: AdultAvSource
  id: string
  url: string
  rating: number
  updatedAt: string
}

export interface AdultAvIdInput {
  id: string
  rating?: number
  url?: string
  updatedAt?: string
}

/** Parse key "source::id" → { source, id } */
export function parseKey(key: string): { source: string; id: string } {
  const idx = key.indexOf('::')
  if (idx === -1) return { source: 'unknown', id: key }
  return { source: key.slice(0, idx), id: key.slice(idx + 2) }
}

/** Build key "source::id" */
export function buildKey(source: string, id: string): string {
  return `${source}::${id.toUpperCase().trim()}`
}

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
```

- [ ] **Step 2: Add AdultAvId to types/index.ts**

In `src/types/index.ts`, add after SehuatangAvId:

```typescript
// ==================== Adult AV ID ====================

/** Adult AV ID record (unified for javdb, sehuatang, etc.) */
export interface AdultAvId {
  source: string       // "javdb" | "sehuatang" | future sources
  id: string           // AV ID uppercase
  url: string          // Source page URL
  rating: number       // 0-10
  updatedAt: string    // ISO 8601
}

/** Input for adding adult AV IDs */
export interface AdultAvIdInput {
  id: string
  rating?: number
  url?: string
  updatedAt?: string
}
```

- [ ] **Step 3: Add message types**

Add to `MessageType`:

```typescript
| 'ADULT_AV_CHECK'
| 'ADULT_AV_ADD'
| 'ADULT_AV_BATCH_ADD'
| 'ADULT_AV_GET_ALL'
```

Add to `MessagePayloadMap`:

```typescript
ADULT_AV_CHECK: { id: string }
ADULT_AV_ADD: { source: string; id: string; rating?: number; url?: string }
ADULT_AV_BATCH_ADD: { source: string; items: AdultAvIdInput[] }
ADULT_AV_GET_ALL: { source?: string }
```

- [ ] **Step 4: Commit**

```bash
git add src/features/adult-av/ src/types/index.ts
git commit -m "feat(adult-av): add types, constants, and key parsing"
```

---

## Task 2: Database Schema Upgrade

**Covers:** [S7]

**Files:**
- Modify: `src/features/database/models.ts`

- [ ] **Step 1: Rename store and bump version**

In `src/features/database/models.ts`:

```typescript
export const DB_VERSION = 9

export const STORE_NAMES = {
  // ... existing ...
  JAV_IDS: 'jav_ids',  // renamed from sehuatang_avids
} as const
```

- [ ] **Step 2: Add migration handler**

In `onupgradeneeded`, after v7→v8 block:

```typescript
// v8→v9: rename sehuatang_avids → jav_ids, migrate data
if (oldVersion < 8 || (oldVersion >= 8 && oldVersion < 9)) {
  // Create new store
  if (!db.objectStoreNames.contains(STORE_NAMES.JAV_IDS)) {
    const avStore = db.createObjectStore(STORE_NAMES.JAV_IDS)
    avStore.createIndex('updatedAt', 'updatedAt', { unique: false })
    console.log('[DB] Created jav_ids store')
  }

  // Migrate data from old store if it exists
  if (db.objectStoreNames.contains('sehuatang_avids')) {
    const oldStore = tx.objectStore('sehuatang_avids')
    const newStore = tx.objectStore(STORE_NAMES.JAV_IDS)
    const request = oldStore.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        const oldKey = cursor.key as string
        // Old format: plain AV ID → new format: javdb::ID
        const newKey = oldKey.includes('::') ? oldKey : `javdb::${oldKey}`
        newStore.put(cursor.value, newKey)
        cursor.continue()
      } else {
        // Delete old store after migration
        db.deleteObjectStore('sehuatang_avids')
        console.log('[DB] Migrated sehuatang_avids → jav_ids, deleted old store')
      }
    }
  }
}
```

Note: The migration uses a transaction that's already open in `onupgradeneeded`. The `tx` variable is the upgrade transaction.

- [ ] **Step 3: Update RECORD_STORES (already done)**

Verify `RECORD_STORES` does NOT include `JAV_IDS` (it shouldn't — already removed in previous fix).

- [ ] **Step 4: Update ALLOWED_DB_STORES**

In `background.ts`:

```typescript
const ALLOWED_DB_STORES = new Set<string>([
  ...RECORD_STORES,
  STORE_NAMES.TTL_CACHE,
  STORE_NAMES.PT_ID_CACHE,
  STORE_NAMES.JAV_IDS,
])
```

- [ ] **Step 5: Commit**

```bash
git add src/features/database/models.ts src/entrypoints/background.ts
git commit -m "feat(db): rename store to jav_ids, bump to v9 with migration"
```

---

## Task 3: AdultAvStore API

**Covers:** [S3]

**Files:**
- Create: `src/features/adult-av/index.ts`

- [ ] **Step 1: Create AdultAvStore**

Create `src/features/adult-av/index.ts`:

```typescript
import type { AdultAvId, AdultAvIdInput } from '@/types'
import { safeSendMessage } from '@/utils/context'

async function sendMsg(type: string, payload?: any): Promise<any> {
  const res = await safeSendMessage({ type, payload }, { timeout: 8000, retries: 1 })
  if (!res?.success) throw new Error(res?.error || `${type} failed`)
  return res
}

export const AdultAvStore = {
  async getAll(source?: string): Promise<AdultAvId[]> {
    const res = await sendMsg('ADULT_AV_GET_ALL', source ? { source } : {})
    return res.items || []
  },

  async has(id: string): Promise<boolean> {
    const res = await sendMsg('ADULT_AV_CHECK', { id })
    return !!res.exists
  },

  async add(source: string, id: string, rating: number = 0, url: string = ''): Promise<void> {
    await sendMsg('ADULT_AV_ADD', { source, id, rating, url })
  },

  async batchAdd(source: string, items: AdultAvIdInput[]): Promise<number> {
    const res = await sendMsg('ADULT_AV_BATCH_ADD', { source, items })
    return res.addedCount || 0
  },
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/adult-av/index.ts
git commit -m "feat(adult-av): add AdultAvStore API"
```

---

## Task 4: Background Message Handlers

**Covers:** [S4]

**Files:**
- Modify: `src/entrypoints/background.ts`

- [ ] **Step 1: Add imports**

```typescript
import { JAV_IDS_STORE_NAME, buildKey, parseKey, normalizeAvId, normalizeTime } from '@/features/adult-av/models'
import type { AdultAvId } from '@/types'
```

- [ ] **Step 2: Add message handlers**

In the switch statement, add before `default:`:

```typescript
// ==================== Adult AV ID Operations ====================
case 'ADULT_AV_CHECK': {
  const { id } = message.payload
  if (!id) { sendResponse({ success: false, error: 'Missing id' }); break }
  // O(1) lookup: try known sources directly via mediaDB.get()
  const cleanId = normalizeAvId(id)
  const knownSources = ['javdb', 'sehuatang']
  let found: any = null
  for (const source of knownSources) {
    const key = buildKey(source, cleanId)
    const record = await mediaDB.get(JAV_IDS_STORE_NAME, key)
    if (record) { found = { key, record }; break }
  }
  sendResponse({ success: true, exists: !!found, record: found?.record })
  break
}
case 'ADULT_AV_ADD': {
  const { source, id, rating = 0, url = '' } = message.payload
  if (!id || !source) { sendResponse({ success: false, error: 'Missing source or id' }); break }
  const key = buildKey(source, id)
  await mediaDB.put(JAV_IDS_STORE_NAME, key, {
    url,
    status: 2,
    rating: Math.max(0, Math.min(10, Math.round(rating))),
    updatedAt: new Date().toISOString(),
    linkedIds: {},
  })
  sendResponse({ success: true })
  break
}
case 'ADULT_AV_BATCH_ADD': {
  const { source, items } = message.payload
  if (!source || !Array.isArray(items) || items.length === 0) {
    sendResponse({ success: false, error: 'Invalid payload' }); break
  }
  let addedCount = 0
  for (const item of items) {
    if (!item.id) continue
    const key = buildKey(source, item.id)
    const existing = await mediaDB.get(JAV_IDS_STORE_NAME, key)
    await mediaDB.put(JAV_IDS_STORE_NAME, key, {
      url: item.url || existing?.url || '',
      status: 2,
      rating: item.rating ?? existing?.rating ?? 0,
      updatedAt: normalizeTime(item.updatedAt),
      linkedIds: existing?.linkedIds || {},
    })
    addedCount++
  }
  sendResponse({ success: true, addedCount })
  break
}
case 'ADULT_AV_GET_ALL': {
  const { source } = message.payload || {}
  let entries = await mediaDB.getAll(JAV_IDS_STORE_NAME)
  if (source) {
    entries = entries.filter(e => e.key.startsWith(`${source}::`))
  }
  const items: AdultAvId[] = entries.map(e => {
    const { source: s, id } = parseKey(e.key)
    return {
      source: s,
      id,
      url: e.record.url || '',
      rating: (e.record as any).rating || e.record.rating || 0,
      updatedAt: e.record.updatedAt,
    }
  })
  sendResponse({ success: true, items })
  break
}
```

- [ ] **Step 3: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/background.ts
git commit -m "feat(background): add ADULT_AV_* message handlers"
```

---

## Task 5: Content Script Migration

**Covers:** [S8]

**Files:**
- Modify: `src/entrypoints/content/handlers/javdb.ts`
- Modify: `src/entrypoints/content/handlers/sehuatang.ts`
- Modify: `src/entrypoints/content/ui/check-viewed-panel.ts`

- [ ] **Step 1: Update javdb.ts**

Replace:
```typescript
import { SehuatangStore } from '@/features/sehuatang'
```
With:
```typescript
import { AdultAvStore } from '@/features/adult-av'
```

Replace all `SehuatangStore.has()` → `AdultAvStore.has()`
Replace all `SehuatangStore.add(avid, 0)` → `AdultAvStore.add('javdb', avid, 0)`

- [ ] **Step 2: Update sehuatang.ts**

Replace `SehuatangStore` → `AdultAvStore`
Replace `SehuatangStore.getAll()` → `AdultAvStore.getAll()`
Replace `SehuatangStore.has()` → `AdultAvStore.has()`
Replace `SehuatangStore.add(info.avId, 0)` → `AdultAvStore.add('sehuatang', info.avId, 0, info.url)`

- [ ] **Step 3: Update check-viewed-panel.ts**

Replace `SehuatangStore` → `AdultAvStore`
Replace `SehuatangStore.getAll()` → `AdultAvStore.getAll()`

- [ ] **Step 4: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/content/handlers/javdb.ts src/entrypoints/content/handlers/sehuatang.ts src/entrypoints/content/ui/check-viewed-panel.ts
git commit -m "refactor(content): migrate to AdultAvStore API"
```

---

## Task 6: Delete Old sehuatang Module

**Covers:** [S7]

**Files:**
- Delete: `src/features/sehuatang/models.ts`
- Delete: `src/features/sehuatang/index.ts`

- [ ] **Step 1: Verify no remaining references**

```bash
grep -rn "sehuatang" src/ --include="*.ts" --include="*.vue" | grep -v "node_modules\|handlers/sehuatang\|content/handlers/sehuatang\|AdultAvStore\|adult-av\|jav_ids\|AdultAv\|adult_av\|成人视频"
```

- [ ] **Step 2: Remove old files**

```bash
rm src/features/sehuatang/models.ts src/features/sehuatang/index.ts
rmdir src/features/sehuatang 2>/dev/null || true
```

- [ ] **Step 3: Remove old SehuatangAvId type from types/index.ts**

Remove the `SehuatangAvId` interface (replaced by `AdultAvId`).

- [ ] **Step 4: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add -A src/features/sehuatang/ src/types/index.ts
git commit -m "refactor: remove old sehuatang module, fully replaced by adult-av"
```

---

## Task 7: UI Integration

**Covers:** [S9]

**Files:**
- Modify: `src/entrypoints/popup/pages/DashboardPage.vue`
- Modify: `src/entrypoints/options/tabs/OverviewTab.vue`

- [ ] **Step 1: Update DashboardPage.vue**

Replace `SehuatangStore` → `AdultAvStore`
Replace `SEHUATANG_GET_ALL` → `ADULT_AV_GET_ALL`
Replace `javCount` logic to use `AdultAvStore.getAll()`

- [ ] **Step 2: Update OverviewTab.vue**

Replace `SEHUATANG_GET_ALL` → `ADULT_AV_GET_ALL`
Update `platformStats` to group by source:
```typescript
const platformStats = computed(() => {
  const map: Record<string, { count: number; type: string }> = {}
  for (const r of records.value) {
    const key = r.provider
    if (!map[key]) map[key] = { count: 0, type: r.type }
    map[key].count++
  }
  // Add adult AV sources
  for (const item of adultAvItems.value) {
    const key = item.source
    if (!map[key]) map[key] = { count: 0, type: '成人视频' }
    map[key].count++
  }
  return Object.entries(map).sort((a, b) => b[1].count - a[1].count)
})
```

- [ ] **Step 3: Run type-check**

```bash
npm run type-check
```

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/popup/pages/DashboardPage.vue src/entrypoints/options/tabs/OverviewTab.vue
git commit -m "feat(ui): integrate AdultAvStore in popup and options"
```

---

## Task 8: Build Verification

**Covers:** All

- [ ] **Step 1: Full type-check**

```bash
npm run type-check
```

- [ ] **Step 2: Full build**

```bash
npm run build
```

- [ ] **Step 3: Verify DB schema**

```bash
grep "JAV_IDS" src/features/database/models.ts | head -5
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit --signoff -m "chore: verify build passes for adult AV storage unification

- Type-check: PASS
- Build: PASS
- Store renamed: sehuatang_avids → jav_ids
- Key format: source::id (javdb::YAG-008)
- DB_VERSION: 9
- AdultAvStore API fully integrated
- Old sehuatang module removed

Assisted-by: MiMo v2.5 via MiMoCode"
```
