# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- `rebuildSubjectCard()` TDZ crash: `ratingCard` referenced via `appendChild` before `const` declaration (Rollup hoists `var` to `undefined`)
- `createStandalonePill()` TS6133 warning: `searchTimeout` declared but never read — added `clearTimeout` to prevent race on rapid clicks
- Original `.rank-label` not hidden after data extraction into rebuilt card
- Old `.lnk-doulist-add` button not hidden after relocation into new card layout
- Doulist modal overlay (`#umm-dl-modal`) broken by `all:initial` — replaced with targeted CSS resets (`margin:0;padding:0;border:none;box-sizing:border-box;overflow-y:auto`)
- Legacy `content.ts` neoDBInjector callback still active alongside handler — overridden via `setNeoDBInjector()` in `handleDoubanDetailPage()`
- Doulist add API: expanded ID field mapping (`doulist_id`, `doulists(plural)`) to fix malformed request URL

### Added
- Left-column wrapper (`umm-subject-left-col`) grouping poster and rating-card below poster in the same grid column
- `umm-detail-shell` container isolating all injected UI elements from legacy Douban CSS pollution
- `FloatingToast` error feedback in `initDoulistReplacement()` when doulist fetch fails or returns empty
- **Douban detail page Vue overlay** — replaces DOM manipulation with Shadow DOM + Vue 3
  - New `src/entrypoints/douban-detail.content/` entrypoint: data extraction + Vue app mount
  - New `App.vue` with full detail page layout: search pill, title, poster, rating card, meta, synopsis, actions
  - New `style.css` with complete light/dark theme variables, responsive grid layout
  - Awards card (`#celebrities`) with grid layout, win/nom badges, sorted by award status
  - Celebrities card (`#celebrities`) with 2:3 portrait avatars
  - Photos/stills card (`#related-pic`) with aspect-ratio grid, trailer badges
  - Recommendations card (`#recommendations`) with watched/unwatched status bar
  - `dbGetAll` → `dbGetWatchedIds` for watched-status batch check
  - XSS sanitization: script tag stripping from synopsis HTML before `v-html`
- Debug toggle (`Shift+\``) for showing/hiding overlay to inspect original page

### Changed
- `handleDoubanDetailPage` simplified from 1994→30 lines — overlay handles UI, handler does background sync only
- Title card layout: horizontal title + original name + year row, responsive stack on small screens
- Rating card redesign: larger score (42px), focal score section, better bar design, `border-top` separator
- Status chip moved from actions area to top of title block
- Poster URL: `s_ratio_poster` → `xl` for high-resolution images
- Celebrity card: circular avatars → 2:3 portrait rectangles

- Full-page overlay injection on Douban search page (`search.douban.com/movie|music/subject_search`)
  - New `src/entrypoints/douban-search-overlay.content/` content script (`document_start`)
  - New `src/entrypoints/douban-search.content/` Vue app with search results grid
  - Data extraction via 4-layer fallback: `window.__DATA__` → script tag regex → injected bridge → DOM parsing
  - Search bar with real-time input normalization and debounce
  - Watch-status badges integrated from IndexedDB
  - Dynamic pagination with page window and jump-to-page input
  - Music/movie search type auto-detection
  - Same-tab navigation for search, new-tab for result links
  - Themed scrollbar and fade-in transition
- Full-page overlay injection on Douban homepage (`movie.douban.com`) with `document_start` CSS blocking
  - New `src/entrypoints/douban-homepage-overlay.content/` content script
  - Early CSS injection prevents flash of original content
  - Shadow root container houses the entire Vue-enhanced homepage UI
  - Themed scrollbar (5px, `--umm-border` color, light/dark adaptive)
  - `user-select: none` on overlay (except search input)
  - Dynamic theme sync via `chrome.storage.onChanged` (`umm:appearance` key)
- Moved Dynamic Island styles from component `<style scoped>` to shadow DOM stylesheet (`style.css`)
  - Fixes Vue scoped styles not applying inside Shadow DOM
