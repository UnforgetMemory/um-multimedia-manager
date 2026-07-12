# Module Boundary & Naming Audit

**Audit date**: 2026-07-12
**Scope**: Top-level source directories (`src/`) and their sub-modules
**Method**: Static analysis of file tree, barrel exports, naming patterns, and cross-module dependencies

---

## 1. Module Boundary Map

### 1.1 Top-level Layout

```
src/
├── config.ts              # App-wide constants (storage keys, status codes, domains)
├── types/                 # Flat data interfaces (StoreRecord, UrlIdentity, AppSettings, message types)
├── stores/                # Pinia stores (app, theme, confirm)
├── composables/           # Vue composables (useStats, useToast, usePlatformMeta, useLocaleSync)
├── utils/                 # Utility functions (Utils singleton: throttle, debounce, JSON, etc.)
├── shared/                # Re-export hub + identity module + UI components + i18n
├── domain/                # Domain layer (value objects, aggregates, repository interfaces)
│   ├── identity/          # Identity entity + IIdentityRepository
│   ├── platform/          # Platform + MediaType value objects
│   └── record/            # StoreRecord aggregate + Status + Rating + IRecordRepository + RecordService
├── features/              # Infrastructure / business logic modules
│   ├── database/          # IndexedDB API + models
│   ├── identity/          # [DEPRECATED] legacy re-export of shared/identity.ts
│   ├── migration/         # Schema version migration for records/cache
│   ├── neodb/             # NeoDB HTTP API client
│   ├── webdav/            # WebDAV HTTP client
│   ├── cache/             # LRU cache + TTL cache store + cache manager
│   ├── memoizer/          # In-memory TTL computation cache
│   ├── data-scheduler/    # Priority queue + rate limiter + retry policy
│   ├── optimistic-lock/   # Optimistic concurrency versioning
│   ├── memory-manager/    # Observer/listener/timer lifecycle
│   ├── settings/          # chrome.storage settings cache
│   └── adult-av/          # Adult AV ID data operations
├── entrypoints/           # WXT entrypoints
│   ├── background.ts      # Service Worker
│   ├── background/        # Background handler modules (webdav, neodb, data, toast, adult-av)
│   ├── content.ts         # Content script entry
│   ├── content/           # Content script router + handlers + enhancers + observers
│   ├── douban-main.content/   # Douban pages (document_idle)
│   ├── douban-early.content/  # Douban pages (document_start)
│   ├── popup/             # Popup UI
│   └── options/           # Options page
├── content/               # Content script business logic
│   └── douban/            # Douban-specific pages, components, extractors, styles
│       ├── components/    # Umm-prefixed Vue/TSX components
│       ├── pages/         # Per-page App.vue + data extractors + config + types
│       ├── overlay/       # Overlay mounting system
│       ├── shared/        # Douban-specific shared utilities (url-detector, hide-nav, etc.)
│       └── styles/        # Page-specific CSS
├── components/            # Generic UI components (StatCard, HeatmapCalendar, etc.)
└── styles/                # Global styles (design-tokens.css, typography.css)
```

---

## 2. `src/shared/` vs `src/utils/` vs `src/composables/` — Boundary Clarity

### 2.1 Current state

| Directory | Contains | Nature |
|-----------|----------|--------|
| `src/utils/` | `Utils` singleton (DOM helpers, throttle, debounce, sleep, JSON parse, etc.) | Pure utility functions |
| `src/composables/` | `useStats`, `useToast`, `usePlatformMeta`, `useLocaleSync` | Vue composables |
| `src/shared/` | `identity.ts`, `ui/`, `plugins/i18n.ts`, `locales/`, plus re-export barrels | Mix of actual code + barrel re-exports |

### 2.2 The `shared/` barrel problem

`src/shared/index.ts` re-exports from 4 sub-directories:

```
src/shared/utils/       → export { Utils } from '@/utils'
src/shared/composables/ → re-exports from @/composables/*
src/shared/stores/      → re-exports from @/stores/*
src/shared/types/       → export * from '@/types'
```

