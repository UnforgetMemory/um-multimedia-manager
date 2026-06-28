# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.2.1] - 2026-06-28

### Added
- **统一模板注入框架 UmmPageLayout**: 创建 defineComponent 布局组件，header (UmmDynamicIsland) + content (slot) + footer (slot) 三明治结构，page-layout.css 共享布局样式
- **UmmRating 统一评分组件**: defineComponent 渲染分数+金色分段 (5+/7+/8+ 三级 gold low/mid/high)，适配亮暗主题
- **UmmMediaRow 首页媒体行组件**: 封装 UmmScrollRow + UmmMediaCard + record 查找，消除 3 处重复 App.vue 模板
- **useDoubanSection 通用工厂**: 替代 3 个 composable 的 ref/parse/watch 重复模式
- **UmmSearchCard 搜索结果卡片组件**: 多行标题 (2-line clamp)、cover hover 缩放、左边条视觉增强
- **UmmSearchFilter 搜索结果筛选器**: ALL/电影/剧集三档切换，基于豆瓣 labels 元数据判断类型，右侧结果计数显示
- **搜索结果卡片重构**: cover 100×140px、视觉层级 (title→rating→meta→cast 渐进淡化)、gap 8px 间距
- **Cover hover 动画统一优化**: 全线使用 cubic-bezier(0.22, 0.61, 0.36, 1) + will-change + backface-visibility，修复搜索页/详情页 transition 错放 :hover 导致鼠标离开瞬间回弹
- **12级断点自适应**: .umm-status--inline/--small font-size 从固定 px 改为 var(--umm-font-xs)
- **统一滚动条美化**: :host::-webkit-scrollbar 6px 圆角细条，Chrome+Firefox 双浏览器覆盖

### Changed
- **首页组件化**: App.vue 从 4 个独立 UmmScrollRow→3 行 UmmMediaRow，删除 3 个旧 composable
- **搜索结果组件化**: App.vue 删除内联模板，改用 UmmSearchCard + UmmSearchFilter
- **详情页图片 hover**: 修复海报/影人/剧照/推荐图片 CSS 选择器（旧 .umm-*-img→实际 .umm-image-img）
- **首页评分**: 移除 UmmMediaCard 的 starNum 计算 + ★ 渲染，统一使用 UmmRating
- **首页 Rank 增强**: billboard 金银铜牌勋章圈 + 渐变 + 辉光 + 左边色条

### Fixed
- **Cover hover 动画瞬间回弹**: transition 属性从 :hover 块移至基态，确保进出双向平滑
- **搜索结果筛选无效**: isTvItem 从抽象启发式改为直接检查豆瓣 labels 元数据 (.text === '剧集')

### Removed
- **useDoubanScreeningItems / useDoubanBillboard / useDoubanHotSection**: 被 useDoubanSection 工厂替代
- **UmmMediaCard 冗余 UmmImageWrapper 内联封装**: 改用共享组件导入

### Added
- **共享 UI 组件系统**：创建 4 个可复用组件，消除 Options 页面重复渲染模式
  - `OptionPicker`：提取 AppearanceTab 主题/语言 3 列按钮网格
  - `PlatformSearchForm`：提取 RatingTab/LinkedTab 重复搜索表单（4字段 Select + Input）
  - `SettingRow`：提取设置项 label+control 水平布局
  - `SkeletonLoader`：统一 App.vue/SyncTab 加载骨架屏

### Fixed
- **Options 页面 Switch 开关不响应**：reka-ui v2 SwitchRoot 改用 `modelValue/update:modelValue`，SettingsTab 绑定改为 `v-model`
- **Options 页面内容无法渲染**：移除 `<Transition mode="out-in">` 包裹 `<Suspense>`（Vue 3 不兼容）
- **CardContent 缺少 padding-top**：`px-6 pb-6` → `p-[var(--umm-card-padding)]`，四边统一流体间距
- **CardHeader 固定间距**：`p-6 pb-4` → `p-[var(--umm-card-padding)] pb-4`
- **豆瓣注入元素主题实时同步**：`applyOverlayTheme` 同时更新 `data-theme` 和 `umm-theme--*` CSS 类
- **Options 统计图颜色硬编码**：`barColor`/`platformColor` 从 JS `isDark` 检测改为 CSS 变量驱动
- **WebDAV 跨标签同步**：`chrome.storage.onChanged` 改用 `changes.newValue` 直接读取
- **Export 数据字段不完整**：`handleExportData` 导出全部 12 个 AppSettings 字段

### Changed
- **网格间距优化**：StatsGrid/Weekly 统计卡片 grid gap 从 `12px` 扩大为流体 `var(--umm-section-gap)`（16-56px自适应）
- **`:root` 补充 surface 颜色**：`--umm-color-surface-*` 亮色值补全（之前只在 `.dark` 有定义）
- **Options 各项 inline style**：统一为 Tailwind class（`umm:mb-3`, `umm:gap-2` 等）
- **`.gitignore`**：新增 `coverage/`、`*.crswap` 等模式

