/**
 * Sync Flow Simulation Test
 *
 * Simulates the complete Extension → Worker API → D1 sync flow:
 * 1. Generate mock StoreRecord data (as if from IndexedDB)
 * 2. Transform through SyncManager logic
 * 3. Validate against Zod schemas
 * 4. Process through Worker sync endpoint logic
 * 5. Verify output correctness
 */

import { SyncPayloadSchema } from '@umm/shared/schemas'

// ═══════════════════════════════════════════════════════════════
// Phase 1: Generate mock data (simulating Extension IndexedDB)
// ═══════════════════════════════════════════════════════════════

interface MockStoreRecord {
  status: number
  rating: number
  comment?: string
  updatedAt: string
}

/** Simulate RECORD_STORES from the extension */
const RECORD_STORES = [
  'douban_records',
  'imdb_records',
  'neodb_records',
  'tmdb_records',
  'bilibili_records',
  'youtube_records',
]

/** Simulate mediaDB.getAll() output */
interface StoreEntry {
  key: string   // format: "type::providerId"
  record: MockStoreRecord
}

function generateMockData(): Map<string, StoreEntry[]> {
  const data = new Map<string, StoreEntry[]>()

  // Douban movie records
  data.set('douban_records', [
    { key: 'movie::37332784', record: { status: 2, rating: 8, updatedAt: '2026-07-16T10:00:00Z' } },
    { key: 'movie::1292052', record: { status: 1, rating: 0, updatedAt: '2026-07-15T08:00:00Z' } },
    { key: 'movie::3541415', record: { status: 2, rating: 7.5, comment: '经典', updatedAt: '2026-07-14T12:00:00Z' } },
  ])

  // IMDb movie record
  data.set('imdb_records', [
    { key: 'movie::tt1375666', record: { status: 2, rating: 9, updatedAt: '2026-07-16T11:00:00Z' } },
  ])

  // NeoDB music record
  data.set('neodb_records', [
    { key: 'music::abc123', record: { status: 2, rating: 6.5, comment: '还不错', updatedAt: '2026-07-13T09:00:00Z' } },
  ])

  // Empty stores
  data.set('tmdb_records', [])
  data.set('bilibili_records', [])
  data.set('youtube_records', [])

  return data
}

// ═══════════════════════════════════════════════════════════════
// Phase 2: Transform (simulating SyncManager.trigger())
// ═══════════════════════════════════════════════════════════════

interface SyncItem {
  platform: string
  mediaType: string
  providerSelfId: string
  title: string
  updatedAt: string
}

interface SyncMark {
  itemRef: { platform: string; mediaType: string; providerSelfId: string }
  status: number
  rating?: number
  comment?: string
  updatedAt: string
}

function transformStoreData(
  storeData: Map<string, StoreEntry[]>,
  lastSyncAt: string,
): { items: SyncItem[]; marks: SyncMark[] } {
  const items: SyncItem[] = []
  const marks: SyncMark[] = []

  for (const [storeName, entries] of storeData) {
    const platform = storeName.replace('_records', '')

    for (const { key, record } of entries) {
      const parts = key.split('::')
      if (parts.length < 2) continue
      const mediaType = parts[0]
      const providerSelfId = parts.slice(1).join('::')

      // Skip unchanged records
      if (lastSyncAt && record.updatedAt <= lastSyncAt) continue

      // Skip inactive records
      if (!record.status || record.status === 0) continue

      items.push({
        platform,
        mediaType,
        providerSelfId,
        title: '',
        updatedAt: record.updatedAt,
      })

      marks.push({
        itemRef: { platform, mediaType, providerSelfId },
        status: record.status,
        rating: record.rating > 0 ? record.rating : undefined,
        comment: record.comment || undefined,
        updatedAt: record.updatedAt,
      })
    }
  }

  return { items, marks }
}

// ═══════════════════════════════════════════════════════════════
// Phase 3: Zod Schema Validation
// ═══════════════════════════════════════════════════════════════