**Finding**: These 4 sub-directories are pure re-export indirection. They add no unique content. This makes `shared/` look like a parallel module system and creates confusion about where code actually lives.

### 2.3 The `identity.ts` gap

`src/shared/identity.ts` is the module's **only unique, non-barrel code** (URL identity extraction, PT site detection, canonical URL builder). Yet it is **not exported from `src/shared/index.ts`** — it must be imported by its full path `@/shared/identity`. Inconsistency.

### 2.4 Boundary recommendations

| Recommendation | Severity |
|---------------|----------|
| **Eliminate the re-export indirection**: Remove `src/shared/utils/`, `src/shared/composables/`, `src/shared/stores/`, and `src/shared/types/` directories. Import directly from root-level modules (`@/utils`, `@/composables`, `@/stores`, `@/types`). | **HIGH** |
| **Clarify `shared/` purpose**: Either (a) rename `shared/` to something specific (e.g., `identity/` or `platform-utils/`) since most actual content is identity-related, or (b) add `identity.ts` to the barrel and document `shared/` as the "cross-platform utility hub". | **HIGH** |
| **Move UI components**: `src/shared/ui/` contains shadcn/vue components (button, badge, card...). Either keep in `shared/ui/` or move to `src/components/ui/`. | **LOW** |

---

## 3. `src/features/` Modules — Overlap & Ownership

### 3.1 Feature inventory

| Module | Purpose | Notes |
|--------|---------|-------|
| `database/` | IndexedDB singleton + CRUD | Core infrastructure |
| `migration/` | Record/cache schema migration | Clean |
| `neodb/` | NeoDB HTTP API client | Clean |
| `webdav/` | WebDAV HTTP + ZIP | Clean |
| `data-scheduler/` | Priority queue, rate limiter, retry | Clean |
| `optimistic-lock/` | OCC version types | Clean |
| `settings/` | chrome.storage cache | Clean |
| `memory-manager/` | Resource lifecycle tracking | Clean |
| `adult-av/` | Adult AV data ops | Clean |
| `cache/` | LRU + TTL + CacheManager | Clean |
| `memoizer/` | In-memory TTL memoization | Overlaps with cache/ |
| `identity/` | Legacy re-export | **Dead module** |

### 3.2 Overlap: `cache/` vs `memoizer/`

Both cache computation results with TTL expiry:

| Aspect | `cache/` | `memoizer/` |
|--------|----------|-------------|
| Backing | IndexedDB (`TtlCacheStore`) + in-memory (`LruCache`) | In-memory only |
| API | `CacheManager`, `LruCache`, `TtlCacheStore` | Simple `Memoizer` class |
| TTL | Configurable per-store | Configurable per-call |
| Persistence | Persistent across SW wake | Ephemeral (resets on SW wake) |

**Recommendation**: Consider folding `memoizer/` into `cache/` or documenting the distinction as "ephemeral (SW session only) vs persistent (IndexedDB-backed)". **Medium priority.**

### 3.3 Dead module: `features/identity/`

Entire contents:

```ts
// src/features/identity/index.ts → export * from './models'
// src/features/identity/models.ts → export { Identity } from '@/shared/identity'
```

This is a backward-compat shim. However:

- `src/entrypoints/content.ts` imports `Identity` from `@/features/identity`
- `src/entrypoints/content/router.ts` imports direct from `@/shared/identity`

Two different import styles for the same module. **Recommendation**: Migrate the `content.ts` import and remove `src/features/identity/`. **HIGH priority.**

---

## 4. `src/domain/` vs `src/types/` — Domain Isolation

### 4.1 Dual representation of `StoreRecord`

| Location | Form | Used by |
|----------|------|---------|
| `domain/record/StoreRecord.ts` | **Class** with behavior (status transitions, rating validation, link mgmt, snapshot serialization) | Domain layer |
| `types/index.ts` | **Interface** (flat data shape, optional fields) | `features/database/`, message passing, export/import |

**Problem**: `features/database/models.ts` imports `StoreRecord` from `@/types` (the interface) and never uses the domain class. The domain invariants (validated status transitions, immutable instances, rating clamping) are **bypassed** in the data write path.

