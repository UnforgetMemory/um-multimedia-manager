# Type Inconsistency Audit — UMM Project

**Date**: 2026-07-12  
**Scope**: Domain types vs message-layer types vs config types  
**Files audited**: 7 core type/source files + cross-file import analysis

---

## 1. StoreRecord: DDD Class vs `types/index.ts` Interface

| Field | Domain `StoreRecord` (class) | `StoreRecordSnapshot` | `types/index.ts` `StoreRecord` |
|-------|------------------------------|-----------------------|-------------------------------|
| `url` | `string` | `string` | `string` |
| `status` | `Status` (value object) | `number` | `number` |
| `rating` | `Rating` (value object) | `number` | `number` |
| `comment` | `string \| undefined` | `string?` | `string?` |
| `updatedAt` | `string` | `string` | `string` |
| `linkedIds` | `Readonly<Record<string, string>>` | `Record<string, string>` | `Record<string, string>` |
| `schemaVersion` | `number \| undefined` | `number?` | `number?` |
| `recordVersion` | `number \| undefined` | `number?` | `number?` |

**Verdict**: The `types/index.ts` `StoreRecord` interface is **structurally identical** to `StoreRecordSnapshot`, not the DDD class. It represents the serialized/IndexedDB wire form (status/rating as numbers). This is a **de facto redefinition** of the snapshot type.

**Canonical**: `StoreRecord` (domain class) + `StoreRecordSnapshot` (serialized form).

**Recommendation**: Change `types/index.ts` to re-export `StoreRecordSnapshot` instead of defining an identical `StoreRecord` interface, to avoid accidental drift. The domain class `StoreRecord` should remain the only thing named `StoreRecord`.

**Extra**: `makeRecordKey()` in `types/index.ts` (produces `{type}::{providerId}`) duplicates the `Identity.storeKey` getter pattern. Move to shared utility to avoid format drift.

---

## 2. Identity: DDD Class vs `types/index.ts` `UrlIdentity`

| Field | Domain `Identity` (class) | `IdentitySnapshot` | `types/index.ts` `UrlIdentity` |
|-------|--------------------------|--------------------|-------------------------------|
| platform/provider | `Platform` (value object) | `string` | `Provider` (= `string`) |
| type | `MediaType` (value object) | `string` | `string` |
| providerId | `string` | `string` | `string` |
| url | `string` | `string` | `string` |
| Methods | `create()`, `fromUrl()`, `storeKey`, `equals()`, `canonicalizeUrl()`, `buildCanonicalUrl()` | — | — |

**Verdict**: `UrlIdentity` is a **stripped-down DTO** with no domain behavior. The field name `provider` (types) vs `platform` (domain) is an **inconsistent naming split**.

**Canonical**: `Identity` (domain class). `UrlIdentity` is a convenience DTO for message passing.

**Import sources**:
- `UrlIdentity` imported by: `content/router.ts`, `douban-scanner.ts`, `douban-sync/*.ts`, `douban-neodb.ts`, `doulist-replace.ts`, `useCrossPlatformSync.ts`, `shared/identity.ts`
- `Identity` (domain) imported by: `IdentityFactory.ts`, `IIdentityRepository.ts`

Only **2 files** use the domain class; **10+ files** use the DTO.

---

## 🔴 CRITICAL: Duplicate URL Parsing Logic

`src/domain/identity/Identity.ts` and `src/shared/identity.ts` contain **near-identical copies** of URL routing/parsing logic:

| Capability | Domain `Identity` (class) | `shared/Identity` (object) |
|------------|--------------------------|---------------------------|
| URL canonicalization | `canonicalizeUrl()` | `canonicalizeUrl()` |
| Parse identity from URL | `fromUrl()` (returns `Identity`) | `fromUrl()` (returns `UrlIdentity`) |
| Build canonical URL | `buildCanonicalUrl()` | `buildUrl()` |
| Parse NeoDB TV path | `parseNeoDbTvPath()` | `parseNeoDbTvPath()` |
| Parse TMDB TV path | `parseTmdbTvPath()` | `parseTmdbTvPath()` |
| Build NeoDB URL | `buildNeoDBUrl()` | `buildNeoDBUrl()` |
| Value objects | Uses `Platform` + `MediaType` | Uses raw `string` + `Provider` |