function validateSyncPayload(
  lastSyncAt: string,
  items: SyncItem[],
  marks: SyncMark[],
  deletedMarkIds: string[],
) {
  const payload = { lastSyncAt, items, marks, deletedMarkIds }
  const result = SyncPayloadSchema.safeParse(payload)

  if (result.success) {
    console.log('  ✅ Schema validation PASSED')
    console.log(`     Items: ${result.data.items.length}, Marks: ${result.data.marks.length}`)
    return result.data
  } else {
    console.log('  ❌ Schema validation FAILED:')
    console.log(`     ${result.error.message}`)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// Phase 4: Simulate Worker sync endpoint logic
// ═══════════════════════════════════════════════════════════════

interface MediaItem {
  id: string
  platform: string
  mediaType: string
  providerSelfId: string
  title: string
  createdAt: string
  updatedAt: string
}

// Simulated D1 storage
const simulatedMediaItems = new Map<string, MediaItem>()
const simulatedUserMarks = new Map<string, { userId: string; mediaItemId: string; status: number; rating?: number; comment?: string }>()
let itemCounter = 0

function simulateWorkerSync(
  userId: string,
  items: SyncItem[],
  marks: SyncMark[],
) {
  const upsertedItems: string[] = []
  const upsertedMarks: string[] = []

  // UPSERT media items
  for (const item of items) {
    // Find existing by composite key
    let found: MediaItem | undefined
    for (const [, mi] of simulatedMediaItems) {
      if (mi.platform === item.platform && mi.mediaType === item.mediaType && mi.providerSelfId === item.providerSelfId) {
        found = mi
        break
      }
    }

    if (found) {
      found.updatedAt = item.updatedAt
      upsertedItems.push(found.id)
    } else {
      const id = `mock-uuid-${++itemCounter}`
      simulatedMediaItems.set(id, {
        id, platform: item.platform, mediaType: item.mediaType,
        providerSelfId: item.providerSelfId, title: item.title,
        createdAt: item.updatedAt, updatedAt: item.updatedAt,
      })
      upsertedItems.push(id)
    }
  }

  // UPSERT user marks
  for (const mark of marks) {
    // Resolve mediaItemId via itemRef
    let targetMediaItemId: string | undefined
    for (const [, mi] of simulatedMediaItems) {
      if (mi.platform === mark.itemRef.platform && mi.mediaType === mark.itemRef.mediaType && mi.providerSelfId === mark.itemRef.providerSelfId) {
        targetMediaItemId = mi.id
        break
      }
    }

    if (!targetMediaItemId) {
      // Create media_item on the fly
      targetMediaItemId = `mock-uuid-${++itemCounter}`
      simulatedMediaItems.set(targetMediaItemId, {
        id: targetMediaItemId,
        platform: mark.itemRef.platform,
        mediaType: mark.itemRef.mediaType,
        providerSelfId: mark.itemRef.providerSelfId,
        title: '',
        createdAt: mark.updatedAt,
        updatedAt: mark.updatedAt,
      })
    }

    const markKey = `${userId}::${targetMediaItemId}`
    simulatedUserMarks.set(markKey, {
      userId, mediaItemId: targetMediaItemId,
      status: mark.status, rating: mark.rating, comment: mark.comment,
    })
    upsertedMarks.push(markKey)
  }

  return { upsertedItems, upsertedMarks }
}

// ═══════════════════════════════════════════════════════════════
// Phase 5: Test Scenarios
// ═══════════════════════════════════════════════════════════════

const TEST_USER = 'test-user-001'

console.log('═══════════════════════════════════════════════════════')
console.log('  Sync Flow Simulation Test')
console.log('═══════════════════════════════════════════════════════')
console.log()

// ── Test 1: Full sync (first time, no lastSyncAt) ──
console.log('┌─ Test 1: Full sync (first time) ──────────────────────')

const data1 = generateMockData()
const { items: items1, marks: marks1 } = transformStoreData(data1, '')
console.log(`  Records read: ${items1.length} items, ${marks1.length} marks`)

const validated1 = validateSyncPayload(new Date(0).toISOString(), items1, marks1, [])
if (validated1) {
  const result1 = simulateWorkerSync(TEST_USER, validated1.items, validated1.marks as any)
  console.log(`  Worker processed: ${result1.upsertedItems.length} items, ${result1.upsertedMarks.length} marks`)
  console.log(`  DB state: ${simulatedMediaItems.size} media items, ${simulatedUserMarks.size} user marks`)
}

// ── Test 2: Incremental sync (only new changes) ──
console.log()
console.log('┌─ Test 2: Incremental sync (after 2026-07-15) ──────────')

const data2 = generateMockData()
const { items: items2, marks: marks2 } = transformStoreData(data2, '2026-07-15T00:00:00Z')
console.log(`  Records changed after cutoff: ${items2.length} items, ${marks2.length} marks`)

  const expectedChanges = ['37332784', '1292052', 'tt1375666']
  if (items2.length === 3 && marks2.length === 3) {
    console.log('  ✅ Expected: 3 records updated after 2026-07-15')
    for (const m of marks2) {
      console.log(`     ${m.itemRef.platform}/${m.itemRef.mediaType}/${m.itemRef.providerSelfId} status=${m.status}`)
    }
  } else {
    console.log(`  ❌ Unexpected count: expected 3, got ${items2.length}`)
  }

// ── Test 3: Schema rejects invalid payload ──
console.log()
console.log('┌─ Test 3: Schema validation errors ────────────────────')

const badPayload = {
  lastSyncAt: 'invalid-date',
  items: [{ platform: 'invalid_platform', mediaType: 'movie', providerSelfId: '123', title: 'Test', updatedAt: '2026-07-16T00:00:00Z' }],
  marks: [],
  deletedMarkIds: [],
}
const badResult = SyncPayloadSchema.safeParse(badPayload)
if (!badResult.success) {
  console.log('  ✅ Schema correctly rejected invalid payload')
  console.log(`     Error: ${badResult.error.issues[0]?.path.join('.')}: ${badResult.error.issues[0]?.message}`)
}

// ── Test 4: Mark with itemRef only (no UUID) ──
console.log()
console.log('┌─ Test 4: Mark with itemRef only (no UUID) ────────────')

const itemRefOnlyPayload = {
  lastSyncAt: '2026-01-01T00:00:00Z',
  items: [],
  marks: [{
    itemRef: { platform: 'douban', mediaType: 'movie', providerSelfId: 'test123' },
    status: 2, rating: 8, updatedAt: '2026-07-16T12:00:00Z',
  }],
  deletedMarkIds: [],
}
const itemRefResult = SyncPayloadSchema.safeParse(itemRefOnlyPayload)
if (itemRefResult.success) {
  console.log('  ✅ Schema accepts itemRef without UUID')
  const r = simulateWorkerSync(TEST_USER, [], itemRefResult.data.marks as any)
  console.log(`  Worker created: ${r.upsertedMarks.length} mark(s)`)
}

// ── Test 5: Mark with UUID only (no itemRef) ──
console.log()
console.log('┌─ Test 5: Mark with UUID only (no itemRef) ────────────')

const uuidOnlyPayload = {
  lastSyncAt: '2026-01-01T00:00:00Z',
  items: [],
  marks: [{
    mediaItemId: '550e8400-e29b-41d4-a716-446655440000',
    status: 1, updatedAt: '2026-07-16T13:00:00Z',
  }],
  deletedMarkIds: [],
}
const uuidResult = SyncPayloadSchema.safeParse(uuidOnlyPayload)
if (uuidResult.success) {
  console.log('  ✅ Schema accepts UUID without itemRef')
} else {
  console.log('  ❌ Schema rejected UUID-only mark:', uuidResult.error.message)
}

// ── Test 6: Mark with neither UUID nor itemRef ──
console.log()
console.log('┌─ Test 6: Mark with neither UUID nor itemRef ──────────')

const neitherPayload = {
  lastSyncAt: '2026-01-01T00:00:00Z',
  items: [],
  marks: [{ status: 2, updatedAt: '2026-07-16T14:00:00Z' }],
  deletedMarkIds: [],
}
const neitherResult = SyncPayloadSchema.safeParse(neitherPayload)
if (!neitherResult.success) {
  console.log('  ✅ Schema correctly rejected: neither UUID nor itemRef')
}

// ── Summary ──
console.log()
console.log('═══════════════════════════════════════════════════════')
console.log('  Results:')
console.log(`  Media items in simulated DB: ${simulatedMediaItems.size}`)
console.log(`  User marks in simulated DB:  ${simulatedUserMarks.size}`)
console.log()
console.log('  Simulated media_items:')
for (const [id, mi] of simulatedMediaItems) {
  const shortId = id.substring(0, 14)
  console.log(`    ${shortId}... ${mi.platform}/${mi.mediaType}/${mi.providerSelfId}`)
}
console.log('═══════════════════════════════════════════════════════')