**Recommendation**: Have `features/database/` accept/return domain `StoreRecord` objects using `toSnapshot()` / `fromSnapshot()` for IndexedDB serialization. **HIGH priority — architectural gap.**

### 4.2 Naming collision: `Identity`

Three things named "Identity" that are architecturally different:

| Path | What it is | Concept |
|------|-----------|---------|
| `domain/identity/Identity.ts` | Domain entity class with snapshot, factory | A persisted identity aggregate |
| `shared/identity.ts` | `export const Identity = { ... }` singleton | URL parsing / canonicalization utility |
| `features/identity/models.ts` | Re-export of shared/identity | (same as above) |

The domain `Identity` class models cross-platform identity with lifecycle. The `shared/identity.ts` `Identity` object is a URL parsing library. Same name, completely different concepts.

**Recommendation**: Rename `shared/identity.ts`'s export (`Identity` → `UrlResolver` or `UrlIdentityUtils`). Keep `features/identity/` shim for backward compat if needed. **HIGH priority.**

### 4.3 Repository interface vs implementation

`domain/identity/IIdentityRepository.ts` and `domain/record/IRecordRepository.ts` define repository interfaces. However:
- No implementation of `IIdentityRepository` exists in the codebase
- `IRecordRepository` has no explicit implementation — `features/database/models.ts` provides equivalent functionality but doesn't implement the interface

**Recommendation**: Implement the interfaces or remove them. **MEDIUM priority.**

---

## 5. Naming Conventions

### 5.1 Umm-prefix — Consistent ✓

All 19 content script components in `src/content/douban/components/` and page-level components use the `Umm` prefix. Good.

### 5.2 File naming inconsistencies

| Pattern | Examples | Status |
|---------|----------|--------|
| Page data files | `detail-data.ts`, `book-authors-data.ts`, `search-data.ts`, etc. | ✓ Consistent |
| **Exception** | `GameDetailData.ts` (PascalCase) | ✗ **Breaks pattern** |
| Page config files | `config.ts` | ✓ Consistent |
| Page type files | `types.ts` | ✓ Consistent |
| Feature model files | `models.ts` (database, identity, migration, adult-av) | ✓ Consistent |
| TS component files | `UmmInterestBar.ts`, `UmmRating.ts`, `UmmImage.ts` | ✓ Consistent |
| Vue component files | `UmmDynamicIsland.vue`, `UmmStatBar.vue` | ✓ Consistent |

The `GameDetailData.ts` file should be renamed to `game-detail-data.ts` to match the convention.

### 5.3 `.vue` vs `.ts` (render function) components

Some Umm components are `.vue` SFCs, others are `.ts` with render functions:

- `.vue`: `UmmDynamicIsland`, `UmmPaginator`, `UmmStatBar`, `UmmUserBar`
- `.ts`: `UmmInterestBar`, `UmmMediaCard`, `UmmPageLayout`, `UmmRating`, `UmmImage`, `UmmImageWrapper`, `UmmStatusBadge`, `UmmStatusBadgeWrapper`

Both are valid Vue component definitions, but the split is undocumented. A developer must open the file to know which pattern is used.

**Recommendation** (low): Add a doc comment or standardize to `.ts` for functional components.

### 5.4 Handler naming patterns

| Entrypoint | Handler files | Pattern |
|------------|--------------|---------|
| Content | `douban.ts`, `imdb.ts`, `neodb.ts`, `mukaku.ts` | Platform names |
| Content | `douban-scanner.ts`, `douban-sync.ts`, `douban-neodb.ts`, `douban-toast.ts` | `douban-` prefix |
| Background | `webdav.ts`, `neodb.ts`, `data.ts`, `toast.ts`, `adult-av.ts` | Domain names |

**Recommendation** (low): Group `douban-*` handlers into `handlers/douban/` subdirectory:
```
handlers/douban/
├── main.ts      (was douban.ts)
├── scanner.ts   (was douban-scanner.ts)
├── sync.ts      (was douban-sync.ts)
├── neodb.ts     (was douban-neodb.ts)
└── toast.ts     (was douban-toast.ts)
```

