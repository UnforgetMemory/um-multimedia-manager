# Changelog

All notable changes to the UMM (um-multimedia-manager) project are documented here.

## [1.5.4] - 2026-05-28

### Added

- **PT 站点适配 — PTHome**: 新增 PTHome (`www.pthome.net`) PT Dimmer 支持（基于 NexusPHP table 布局）
- **PT 站点适配 — Haidan**: 新增 Haidan (`www.haidan.cc`) PT Dimmer 支持（DIV-based `.torrent_group` 布局，支持 `torrents.php` / `videos.php`）
- **MTeam 懒加载**: Content script 覆盖 `kp.m-team.cc/*` 全局匹配，非 PT 页面仅运行轻量 URL 监听器，检测到 `/browse` 路由后触发完整初始化
- **MTeam SPA 路由增强**: 新增 `history.pushState`/`replaceState` 拦截 + 1s 轮询兜底，确保 Ant Design 路由切换时 PT Dimmer 可靠触发
- **PTDimmer 单例模式**: Router 层使用 `PTDimmer` 单例复用，避免每次路由分发创建新实例导致 observer 泄漏

### Fixed

- **MTeam waitForElement 超时**: 超时从 5s→15s，添加 `fulfilled` 标志防重复回调，超时打 `console.warn` 而非静默断开
- **MTeam 无限处理循环**: 为 `safeProcess` 添加重入锁（`processing` + `processQueued` 标志），防止 poll/observer/scroll 三路并发
- **MTeam observer 范围收窄**: 以 `setupMTeamWatcher`+`attachMTeamObserver` 替代 `setupReactiveLoop`，从 `body` 全量 subtree 改为仅监听 `[role="row"]` 容器 `childList`，彻底移除 poll 定时器和 scroll 处理器
- **MTeam 签名不稳定**: `getMTeamRowSignature` 移除 `textContent.slice(0,160)`，改用稳定字段避免 React 重渲染导致签名不一致
- **MTeam `resolved='false'` 死循环**: `processMTeamRows` 和 `applyCacheFallback` 均无条件标记 `resolved='true'`，防止无 ID 行被反复处理
- **MTeam 导航离开后持续处理**: 添加 URL guard（不匹配时跳过处理）+ `active` 标志 + `dispatchRoute` 无路由分支 cleanup
- **PTHome / Haidan 详情页路由**: `pt-detail.ts` 添加 `pthome.net` / `haidan.cc` 到 NexusPHP 主机列表

### Changed

- **watchUrlChanges**: 10% 随机采样 → 300ms 节流 MutationObserver + popstate + pushState/replaceState + 1s setInterval 四重保障
- **dispatchRoute cleanup**: 使用 `PTDimmer.currentInstance` 静态引用兜底，确保路由切换时 observer 被正确清理
- **版本更新**: 1.5.3 → 1.5.4

## [1.5.3] - 2026-05-27

### Added

- **调试面板**: Popup 设置页新增 Debug 控制面板，支持运行时开关日志和日志级别选择
- **STORAGE_KEYS 常量系统**: 统一管理所有 chrome.storage.local 存储键，替代散落的字符串字面量
- **模块化架构重构**: shared/ 拆解为 features/{database,neodb,webdav,identity,migration} 按领域模块组织

### Fixed

- **调试开关不持久化**: 修复 debugEnabled/logLevel 存储键读写不一致导致的开关复位问题
- **初始化守卫时序**: 修复 autoSyncNeoDB 首次切换被初始化守卫吞掉的 bug；修复每次刷新 popup 弹出"日志已开启"toast 的问题

### Changed

- **config.ts**: 移除 DATASETS/SETTINGS_KEYS 等死代码；Domain 类型改为联合字面量
- **存储键管理**: 所有 chrome.storage.local 访问改用 STORAGE_KEYS/STATS_KEYS/MISC_KEYS 常量
- **目录结构**: content/ 移入 entrypoints/ 目录，符合 WXT 官方推荐
- **版本更新**: 1.5.2 → 1.5.3

## [1.5.2] - 2026-05-26

### Added

- **事件驱动架构**: 豆瓣详情页新增评分变化实时监听（`#n_rating` MutationObserver），星级点击后推送按钮值自动同步
- **推送成功后响应式更新**: NeoDB 推送成功后自动重渲染按钮容器，水印变绿并播放荧光动画
- **按钮容器状态**: 已关联 NeoDB 时容器自动添加 `umm-neodb-synced` 类，触发绿色荧光 CSS 动画

### Fixed

- **豆瓣详情页**: 修复推送后 NeoDB 水印不更新的问题（取消硬编码 CSS，改为完整重渲染）
- **豆瓣详情页**: 修复按钮评分与页面星级不同步的问题（使用实时 DOM 评分替代 `currentRecord.rating`）

### Changed

- **豆瓣详情页**: `pushToNeoDB` 推送基数改用页面实时评分（`scanDoubanPageStatus`），而非缓存数据

## [1.5.1] - 2026-05-26

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
