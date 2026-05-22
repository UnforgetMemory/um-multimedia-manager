# Changelog

All notable changes to the UMM (um-multimedia-manager) project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-05-22

### Added

- **PT Dimmer**: Added `pt_id_cache` fallback for all PT site handlers (Audiences, HDHome, HDArea, OurBits, PTerClub), not just M-Team
- **Toast**: Unified toast notification system with scripting fallback for non-matching pages
- **Toast**: Added missing toasts for IMDB save, NeoDB linkedId, Douban auto-sync
- **Database**: Added `schemaVersion` record migration system
- **PT Dimmer**: Added detailed debug logging for full chain diagnostics (ID sets, row IDs, cache lookups)

### Fixed

- **PT Dimmer**: Fixed ID key parsing bug (`key.slice(6)` -> `slice(7)`) that caused a leading colon on all IDs, making matches fail
- **Database**: Fixed `getWatchedIds` to use store cursor with JS status check instead of IndexedDB index, handling both legacy string statuses (`"done"`/`"wish"`) and numeric values (`1`/`2`)
- **PT Dimmer**: Removed unnecessary `attributes: true` from `MutationObserver` to prevent wasteful re-triggers on `umm-dimmed` class changes

### Changed

- **Build**: Updated package version to 1.4.0