- Glassmorphic pill-shaped search bar on Douban detail and search pages, replacing native form
  - New `src/utils/search-normalizer.ts` shared normalizer (extracted from UmmDynamicIsland)
  - New `src/entrypoints/content/enhancers/douban-search-bar.ts` enhancer
  - Detail page integration via `handleDoubanDetailPage` in `douban.ts`
  - Search page integration via `startSearchEnhancer` in `douban-search.ts`
  - URL `search_text` prefilling on search result pages
  - Smart query normalization: PT release names → clean search terms (dots, brackets, season/episode → `Season 1`, year truncation)
  - 500ms debounce on blur for input normalization (no cursor jump during typing)
  - CSS isolation via inline styles + injected stylesheet with `!important` overrides
  - Responsive breakpoints: mobile (40px), tablet (42px), desktop
  - Dark mode support via `prefers-color-scheme`

### Changed
- Search navigation uses `location.href` (same-tab) instead of `window.open` (new tab)

## [4.0.0] - 2026-06-24

### Changed
- **Background service worker refactored**: Split 1,439-line monolithic `background.ts` into modular handler architecture
  - `background/handlers/webdav.ts` — WebDAV sync handlers (test, upload, download, merge)
  - `background/handlers/neodb.ts` — NeoDB push rating handler
  - `background/handlers/data.ts` — Settings, export, import, statistics handlers
  - `background/handlers/toast.ts` — Toast notification handler with inline fallback
  - `background/handlers/adult-av.ts` — Adult AV ID operations + legacy sehuatang handlers
  - Main `background.ts` reduced to message routing entry point (457 lines)
- **Content script refactored**: Extracted NeoDB push logic from `content.ts` (707→272 lines)
  - New `content/neodb-push.ts` — NeoDB push button injection and push logic (312 lines)
  - New `content/shared/overlay.ts` — Shared shadow DOM overlay creation (127 lines)
- **Early scripts consolidated**: 3 near-identical douban early scripts now use shared `createOverlay()`
  - `douban-detail-early.content/index.ts` — 109→25 lines
  - `douban-homepage-overlay.content/index.ts` — 74→21 lines
  - `douban-search-overlay.content/index.ts` — 74→21 lines
- **Design tokens extracted**: New `content/styles/tokens.ts` with shared color constants
  - `global.ts` updated to import tokens instead of hardcoded values
  - UI component styles (`umm-panel`, `umm-overlay`, `umm-btn`) added to `global.ts`
- **UI panels refactored**: `manual-add-panel.ts` and `check-viewed-panel.ts` use CSS classes instead of inline styles
- Added 3K resolution breakpoint (`--bp-3k: 2880px`) to `design-tokens.css`

### Security
- Security audit passed: XSS prevention via `escapeHtml()` in toast handler, store name validation in DB operations, settings whitelist in import
- Known low-risk items deferred to 4.2.0: toast payload input validation, webdav credential leakage in error messages, import data structural validation

## [3.6.1] - 2026-06-20

### Fixed
- Fixed PT dimmer not activating on some sites after SPA navigation
- Removed redundant regex scan loop in list page handler causing unnecessary DOM queries for 6 sites
- MTeam pollTimer over-fetching cached data on every poll cycle
- MTeam pollTimer cascade triggering after observer attachment
- Scroll/resize event bursts triggering excessive reprocessing during SPA navigation

### Added
- Background scan support for 6 NexusPHP sites: pt.btschool.club, discfan.net, hhanclub.net, hdfans.org, pt.soulvoice.club, hdtime.org

### Security
- Added URL validation for external resource fetches
- Sanitized console output to prevent URL and data exposure

### Changed
- Router URL detection restored with setInterval polling and hashchange listener
- Removed redundant JSDoc, Chinese comments, and section headers from core modules
- Bumped version to 3.6.1
- Added `Thumbs.db` to .gitignore

---

## [3.5.2] - 2026-06-19

