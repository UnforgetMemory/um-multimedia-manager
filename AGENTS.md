# AGENTS.md

## Project

UMM (Unified Multimedia Manager) — Chrome extension (Manifest V3) that tracks movie/TV/music across Douban, IMDb, NeoDB, TMDB, and PT sites. Built with Vue 3 + TypeScript + WXT + Tailwind CSS v4 + shadcn/vue (reka-ui). Current version: 4.13.2.

## Quick Commands

```bash
npm run dev                 # Dev mode (WXT hot reload)
npm run build               # Production build → dist/chrome-mv3/
npm run type-check          # vue-tsc --noEmit (run before commits)
npm test                    # Playwright E2E tests (chromium only)
npm run test:unit           # Playwright unit tests only
npm run test:integration    # Playwright integration tests only
npm run test:ui             # Playwright UI test mode (interactive)
npm run zip                 # Build + zip for Chrome Web Store upload
npm run package:patch       # Bump patch version + build + package
npm run package:minor       # Bump minor version + build + package
npm run package:major       # Bump major version + build + package
npm run i18n:check          # Check i18n keys (no missing)
npm run i18n:check:strict   # Check i18n keys with strict mode
npm run deps:check          # Check outdated dependencies (npm outdated)
npm run deps:update         # Update all dependencies (npm update)
npm run deps:audit          # Security audit (npm audit)
npm run clean               # Remove node_modules, dist, releases, extracted
npm run reinstall           # clean + npm install
npm run unpack              # Unpack the compiled extension
npm run data:export         # CLI export data from IndexedDB
npm run data:import         # CLI import data into IndexedDB
npm run resize-icons        # Resize extension icons via sharp
npm run preview             # WXT preview build
```

**CI order**: `npm run type-check` → `npm run build`. CI also builds for Firefox (`npx wxt build -b firefox`).

**No lint or format command exists.** Type checking is the only automated quality gate.

## Build Gotcha

`npm run build` runs `wxt build && node scripts/fix-paths.js`. The `fix-paths.js` post-step is required — don't skip it or the extension breaks. Build output goes to `dist/chrome-mv3` (Chrome) or `dist/firefox-mv2` (Firefox).

## Architecture

### WXT Entrypoints

Six entrypoints in `src/entrypoints/`:

| Entrypoint | Type | Description |
|---|---|---|
| **`background.ts`** | Service Worker (module) | Message router, IndexedDB singleton (mediaDB), alarm-based periodic tasks (shelf cache cleanup every 10 min), settings cache, context menu stats. All DB access goes through here. |
| **`content.ts`** | Content Script | Legacy single-file injection for all non-Douban sites. Lazy-loads: `hasMatchingRoute()` → full init or lightweight URL watcher (intercepts pushState/replaceState). |
| **`douban-early.content/`** | Content Script (document_start) | New Douban injection system, part 1. Injects Shadow DOM overlay mask, page-level CSS (body lock), and loading spinner before DOM is ready. |
| **`douban-main.content/`** | Content Script (document_idle) | New Douban injection system, part 2. Mounts Vue 3 app inside the shadow root created by early.ts. Uses MountRegistry for per-page dispatch. |
| **`popup/`** | HTML page (Vue 3) | Popup UI — stats dashboard, router with DashboardPage (search, filter, export). |
| **`options/`** | HTML page (Vue 3) | Options page — tab-based router with OverviewTab, RatingTab, LinkedTab, SyncTab (WebDAVTab + ImportExportTab), SettingsTab, AppearanceTab. |

### Two Content Injection Systems

#### 1. Legacy (content.ts → router.ts → handlers + enhancers)

Serves all non-Douban sites plus Douban background tasks:

- **`src/entrypoints/content/router.ts`** — URL → handler dispatch
- **`src/entrypoints/content/handlers/`** — per-platform:
  - `douban.ts` — Douban entry (legacy)
  - `douban-scanner.ts` — Douban page scanning
  - `douban-sync.ts` — Douban save sync
  - `douban-sync/sync-db.ts` — DB sync operations
  - `douban-sync/sync-cross-platform.ts` — Cross-platform sync
  - `douban-sync/sync-neodb.ts` — NeoDB sync
  - `douban-neodb.ts` — Douban NeoDB push
  - `douban-toast.ts` — Notification display
  - `imdb.ts` — IMDb page handler
  - `neodb.ts` — NeoDB page handler
  - `mukaku.ts` — Mukaku sync handler
  - `pt-detail.ts` — PT detail page handler
  - `javdb.ts` — JavDB handler
  - `sehuatang.ts` — Sehuatang handler
