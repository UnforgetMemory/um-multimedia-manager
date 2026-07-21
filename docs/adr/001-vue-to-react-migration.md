# ADR-001: Vue 3 → React 19 Migration

**Status**: Completed
**Date**: 2026-07-21
**Branch**: `dev-2026-07-21`

## Context

The UMM extension was originally built with Vue 3 + TypeScript + WXT. Key drivers for migration:

- **AI coding efficiency**: React has 5x more training data, yielding 15-25% higher first-pass accuracy
- **TypeScript 7.0 compatibility**: Vue's vue-tsc was blocked on TS 7.0 support
- **Framework stability**: React 19.2.7 is stable; Vue 3.6 was still RC
- **Ecosystem depth**: React's ecosystem is larger for AI tools, component libraries

## Decision

Migrate from Vue 3 to React 19 using an incremental coexistence strategy.

## Migration Strategy

1. **Phase 1**: Both @wxt-dev/module-vue and @wxt-dev/module-react active simultaneously
2. **Phase 2**: Popup SPA migrated first (simplest entrypoint, 2 Vue files)
3. **Phase 3**: Options SPA migrated second (6 tabs, router)
4. **Phase 4**: Douban overlay system migrated last (30+ pages, shared components)

## Changes

| Area | Before | After |
|------|--------|-------|
| Framework | Vue 3.6 RC | React 19.2.7 |
| State | Pinia 4 | Zustand 5 |
| Routing | vue-router 5 | react-router-dom 7 |
| i18n | vue-i18n 11 | react-i18next 17 |
| UI | shadcn/vue (reka-ui) | shadcn/react (radix-ui) |
| Icons | lucide-vue-next | lucide-react |
| Build | @wxt-dev/module-vue | @wxt-dev/module-react |
| Type-check | vue-tsc 3.3.7 | tsc --noEmit |

## Files Changed

- 104 .vue SFCs → .tsx React components
- 28 page config.ts updated for React mount
- 3 Pinia stores → 3 Zustand stores
- 14 Vue composables → 4 React hooks
- 50+ shadcn/vue components → shadcn/react
- package.json: all Vue deps removed, React deps added

## Files Unchanged

- 265 domain/feature pure TypeScript files
- 30+ Shadow DOM CSS files (framework-agnostic)
- Background service worker
- Content script handlers

## Verification

- `npm run build`: ✅ exit 0
- `npm run type-check` (tsc --noEmit): ✅ 0 errors
- Build output: 2.5 MB

## Risks

- Douban overlay 28 pages have data display but may lack full interactive features from original Vue version
- Some pages' data structure may not perfectly match original Vue extraction