### Added
- **PT Dimmer 模块化重构**: 单文件 `pt-dimmer.ts` 重构为 `enhancers/pt/` 多模块架构（12 个文件，~1700 行）
  - `config/` — 站点配置注册表（`SITE_CONFIGS`），支持 17+ NexusPHP 站点
  - `scanner/` — 后台扫描队列（信号量并发控制、随机延迟、缓存优先、60s 冷却）
  - `dimmer/` — 处理器编排（MTeamHandler + NexusPHPHandler），per-task 回调实时淡化
  - `types.ts` / `utils.ts` — 共享类型和工具函数
- **NexusPHP 列表页扫描**: 后台请求详情页提取豆瓣/IMDb 平台 ID，IndexedDB 缓存，双保险策略（后台扫描 + 详情页手动访问）
- **17+ PT 站点适配**: ptsbao.club, audiences.me, hdhome.org, hdarea.club, ourbits.club, pterclub.net, pthome.net, haidan.cc, pt.btschool.club, discfan.net, hhanclub.net, hddolby.com, hdfans.org, pt.soulvoice.club, hdtime.org, piggo.me
- **豆瓣 ID 格式兼容**: 支持 `douban.com/subject/`（无 `movie.` 前缀）和 `movie.douban.com/subject/` 两种格式

### Changed
- **PT Dimmer 架构**: 从单文件 `enhancers/pt-dimmer.ts`（874 行）重构为模块化 `enhancers/pt/`（12 文件，1686 行）
- **数据属性提取**: `extractIdsFromRowLinks` 同时扫描 `<a>` 链接和 `data-doubanid`/`data-imdbid` 属性
- **性能优化**: `enableBackgroundScan: false` 时跳过 IndexedDB 缓存查询；`getScanner()` 单例支持动态更新并发参数

### Fixed
- **内存泄漏**: `waitForElement` observer 使用类属性而非本地变量，`cleanup()` 可正确断开
- **单例配置**: `getScanner()` 后续调用的 `concurrency`/`delayRange` 参数不再被忽略
- **userdetails.php 误匹配**: `extractDetailUrlFromLink` 跳过 `userdetails.php` 链接
- **DOMParser base URL**: `extractIdsFromDoc` 改用 `getAttribute('href')` 避免 `about:blank` 前缀
- **空结果缓存**: 无平台 ID 的详情页也写入空缓存条目，避免重复扫描
- **详情页更新**: 用户手动访问详情页时提取并更新缓存，双重保险

## [3.5.1] - 2026-06-19

### Added
- **Dynamic Island 搜索栏**: 豆瓣首页顶部新增悬浮搜索栏，集成电影/音乐/个人主页快捷入口
  - 左侧导航：电影（🎬）、音乐（🎵）、个人主页（👤）图标按钮
  - 右侧搜索框：支持实时规范化输入（去除 PT 发布组后缀、年份后内容）
  - 搜索按钮 loading 动画：提交时旋转 spinner + 800ms 脉冲防抖
  - 所有链接通过 `window.open` 新标签页打开，不使用原生 `<a>` 元素
- **12 级响应式 CSS Token 系统**: 全新 `breakpoints.css` 定义流体排版、间距、卡片尺寸
  - 覆盖 320px（手机）→ 5120px（5K）完整分辨率范围
  - 3 个显式断点覆写：2560px（2K）、3840px（4K）、5120px（5K）
  - 所有 CSS 硬编码 `px` 值替换为 `var(--umm-*)` token
- **深浅主题联动**: 支持 `auto`/`light`/`dark` 三种模式
  - 从 `chrome.storage.local` 读取扩展主题设置
  - `auto` 模式跟随 `prefers-color-scheme` 媒体查询
  - 监听系统主题变化实时切换
  - CSS 变量系统：`--umm-bg`, `--umm-text-primary`, `--umm-island-bg` 等
- **封面悬浮效果**: 仅封面图片盒浮动，标题/评分/徽章保持静止
- **useBadge 抽取**: 共享徽章计算逻辑抽取为独立 composable，消除 UmmMediaCard 和 UmmBillboardCard 重复代码
- **href 协议验证**: `sanitizeHref()` 函数验证 URL 仅允许 http/https 协议，阻止 javascript:/data:/vbscript: 注入