- **`src/entrypoints/content/enhancers/`** — page enhancements:
  - `pt-dimmer.ts` — PT site watched-torrent dimming
  - `douban-search.ts` — Douban search result badges
- **`src/entrypoints/content/observers/`** — DOM observers:
  - `rating.ts` — Rating change observer
- **`src/entrypoints/content/neodb-push.ts`** — NeoDB push UI

#### 2. New (douban-early.content/ + douban-main.content/ → src/content/douban/)

Vue 3 overlay system for 29 Douban page types (detail, search, homepage, celebrities, user-profile, doulists, genre, etc.). Uses Shadow DOM for complete style isolation from Douban's page CSS.

##### Coordination

1. **early.ts** (document_start): Creates shadow DOM overlay with loading spinner, injects page-level body lock CSS, starts theme sync
2. **main.ts** (document_idle): Looks up the page type via `url-detector.ts`, finds the mount function in `MountRegistry`, runs `definePageMount()` → `mountUmmOverlay()`: injects page CSS, removes spinner, mounts Vue app
3. **dismiss.ts**: Cleans up and removes the overlay

##### MountRegistry / page-registry.ts

`MountRegistry` (in `src/content/douban/page-registry.ts`) replaces the old hardcoded switch statement. Maps page type identifiers to mount functions. Each page type registers via `definePageMount()`.

##### Per-Page Pattern

Each page type in `src/content/douban/pages/` follows:

```
pages/{page-type}/
  App.vue        — Root Vue component (mounted in shadow DOM)
  config.ts      — Page-specific config
  data.ts        — Data extraction from DOM
  types.ts       — TypeScript types
  (optional) extractors/ — DOM extraction helpers
```

29 page types: `albums/`, `artists-overview/`, `book-authors/`, `book-collect/`, `book-homepage/`, `book-profile/`, `book-review-detail/`, `book-reviews/`, `celebrities/`, `detail/`, `doulist-detail/`, `doulists/`, `game-collect/`, `game-detail/`, `game-explore/`, `genre/`, `homepage/`, `movie-profile/`, `music-homepage/`, `personage/`, `photos/`, `review-detail/`, `search/`, `trailer/`, `user-celebrities/`, `user-media/`, `user-profile/`, `user-reviews/`.

##### Shared Components (src/content/douban/components/)

- `UmmDynamicIsland.vue` — Floating action island
- `UmmMediaCard.ts` — Media card display (JSX)
- `UmmPageLayout.ts` — Page layout wrapper
- `UmmInterestBar.ts` — Interest/status bar
- `UmmStatusBadge.ts` — Status badge indicator
- `UmmStatusBadgeWrapper.ts` — Badge wrapper
- `UmmRating.ts` — Rating component (JSX)
- `UmmPaginator.vue` — Pagination component
- `UmmImage.ts` — Image component
- `UmmImageWrapper.ts` — Image wrapper
- `UmmStatBar.vue` — Statistics bar
- `UmmUserBar.vue` — User info bar

##### Overlay System (src/content/douban/overlay/)

- `create-overlay.ts` — Creates shadow DOM overlay with body lock CSS and loading spinner
- `mount-app.ts` (`mountUmmOverlay()`) — Injects CSS, removes spinner, creates and mounts Vue app
- `theme-sync.ts` — Syncs theme (light/dark) between page and shadow root
- `dismiss.ts` — Cleanup removal
- `index.ts` — Public re-exports

##### CSS System

Per-page CSS files in `src/content/douban/styles/`:

- `design-tokens.css` — CSS custom properties (colors, spacing, fonts)
- `theme.css` — Light/dark theme variables (Shadow DOM :host)
- `base.css` — Base element reset
- `breakpoints.css` — Responsive breakpoints
- `page-layout.css` — Shared page layout
- `paginator.css`, `userbar.css`, `interest.css` — Shared component styles
- 29+ per-page CSS files (e.g. `detail.css`, `search.css`, `homepage.css`)

