# Adult AV ID Storage Unification — Design Spec

> **Anchors:** [S1] Problem · [S2] Data Model · [S3] Store API · [S4] Background Handlers · [S5] WebDAV Sync · [S6] Export/Import · [S7] Migration · [S8] Content Script Handlers · [S9] UI Integration

## [S1] Problem

`sehuatang_avids` store was added ad-hoc in v3.0.0 with:
- Plain AV ID key format (no `::` separator) — inconsistent with platform stores
- Not included in WebDAV sync or export/import
- Background handlers bypass Store API pattern
- Single source (sehuatang only), but javdb and future sources need support

**Goal:** Unify adult AV ID storage with the platform record architecture, support multiple sources (javdb, sehuatang, future), integrate with WebDAV/export/import.

## [S2] Data Model

### Store Rename

`sehuatang_avids` → `jav_ids` (more general, covers all adult AV ID sources)

### Key Format

```
source::id
```

Examples:
- `javdb::YAG-008` — from JavDB
- `sehuatang::YAG-008` — from sehuatang.net
- `future-source::ID` — extensible

### Value Format

Standard `StoreRecord`:

```typescript
{
  url: string          // Source page URL (e.g., "https://javdb.com/xxx")
  status: number       // 2 = viewed (always, for adult content)
  rating: number       // 0-10
  updatedAt: string    // ISO 8601
  linkedIds: Record<string, string>  // Cross-source links
}
```

### LinkedIds Pattern

Same AV ID from multiple sources → linked via `linkedIds`:

```json
{
  "javdb": "javdb::YAG-008",
  "sehuatang": "sehuatang::YAG-008"
}
```

### Query Pattern

- `getAll()` → all records from all sources
- `getBySource(source)` → records from specific source
- `has(id)` → check if any source has this AV ID
- `add(source, id, rating, url)` → add/update record

## [S3] Store API

### Public API

```typescript
export const AdultAvStore = {
  getAll(): Promise<AdultAvId[]>
  getBySource(source: string): Promise<AdultAvId[]>
  has(id: string): Promise<boolean>
  add(source: string, id: string, rating?: number, url?: string): Promise<void>
  batchAdd(source: string, items: AdultAvIdInput[]): Promise<number>
}
```

### Type Definition

```typescript
interface AdultAvId {
  source: string      // Extracted from key prefix
  id: string          // AV ID (uppercase)
  url: string
  rating: number
  updatedAt: string
  linkedIds: Record<string, string>
}

interface AdultAvIdInput {
  id: string
  rating?: number
  url?: string
  updatedAt?: string
}
```

## [S4] Background Handlers

### Message Types

| Message | Payload | Response |
|---------|---------|----------|
| `ADULT_AV_CHECK` | `{ id: string }` | `{ exists: boolean, record? }` |
| `ADULT_AV_ADD` | `{ source, id, rating?, url? }` | `{ success: true }` |
| `ADULT_AV_BATCH_ADD` | `{ source, items }` | `{ success, addedCount }` |
| `ADULT_AV_GET_ALL` | `{ source?: string }` | `{ items: AdultAvId[] }` |

### Handler Pattern

Follows existing pattern in background.ts — flat switch cases, uses `mediaDB` directly.

## [S5] WebDAV Sync

### Strategy

`jav_ids` is NOT in `RECORD_STORES` (different key format). Sync is handled separately:

- **Upload:** `jav_ids` data exported as JSON array, uploaded as a separate file `jav-ids.json`
- **Download:** Download `jav-ids.json`, parse, merge into local store
- **Merge:** Bidirectional merge using `updatedAt` timestamps

### Integration Points

In `background.ts` WebDAV handlers:
- `WEBDAV_UPLOAD`: Add `jav_ids` export after RECORD_STORES upload
- `WEBDAV_DOWNLOAD`: Add `jav_ids` import after RECORD_STORES download
- `WEBDAV_SYNC`: Add `jav_ids` merge logic

## [S6] Export/Import

### Export Format

```json
{
  "javIds": {
    "javdb::YAG-008": { "url": "...", "status": 2, "rating": 8, ... },
    "sehuatang::YAG-008": { "url": "...", "status": 2, "rating": 8, ... }
  }
}
```

### Import Logic

1. Parse `javIds` from import payload
2. For each record: normalize key, merge with existing (updatedAt wins)
3. Write to `jav_ids` store

## [S7] Migration

### Data Migration (v8 → v9)

On first load after update:
1. Read all entries from `sehuatang_avids` store
2. For each entry: key is plain AV ID → migrate to `javdb::ID` (default source)
3. Write to `jav_ids` store
4. Delete `sehuatang_avids` store
5. Bump DB_VERSION to 9

### Config Migration

- Rename `SEHUATANG_AVIDS` constant to `JAV_IDS` in STORE_NAMES
- Update all references

## [S8] Content Script Handlers

### sehuatang.ts

```typescript
// Before: SehuatangStore.add(info.avId, 0)
// After:  AdultAvStore.add('sehuatang', info.avId, 0, info.url)
```

### javdb.ts

```typescript
// Before: SehuatangStore.has(avid)
// After:  AdultAvStore.has(avid)  // checks all sources
```

### check-viewed-panel.ts

```typescript
// Before: SehuatangStore.getAll()
// After:  AdultAvStore.getAll()
```

## [S9] UI Integration

### OverviewTab

- JavId count fetched via `ADULT_AV_GET_ALL`
- Platform distribution includes `javdb` and `sehuatang` as separate platform entries

### Popup Dashboard

- JavId count from `ADULT_AV_GET_ALL`
- Total includes JavId count