### Changed
- **重构为独立 WXT 入口点**: `src/entrypoints/douban-homepage.content/` 替代旧 `enhancers/douban-homepage/` 模块
  - 使用 `createShadowRootUi` Shadow DOM 隔离，无需 `all: initial` + `!important` CSS hack
  - 从 `content/router.ts` 解耦，独立匹配 `https://movie.douban.com/`
- **dbGetAll 优化**: `useRecordCache` 仅加载 `{ status, rating }` 字段，减少内存占用
- **搜索查询规范化**: 去除点号、括号、特殊字符，合并多余空格，年份后内容截断
  - 支持双年份场景（使用第二个年份作为截止点）
  - 防死循环：`isNormalizing` 标志 + `setTimeout(0)` 重置
- **所有导航链接**: 从原生 `<a>` 元素改为 `<button>` + `@click` 事件处理，统一新标签页打开

### Fixed
- **matchMedia 监听器泄漏**: `applyTheme` 每次调用新增监听器但从未移除 → 模块级 `activeMqHandler` 追踪 + `removeMqListener()` 清理
- **重复 `:host` 声明**: `style.css` 中 `:host` 声明两次，移除底部重复块
- **冗余注释清理**: 移除 `index.ts` 和 `App.vue` 中 8 条仅重述代码的内联注释
- **console.error 泄露**: `useRecordCache.ts` 移除 error 对象，仅记录通用错误信息

### Removed
- **旧 enhancers 模块**: 删除 `src/entrypoints/content/enhancers/douban-homepage/` 目录（cache, card, index, row, sections, styles, utils 共 7 个文件）
- **router.ts 豆瓣首页路由**: 移除 `content/router.ts` 中豆瓣首页增强器路由规则（21 行）

## [3.4.0] - 2026-06-16

### i18n
- **vue-i18n 体系**: 集成 vue-i18n v11.4.5，支持中文简体/繁体/英文三语言
  - 异步 locale 检测：`chrome.storage` → `navigator.language` → `zh-CN` 兜底
  - 用户语言选择持久化至 `chrome.storage.local`，全局生效
  - Vue 应用（popup/options）使用 `createAppI18n()` 异步 bootstrap，挂载前完成 locale 检测
  - Content script 使用独立 i18n 模块，与 Vue 应用共享 `chrome.storage.local` 语言设置
- **Options 页面**: 全量迁移 — 概览、评分管理、关联查询、数据同步、外观、设置等所有标签页已替换为 `t()` 调用
- **Content script**: NeoDB 推送按钮、Toast 通知、状态标签等注入 DOM 元素使用 `t()` 调用统一本地化
- **共享组件**: HeatmapCalendar（活跃度热力图）、PlatformDistribution（平台分布）使用 `t()` 调用
- **语言切换**: 外观设置新增语言选项（简体中文/繁體中文/English），切换后即时生效

### Added
- **每日详情平台名称**: 标签宽度从 48px 扩展至 80px，防止英文平台名（Sehuatang/IMDb 等）被进度条遮挡
- **热力图悬浮提示**: 热力方块悬浮时显示日期和活动条数 Tooltip 提示
- **热力图颜色图例**: 右下角新增「少 ↔ 多」渐变色阶示例条

### Fixed
- **活跃度计算**: 使用平方根曲线（`sqrt(count/max)`）替代线性映射，避免峰值日压制日常微小活动，层次更分明
- **活跃度色彩**: 暗色模式起点亮度提升至 29%、亮色模式起点设为柔和 82%，每级均匀步进，深浅度更易辨识
- **平台统计缺失**: JavDB/色花堂等成人视频数据现纳入概览页「平台分布」和「每日详情」统计
- **类型标签显示**: 平台卡片内的媒体类型（电影/剧集/音乐/书籍/成人视频）由原始 code 改为本地化显示名称
- **跨标签数据一致**: 多标签页下语言切换/配置修改现自动同步至所有打开的选项和弹出页
  - 使用 `useLocaleSync` composable 通过 `useI18n().locale.value` 模式保持响应式链完整
  - Content script 新增 `startLocaleSync()` 监听语言变更
  - SettingsTab/WebDAVTab 使用 `chrome.storage.onChanged` 同步配置，`syncingFromStorage` 防止重复写入