CSS composition via `css-composer.ts` — defines `PAGE_CSS_PRESETS` mapping each page type to its shared + page-specific CSS chunks. `css-map.ts` provides the raw CSS imports. `composeStylesForPage()` assembles them into one string for Shadow DOM injection.

### Background Service Worker (entrypoints/background.ts)

The Service Worker (`defineBackground({ type: 'module' })`) handles:

- **Message routing**: `chrome.runtime.onMessage` → `handleMessage()` switch dispatch to handler modules
- **Database**: Single `mediaDB` (IndexedDB) singleton with LRU read cache
- **DataScheduler**: Priority queue + rate limiter + retry policy for DB operations
- **CacheManager**: L1 in-memory LRU cache shared across scheduler + DB
- **Alarms**: Periodic `cleanupShelfCache` (every 10 min)
- **Queue**: Pending message queue for messages arriving before DB init
- **Context menus**: Install-time menu creation, stats updates

Dedicated handler modules in `src/entrypoints/background/handlers/`:

| Handler | Messages | File |
|---|---|---|
| `data.ts` | GET_SETTINGS, UPDATE_SETTINGS, EXPORT_DATA, IMPORT_DATA, GET_STATISTICS, GET_ALL_RECORDS, GET_MIGRATION_STATUS | background/handlers/data.ts |
| `webdav.ts` | WEBDAV_SYNC, WEBDAV_TEST, WEBDAV_UPLOAD, WEBDAV_DOWNLOAD | background/handlers/webdav.ts |
| `neodb.ts` | NEODB_PUSH_RATING | background/handlers/neodb.ts |
| `toast.ts` | SHOW_TOAST | background/handlers/toast.ts |
| `adult-av.ts` | ADULT_AV_CHECK, ADULT_AV_CHECK_BATCH, ADULT_AV_ADD, ADULT_AV_BATCH_ADD, ADULT_AV_GET_ALL, SEHUATANG_CHECK_VIEWED, SEHUATANG_ADD, SEHUATANG_BATCH_ADD, SEHUATANG_GET_ALL | background/handlers/adult-av.ts |

### Message Flow

```
Content Script / Popup → chrome.runtime.sendMessage({ type, payload })
  → Background SW handleMessage() switch
  → Handler function (data/webdav/neodb/toast/adult-av or inline case)
  → mediaDB operations (routed through DataScheduler)
  → Response via sendResponse({ success, data/error })
```

Also supports `EVENT_BUS` for background → content script broadcasts (`record:updated`, `record:deleted`, `settings:changed`, `sync:completed`) via `src/utils/event-bus.ts`.

## Domain Layer (DDD)

Clean domain model in `src/domain/` — pure TypeScript, no framework or storage dependencies.

### StoreRecord (Aggregate Root)

`src/domain/record/StoreRecord.ts` — Immutable aggregate root for a tracked media item.

- **Status**: `Status` value object (NONE=0, WISHLIST=1, DONE=2, DOING=3). Immutable transitions: `markAsWatched()`, `markAsWishlisted()`, `clearStatus()`
- **Rating**: `Rating` value object (0-10 scale, 0.5 step increments). `UNRATED` sentinel at 0
- **Comment**: Optional user text
- **linkedIds**: Cross-platform ID map (`{ "imdb": "movie::tt1375666", "douban": "movie::37332784" }`)
- **recordVersion**: Optimistic concurrency version for conflict detection
- **schemaVersion**: Schema migration support
- **Serialization**: `toSnapshot()` → `StoreRecordSnapshot` (plain object for IndexedDB), `StoreRecord.fromSnapshot()` for reconstruction
- **Immutability**: All mutations return new instances; original never modified
- **Factories**: `StoreRecord.fresh(url)`, `StoreRecord.fromSnapshot(snapshot)`

### Status Value Object

`src/domain/record/Status.ts` — Codes: 0=NONE, 1=WISHLIST, 2=DONE, 3=DOING. Supports `fromCode()`, `fromString()` (with legacy `"done"`/`"wish"`), `require()`, transitions, `isDone`/`isWishlist`/`isActive` queries, `toggleProgress()`.

### Rating Value Object

`src/domain/record/Rating.ts` — Range 0-10, step 0.5. `fromNumber()`, `require()`, `round()` to nearest step, `isRated`/`isUnrated`, `stars` (0-5 scale), `fraction` (0-1).