---

## 6. Barrel Exports (`index.ts`)

### 6.1 Overall barrel coverage

42 `index.ts` files found. Generally well-deployed:

| Area | Has barrel? | Quality |
|------|-------------|---------|
| `src/types/` | ✓ `index.ts` | Good |
| `src/stores/` | ✓ `index.ts` | Good — named exports |
| `src/utils/` | ✓ `index.ts` | Good — Utils singleton |
| `src/shared/` | ✓ `index.ts` | **Missing `identity.ts`** |
| `src/features/*/` | ✓ All 12 modules | Good |
| `src/content/douban/` | ✗ No top-level barrel | Pages import individually |

### 6.2 Key finding

The most substantial file in `shared/` — `identity.ts` — is **not re-exported through `shared/index.ts`**:

```ts
import { Identity } from '@/shared'           // ❌ Does NOT include identity.ts
import { Identity } from '@/shared/identity'  // ✅ Must use full path
```

### 6.3 Barrel quality guide

| Pattern | Example | Verdict |
|---------|---------|---------|
| `export { X } from './x'` + `export type { Y }` | `features/cache/index.ts` | **Best practice** |
| `export * from './api'` | `features/neodb/index.ts` | OK for single-source |
| `export * from './models'` | `features/database/index.ts` | OK |
| `import * as Store from './api'; export { Store }` | `features/database/index.ts` | Namespace pattern |

### 6.4 Barrel recommendations

| Recommendation | Severity |
|---------------|----------|
| Add `export { Identity, PT_HOSTS, ... } from './identity'` to `src/shared/index.ts` | **MEDIUM** |
| Remove `src/features/identity/` (dead barrel, see §3.3) | **HIGH** |
| Consider adding top-level `index.ts` to `src/content/douban/` | **LOW** |

---

## 7. Critical Issues Summary

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| 1 | `features/identity/` is a dead backward-compat shim | HIGH | Remove after migrating `content.ts` import |
| 2 | `shared/` has 4 indirection barrels that add no value | HIGH | Eliminate re-export wrappers |
| 3 | `StoreRecord` domain class bypassed by `features/database/` | HIGH | Wire domain class into data path |
| 4 | `shared/identity.ts` `Identity` collides with `domain/identity/Identity.ts` | HIGH | Rename one of them |
| 5 | `shared/index.ts` omits `identity.ts` from barrel | MEDIUM | Add to barrel |
| 6 | `cache/` vs `memoizer/` functional overlap | MEDIUM | Consolidate or document |
| 7 | Repository interfaces without implementations | MEDIUM | Implement or remove |
| 8 | `GameDetailData.ts` breaks kebab-case convention | LOW | Rename to `game-detail-data.ts` |
| 9 | `.vue` vs `.ts` component split undocumented | LOW | Add doc comments |
| 10 | `douban-*` handler prefix naming | LOW | Group in subdirectory |

---

## 8. Recommended Action Plan

### Phase 1 — High priority (architectural correctness)

1. Migrate `content.ts` import of `Identity` from `@/features/identity` → `@/shared/identity`
2. Delete `src/features/identity/` directory
3. Remove `src/shared/utils/`, `src/shared/composables/`, `src/shared/stores/`, `src/shared/types/` indirection layers
4. Update `src/shared/index.ts` to export only unique content (`identity.ts`, `ui/`, `plugins/`, `locales/`)
5. Add `identity.ts` exports to `src/shared/index.ts`
6. Rename `shared/identity.ts`'s `Identity` export to `UrlResolver` (or rename domain `Identity` if the URL utility is more widely used)

### Phase 2 — Medium priority (cleanup)

7. Wire `domain/record/StoreRecord` class into `features/database/` data path
8. Implement or remove `IIdentityRepository` and `IRecordRepository` interfaces
9. Consolidate `memoizer/` into `cache/` or document the distinction

### Phase 3 — Low priority (polish)

10. Rename `GameDetailData.ts` → `game-detail-data.ts`
11. Group `douban-*` handlers into subdirectory
12. Add doc comments distinguishing `.vue` vs `.ts` component patterns