**Every URL pattern** (douban movie/music/book/game, IMDb, NeoDB, TMDB) is **duplicated** in both files. A change to URL parsing requires updating both. This is the highest-risk type inconsistency in the project.

`shared/identity.ts` is the one actually used by the content script router (`src/entrypoints/content/router.ts` imports it). The domain `Identity` is only used within the domain layer.

---

## 3. Platform (DDD) vs `Provider` (config)

| Aspect | Domain `Platform` | `config.ts` `Provider` |
|--------|------------------|----------------------|
| Type | Class with `id: string` | `type Provider = string` |
| Known values | `KNOWLEDGE = ['douban','imdb','neodb','tmdb']` | **None** |
| Validation | `fromString()` / `require()` | **None** |
| Store name | `storeName` → `{id}_records` | — |
| Display name | `displayName` → capitalized | — |

**Verdict**: `Provider` is an **untyped `string` alias** with zero compile-time safety. Any arbitrary string is valid. The domain `Platform` has runtime validation but the config type has none. The `config.ts` comment itself admits: *"Provider 保持 string 类型，避免与多处 MediaRecord 定义冲突"* — this is a known technical debt marker.

**Canonical**: `Platform` (domain value object).

**Impact**: 4 files import `Provider` from `@/config`. If `Provider` ever diverges from `Platform`, all those files get broken silently (no type error, just runtime failures).

---

## 4. MediaType (DDD) vs String Literals

| Aspect | Domain `MediaType` | `config.ts` `Domain` | Codebase usage |
|--------|-------------------|---------------------|----------------|
| Type | Class with `id: string` | `'movie' \| 'tv' \| 'music' \| 'book' \| 'game'` | Mixed |
| Values | MOVIE, TV, MUSIC, BOOK, GAME | Same literals | ✅ |
| Validation | `fromString()` / `require()` | Union type (compile-time) | — |
| Queries | `isVideo`, `isAudio`, `isReadable`, `label` | — | — |

**Verdict**: **Good alignment.** `Domain` union type and `MediaType` cover the same values. `Domain` provides compile-time safety where string literals are appropriate; `MediaType` provides runtime behavior.

**Canonical**: Both are valid in their contexts. `Domain` for lightweight typing; `MediaType` for domain logic.

**Gap**: `types/index.ts` `UrlIdentity.type` is `string` (not `Domain`). This loses type safety in the DTO.

---

## 5. Storage Key Constants

| Defined constants | File | Usage |
|------------------|------|-------|
| `STORAGE_KEYS` | `config.ts` | 15 typed string constants |
| `STATS_KEYS` | `config.ts` | 1 constant (`AGGREGATE`) |
| `MISC_KEYS` | `config.ts` | 4 constants (`QUARANTINE`, `MIGRATION_VERSION`, `DATA_VERSION`, `SETTINGS_NESTED`) |

**Usage audit**: All `chrome.storage.local` calls in the codebase use the `STORAGE_KEYS` constants correctly. No hardcoded storage key strings found in `chrome.storage.local.get/set` calls. ✅

**Minor issues**:
- `src/stores/theme.ts:50` uses a local `STORAGE_KEY` variable (not the project constant) — negligible.
- `src/entrypoints/content/i18n/index.ts` uses local `EXT_LANGUAGE_KEY` — acceptable for module-local key.
- `src/entrypoints/background/handlers/webdav.ts` reads `null` (all keys) then destructures by `STORAGE_KEYS` — correct.

**Verdict**: **Clean.** No hardcoded key string violations. ✅

---

## 6. Message Type Strings