### Identity (Aggregate Root)

`src/domain/identity/Identity.ts` — Uniquely identifies media on a platform.

- Components: `Platform` + `MediaType` + `providerId`
- Factory: `Identity.fromUrl(url)` parses URLs from douban, imdb, neodb, tmdb
- Factory: `Identity.create(platform, type, providerId)`
- `storeKey` getter: `"{type}::{providerId}"` (used as IndexedDB key)
- `buildCanonicalUrl()` generates normalized URLs
- `isLinkedTo(other)` — cross-platform equality check by providerId
- `IIdentityRepository` interface at `src/domain/identity/IIdentityRepository.ts`

### Platform Value Object

`src/domain/platform/Platform.ts` — Known: `douban`, `imdb`, `neodb`, `tmdb`. Properties: `displayName`, `storeName` (`"{id}_records"`), `isKnown`. `fromString()` / `require()`.

### MediaType Value Object

`src/domain/platform/MediaType.ts` — Known: `movie`, `tv`, `music`, `book`, `game`. Query helpers: `isVideo`, `isAudio`, `isReadable`.

### RecordService

`src/domain/record/RecordService.ts` — Domain service for cross-platform operations:

- `syncRecord()` — Propagates status to linked platforms (never overwrites ratings on linked platforms)
- `merge()` — Merges two records for the same item (status: more progressed wins, rating: higher wins, comments: newer wins)
- `bulkUpdateStatus()` — Batch status transitions
- `deduplicate()` — Merges duplicate records after import
- `getWatchedKeysAcrossStores()` — PT dimmer helper

Depends on `IRecordRepository` interface (`src/domain/record/IRecordRepository.ts`).

## Data Systems

### DataScheduler

`src/features/data-scheduler/` — Central orchestrator for database operations in the Service Worker.

```
schedule() → cache check → rate-limit → enqueue → process loop → dequeue → [retry loop] → resolve/reject → monitor event
```

Components:

| Component | File | Purpose |
|---|---|---|
| `DataScheduler` | `data-scheduler.ts` | Main orchestrator — composes queue, limiter, retry, monitor |
| `PriorityQueue` | `priority-queue.ts` | Task queue with HIGH/MEDIUM/LOW priority |
| `RateLimiter` | `rate-limiter.ts` | Token bucket: 10 req/s default, burst 5 |
| `RetryPolicy` | `retry-policy.ts` | Exponential backoff: max 3 retries, base 1s, max 10s, ±25% jitter |
| `SchedulerMonitor` | `scheduler-monitor.ts` | Metrics: response time (p50/p95/p99), error rate, cache hit rate |
| Types | `types.ts` | All shared types, constants (MAX_QUEUE_SIZE=1000, DEFAULT_TASK_TIMEOUT=8000ms) |

The scheduler is re-created on every Service Worker wake (MV3 ephemeral state).

### CacheManager

`src/features/cache/` — Two-layer cache:

- **L1** (`LruCache`): In-memory LRU with maxSize and per-entry TTL
- **L2** (`TtlCacheStore`): Optional IndexedDB-backed persistent cache
- **CacheManager**: Unified orchestrator: L1 → L2 fallback, namespace-prefixed keys (`{namespace}::{key}`)
- `Memoizer`: Result caching wrapper (in same module)

`mediaDB` also has its own internal `readCache` (LruCache, max 500 entries, 30s default TTL).

### OptimisticLock

Concurrent write conflict detection via `mediaDB.optimisticPut()` — compares `expectedVersion` against stored `recordVersion`. Returns `{ ok: true, version }` or `{ ok: false, conflict }`.

### MemoryManager

Lifecycle management for in-memory state across MV3 Service Worker wake cycles.

### SettingsCache

`src/features/settings/cache.ts` — Cached `AppSettings` with `init()`, `get()`, `updateAll()`, `startListening()` (reacts to `chrome.storage.onChanged`).

## PT Dimmer Architecture

The PT Dimmer automatically dims already-watched torrents on supported PT sites.

### Core (src/entrypoints/content/enhancers/pt/)

