# Changelog

All notable changes to the UMM (um-multimedia-manager) project are documented here.

## [1.4.2] - 2026-05-26

### Fixed

- **豆瓣搜索**: 影人（celebrity）卡片不再输出误导性 `console.warn`，替换为 `debugLog`，仅在开发者模式下可见
- **豆瓣搜索**: `idExtractor` 中 link 为 null 时提前返回空，避免无效处理

### Changed

- **上下文监控**: 上下文失效轮询间隔从 30s 调整为 60s，减少页面无意义检查
- **上下文监控**: 移除 5 分钟检查超时限制，页面存活期间持续保护（`beforeunload` 已提供清理保障）

## [1.5.0] - 2026-05-23

### Added

- **评语(Comment)**: StoreRecord 新增 `comment` 字段，schema v1→v2 迁移
- **评语提取**: 豆瓣详情页自动提取用户短评（`#interest_sect_level` DOM 选择器），同步 4 条路径
- **NeoDB API**: `markItem`/`updateShelfItem` 支持 `comment_text` 参数
- **Popup UI**: 评分管理页面新增评语输入框（textarea）和查询结果显示
- **推送**: 后台 NeoDB push + 手动同步流程透传 comment

### Fixed

- **NeoDB/IMDb 页面处理器**: 无条件 toast 问题 — 仅在评分/状态/评语/关联真正变化时弹出通知
- **NeoDB/IMDb 处理器**: 缺失 comment 传播（本地保存 + linked 平台同步）
- **IMDb 处理器**: Hardcoded `linkedIds: {}` → 从 `localRecord` 继承
- **豆瓣 syncToLocalStorage**: 缺少 `isCommentChanged` 变化检测，评语单独变化时无通知
- **Release workflow**: `action-gh-release` 缺少 `GITHUB_TOKEN` 导致发布失败

### Changed

- `database.ts syncPageRecord` 新增 comment 变化检测并传播到 linked 平台
- 豆瓣跨平台同步记录（IMDb/TMDB）携带评语

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
