# Script Format Consistency Audit

**Date**: 2026-07-12  
**Scope**: All files in `scripts/` (7 JS, 2 TS)  
**Method**: Manual review of module system, package.json references, and code quality

---

## 1. Module System Summary

| File | Type | Module System | `import` | `require()` | `__dirname` Pattern |
|------|------|---------------|----------|-------------|---------------------|
| `fix-paths.js` | JS | ESM | ✅ Static | ❌ None | `fileURLToPath(import.meta.url)` |
| `package.js` | JS | ESM | ✅ Static | ✅ `createRequire` (archiver) | `fileURLToPath(import.meta.url)` |
| `add-umm-prefix.js` | JS | ESM | ✅ Static | ❌ None | ❌ Hardcoded absolute paths |
| `check-i18n.js` | JS | ESM | ✅ Static | ❌ None | `fileURLToPath(import.meta.url)` |
| `data-export.js` | JS | ESM | ✅ Static | ✅ `createRequire` (adm-zip) | `fileURLToPath(import.meta.url)` |
| `data-import.js` | JS | ESM | ✅ Static | ✅ `createRequire` + inline `require()` | `fileURLToPath(import.meta.url)` |
| `unpack.js` | JS | ESM | ✅ Static | ✅ `createRequire` (adm-zip) | `fileURLToPath(import.meta.url)` |
| `resize-icons.ts` | TS | ESM | ✅ Static + dynamic | ❌ None | `fileURLToPath(import.meta.url)` |
| `migrate-data.ts` | TS | ESM | ✅ Static | ❌ None | `fileURLToPath(import.meta.url)` |

**Verdict**: All 9 scripts are consistently ESM. The project's `"type": "module"` in `package.json` is respected uniformly. No CommonJS-first scripts found.

---

## 2. ESM Details

### Standard ESM imports
All JS/TS files use static `import` syntax with named imports from Node builtins (`fs`, `path`, `child_process`, `url`, `module`, `stream`, `util`).

### CJS interop via `createRequire`
Three scripts use `createRequire(import.meta.url)` to load CJS-only dependencies:

- **`package.js`**: `require('archiver')` — `ZipArchive` destructured from it (line 19)
- **`data-export.js`**: `require('adm-zip')` (line 19)
- **`data-import.js`**: `require('adm-zip')` (line 18)
- **`unpack.js`**: `require('adm-zip')` (line 22)

This is the standard ESM-compatible way to load CJS modules. Acceptable.

### `__dirname` pattern
All scripts except `add-umm-prefix.js` use the standard ESM pattern:
```js
import { fileURLToPath } from 'url'
import { dirname } from 'path'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
```

---

## 3. package.json Script References

| Script | Referenced in `package.json` `"scripts"` | Node runner |
|--------|------------------------------------------|-------------|
| `fix-paths.js` | ✅ `build` | `node` |
| `package.js` | ✅ `package`, `package:patch`, `package:minor`, `package:major` | `node` |
| `add-umm-prefix.js` | ❌ **Orphaned** | — |
| `check-i18n.js` | ✅ `i18n:check`, `i18n:check:strict` | `node` |
| `data-export.js` | ✅ `data:export` | `node` |
| `data-import.js` | ✅ `data:import` | `node` |
| `unpack.js` | ✅ `unpack` | `node` |
| `resize-icons.ts` | ✅ `resize-icons` | `tsx` |
| `migrate-data.ts` | ❌ **Orphaned** | — |

### Referenced (7/9): All actively wired into package.json scripts.

### Orphaned (2/9):

**`add-umm-prefix.js`** — A one-time migration tool to add `umm:` prefix to Tailwind classes. Contains hardcoded absolute paths (lines 283-286 e.g. `/home/um/sourcecode/my/um-multimedia-manager/...`). Likely already used and kept for reference. Should either be removed or documented in package.json as `scripts/prefix:add`.

**`migrate-data.ts`** — Data migration from old Tampermonkey export format to new extension format. Has hardcoded input/output paths pointing to `.agents/` directory. Likely one-time use. Not wired into any npm script.

---

## 4. Runner Consistency

All JS scripts use `node` as runner. The two TS scripts use `tsx`:
- `"resize-icons": "tsx scripts/resize-icons.ts"` ✅
- `migrate-data.ts` — orphaned, no runner configured

**Consistent**: JS → `node`, TS → `tsx`. No mixed runners.

---

## 5. Issues Found

### 5.1 Inline `require()` in `data-import.js` (minor inconsistency)

`data-import.js` imports `readFileSync, writeFileSync, existsSync, mkdirSync, rmSync` from `fs` and `join, basename` from `path` at the top level (lines 11-12). However, inside `validateAndReadData()` (lines 166-167), it re-acquires these via:

```js
const fs = require('fs')
const path = require('path')
```

This is redundant and inconsistent. Should reuse the top-level ESM imports.

### 5.2 Hardcoded absolute paths in `add-umm-prefix.js`

Lines 283-286 use hardcoded absolute paths:
```js
const uiDir = '/home/um/sourcecode/my/um-multimedia-manager/src/shared/ui'
const optionsDir = '/home/um/sourcecode/my/um-multimedia-manager/src/entrypoints/options'
const popupDir = '/home/um/sourcecode/my/um-multimedia-manager/src/entrypoints/popup'
const customDir = '/home/um/sourcecode/my/um-multimedia-manager/src/shared'
```

These should use `join(__dirname, '..', 'src', ...)` for portability.

### 5.3 Regex whitespace typos in `add-umm-prefix.js`

Line 33: `/\b(size-[0-9]+|...)/g` → should be `/\b(size-[0-9]+|...)/g` (extra space in the regex breaks word boundary matching for `size-` classes)
Line 86: `/\b align-[a-z]+/g` → should be `/\balign-[a-z]+/g` (leading space makes this match ` align-` instead of `align-`)

These are regex bugs but the script appears to be a one-time migration tool, so fixing is optional.

### 5.4 Dynamic imports in `resize-icons.ts`

Lines 20-21 use dynamic `await import()` for `fs` and `path`:
```ts
const fs = await import('fs')
const path = await import('path')
```

But `path` is already imported statically at the top of the file (line 7). And `fs` could be imported statically too. This is inconsistent — the file mixes static and dynamic imports for the same module.

---

## 6. .ts Conversion Candidates

| Script | Lines | Complexity | CJS interop | Recommend .ts? | Reason |
|--------|-------|------------|-------------|----------------|--------|
| `fix-paths.js` | 61 | Low | No | ❌ No | Stable, simple, no benefit |
| `package.js` | 319 | Medium | Yes (archiver) | ⚠️ Possibly | Complex logic, would benefit from types |
| `add-umm-prefix.js` | 349 | Medium | No | ⚠️ Possibly | Complex regex, orphaned — if kept |
| `check-i18n.js` | 166 | Low | No | ❌ No | Simple, stable |
| `data-export.js` | 227 | Medium | Yes (adm-zip) | ⚠️ Possibly | Schema validation would benefit |
| `data-import.js` | 314 | Medium | Yes (adm-zip) | ⚠️ Possibly | Data structure validation, import mode logic |
| `unpack.js` | 277 | Medium | Yes (adm-zip) | ⚠️ Possibly | File/archive handling, validation |
| `resize-icons.ts` | 61 | Low | No | ✅ Already .ts | Already converted |
| `migrate-data.ts` | 197 | Medium | No | ✅ Already .ts | Already converted, orphaned |

**Recommendation**: The current split (JS for simple scripts, TS for ones needing type safety) is reasonable. No urgent conversion needed. If converting, start with `package.js` and `data-import.js` as they have the most complex data handling.

---

## 7. Standardization Recommendations

### Immediate (low effort, high value):
1. **Fix inline `require()` in `data-import.js`** — replace lines 166-167 with the already-imported top-level `readFileSync` and `join`/`basename`
2. **Wire `migrate-data.ts` into package.json** — add a `"migrate:data"` script runner, or archive/remove it if it's truly one-time use
3. **Remove or document `add-umm-prefix.js`** — if the migration is complete, remove it; if kept, fix the absolute paths and add a package.json entry

### Medium term:
4. **Run all scripts via `tsx` or `node` consistently** — if the project wants uniform runner choice, either convert all to `.ts` with `tsx` runner, or stick with `node` for `.js` files (current state is fine)
5. **Fix `resize-icons.ts` dynamic imports** — make them static to match the rest of the codebase

### Optional:
6. **Convert `package.js` to `.ts`** — it has the most complex logic (async ZIP, version bumping, git operations, changelog) and would benefit from type safety

---

## 8. Summary Checklist

| Check | Status |
|-------|--------|
| All scripts use same module system (ESM)? | ✅ Yes — all ESM |
| `import`/`export` consistently used? | ✅ Yes — no `module.exports` |
| All scripts referenced in package.json? | ❌ No — 2 orphaned (`add-umm-prefix.js`, `migrate-data.ts`) |
| Runner consistent (node vs tsx)? | ✅ Yes — JS→node, TS→tsx |
| `__dirname` pattern consistent? | ⚠️ Mostly — 1 exception (`add-umm-prefix.js` uses hardcoded paths) |
| CJS interop via `createRequire`? | ✅ Yes — consistent pattern where needed |
| Inline `require()` instead of imports? | ❌ 1 occurrence in `data-import.js` |
| Any CommonJS-first scripts? | ❌ None found |