| File | Purpose |
|---|---|
| `dimmer/index.ts` | `PTDimmer` class — top-level orchestrator |
| `dimmer/mteam.ts` | `MTeamHandler` — SPA-specific handler for M-Team (uses MutationObserver for SPA routing) |
| `dimmer/nexusphp.ts` | `NexusPHPHandler` — Generic handler for NexusPHP-based sites (config-driven) |
| `dimmer/cache.ts` | ID set cache with fallback |
| `config/index.ts` | Site config registry lookup |
| `config/sites.ts` | `SITE_CONFIGS` — per-site row selectors, column indexes, scanner configs |
| `scanner/index.ts` | Scanner entry point |
| `scanner/queue.ts` | Background scan queue — fetches detail pages to extract Douban/IMDb IDs (concurrency-limited via Semaphore) |
| `scanner/semaphore.ts` | Concurrency semaphore |
| `types.ts` | `HandlerContext`, `ListPageHandler`, `SiteScannerConfig` interfaces |
| `utils.ts` | `dimElement()`, `waitForElement()`, `throttle()` helpers |
| `index.ts` | PT enhancer entry point |

### Flow

1. `PTDimmer` constructor detects site (M-Team vs NexusPHP)
2. Fetches watched IDs from IndexedDB via `dbGetWatchedIds()`
3. Scans page DOM for torrent rows matching site config selectors
4. Checks extracted IDs against watched set
5. Applies CSS dimming (`dimElement()`) to matched rows
6. Uses ID cache with 30s TTL to avoid repeated DB queries
7. Background scanner (`ScanQueue`) fetches detail pages in batches to extract Douban/IMDb IDs

## CSS Architecture (3-Layer)

UMM uses three separate CSS stacks, each for a different rendering context:

### Layer 1: Tailwind @theme (Popup / Options SPA)

`src/shared/styles/style.css` — Standard Tailwind CSS v4 with `@theme` directive. Used by the Popup and Options page Vue apps. Builds via Vite/Tailwind CSS Vite plugin.

### Layer 2: Shadow DOM :host Variables (Douban Overlay)

`src/content/douban/styles/design-tokens.css` — CSS custom properties on `:host` (Shadow DOM root). Defines colors, spacing, border radii, fonts, and shadows for the injected overlay.

Additional shared files:
- `theme.css` — Light/dark theme variables
- `base.css` — Element reset within shadow
- `breakpoints.css` — Responsive breakpoints
- `page-layout.css` — Layout system
- `paginator.css`, `userbar.css`, `interest.css` — Component styles

Per-page CSS files are composed via `css-composer.ts` + `css-map.ts` presets.

### Layer 3: JS Template Constants (Global Injection)

`src/entrypoints/content/styles/tokens.ts` — TypeScript color constants (not CSS variables) used in JS template literals for programmatic style injection.

`src/entrypoints/content/styles/global.ts` — Injects global styles into the page DOM for legacy content scripts (search badges, NeoDB buttons, toast notifications). Uses template strings with imported token values.

## i18n (Two Systems)

### System 1: vue-i18n (Popup / Options SPA)

`src/shared/plugins/i18n.ts` — Creates `createI18n()` instance for Vue apps.

Locales in `src/shared/locales/`:
- `en.ts` — English
- `zh-CN.ts` — Simplified Chinese (default)
- `zh-TW.ts` — Traditional Chinese (Taiwan)

Detection cascade: `chrome.storage.local` → `navigator.language` → `zh-CN` (fallback). Persists via `persistLocale()` → `chrome.storage.local`.

### System 2: Custom t() (Content Scripts)

`src/entrypoints/content/i18n/` — Standalone i18n for Shadow DOM content scripts (vue-i18n cannot operate inside shadow DOM):

- `index.ts` — `initI18n()`, `setLocale()`, `t()` function with `{{param}}` interpolation
- `locales.ts` — `Record<Locale, Record<string, string>>` map with `en-US`, `zh-CN`, `zh-HK`, `zh-TW`

Locale detection cascade: `chrome.storage.local` → `localStorage` → `navigator.language`. Sync mechanism via `startLocaleSync()` listens to `chrome.storage.onChanged` to keep content scripts in sync when locale changes in Popup/Options.

### Validation

`npm run i18n:check` / `npm run i18n:check:strict` — Scripts in `scripts/check-i18n.js` that verify no translation keys are missing across locales.

## Database

`src/features/database/models.ts` — IndexedDB singleton `mediaDB`:

