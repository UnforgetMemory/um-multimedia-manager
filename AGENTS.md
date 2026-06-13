# AGENTS.md

## Project

UMM (Unified Multimedia Manager) — Chrome extension (Manifest V3) that tracks movie/TV/music across Douban, IMDb, NeoDB, TMDB, and PT sites. Vue 3 + TypeScript + WXT + Tailwind CSS v4 + shadcn/vue (reka-ui).

## Quick commands

```bash
npm run dev          # Dev mode (WXT hot reload)
npm run build        # Production build → dist/chrome-mv3/
npm run type-check   # vue-tsc --noEmit (run before commits)
npm test             # Playwright E2E tests (chromium only)
npm run test:unit    # Unit tests only
npm run test:integration  # Integration tests only
npm run package:patch     # Bump patch version + build + package
npm run zip          # Build + zip for Chrome Web Store upload
```

**CI order**: `npm run type-check` → `npm run build`. CI also builds for Firefox (`npx wxt build -b firefox`).

**No lint or format command exists.** Type checking is the only automated quality gate.

## Build gotcha

`npm run build` runs `wxt build && node scripts/fix-paths.js`. The `fix-paths.js` post-step is required — don't skip it or the extension breaks. Build output goes to `dist/chrome-mv3` (Chrome) or `dist/firefox-mv2` (Firefox).

## Architecture

Three WXT entrypoints in `src/entrypoints/`:

- **`background.ts`** — Service Worker. Message router (Content ↔ Popup ↔ Background), IndexedDB singleton, alarm-based cache cleanup, WebDAV sync, NeoDB push. All DB access goes through this.
- **`content.ts`** — Content Script injected into target sites. Lazy-loads: if the URL doesn't match any route, starts a lightweight URL watcher instead of full init.
- **`popup/`** — Popup UI (Vue 3 app). Stats dashboard, settings, export/import.

Content script dispatches via `src/entrypoints/content/router.ts` to per-platform handlers in `content/handlers/` (douban, imdb, neodb, pt-detail, mukaku) and enhancers in `content/enhancers/` (pt-dimmer, douban-search).

Shared code in `src/features/` (database, identity, migration, neodb, webdav) and `src/utils/`.

## Key conventions

- **Path alias**: `@/` → `./src/` (configured in both `wxt.config.ts` and `tsconfig.json`)
- **Component library**: shadcn/vue with reka-ui primitives. Components live in `src/components/ui/`. Config in `components.json`.
- **Message passing**: Content scripts communicate with background via `chrome.runtime.sendMessage`. Message types are string constants (e.g., `DB_GET`, `WEBDAV_SYNC`, `NEODB_PUSH_RATING`).
- **Database**: IndexedDB via a singleton `mediaDB` in `src/features/database/models.ts`. Store names follow `{platform}_records` pattern.
- **Node requirement**: >= 22. CI uses Node 24.
- **Version**: Bumped via `npm run package:patch/minor/major` (scripts/package.js). Version lives in `package.json` and `wxt.config.ts` manifest — the package script updates both.

## Testing

Tests use Playwright (not Vitest/Jest). The `tests/` directory is gitignored — tests are ephemeral or generated. Config in `playwright.config.ts`. Chromium only, fully parallel locally, single worker in CI.

## Adding content script patterns

When adding a new site to the content script, update the `matches` array in `src/entrypoints/content.ts` AND add a corresponding handler in `src/entrypoints/content/handlers/`. The router (`content/router.ts`) maps URLs to handlers.

## Content Script Architecture

The content script uses a lazy-loading pattern:
1. On page load, check if URL matches any route via `hasMatchingRoute()` in `router.ts`
2. If no match → start lightweight URL watcher (intercept history.pushState/replaceState)
3. If match → run full initialization

Full initialization waits for background DB to be ready (up to 8 retries with exponential backoff), then:
- Injects global styles
- Detects current page identity via `Identity.fromUrl()`
- Loads current record from IndexedDB
- Initializes router to dispatch to platform-specific handler
- Starts theme/rating observers

## Message Types

Key message types used in `chrome.runtime.sendMessage`:
- `DB_GET` / `DB_PUT` / `DB_DELETE` — Database operations via background
- `WEBDAV_SYNC` — Trigger WebDAV backup/sync
- `NEODB_PUSH_RATING` — Push rating to NeoDB API
- `SHOW_TOAST` — Display notification in content script
- `HEALTH_CHECK` — Verify background DB is ready