### Security
- **热力阴影硬编码 rgba**：`box-shadow` 改用 `hsl(var(--foreground) / 0.2)` 适应双主题
- **bar chart 样式**：CSS 变量 `--umm-bar-base-s/l`、`--umm-bar-platform-l` 在 `:root`/`.dark` 双定义

### 豆瓣注入体系统一：6个独立 WXT entrypoint 合并为2个薄层入口点 (`douban-early` / `douban-main`)，全部逻辑迁移到 `src/content/douban/`
  - `early.ts`：3个 early overlay 合并为 URL 路由的工厂函数
  - `main.ts`：3个 idle 入口合并为 URL 路由工厂，动态导入 page 模块
  - `UmmImageWrapper` / `UmmStatusBadgeWrapper` 提取到 `components/`，消除搜索/详情页重复 defineComponent
- **模板统一系统**：创建函数式模板构造架构，消除3个豆瓣入口点的重复代码
  - 共享 `UmmImage` 组件 (defineComponent + shimmer 覆盖式 loading，修复 `display:none` 导致 lazy 加载死锁)
  - 共享 `UmmStatusBadge` 组件 (纯渲染函数，无 computed 开销，三态 done/none/wish + 3种变体)
  - 共享 `mountUmmOverlay` 工厂函数 (beforeMount→createApp→afterMount 生命周期编排)
  - 共享 `composeStyles` CSS 组合工具
  - 共享 `douban-theme.css` (:host变量源) + `douban-common.css` (shimmer/status badge 样式)
  - 共享 `useStatus` composable (MaybeRefOrGetter 适配)
- **灵动岛统一**：`UmmDynamicIsland` 提取为跨三页共享组件，新增 `newTab`/`type`/`initialQuery` props
  - 搜索页：`newTab=false` 同标签导航；详情/首页：`newTab=true` 新标签
- **数据链路 v4：DataScheduler 调度中心** — 请求优先级队列 + 令牌桶限流 + 指数退避重试
  - `src/features/data-scheduler/`: PriorityQueue (HIGH/MEDIUM/LOW 三级)、RateLimiter (token bucket + timestamp refill)、RetryPolicy (exponential backoff + jitter)、SchedulerMonitor (P50/P95/P99 + 错误率 + 缓存命中率)
  - DataScheduler 编排器：缓存检查 → 限流 → 排队 → [重试循环] → 监控事件
  - 集成到 background.ts：所有 DB 消息通过 scheduler.schedule() 执行
- **多级缓存系统 CacheManager** — L1 (LruCache LRU 内存) + L2 (TtlCacheStore IndexedDB 持久层)
  - `src/features/cache/`: LruCache (可配 maxSize/TTL、deleteByPrefix)、TtlCacheStore (DbAdapter 接口)
  - 替换 MediaDatabase.readCache (Map → LruCache 500条 LRU 淘汰)
  - 替换 DataScheduler 内部缓存 (Map → CacheManager DI 注入)
- **查询优化层** — `query-utils.ts`: queryPage (limit/offset cursor pagination)、batchGet (单事务批量读取)
- **乐观锁 OptimisticLock** — 版本式写冲突检测，StoreRecord 新增 recordVersion 字段，put() 自动版本递增，optimisticPut() 条件写入
- **性能优化工具** — MemoryManager (Observer/Listener/Timer 生命周期管理)、Memoizer (计算结果记忆化缓存)
- **批量 ADULT_AV_CHECK_BATCH** — 一次性批量查询番号，避免并发消息超时
- **ADULT_AV_CHECK 跨源扫描** — 超出已知 sources 时游标扫描全 store 匹配任意 source
- **导入错误诊断增强** — BOM 剥离、JSON 前80字符预览、响应结果校验

### Fixed
- **vue-i18n SyntaxError: 9** — 双花括号 `{{level}}`/`{{count}}` 被 vue-i18n 解析为嵌套占位符触发 `NOT_ALLOW_NEST_PLACEHOLDER` (错误码 9)，改为单花括号
- **Toast 背景色丢失** — `@theme` 中 `--umm-color-state-*` 改为 `--color-state-*`，Tailwind 正确生成 `umm:bg-state-*`
- **图片加载死锁**：UmmImage 从 FunctionalComponent 改为 defineComponent，`loading="lazy"` + `display:none` 导致浏览器不触发加载
- **UmmStatusBadge**：移除 FunctionalComponent 内的 `computed` 误用
- **Dark 主题变量**：`--umm-text-muted`/`--umm-text-secondary` 暗色值交换
- **Promise 拒绝**：`mountUmmOverlay.finalize()` 添加 `.catch()`
- **CSS 组合**：`composeStyles` 每 chunk 尾部添加换行，防止注释粘连
- **搜索页重复搜索栏**：移除 `enhanceSearchPageSearch()` 调用，消除与 Vue App 重复注入
- **详情页灵动岛边距**：`.umm-detail-root` padding-top 0 → 16px
- **Wrapper 组件 props 类型**：从 loose array props 改为带类型声明的 props 对象
- **safeSendMessage null 处理** — AdultAvStore.has() 添加 try/catch