### Changed
- **License**: 项目许可证从 MIT 切换为 Apache-2.0 ([LICENSE](LICENSE))

### Docs
- **README**: 修正项目名称展开为 UM Multimedia Manager（UM 即 UnforgetMemory），之前误写为 "Unified" / "Universal"
- **README**: 添加项目 Logo，优化布局与排版，统一双语文档风格
- **README**: 添加中英文 README 之间的语言切换导航链接，支持一键切换语言

## [3.3.0] - 2026-06-15

### Architecture
- **Pinia 状态管理层**: 新增 3 个 Pinia stores (`theme`, `app`, `confirm`)，替代模块级 reactive 单例，状态变更可追踪
- **依赖全量更新**: vue 3.5.38, vue-router 5.1.0, pinia 3.0.4, reka-ui 2.9.10 等 15 个包升级至最新稳定版
  - 移除废依赖 `@crxjs/vite-plugin`
- **@vueuse/core 集成**: `useThemeStore` 使用 `useStorage` / `useMediaQuery` 替代手写 localStorage/matchMedia

### Composables
- **useStats**: 提取 OverviewTab + DashboardPage 共用的统计分类计算逻辑
- **usePlatformMeta**: 平台名称标签/色相映射表，统一管理和复用
- **useRecordLoader**: 消息通信加载逻辑（已整合入 `useAppStore`）

### Components
- **StatCard**: 统计卡片通用组件，替代 DashboardPage + OverviewTab 中 8 处内联卡片
- **HeatmapCalendar**: 90 天活跃度热力图组件
- **PlatformDistribution**: 平台分布详情列表组件

### Refactoring
- **OverviewTab**: 601 → 380 行，使用 stores + composables + 组件替代内联代码
- **Popup App.vue**: 67 → 10 行，内联主题逻辑统一由 `useThemeStore` 管理
- **DashboardPage**: 内联数据加载迁移至 `useAppStore`，统计卡片使用 `StatCard`
- **ConfirmDialog**: 使用 `useConfirmStore` 替代 `useConfirmDialog.ts`
- **Content script 状态观察者**: `startRatingObserver` 独立至 `observers/rating.ts`
- **豆瓣详情页处理器拆分**: `handlers/douban.ts` 1243 → 189 行，拆分为 5 个聚焦文件：
  - `douban-scanner.ts` (页面扫描), `douban-sync.ts` (保存同步), `douban-neodb.ts` (NeoDB 推送), `douban-toast.ts` (通知), `douban.ts` (入口)
- **清除废弃代码**: 移除 `handleDoubanDetailPage`、`waitForElement`、`renderDoubanStatusChip` 等已替换的过期函数

### Security
- **XSS 防护**: 所有 `innerHTML` 写入使用 `escapeHtml()` + `textContent`，无注入风险
- **`.gitignore` 加固**: 新增 `*.tsbuildinfo` 模式，覆盖 TypeScript 增量构建产物

### Fixed
- **Pinia store 解包兼容**: `useStats` 改用 getter 函数模式，避免 Pinia 自动解包 ref 导致 `TypeError: not iterable`
- **Unicode 转义修复**: 替换 `.vue` 模板中所有 `\uXXXX` 转义序列为实际中文字符
- **Options 页侧边栏精简**: 移除重复的页脚和标签页标题，修复 `LinkedTab.vue` 缺失的 `Input`/`Label` 导入

### Removed
- 临时 jav_ids 导入入口
- 各处重复的 `showPageToast` 函数
- `<all_urls>` 过度权限

## [3.2.0] - 2026-06-14