- **DB name**: `umm-media-db`
- **Current version**: 9
- **Store names**: `douban_records`, `imdb_records`, `neodb_records`, `tmdb_records`, `ttl_cache`, `sync_logs`, `pt_id_cache`, `jav_ids`
- **Record key format**: `"{type}::{providerId}"` (e.g. `"movie::37332784"`)
- **Migration**: Records carry `schemaVersion` field; on read, records are normalized via iterative migration steps
- **Caching**: Internal LRU read cache (500 entries, 30s TTL)
- **Cross-platform sync**: `syncPageRecord()` propagates status to linked platforms (never overwrites ratings on linked platforms that are already watched)

Database API at `src/features/database/api.ts` provides thin message-passing wrappers:
`dbGet()`, `dbPut()`, `dbDelete()`, `dbGetAll()`, `dbQuery()`, `dbCount()`, `dbGetWatchedIds()`, `dbSyncPageRecord()`, `ptIdCacheGet()`, `ptIdCachePut()`, `ptIdCacheGetBulk()`, `getSettings()`, `updateSettings()`, `exportData()`, `importData()`, `getStatistics()`, `healthCheck()`, `getMigrationStatus()`.

## Message Types

Complete table of `chrome.runtime.sendMessage` types dispatched by `handleMessage()` in `background.ts`:

| Type | Direction | Purpose |
|---|---|---|
| **DB Operations** | | |
| `DB_GET` | CS/Popup → BG | Get single record by store+key |
| `DB_PUT` | CS/Popup → BG | Insert/update a record |
| `DB_DELETE` | CS/Popup → BG | Delete a record |
| `DB_GET_ALL` | CS/Popup → BG | Get all records from a store |
| `DB_QUERY` | CS/Popup → BG | Query records by index |
| `DB_COUNT` | CS/Popup → BG | Count records in a store |
| `DB_GET_WATCHED_IDS` | CS/Popup → BG | Get all watched (status>=2) record keys across stores |
| `DB_SYNC_PAGE_RECORD` | CS → BG | Cross-platform sync (propagate status+links) |
| **PT ID Cache** | | |
| `PT_ID_CACHE_GET` | CS → BG | Get PT ID cache entry |
| `PT_ID_CACHE_PUT` | CS → BG | Put PT ID cache entry |
| `PT_ID_CACHE_GET_BULK` | CS → BG | Batch get PT ID cache entries |
| **WebDAV** | | |
| `WEBDAV_SYNC` | Popup → BG | Trigger full WebDAV backup/sync |
| `WEBDAV_TEST` | Popup → BG | Test WebDAV connection |
| `WEBDAV_UPLOAD` | Popup → BG | Upload data to WebDAV |
| `WEBDAV_DOWNLOAD` | Popup → BG | Download data from WebDAV |
| **NeoDB** | | |
| `NEODB_PUSH_RATING` | CS → BG | Push rating to NeoDB API |
| **User Interface** | | |
| `SHOW_TOAST` | BG → CS | Display notification in content script |
| `DOWNLOAD_FILE` | CS → BG | Download file via MAIN world fetch |
| **Settings & Data** | | |
| `GET_SETTINGS` | Any → BG | Get current app settings |
| `UPDATE_SETTINGS` | Any → BG | Update app settings (partial merge) |
| `EXPORT_DATA` | Popup → BG | Export all stores + settings |
| `IMPORT_DATA` | Popup → BG | Import data (validate + clear + write) |
| `GET_STATISTICS` | Any → BG | Aggregate stats across all stores |
| `GET_ALL_RECORDS` | Popup → BG | Flattened all records for popup display |
| **Utility** | | |
| `HEALTH_CHECK` | Any → BG | Verify background + DB ready |
| `GET_MIGRATION_STATUS` | Any → BG | Current migration info |
| **Adult AV** | | |
| `ADULT_AV_CHECK` | CS → BG | Check if AV ID is viewed |
| `ADULT_AV_ADD` | CS → BG | Add AV record |
| `ADULT_AV_GET_ALL` | CS → BG | Get all AV records |
| `ADULT_AV_CHECK_BATCH` | CS → BG | Batch check AV IDs |
| `ADULT_AV_BATCH_ADD` | CS → BG | Batch add AV records |
| `SEHUATANG_CHECK_VIEWED` | CS → BG | Legacy: check Sehuatang viewed |
| `SEHUATANG_ADD` | CS → BG | Legacy: add Sehuatang record |
| `SEHUATANG_BATCH_ADD` | CS → BG | Legacy: batch add Sehuatang records |
| `SEHUATANG_GET_ALL` | CS → BG | Legacy: get all Sehuatang records |
| **Event Bus** | | |
| `EVENT_BUS` | BG → CS | Broadcast events (record:updated, record:deleted, settings:changed, sync:completed) |