### Changed
- 共享组件和 CSS 集中到 `src/entrypoints/content/shared/`，3个入口点统一引用
- **CSS 变量集中化**：`--umm-island-*` 系列变量从 homepage.css/detail.css 迁移到 theme.css
- **CSS 去重**：删除 detail.css 中 `.umm-pill-wrap`/`.umm-search-bar` 等残留样式
- **构建优化**：`douban-main.js` 215→209 kB；`content.js` 168→162 kB
- `database/models.ts` — put() 自动 recordVersion、新增 optimisticPut()/queryPage()/batchGet()
- `data-scheduler/data-scheduler.ts` — CacheManager 构造函数注入
- `background.ts` — 注入 CacheManager/DataScheduler、新增 ADULT_AV_CHECK_BATCH 路由
- `locales/*.ts` — 统一单花括号占位符格式

### Removed
- 6个旧 Douban 入口点目录 (`douban-homepage-overlay.content/`, `douban-search-overlay.content/`, `douban-detail-early.content/`, `douban-homepage.content/`, `douban-search.content/`, `douban-detail.content/`)
- `entrypoints/content/shared/` 目录

### Security
- 全面审查 XSS/CSS 注入/数据流：DOMPurify 验证、搜索桥接安全性确认、Shadow DOM 隔离
- javdb.ts: textContent 替代 innerHTML，AdultAvStore 异常安全返回 false

### Fixed
- **热力图溢出**：修复活跃度热力图方块在 hover 放大时向上溢出被裁剪的问题
- **Tooltip 残留**：优化 tooltip 防抖配置，快速移动鼠标时不再出现残留轨迹
- **Tooltip 暂停**：移除关闭动画，消除 tooltip 关闭时的视觉暂停

### Changed
- Title card layout: horizontal title + original name + year row, responsive stack on small screens
- Rating card redesign: larger score (42px), focal score section, better bar design, `border-top` separator
- Status chip moved from actions area to top of title block
- Poster URL: `s_ratio_poster` → `xl` for high-resolution images
- Celebrity card: circular avatars → 2:3 portrait rectangles
- Search navigation uses `location.href` (same-tab) instead of `window.open` (new tab)

### Added
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

### Security
- XSS prevention: DOMPurify integrated for all `v-html` usage
- Tabnabbing prevention: `rel="noopener noreferrer"` added to all `target="_blank"` links
- Dead code cleanup: Removed unused `vue-sonner` and `gsap` dependencies

## [4.1.0] - 2026-06-25

### Added
- Unified design system with Tailwind CSS v4 `prefix(umm)` configuration (v4 variant-style prefix)
- Design tokens consolidated in `src/style.css` `@theme` block (merged from `design-tokens.css` and `typography.css`)
- 13-level responsive breakpoint system (320px to 3200px) with 3K (2880px) support
- Fluid typography using `clamp()` for all text sizes
- `src/shared/` module for unified exports (utils, composables, stores, types)
- `scripts/add-umm-prefix.js` automation for adding `umm:` prefix to Tailwind classes

### Changed
- All shadcn/vue components now use `umm:` prefixed Tailwind classes (126 files updated)
- Options page and popup components updated with `umm:` prefix
- Custom components (HeatmapCalendar, PlatformDistribution, ToastContainer, StatCard, ConfirmDialog) updated with `umm:` prefix
- Variant files (index.ts) for Button, Badge, Alert, Toggle, Sheet, NavigationMenu, Avatar updated with `umm:` prefix
- `handleDoubanDetailPage` simplified from 1994→30 lines — overlay handles UI, handler does background sync only

### Fixed
- Tailwind CSS v4 prefix format: changed from `umm-` (v3 style) to `umm:` (v4 variant style)
- `data-[state=on]:` prefixed classes now correctly skip shadcn token classes
- Nested parentheses in `cn()` calls (e.g., `[&:has([role=checkbox])]`) now handled correctly
- Multi-line `:class="cn(...)"` bindings now processed correctly
- `size-*` Tailwind utility classes now receive `umm:` prefix
- `border-b` (without number suffix) now correctly identified as Tailwind utility

### Removed
- `src/styles/design-tokens.css` (merged into `src/style.css`)
- `src/styles/typography.css` (merged into `src/style.css`)
- `src/utils/theme.ts` (consolidated into `src/shared/`)
- Debug toggle (`Shift+\``) for showing/hiding overlay to inspect original page
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