### Added
- **jav_ids 体系支持**: 评分管理、关联查询全面支持成人视频 ID 体系
  - 新增"成人视频"平台选项，支持 JavDB、色花堂、本地来源
  - jav_id 格式自动识别（FC2-PPV-1234567, ABP-123 等），支持 -UC/-C/-U 后缀
  - 评分管理：查询、评分、保存支持 jav_ids 存储
  - 关联查询：查询 jav_ids 独立存储记录
  - 概览统计：支持 local 源标签显示为"本地"
- **Toast 通知系统**: 新增 `useToast` composable + `ToastContainer` 全局组件
  - 选项页内所有操作反馈（配置保存、WebDAV 同步、导入导出等）使用统一通知
  - 平滑淡入淡出动画，自动消失（3s）
- **统一确认对话框**: 新增 `ConfirmDialog` 全局组件
  - 选项页内所有危险操作（导入数据、云端覆盖等）显示风格统一的确认框
- **导出/导入支持 jav_ids**: 导出包含 jav_ids 存储，导入恢复 jav_ids 数据
- **WebDAV 同步支持 jav_ids**: 同步元数据包含 jav_ids 存储
- **host_permissions 扩展**: 添加坚果云等常见 WebDAV 服务器权限
- **数字等宽显示**: 添加 `.tabular-nums` 类，统计数据数字对齐优化

### Fixed
- **安全审计修复**:
  - 添加 sender ID 校验（content.ts, event-bus.ts）
  - 添加 DB store 名称白名单校验（DB_GET_WATCHED_IDS, DB_SYNC_PAGE_RECORD）
  - 添加 toast 类型白名单校验
  - 修复 linked platform 验证使用 return 而非 break 的问题
  - 移除 `<all_urls>` 权限，WebDAV 改用具体域名 + HTTPS
- **查询状态管理**:
  - 评分管理：添加 `hasQueryed` 标记，消除"未找到"闪烁
  - 关联查询：添加 `hasQueryed` 标记，消除"未找到"闪烁
  - 统一防抖逻辑 `debouncedQuery()`，防止查询重入
  - 平台/类型/来源切换时自动触发重新查询
- **UI 动画优化**:
  - 评分管理：查询状态使用 `<Transition>` 平滑过渡
  - 关联查询：查询状态使用 `<Transition>` 平滑过渡
  - 修复下拉菜单按钮 label 闪烁问题（添加全局动画 CSS 类）
- **CSS 动画合规**:
  - 添加 `@keyframes umm-enter/umm-exit` 动画定义
  - 添加 `animate-in/out`、`fade-in/out`、`zoom-in/out` 等工具类
  - 修复 `@keyframes` 命名冲突（添加 `umm-` 前缀）

### Changed
- **代码质量优化**:
  - 提取共享 `auto-detect.ts` 模块，统一自动检测逻辑
  - 使用 `useToast` 替代各处重复的 `showPageToast`
  - 移除 `Badge`、`Alert` 等未使用导入
  - `VALID_TOAST_TYPES` 提升到模块作用域
  - `ConfirmDialog` 图标类型标注
  - Reka-ui 触发器排除全局主题过渡
- **配置优化**:
  - `.gitignore` 补充 `.env.*` 变体、包管理器配置、构建产物等规则
  - WebDAV host_permissions 限制为 HTTPS 仅
- **导出功能**: jav_ids 空存储时不在导出中包含（节省空间）

### Removed
- 临时 jav_ids 导入入口
- 各处重复的 `showPageToast` 函数
- `<all_urls>` 过度权限

## [3.1.0] - 2026-06-12

### Fixed
- 选项页独立配置页面侧边栏精简：移除冗余 footer 和 tab 标题
- 关联查询 LinkedTab 缺少 Input/Label 组件导入

[3.4.0]: https://github.com/UnforgetMemory/um-multimedia-manager/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/UnforgetMemory/um-multimedia-manager/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/UnforgetMemory/um-multimedia-manager/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/UnforgetMemory/um-multimedia-manager/compare/v3.0.0...v3.1.0