## Key Conventions

- **Path alias**: `@/` → `./src/` (configured in both `wxt.config.ts` and `tsconfig.json`)
- **Component library**: shadcn/vue with reka-ui primitives. Components live in `src/components/ui/`. Config in `components.json`
- **Message passing**: Content scripts communicate with background via `chrome.runtime.sendMessage`. Message types are string constants (no shared enum file — typed inline in the switch case)
- **Database**: IndexedDB via singleton `mediaDB` in `src/features/database/models.ts`. Store names follow `{platform}_records` pattern. Record keys are `{type}::{providerId}`
- **Content-DB isolation**: Content scripts never touch IndexedDB directly — all DB access goes through `chrome.runtime.sendMessage` to the background Service Worker
- **State management**: Pinia stores in `src/stores/` (app.ts, theme.ts, confirm.ts)
- **Vue composables** in `src/composables/` (useStats, usePlatformMeta, useToast)
- **Node requirement**: >= 22. CI uses Node 24
- **Version**: Bumped via `npm run package:patch/minor/major` (`scripts/package.js`). Version lives in `package.json` and `wxt.config.ts` (manifest) — the package script updates both
- **No `@ts-ignore` / `@ts-expect-error`** — type errors must be fixed properly
- **No `as any`** — explicit type annotations or proper generics instead
- **Use Composition API with `<script setup>` and TypeScript** for all new code

## Testing

- **Framework**: Playwright (not Vitest/Jest)
- **Test locations**: `tests/` directory (gitignored — ephemeral/generated)
- **Config**: `playwright.config.ts`
- **Browser**: Chromium only (fully parallel locally, single worker in CI)
- **Test suites**:
  - `npm test` — All tests
  - `npm run test:unit` — Unit tests (tests/unit/)
  - `npm run test:integration` — Integration tests (tests/integration/)
  - `npm run test:ui` — Playwright UI mode (interactive)

## Adding a New Site

Complete checklist for integrating a new platform:

1. **Content script matches**: Add URL match patterns to `matches` array in `src/entrypoints/content.ts`
2. **Router route**: Add URL → handler mapping in `src/entrypoints/content/router.ts`
3. **Handler**: Create handler file in `src/entrypoints/content/handlers/` following existing patterns (e.g. `imdb.ts`, `neodb.ts`)
4. **Domain entries**: Add new platform/type to domain models if needed (`Platform.ts`, `MediaType.ts`)
5. **Host permissions**: Add domain to `host_permissions` in `wxt.config.ts`
6. **Database**: Add store name to `STORE_NAMES` in `database/models.ts` and `RECORD_STORES` if a record store
7. **Identity parsing**: Add URL pattern to `Identity.fromUrl()` in `Identity.ts`
8. **i18n keys**: Add translation keys to both i18n systems:
   - `src/entrypoints/content/i18n/locales.ts` (content script)
   - `src/shared/locales/` (vue-i18n for Popup/Options)
9. **CSS**: Add any new CSS files for content script injection following the existing style patterns
10. **Message types**: Add any new message types to the background handler switch in `background.ts`

For Douban pages specifically, follow the new injection system pattern:
- Add page type to `url-detector.ts`
- Create page directory under `src/content/douban/pages/{page-type}/` with App.vue + config + data + types
- Register mount function in `main.ts` via `definePageMount()` + `MountRegistry.register()`
- Add CSS preset in `css-composer.ts` `PAGE_CSS_PRESETS`
- Add page-specific CSS file in `src/content/douban/styles/`

## Project Structure