| Aspect | Status |
|--------|--------|
| Central type definition | `types/index.ts` `MessageType` — 34 string literal union members ✅ |
| Payload map | `MessagePayloadMap` — typed per-message payloads ✅ |
| Usage in `db/api.ts` | Uses magic strings (`'DB_GET'`, `'DB_PUT'`, ...) inside `send()` calls |
| Usage in `background.ts` | `RuntimeMessage` interface has `type: string` (not `MessageType`) |
| Usage in `toast.ts` | `'SHOW_TOAST'` as magic string |
| `event-bus.ts` | `'EVENT_BUS'` — not part of `MessageType` union (separate channel) |

**Verdict**: The message type **union exists** in `types/index.ts` but is **barely enforced**:
- `src/features/database/api.ts` uses magic strings for all 30+ message types. These match the union but aren't type-checked against it.
- `src/entrypoints/background.ts` defines its own `RuntimeMessage` with `type: string` instead of `type: MessageType`.
- No runtime type string collisions found (all magic strings match union members).

**Risk**: Adding a new message type requires updating 3 places: the union, the payload map, and the handler switch in `background.ts`. Missing one results in silent errors.

---

## Summary Table

| # | Type Pair | Domain (canonical) | Types/Config (DT layer) | Drift | Severity |
|---|-----------|-------------------|------------------------|-------|----------|
| 1 | StoreRecord | DDD class + `StoreRecordSnapshot` | `StoreRecord` ≡ `StoreRecordSnapshot` (redefinition) | Naming conflict | Medium |
| 2 | Identity | DDD class | `UrlIdentity` (DTO) | Field name: `platform` vs `provider` | Medium |
| 3 | Platform | Value object (typed) | `Provider = string` (untyped) | Complete type erasure | **High** |
| 4 | MediaType | Value object (5 types) | `Domain` union (5 types) | Aligned ✅ | None |
| 5 | URL parsing | `Identity.fromUrl()` (class) | `shared/Identity.fromUrl()` (object) | **Full code duplication** | **Critical** |
| 6 | Storage keys | `STORAGE_KEYS` constants | N/A (used correctly) | None ✅ | None |
| 7 | Message types | `MessageType` union (34 members) | Magic strings in `api.ts` + `background.ts` | Not type-enforced | Low |

---

## Top Risks (by severity)

### 🔴 CRITICAL: Duplicate URL parsing (`Identity.fromUrl` vs `shared/Identity.fromUrl`)
- Two complete implementations of URL-to-identity parsing
- `shared/identity.ts` is the one used by the content script router
- `domain/identity/Identity.ts` is unused by runtime path
- Any URL pattern change must be made in both files or they diverge

### 🔴 HIGH: `Provider = string` type erasure
- Platform identifiers have no compile-time safety outside the domain layer
- 4 files import `Provider` as untyped `string`
- Comment in `config.ts` acknowledges debt: *"Provider 保持 string 类型，避免与多处 MediaRecord 定义冲突"*

### 🟡 MEDIUM: `StoreRecord` naming conflict
- Two types with same name, different semantics
- Domain: class with value objects + methods
- Types: plain interface matching snapshot form

### 🟡 MEDIUM: `UrlIdentity` field naming inconsistency
- `provider` in DTO vs `platform` in domain class
- Causes confusion when crossing domain ↔ message boundaries

### 🟢 LOW: Message type magic strings
- Union exists but not enforced in `chrome.runtime.sendMessage` calls
- `background.ts` uses `type: string` instead of `type: MessageType`

---

## Recommendations (priority order)

1. **Merge `shared/identity.ts` into `domain/identity/Identity.ts`** — or make `shared/identity.ts` delegate to the domain class. One source of truth for URL parsing.

2. **Replace `Provider = string` with `Platform` value object** — or at minimum use the `KNOWN` union: `type Provider = 'douban' | 'imdb' | 'neodb' | 'tmdb'`.

3. **Rename `types/index.ts` `StoreRecord`** → `StoreRecordSnapshot` to match the domain — eliminate the naming conflict.

4. **Rename `UrlIdentity.provider`** → `platform` to match domain `Identity.platform`.

5. **Import `MessageType` in `background.ts`** and use `type: MessageType` instead of `type: string` on the handler signature.

6. **Re-export `UrlIdentity.type` as `Domain`** (from config) instead of raw `string`.