```
um-multimedia-manager/
├── wxt.config.ts                    # WXT extension build config
├── components.json                  # shadcn/vue config
├── tsconfig.json                    # TypeScript config
├── playwright.config.ts             # Playwright E2E config
├── icons/                           # Extension icons (16/48/128px)
├── scripts/                         # Build & maintenance scripts
│   ├── package.js                   # Version bump + packaging
│   ├── fix-paths.js                 # Post-build path fix (critical)
│   ├── check-i18n.js                # i18n key checker
│   ├── resize-icons.ts              # Icon resizing
│   ├── data-export.js               # CLI data export
│   ├── data-import.js               # CLI data import
│   ├── unpack.js                    # Extension unpacker
│   └── migrate-data.ts              # Data migration tool
├── assets/                          # Logo and graphics
├── .omo/                            # Work plans & spec docs
├── docs/                            # Documentation
├── src/
│   ├── entrypoints/                 # WXT entrypoints
│   │   ├── background.ts            # Service Worker (message router, DB, alarms)
│   │   ├── background/handlers/     # Modular message handlers
│   │   │   ├── data.ts              # Settings, export/import, stats
│   │   │   ├── webdav.ts            # WebDAV sync handlers
│   │   │   ├── neodb.ts             # NeoDB push handler
│   │   │   ├── toast.ts             # Toast notification handler
│   │   │   └── adult-av.ts          # Adult AV ID handlers
│   │   ├── content.ts               # Legacy content script entry
│   │   ├── content/                 # Legacy content script modules
│   │   │   ├── router.ts            # URL-based route dispatch
│   │   │   ├── handlers/            # Per-platform handlers
│   │   │   ├── enhancers/           # Page enhancements (PT dimmer, search)
│   │   │   ├── observers/           # DOM observers (rating)
│   │   │   ├── i18n/                # Custom i18n for content scripts
│   │   │   ├── styles/              # JS-injected style templates
│   │   │   ├── ui/                  # Content script UI components
│   │   │   ├── neodb-push.ts        # NeoDB push UI
│   │   │   └── utils/               # Content script utilities
│   │   ├── douban-early.content/    # New Douban: early injection
│   │   ├── douban-main.content/     # New Douban: main injection
│   │   ├── popup/                   # Popup Vue app
│   │   └── options/                 # Options page Vue app
│   ├── content/                     # Content script business logic
│   │   └── douban/                  # New Douban injection system
│   │       ├── early.ts             # document_start overlay creation
│   │       ├── main.ts              # document_idle Vue app mount
│   │       ├── page-registry.ts     # MountRegistry class
│   │       ├── mount-factory.ts     # definePageMount() factory
│   │       ├── css-composer.ts      # CSS preset composition
│   │       ├── css-map.ts           # Raw CSS import map
│   │       ├── overlay/             # Shadow DOM overlay utilities
│   │       ├── components/          # Shared Vue components
│   │       ├── pages/               # Per-page Vue apps (29 types)
│   │       ├── shared/              # Shared logic (composables, theme, URL detection)
│   │       └── styles/              # CSS files (design tokens, themes, per-page)
│   ├── domain/                      # DDD domain layer
│   │   ├── record/                  # StoreRecord aggregate, Status VO, Rating VO, RecordService, IRecordRepository
│   │   ├── identity/                # Identity aggregate, IdentityFactory, IIdentityRepository
│   │   └── platform/                # Platform VO, MediaType VO
│   ├── features/                    # Business features
│   │   ├── database/                # IndexedDB (models.ts, api.ts, query-utils.ts)
│   │   ├── data-scheduler/          # Priority queue, rate limiter, retry, monitor
│   │   ├── cache/                   # CacheManager, LRUCache, TtlCacheStore, Memoizer
│   │   ├── migration/               # Data migration (models.ts)
│   │   ├── neodb/                   # NeoDB API client
│   │   ├── webdav/                  # WebDAV client
│   │   ├── settings/                # Settings cache
│   │   ├── adult-av/                # Adult AV ID management
│   │   └── optimistic-lock/         # Optimistic concurrency types
│   ├── stores/                      # Pinia stores
│   ├── composables/                 # Vue composables
│   ├── components/                  # Shared UI components
│   │   └── ui/                      # shadcn/vue (reka-ui) primitives
│   ├── shared/                      # Shared across entrypoints
│   │   ├── locales/                 # vue-i18n locale files
│   │   ├── plugins/                 # Vue plugins (i18n)
│   │   └── styles/                  # Shared Tailwind styles
│   ├── types/                       # TypeScript type definitions
│   ├── utils/                       # Shared utilities (context, event-bus, logger)
│   └── config/                      # App configuration constants
```
