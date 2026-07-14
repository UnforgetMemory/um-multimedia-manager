# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Features

- **Bilibili 首页瀑布流注入**: 新增 `bilibili-homepage.content` 入口点，在首页和搜索结果页视频卡片上注入 UMM 状态标签
  - 状态显示：所有卡片默认显示"未看"，根据 DB 记录自动更新为 想看/已看/在看
  - 已看淡化：已标记视频卡片自动降低透明度 + 灰度，hover 恢复
  - 评分展示：status=2 时 badge 显示"已看 N"评分
  - 搜索页适配：`search.bilibili.com` 搜索结果页同样支持
  - 动态加载：MutationObserver 监听无限滚动加载的新卡片

### Fixes

- **Bilibili 详情页保存**: 增加 `saveRecord` 回调检查，确保保存操作可追踪错误
- **Options 总览缺 B站统计**: OverviewTab StatsGrid 中 `statKeys`/`statIcons`/`statLabels` 三数组同步追加 `bilibili` 条目，使 Options 总览正确显示 B站视频统计卡片（与 Popup DashboardPage 一致）

### Changed

- **wxt.config.ts**: 添加 `*://www.bilibili.com/*` 和 `*://search.bilibili.com/*` 到 `host_permissions`

### Performance

- **Mukaku 链路优化**: 手术级性能与内存优化
  - 添加 handler 级 `watchedIdCache`（30s TTL），消除重复 `dbGetAll` 调用（减少 ~90%）
  - `probeCache` 添加 LRU 上限（500 条），消除内存泄漏
  - 批量读取 watched/unwatched 集合，替代逐卡片 2N 次 IndexedDB roundtrip
  - IntersectionObserver 替代全 document MutationObserver，降低 CPU 占用
  - Toast 更新改用 `requestAnimationFrame`，简化节流机制
  - `ensureQueue` totalCount 每批次准确重置

### Fixes

- **Bilibili 平台分布**: 修复 Options 平台分布中 Bilibili 记录类型异常
  - `handleGetAllRecords` 统一 Bilibili 记录 type 为 `video`（兼容遗留 bvid/movie 前缀）
  - `OverviewTab` 添加视图层 Bilibili type 安全网归一化
- **热力图色阶**: 修复活动度热力图颜色计算
  - 改用 `log2` 对数压缩替代 `sqrt` 平方根，避免大 maxDaily 时低值全部坍缩到 level 1

## [5.0.0] - 2026-07-14

### Features

- **Bilibili 集成**: 全新 WXT 内容脚本入口点 (`bilibili.content`)，在 Bilibili 视频详情页注入悬浮按钮 + 评分弹窗
  - 状态跟踪：未看 / 想看 / 在看 / 已看 循环切换
  - 评分输入：0-10 分，仅"已看"状态可评
  - 深浅主题适配：MutationObserver 监听 `html[data-theme]` + `prefers-color-scheme`
  - SPA 导航适应：pushState/replaceState 拦截 + 3s 轮询兜底，自动跟随视频切换
  - 风格统一：`data-umm-bili-*` 属性前缀，hover/active 动效，状态色光阴影
- **Bilibili 平台支持**: 全线管理页面集成 B站
  - Options 评分管理：URL 自动识别 + BV 号验证（`BV[a-zA-Z0-9]+`）
  - Options 关联管理：URL/BV ID 自动检测 + 跨平台关联
  - Popup 统计看板：B站 计数卡片
  - 后台统计聚合：GET_STATISTICS / GET_ALL_RECORDS 含 bilibili 数据
- **新增 Domain 类型**: `video`（视频），用于 Bilibili 等纯视频平台
- **自动检测平台切换**: 输入 bilibili URL 或 BV 号自动切换到 B站 平台

### Architecture

- **Bilibili 链路重构**: 死代码清理 + WXT 规范化
  - 删除 `icons/bilibili-float.js`（旧版 raw JS，放在 icons/ 目录）
  - 删除 `src/entrypoints/content/handlers/bilibili.ts`（无引用的死代码）
  - 移除 wxt.config.ts 手动 content_scripts，WXT 自动发现 entrypoint
  - 数据 KEY 格式统一：`video::BVID` 替代裸 `BVID`
- **样式模板化**: 提取 `s*()` 函数模板（sBtnFloat, sBadge, sCard 等 10+ 模板）
- **主题观察器**: `startThemeWatch()` + `applyModalTheme()` 实时响应主题变化

### i18n

- 新增 `platform.bilibili` 键（zh-CN/zh-TW: B站, en: Bilibili）
- 新增 `stats.bilibili` 键（Bilibili 统计标签）
- 新增 `stats.video` 键（视频类型标签）
- 总 keys: 180 (3 locales, 100% 覆盖)

### Chores

- Version bump 4.13.3 → 5.0.0
- npm audit 审计：9 项漏洞（全部在构建工具链，非运行时依赖）
- Gitignore 审计：已全覆盖
- 测试目录审计：tests/ 7 个单元测试文件，无过期产物

## [4.13.3] - 2026-07-12

### Architecture

- **Identity 系统合并**: `shared/identity.ts` 消除 URL 解析重复逻辑，委托给 `domain/identity/Identity.ts`，代码缩减 71%（-272 行）
- **CSS token 对齐**: `design-tokens.css` 颜色值与 `style.css` 同步（light/dark 双模式），间距从 px 统一为 rem
- **死代码清理**: 删除 `enhancers/douban-search-bar.ts`（无引用）
- **导入路径规范化**: 8 个文件从 `@/features/identity` 迁移至 `@/shared/identity`
- **脚本修复**: `add-umm-prefix.js` 硬编码绝对路径改为动态路径

### Documentation

- **README.md 重写**: 更新至 4.13.2 架构，Mermaid 架构图，完整项目结构
- **README.en.md 重写**: 英文版同步更新
- **AGENTS.md 重写**: 全面架构文档，包含所有入口点、域层、CSS 三系统、消息类型等

### Chores

- Version bump 4.13.2 → 4.13.3
- 架构审计报告 6 份写入 `docs/audit/`

## [4.13.2] - 2026-07-12

### Fixed

- **Mukaku 已看判断误将"想看"(status=1)视为"已看"**: `getIdSet()` 使用 `record.status >= 1` 筛选，将 wishlist 记录错误归入已看集合，导致非已看视频在 Mukaku 页面被标记为已看并置灰
  - `mukaku.ts`: `getIdSet()` 过滤条件 `>= 1` → `>= 2`，对齐 DB 层 `getWatchedIds()` 定义

### Chores

- Version bump 4.13.1 → 4.13.2
- 清理迁移残留的空目录 (`entrypoints/`)
- `.gitignore` 补充遗漏的临时目录模式

## [4.13.1] - 2026-07-12

### Fixed

- **NeoDB 同步后本地记录未保存**: 手动/自动 NeoDB 推送成功后，当 `linkedIds.neodb` 未变化或 status 与已有记录一致时，douban record 的 `Store.dbPut` 被条件跳过，导致 `updatedAt` 从不刷新、记录状态停滞
  - `sync-neodb.ts`: 推送后无条件保存 douban record + 刷新 `updatedAt`；neodb record 的 `updatedAt` 始终刷新
  - `douban-neodb.ts`: 移除 `linkedIds.neodb` 变化判断，推送后始终保存 douban record
  - `neodb-push.ts`: 推送后刷新 douban record 的 `updatedAt` 和 neodb record 的 status/rating/updatedAt
  - `useCrossPlatformSync.ts`: 推送后刷新 douban record 的 `updatedAt`

## [4.13.0] - 2026-07-11

### Added
- **豆瓣游戏探索页深度适配**: 新增 `www.douban.com/game/explore` 页面完整注入
  - 页面类型 `game-explore` → `url-detector.ts` / `early.ts` / `main.ts` / `css-composer.ts` / `css-map.ts`
  - 数据提取: `GlobalData` JS 对象解析（支持 key-by-key 赋值格式） + DOM 回退（items/filters/sorter）
  - 筛选栏: 类型/平台两组 chip 按钮，选中态根据当前 URL 参数动态映射，点击 toggle 选中/取消
  - 排序: 评分/按时间排序，`currentSort` 直接读 URL `?sort=` 参数
  - 游戏卡片: 单列列表，封面+标题+内联状态徽章（玩过/想玩/在玩）+类型/platform chips+评分+短评
  - 加载更多: `GET /j/ilmen/game/search?more=N` 游标分页，总结果数精确显示
  - 灵动岛: 新增"游戏"导航入口，游戏搜索使用 `?q=` 参数同站导航（保留当前 filter/sort）
- **豆瓣游戏详情页标记状态增强**: `scanDoubanPageStatus()` / `GameDetailData.ts` 使用精确匹配 `我玩过`/`我想玩`/`我最近在玩` 而非子串
- **游戏页搜索框预填**: 从 URL `?q=` 直接读取初始搜索关键词

### Added
- **豆瓣游戏详情页深度适配**: 新增 `www.douban.com/game/{id}` 页面完整注入，沿用电影详情页风格
  - Vue 覆盖层: 封面海报、评分卡片(分布条)、元数据(类型/平台/开发商等)、简介、媒体画廊(视频+图片16:9)、推荐网格(含UmmMediaCard+DB状态) 和 热门短评(含游戏平台标签)
  - 列表转芯片: 类型/开发商/发行商等多值字段自动分割为 `umm-meta-chip`
  - 收藏状态: 玩过/想玩/在玩 通过 UmmInterestBar 按钮状态显示，短评支持从 DOM 回退提取
- **添加到豆列**: `DOULIST_CAT_MAP`/`LABEL_MAP` 新增 `game` 类型，Vue 模板添加 `.umm-dl-trigger` 按钮
- **全链路数据同步**: `router.ts` + `content.ts` 添加游戏URL匹配，`fullInit()` 覆盖游戏页；`scanDoubanPageStatus()` 扩展 `.collection-section` DOM 扫描；`extractCommentFromPage()` 增加游戏页 `.collection-comment` 提取
- **身份标识/组件体系**: `Identity.fromUrl()` 解析 `www.douban.com/game/{id}`；`UmmStatusBadge` 新增 `game` 类型({已玩,想玩,未玩,在玩})；`UmmDynamicIsland`/`UmmMediaCard`/`UmmPageLayout`/`UmmStatusBadgeWrapper` props 支持 `'game'`

### Fixed
- **游戏详情页子路径误匹配**: 视频/图片/评论等 `/game/{id}/XXXX` 子页面不再触发详情注入 — `isGameDetailPage()`/路由匹配/content.ts 全面加 `\/?$` 结尾约束
- **NeoDB/cross-platform 异步链路**: `App.vue onMounted` 调用 `fetchInterest()` 后注入 NeoDB 按钮；`onCrossPlatformSave` 完整执行跨平台同步+NeoDB推送
- **NeoDB 自动同步评分保护**: 已有本地 NeoDB 记录且 status 相同时，`syncNeoDBRecord()` 将 `pageRating` 设为 0 使 API 跳过评分更新（`markItem` 中 `rating_grade` 仅在 `rating > 0` 时发送），保护用户手动设置的精确评分（NeoDB 支持 0.5 分跨度）
- **NeoDB 自动同步重复记录防护**: `syncNeoDBRecord()` 中 `linkedIds.neodb` 新增 guard（仅不同时写入），`neodbKey` 优先使用已有 `linkedIds.neodb` 防止 API 返回不同 UUID 时创建重复记录
- **NeoDB 手动推送本地记录未同步**: `performNeoDBPush()` 更新已有 NeoDB 记录时补全 `status`/`rating`/`updatedAt` 同步（之前仅更新 `linkedIds`）
- **NeoDB 自动同步本地记录未同步**: `syncNeoDBRecord()` 更新已有 NeoDB 记录时补全 status 变化时的 `status`/`rating`/`updatedAt` 同步（之前仅更新 `linkedIds`）

### Chore
- codereview 通过：Shadow DOM 隔离、`credentials: include` API 调用、textContent/innerHTML 只读提取
- 安全审计通过：纯 DOM 提取 + Vue 模板插值，无 XSS/注入风险；Content Script Shadow DOM 隔离避免样式污染
- `.gitignore` 补充 AI 辅助目录、MCP 配置等 11 条模式
- 清理 `test-results/` 运行产物
- type-check + build 通过
- 63 项单元测试全部通过
- 新增 `performNeoDBPush` 写入后立即读回验证日志

### Added
- **豆瓣读书书评主页适配**: 新增 `book.douban.com/people/{uid}/reviews` 页面类型 `book-reviews`，覆盖用户书评列表的封面、标题、评分、内容预览、阅读统计、分页
- **豆瓣读书书评详情页适配**: 新增 `book.douban.com/review/{id}/` 页面类型 `book-review-detail`，覆盖书评正文、作者栏、评分、侧边栏书籍信息(作者/出版/页数)、阅读统计
- **豆瓣读书收藏页适配**: 新增 `book.douban.com/people/{uid}/{collect|wish|do}` 页面类型 `book-collect`，覆盖读过/想读/在读三种状态的书籍网格、排序、分页
- **豆瓣读书收藏作者页适配**: 新增 `book.douban.com/people/{uid}/authors` 页面类型 `book-authors`，覆盖作者头像、身份、作品网格
- `isBookUserReviewsPage()` / `isBookReviewDetailPage()` / `isBookCollectPage()` / `isBookAuthorsPage()` URL 检测 + PageType 联合类型
- `pages/book-reviews/`, `pages/book-review-detail/`, `pages/book-collect/`, `pages/book-authors/` 四个模块
- `styles/book-reviews.css`, `book-review-detail.css`, `book-collect.css`, `book-authors.css` Shadow DOM 样式
- 共享 CSS 安全网: `userbar.css` (UmmUserBar 样式 Shadow DOM 副本), `paginator.css` (UmmPaginator 样式 Shadow DOM 副本)

### Fixed
- **Shadow DOM scoped CSS 失效**: Vue 3 scoped CSS 在 `cssInjectionMode:manual` 下不会被注入 Shadow DOM；创建共享 `userbar.css`/`paginator.css` ?raw 导入作为安全网，覆盖所有使用 UmmUserBar/UmmPaginator 的 7 个页面类型
- **书评列表标题提取错误**: `querySelector('.nlst h3 a[href*="/review/"]')` 会匹配展开箭头链接，改为 `.nlst h3 > a` 直接子元素选择器
- **设置页 body 样式被覆盖**: `overlay.css` 的 `html { background }` 通过模块级静态导入对所有 book.douban.com 页面生效；添加 `excludeMatches: ['*://*.douban.com/settings/*']` 从 manifest 级排除
- **分页导航安全加固**: `book-collect`/`book-authors` 的 `onPageChange()` 增加 `isSafeDoubanUrl()` 域名校验，防止 open redirect

### Chore
- codereview 通过：无 Critical 问题，5 个 Warning 已记录
- 安全审计通过：全部 textContent 提取，v-html 仅限星号转换，CSP 合规
- .gitignore 复核通过：127 行覆盖完整，无遗漏
- type-check + build 通过
- 22 个新增文件添加简洁英文注释
- `isBookUserProfile()` URL 检测 / `PageType` 联合类型 / `detectPageType()` 入口
- `pages/book-profile/` 模块 (types/data/config/App.vue)
- `styles/book-profile.css` Shadow DOM 样式 (StatBar override + Profile Nav + Author Grid + Timeline)

### Fixed
- **豆瓣图书详情页目录提取不完整**: `extractTOC()` 增加 `_full` / `.all` 三层回退策略，优先读取隐藏的完整目录 DOM 而非截断版本；同时过滤 `(更多)`/`(收起)` 等截断标记文本
- **Shadow DOM StatBar 样式缺失**: `book-profile.css` 补全 `umm-statbar-item`/`val`/`lbl`/`--clickable` 覆盖层

### Chore
- codereview 通过：`rel="noopener noreferrer"` 补全、冗余 DOM 查询移除
- 安全审计通过：纯 DOM 提取 + Vue 模板插值，无 XSS/注入风险
- type-check + build 通过
- 63 项单元测试全部通过
- `.gitignore` 复核通过

### Added
- **领域模型层**: 新建 `src/domain/` 目录，10 个领域实体 (Identity, StoreRecord, Platform, MediaType, Status, Rating) + 仓储接口 + 领域服务
- **领域模型层**: 新建 `src/domain/` 目录，10 个领域实体 (Identity, StoreRecord, Platform, MediaType, Status, Rating) + 仓储接口 + 领域服务
- **CSS 设计 Token 系统**: 新建 `design-tokens.css`，统一 HSL 色彩体系，浅色/深色双主题覆盖
- **PageMountFactory 模板化**: `definePageMount()` 工厂函数消除 19 个重复 mount 函数，`main.ts` 656→84 行
- **页面配置化**: 20 个 `pages/*/config.ts`，页面挂载配置与实现分离
- **Overlay 模块化**: `overlay.ts` 210 行拆分为 5 个聚焦模块 (create-overlay, mount-app, theme-sync, dismiss)
- **共享组件库**: UmmPaginator (分页器), UmmUserBar (用户栏), UmmStatBar (统计栏) — 覆盖 12 个页面
- **内容脚本句柄拆分**: `douban-sync.ts` 拆分为 3 模块 (sync-db, sync-neodb, sync-cross-platform)
- **详情页数据拆分**: `detail-data.ts` 拆分为 5 模块 (types, extractor, extra-extractor, record-loader)
- **CSS 响应式 Grid 变量**: `breakpoints.css` 13 级断点增加 `--umm-grid-cols` (2→14 列)

### Changed
- `.gitignore` 去重并补充 `.envrc`/`.direnv`/`.flox`/`.vite`/`.eslintcache` 等模式
- 依赖更新: TypeScript 6.0.3, `@types/dompurify` 3.2.0

### Fixed
- **豆瓣图书详情页 "添加到书单" 文本错误**: `doulist-replace.ts` 所有 12 处 "片单" 硬编码改为动态标签（片单/书单/歌单）
- **Dialog 无障碍**: 添加 `role="dialog"` / `aria-modal` / `aria-labelledby`
- **Dialog 标题样式**: `<h3>` 改为 `<div role="heading">` 防止豆瓣页面 h3 样式污染
- **`genre.css` 深色模式缺失**: 补全 `:host(.umm-theme--dark)` 块
- **11 个页面 CSS 自定义变量深色覆盖**: 补全 accent/card-bg/border 等暗色值
- **z-index 硬编码 token 化**: 10 处 → `var(--umm-z-*)`
- **`common.css`/`base.css` 去重**: 删除 `common.css` (375行)，消除每页冗余 CSS 注入
- **`design-tokens.css` 深色 shadow 覆盖**: 增加 4 个 `--umm-shadow-*` 白色阴影值
- **CSS 基础样式变量更新**: `base.css` 使用新 `--umm-color-*` 设计 Token
- **挂载失败处理**: `mount-app.ts` 挂载失败时移除加载动画+显示错误提示
- **主题监听器泄漏**: `startThemeSync` 返回清理函数，dismiss 时移除监听器
- **`doulist-replace.ts` 正则 Bug**: `/(\\d+)/` 双转义修复
- **`StoreRecord.ts` JSDoc**: 修正 `recordVersion` 描述（领域层不递增，仓库层递增）

### Removed
- `common.css` (被 `base.css` 取代)
- `components.css` (合并至 `base.css`)
- 19 个重复的 mount 函数 (被 `definePageMount` 取代)
- `overlay.ts` 单体文件 (拆分为 `overlay/` 5 模块)
- `douban-sync.ts` 单体 (拆分为 3 模块)
- `detail-data.ts` 单体 (拆分为 5 模块)
- `shared/theme-sync.ts` 独立文件 (合并入 `overlay/theme-sync.ts`)

### Chore
- code-review 通过：3 文件 +17/-2 行，CSS-only 变更
- 安全审计通过：CSS-only，无用户输入/数据流/执行风险
- 63 项单元测试全部通过
- `.gitignore` 复核通过：无需补充

### Added
- **豆瓣图书详情页深度适配**: `book.douban.com/subject/*` 全功能覆盖
  - 书名/副标题/原作名/作者/出版社/ISBN 等元信息完整提取
  - 评分条平铺结构兼容（`.starstop` + `.power` + `.rating_per` 兄弟节点）
  - 内容简介从 `#link-report .intro` 提取（支持多段合并）
  - 创作者/作者信息从 `#authors` 提取（过滤 `.fake` 占位元素）
  - **作者简介**卡片：提取"作者简介"章节 HTML，DOMPurify 消毒后渲染
  - **目录**卡片：从 `[id^="dir_"]` 提取按 `<br>` 分隔的目录项
  - **原文摘录**卡片：从 `.blockquote-list` 提取引用文本/来源/用户/赞数
  - **其他版本**卡片：从"这本书的其他版本"区域提取版本列表
  - `UmmInterestBar` 新增 `book` 类型标签（想读/在读/已读）
  - `detectStatusFromDom()` 支持图书状态文字（我读过/我在读/我想读）
  - 海报使用 2:3 竖版比例（`ASPECT_RATIO.POSTER`），按钮文字显示"添加到书单"
  - 推荐项 `.subject-rate` 评分提取兼容图书 `dl` 结构
  - 过滤空推荐项（跳过 `<dl class="clear">` 占位元素）

### Changed
- **detail-data.ts** — `extractDetailData()` 新增 `isBook`、`subtitle`、`authorBioHtml`、`tocItems`、`blockquoteItems`、`editionItems` 字段
- **App.vue** — 提取 `mediaType` computed 属性，消除 4 处重复类型分支
- 图书简介/作者/目录/原文摘录/其他版本卡片位于创作者区域下方

### Chore
- code-review 通过：4 文件 +122/-30 行，仅 DOM 读取 + DOMPurify 输出，零安全风险
- 安全审计通过：所有 HTML 输出经 DOMPurify 消毒，无 XSS 向量，无密钥泄露
- `.gitignore` 复核通过：`localref/` + `.localref/` 均已覆盖
  - 3 个 entrypoint matches 全面注册，`url-detector.ts` 新增 `book` mediaType
  - 主 overlay 挂载流程支持 book 类型：`cat=1001` URL 构造，`loadRecordMap('book')` 加载记录
  - 搜索结果卡片适配：POSTER 比例封面（同电影），隐藏 labels/chips/演职员行
  - 分页器完整支持（首页/上一页/下一页/末页/跳转输入）
  - 搜索标题显示"图书搜索"，不显示 all/movie/TV 筛选器

### Chore
- 测试产物清洁：删除 `test-results/` 目录
- 安全审计通过：仅 URL 匹配和条件渲染变更，零用户输入处理，Vue 模板自动转义
- `.gitignore` 复核：所有 AI 目录/产物模式已覆盖
- 简洁英文注释补充：`UmmSearchCard` 组件 JSDoc 更新

### Fixed
- **Options RatingTab/LinkedTab 豆瓣图书适配**: book 类型映射修复
  - `parseRatingInput()`: `book.douban.com` URL → `type: 'book'`（原被映射为 `'movie'`）
  - ID 输入时图书 URL 正确构造为 `book.douban.com/subject/{id}`
  - `autoDetectPlatform()`: `book.douban.com` 域名正确识别为 `'book'`
  - `Domain` 类型扩展支持 `'book'`，类型约束完整覆盖
- **豆瓣图书页面短评提取修复**: 嵌套 `.j.a_stars` DOM 结构干扰
  - 选择器 `.j.a_stars` → `div.j.a_stars`，排除嵌套的 `<span>` 评价格式区
  - 修复前：提取到 `"我的评价: 力荐"` 而非真实用户短评
- **短评更新丢失修复**: 空串无条件覆盖已有短评
  - `syncToLocalStorage()`: 当页面未提取到短评时，保留数据库中已有短评（`|| existingRecord?.comment` 守卫）

### Changed
- **Popup 布局优化**: 避免统计卡片 Y 轴溢出
  - 宽度 480px→600px，统计卡片 2 列→4 列（5 卡排成 2 行）
  - Options 按钮无需滚动直接可见

### Chore
- `.gitignore` 重构：去重 5 组重复条目（`.env`、`.env.local`、`.env.*.local`、`playwright-report/`、`test-results/`）
  - 新增 `.vercel/` `.netlify/` `.history/` 模式
- 63 项单元测试全部通过
- 安全审计通过：所有变更经正则输入验证 + `textContent` DOM 读取 + 无动态代码执行

## [4.11.0] - 2026-07-09

### Added
- **豆瓣图书首页深度适配**: `book.douban.com/` 页面全覆蓋
  - 新书速递：响应式 Grid 卡片区，复用 `UmmMediaRow`/`UmmMediaCard` 组件（`type="book"`）
  - 每月热门图书榜：排行列表 + 排行趋势指示器（↑↓N）
  - 读书活动：背景覆盖式活动卡片
  - 封面 `aspect-ratio: 2/3` 自适应 + hover 上浮动效
- **图书状态徽章全链路**: `UmmStatusBadge` 新增 `book` 类型（已读/想读/未读/在读）
  - 新书速递 Grid 卡片：悬浮于封面上角（`variant="small"`）
  - 排行榜列表：inline 嵌入标题前（`variant="inline"`）
  - 状态从 IndexedDB 异步加载
- **图书身份识别**: `Identity.fromUrl()` 支持 `book.douban.com/subject/{id}` → type `'book'`
  - `Identity.buildUrl()` 新增 `douban + book` 路径
- **图书详情页扫描**: `douban-scanner.ts` 图书状态文字适配（我读过/我想读/我在读）
- **图书首页导航入口**: UmmDynamicIsland 新增「图书」按钮（书本 SVG 图标）
- **全链路统计集成**: `useStats.ts` 新增 `book` 计数器
  - Popup Dashboard 新增 Book 统计卡片（Book 图标）
  - Options OverviewTab StatsGrid 新增 Book 条目 + platformStats 推断
- **图书类型埋点**: `host_permissions` + `matches` 三入口注册 `*://book.douban.com/*`
- **图书详情页路由**: `router.ts` 新增 `book.douban.com/subject/` 路由 → `handleDoubanDetailPage()`
- **图书详情页隐藏导航**: `hide-nav.ts` 支持 `bookNav`（`#db-nav-book`）

### Fixed
- **封面全屏溢出**: `css-composer.ts` 补充 `homepage.css` 到 book-homepage CSS preset，grid-track 约束 `aspect-ratio`

### Security
- 安全审计通过：所有 DOM 读取使用 `textContent`（非 `innerHTML`），URL 经 `new URL()` + 协议白名单过滤，Vue 模板 `{{ }}` 自动转义，无 `v-html`，外部链接含 `rel="noopener noreferrer"`

## [4.10.0] - 2026-07-09

### Added
- **豆瓣「用户片单」分类导航栏 UI**: `www.douban.com/people/{uid}/subject_doulists/{category}` 页面适配
  - 新增 `.xbar` 分类标签（豆列/片单/书单/地点）的提取与 UI 重建，胶囊式标签 + 当前 tab 高亮
  - 新增 `XbarCategory` 接口和 `xbarCategories` 数据字段
- **豆瓣「片单详情页」深度适配**: `www.douban.com/doulist/{id}/` 页面信息提取与 UI 重建
  - 水平三明治布局：固定封面列 + 信息列（垂直三明治：标题/创建者 → 统计/筛选/条目网格 → 分页器）
  - 条目卡片展示：海报、标题、星级评分（含评价人数）、导演/演员/类型/年份元数据
  - 记录状态集成：已看（含用户评分）和想看徽章，通过 IndexedDB recordMap 异步加载
  - 全部分类筛选 tab（全部/我没看过的/我看过的/可播放）
  - 数字排序分页器，正确识别当前页 `thispage` 位置
  - 共享 `umm-status` 组件样式（渐变胶囊徽章）
  - 浅色/深色主题自动适配（通过 `--dd-*` 本地变量 + `theme.css`）
- **NeoDB 自动同步 UI 实时刷新**: 自动同步成功后调用 `injectNeoDBPushButtons()` 刷新按钮组件
- **跨平台 Record 健康检查**: 每次已看页面加载时检查 IMDb/TMDB/NeoDB record 是否存在且状态正确
- **NeoDB URL 统一构建**: 处理 `show:`/`season:`/`episode:` 前缀
- **UmmStatusBadge 4 状态完整支持**: 新增 `doing`（在看/在听）状态类型
- **Color tokens (wish/doing)**: 全套颜色 Token（含 light/dark）
- **i18n 状态标签**: 4 个 locale 新增 wish/doing 相关标签
- **Personage 页面作品记录状态**: 加载 `loadRecordMap()` 填充记录状态与评分
- **豆瓣个人主页全面重建**: 新增 `#doulist`/`#friend`/`#review`/`#statuses` 区块提取
- WXT 内容脚本匹配：`*://www.douban.com/doulist/*` 加入 3 个入口点

### Fixed
- **豆瓣「片单列表」navLinks 域名错误**: `www.douban.com` 页面导航链接被错误重写为 `movie.douban.com`
- **豆瓣「片单列表」meta 提取不兼容书单/音乐**: 正则扩展为 `(?:看过|读过|听过)`，支持多介质格式
- **豆瓣「片单列表」activeTab 检测**: 新增 `?owned=followed` 查询参数检查
- **豆瓣同步/关联链路全面优化**: 修复 4 个同步链路问题
  - 非已看记录（想看/在看）同步到 IMDb/TMDB/NeoDB
  - 状态变更重新触发 NeoDB 推送
  - 跨平台对应记录缺失时自动创建
  - 新增 "在看"(doing) 状态支持（status=3）
  - `normalizeStatus` 修正 status=1 归为 done 的 bug
- **UmmStatusBadge 判断丢失**: 核心组件未处理 status=3(doing)
- **首页/详情页/演员页 Stale Render**: `UmmMediaCard` 动态 key 修复
- **详情页推荐区状态折叠**: `RecItem.isDone` → `recStatus`
- **搜索徽章 / 状态标签 二进制折叠**: status 映射扩展为完整 4 状态
- **User reviews list expand/collapse**: 超过 400 字显示展开/收起
- **User reviews list data extraction**: `.nlst h3 a` → `.nlst h3 > a` 选择器修复
- **IMDb clickable links on Douban detail page**: IMDb ID 包装为可点击链接
- **NeoDB "Open" button on Douban detail page**: 动态渲染打开按钮
- **豆瓣个人主页豆列/关注/广播提取**: 区块选择器和解析逻辑修复
- **Stat Bar 用户ID**: 从硬编码改为动态 `data.userId`

### Changed
- **依赖升级**: 升级多个依赖至最新兼容版本
  - `@types/chrome` 0.1.x → 0.2.x, `@types/node` 25.x → 26.x, `@types/archiver` 7.x → 8.x
  - `reka-ui` → 2.10.1, `vue` → 3.5.39, `vue-tsc` → 3.3.7, `vite` → 8.1.4
  - `wxt` → 0.20.27, `playwright` → 1.61.1, `tailwindcss` → 4.3.2, `tsx` → 4.23.0
  - `sharp` → 0.35.3, `adm-zip` → 0.5.18
- **url-detector.ts**: 新增 `isDoulistDetailPage()`, 扩展 `isDoulistsPage()` 正则
- **early.ts/main.ts/css-composer.ts/hide-nav.ts**: 新页面类型全链路注册
- **App.vue**: 移除未使用的 `activeFilter` ref（代码清理）
- **豆瓣注入架构**: 12 级自适应断点字体系统、分类徽章、悬浮缩放在封面动效等 UI 优化

### Security
- All external links use `target="_blank" rel="noopener noreferrer"`
- IMDb ID matching uses strict `/^tt\d+$/` regex — no XSS vector
- NeoDB URL is constructed from internal IndexedDB data, not user input

## [4.9.0] - 2026-07-07

### Architecture
- **豆瓣注入架构重构**: 三套并行注入系统（douban-early/douban-main/content.ts）统一通过 `shared/` 模块建立正式契约
  - 新建 6 个共享模块：`url-detector.ts`、`hide-nav.ts`、`extract-subject-id.ts`、`load-record-map.ts`、`theme-sync.ts`、`useCrossPlatformSync.ts`
  - `early.ts` 140→60 行（移出内联 URL 检测/CSS 组合/SPA 观察者）
  - `main.ts` 514→370 行（去除 8+ 处重复 mount 样板、导航隐藏逻辑、CSS 组合代码）
  - 删除 `useMusicHomepageObserver.ts` 和重复 CSS 声明，净减 ~490 行
  - 解决 12 类重复模式（R1-R12）和 1 个架构问题（A11 跨平台同步）

### Added
- **首页横向滚动→Grid 自适应**: 电影首页筛选/热门区域从横向滚动改为 CSS Grid 自适应布局
  - `.umm-grid-track` 容器：`auto-fill, minmax(150px, 1fr)` → 固定列数（6-9 列，跨 1280-3200px 断点）
  - `UmmScrollRow` 新增 `mode="grid"` prop 切换滚动/网格模式
  - `UmmMediaCard` 新增 `mode="grid"` 渲染路径
  - `homepage.css` 新增 grid 布局、行间距 `var(--umm-space-lg)`、hover 上浮动画
- **音乐详情推荐区域**: 修复音乐详情页推荐内容缺失（`#db-rec-section` 选择器）
  - `detail-data.ts` 推荐提取兼容 `#recommendations`（电影）和 `#db-rec-section`（音乐）
  - 封面使用 1:1 正方形比例（`:type="d.isMusic ? 'music' : 'movie'"`）
  - 图片 URL 尺寸升级：`s_ratio_poster`→`xl`、`/[slm]/`→`/xl/`、`/[slm]pic/`→`/xl/`

### Fixed
- **详情页推荐区域 rating 字体巨大**: `detail.css` 中 `.umm-rating-score { font-size: var(--umm-font-display) }` 为裸类选择器，泄漏至 Shadow DOM 内所有评分元素 → 限定作用域为 `.umm-rating-score-section .umm-rating-score`
- **首页 grid rating 大屏偏小**: 新增 `.umm-grid-track .umm-rec-item .umm-rating` 12 级自适应 `clamp(0.75rem, 0.55rem + 0.45vw, 1.125rem)`
- **音乐详情推荐封面始终 2:3**: `.umm-rec-cover` 硬编码 `aspect-ratio: var(--umm-aspect-poster)` → 移除以允许内部 `UmmImage` 动态控制
- **音乐条目主封面 URL 未升级至 xl**: `detail-data.ts:143` 仅处理 `s_ratio_poster`（电影），增加 `/subject/m/`→`/xl/` 替换
- **详情页添加到片单按钮浅色主题不可见**: W1.9 CSS 清理误删 `--umm-accent: #6366f1` → 恢复 `detail.css` 浅色变量
- **首页 grid 三明治样式错误**: `homepage.css` 补全 `.umm-rec-item/cover/title/rating` 卡片基类样式
- **首页 grid 大屏列数过多**: `auto-fill` 改为固定列数断点（6-9 列），宽屏防止过多列挤压
- **一周口碑榜元素样式**: `.umm-billboard-title` 增加 `max-width: 220px` + ellipsis 截断

### Changed
- **`.gitignore` 精简**: 去重 `playwright-report`×2 / `Thumbs.db`×2 / `.DS_Store`×2，合并同类条目

### Chore
- **版本升至 4.9.0**: 同步 `package.json` + `wxt.config.ts` manifest
- **测试产物清洁**: 删除 `test-results/` 目录，63 个单元测试全部通过
- **安全审计**: CSP/消息传递/Shadow DOM 隔离/凭据管理确认安全
- **英文注释补充**: `css-composer.ts` 模块 JSDoc + `?raw` 约束说明，`constants.ts` 导出简短注释

## [4.8.0] - 2026-07-07

### Added
- **音乐专辑多版本页面全屏覆盖层**: `music.douban.com/albums/{id}` — 版本列表 grid，1:1 方形专辑封面 + 介质 chip（CD/DVD/磁带/数字/黑胶 等）+ 评分 + IndexedDB 状态徽章
- **豆瓣音乐搜索结果优化**: 专辑封面宽度比从 2:3 改为 1:1 正方形比例；解析元数据中的介质信息（CD/DVD/磁带/数字/流媒体），在封面下方展示多色系 chip（亮/暗主题）
- **介质 chip 色系系统**: 11 种介质各配独立色值（亮色/暗色双主题），白字 ≥4.5:1 WCAG AA 可读性
- **i18n 音乐状态键值**: `common.listened`/`common.unlistened` 三语言（zh-CN/zh-TW/en）

### Fixed
- **音乐搜索结果状态徽章显示电影用语**: UmmSearchCard 缺失 `:type` prop → 加入 `:type="isMusic ? 'music' : 'movie'"`
- **专辑版本页状态徽章同问题**: albums/App.vue 固定 `type="music"`
- **Options RatingTab 音乐类型标签**: `getStatusLabel()` 当 `type='music'` 时返回 `common.listened`/`common.unlistened`
- **Options LinkedTab 音乐类型标签**: `getStatusText()` 之前忽略 `_type` 参数 → 使用 `type` 参数正确分支音乐/电影

### Changed
- **删除孤儿代码**: `useStatus.ts` composable（全库零引用）

### Chore
- **版本升至 4.8.0**: 同步 `package.json` + `wxt.config.ts` manifest

## [4.7.0] - 2026-07-07

### Added
- **豆瓣音乐首页全屏覆盖层**: `music.douban.com/` — 热门音乐人分类 pills + 新碟榜 grid（1:1 封面）+ 流行音乐人圆形头像
- **豆瓣音乐人概览页全屏覆盖层**: `music.douban.com/artists/` — 推荐艺人轮播、推荐活动、音乐视频、流派导航
- **豆瓣音乐流派页全屏覆盖层**: `music.douban.com/artists/genre_page/*/` — 流派艺人 grid
- **全局宽高比常量**: `ASPECT_RATIO.POSTER/SQUARE/WIDE`（TS 常量）+ `--umm-aspect-poster/square/wide`（CSS 变量），消除 33 处硬编码比例值
- **UmmInterestBar `type` 属性**: movie 上下文显"想看/在看/已看"，music 上下文显"想听/在听/已听"
- **音乐详情页优化**: 曲目列表（含序号）、表演者标题行、meta row chip 拆分表演者、正方形 1:1 专辑封面、简介/表演者标题适配
- **音乐详情页标记状态初始化**: 优先 IndexedDB record → DOM 检测（`#interest_sect_level`）→ fallback null，消除 API 返回空值时状态丢失

### Fixed
- **NeoDB 自动同步不持久化**: `App.vue` `onInterestSave()` 推送成功后将 `catalogUuid` 写入 `linkedIds.neodb` + 创建 `neodb_records` 本地记录 + 更新 IMDb/TMDB 记录的 NeoDB 反向链接
- **DataScheduler 缓存键隔离 Bug**: `DB_PUT`/`DB_DELETE`/`DB_SYNC_PAGE_RECORD` 写操作仅失效自身前缀的缓存键（`put:*/delete:*/sync:*`），`get:*` 缓存未被清除导致后续读取返回陈旧 null。三个写 handler 新增显式 GET 缓存失效
- **`DB_SYNC_PAGE_RECORD` 响应破损**: 返回体丢失 `result` 字段，`dbSyncPageRecord()` 始终返回 `{changed:false}`
- **NeoDB 推送失败 Toast 降级**: 从 `info` 恢复为 `error`，确保用户感知推送失败
- **豆瓣音乐详情页标记状态覆盖**: `fetchInterest()` API 返回空 `interest_status` 时不再覆盖已有的初始状态（来自 IndexedDB 或 DOM 检测）
- **音乐表演者标签提取**: `pl.textContent` 误包含嵌套 `<a>` 链接文本 → 改用 `pl.firstChild?.textContent` + 移动子节点至 wrapper 外再移除 `<span class="pl">`
- **音乐详情页空白标题**: `#content h1` 选择器在音乐页面不命中 → 添加 `#wrapper > h1` 回退
- **`UmmMediaCard` 滚动模式封面比例**: 缺少 `aspectRatio` prop，图片无约束拉伸
- **调试日志清理**: 移除 `useInterest.ts` 中遗留的 `console.log`

### Changed
- **豆瓣音乐首页入口匹配**: `douban-early.content` matches 从 `*://music.douban.com/subject/*` 扩展为 `*://music.douban.com/*`，覆盖首页/流派/艺人页
- **版本升至 4.7.0**: `package.json` + `wxt.config.ts` manifest

## [4.6.1] - 2026-07-06

### Changed
- **统一 z-index 层级体系**: 14 个文件中 15 个硬编码 z-index 值全部替换为 8 级语义化 CSS 变量（backdrop:10 / sticky:50 / floating:100 / tooltip:150 / overlay-host:200 / overlay:300 / dialog:400 / toast:500），消除 `9999`/`10000`/`999999`/`2147483647` 等随机值。Toast 从 `999999`（等于 overlay）提升至 `500`，确保始终在 dialog 之上。

### Fixed
- **照片页面总数显示为 0**: `photos-data.ts` — 单页照片列表无 `.paginator` 元素时 `extractPagination()` 返回 `totalCount=0`，增加回退逻辑使用实际 `photos.length` 作为总数

## [4.6.0] - 2026-07-05

### Added
- **设计规范文档体系**: 新增 `docs/DESIGN_GUIDE.md`（1205 行/11 节，含三层样式架构、token 引用、组件层级、命名规范、主题系统）、`docs/CONSISTENCY_CHECKLIST.md`（9 维度/28 条一致性规则）
- **暗色主题支持 — 全局注入 UI**: `tokens.ts` 新增 32 个 `_DARK` 颜色常量；`global.ts` 新增 `ALL_STYLES_DARK` 块通过 `[data-umm-theme="dark"]` 选择器注入暗色覆盖
- **主题同步监听**: `content.ts` + `douban.ts` 添加 `chrome.storage.onChanged` 监听 `umm:appearance`，跨上下文（popup/options/overlay）主题实时同步
- **CSS 架构**: `components.css` 共享 CSS 变量文件；`theme.css` 添加 `--umm-color-*` 统一 token 别名、`--umm-z-*` z-index 层级缩、`--umm-color-error` 变量（light + dark）
- **`useRecordCache` 共享化**: 从 `homepage/composables/` 提取至 `content/douban/shared/composables/`，消除 homepage/search 页面 DB 加载重复
- **预存 TS 错误修复**: `douban-neodb.ts` overlay 作用域修复、`neodb-push.ts` optional chaining 修复

### Fixed
- **早期注入浅色主题闪烁**: `overlay.css` 添加 `@media (prefers-color-scheme: light)` 匹配 OS 偏好；`overlay.ts` JS 注入 `<style>` 覆盖显式主题设置
- **meta-card a 标签蓝色突兀**: `.umm-meta-chip a` 改为 `color: inherit`，hover 使用 `opacity` 而非蓝色文字
- **`.umm-photo-badge` 黑字不可读**: `color: #fff`（图片叠加标签始终白色文字）
- **`.umm-comment-status--wish` 暗色主题不可见**: 添加 `:host(.umm-theme--dark)` 覆盖（`#f59e0b`）
- **`.umm-rating-better` / `.umm-better-chip` 暗色背景缺失**: 添加 `:host(.umm-theme--dark)` 覆盖
- **`#e74c3c` 硬编码无暗色变体**: 替换为 `var(--umm-color-error, #e74c3c)` CSS 变量

### Changed
- **全局注入样式暗色主题修正**: `UI_COMPONENT_STYLES` fallback 从深色默认值（`#1e1e1e`/`#333`）修正为浅色默认值（`#ffffff`/`#e5e7eb`）；新增 `ALL_STYLES_DARK` 响应 `[data-umm-theme="dark"]`
- **链接统一新标签打开**: 豆瓣重构页面中全部元素跳转默认新标签（`target="_blank" rel="noopener noreferrer"`），搜索页搜索导航除外
- **遮罩层 z-index 统一**: 所有 overlay 使用 `var(--umm-z-overlay, 999999)`，消除 `9999`/`999999` 不一致
- **NeoDB 按钮样式对齐**: `global.ts` 与 `interest.css`（canonical source）统一 padding/shadow/transition
- **`components.json` 配置修正**: CSS/Utils/Tailwind 路径对齐 `src/shared/styles/style.css`
- **版本升至 4.6.0**: `package.json` + `wxt.config.ts` manifest

[4.5.0] - 2026-07-01

### Added
- **全部演职员页面全屏覆盖层**: `/subject/{id}/celebrities` 支持影人分组网格，2/3 头像 + 代表作标签，12 级响应式断点
- **单个影人页面全屏覆盖层**: `www.douban.com/personage/{id}/` 含 profile header（2/3 头像 grid）、简介（meta OG 全文提取）、图片、获奖、作品三明治卡片（UmmMediaCard）、合作人物卡片网格、未上映作品列表
- **www.douban.com host_permission**: 新增 `*://www.douban.com/*`，扩展 content script 覆盖到豆瓣主站
- **`Identity.fromUrl()` 影人 ID 解析**: `www.douban.com/personage/{id}` 路径识别，type=movie, provider=douban
- **作品卡片复用 UmmMediaCard**: personage 页面 recentWorks/popularWorks 复用 UmmMediaCard grid 模式
- **作品提取重试兜底**: 5 次指数退避重试，解决豆瓣原生 JS 替换底部 sections DOM 的竞态问题

### Fixed
- **人物简介截断**: 从 `meta[property="og:description"]` 提取全文，替代原生 DOM 截断片段
- **工作区清洁**: `dist/`、`.wxt/` 构建产物清理
- **代表作链接新标签**: celebrities 页面代表作标签改为 `@click.prevent` + `window.open` new tab
- **影人卡片新标签**: celebrities 页面点击影人卡片改为 `@click.prevent` new tab
- **CSS 变量统一**: celebrities/personage 全量硬编码值替换为 `--umm-*` 带 fallback 变量
- **12 级断点体系**: 所有 grids 补齐 375px→5120px 完整 12 级断点

### Changed
- **合作人物卡片**: 从横向 flex 改为纵向卡片网格（2/3 封面 + 名称 + 合作数），hover 上浮阴影
- **Section heading 主题色**: 下划线统一使用 rosered accent (`--umm-personage-accent`)
- **"更多影视作品"按钮**: 从 `<a>` 内联样式改为统一 `.umm-personage-btn` 带 hover 效果

### Added
- **预告片/视频页面统一注入**: `/subject/{id}/trailer` 列表页网格 + `/trailer/{id}/` `/video/{id}/` 详情页内嵌视频播放器，原生 DOM 移除防止音频穿透
- **预告片详情页导航按钮**: 从 `.aside .links` 原生数据提取，"去本片全部视频"/"去影片页" 两个 `@click` 按钮新标签页打开
- **all_photos 页面导航按钮**: 从 `.aside .links` + `.mb30` 提取，显示剧照/海报/壁纸类型切换 + 影片页链接
- **全屏画廊 bottom-bar 动画**: Vue `<Transition>` 实现索引数字切换的淡入淡出动画，两端固定布局防重建

### Fixed
- **trailer selectors DOM 层级修复**: `h2 ~ ul.video-list` 改为 `.mod:has(h2#trailer) > ul.video-list`
- **trailer 路由优先级**: `isTrailerPage()` 移至 `isDetailPage()` 之前，防止双 overlay 冲突
- **详情页主演空 chip**: `metaToChips()` 在 `/` 分隔符后跳过闭合标签，展开 `display:none` 演员
- **照片页 all_photos `extractSidebarLinks` 函数缺失**: 修复 `ReferenceError`
- **早期注入白色闪烁**: 新增 `overlay.css` 通过 manifest `content_scripts.css` 注入，在浏览器渲染前设置 `<html>` 深色背景
- **预告片页面 subject ID 提取**: 改为从 DOM `<h1> <a href="/subject/{id}/">` 提取
- **Popup/Options 白闪及配色紊乱**: WXT CSP (`script-src 'self'`) 禁止 inline script——改用纯 CSS `html.dark { background; color-scheme }` 方案，零 JS 依赖
- **Popop/Options `color-scheme` 与扩展主题脱节**: CSS `html.dark { color-scheme: dark; }` + `@media` 兜底，消除系统颜色与扩展主题不一致
- **豆瓣 overlay Vue 主题 store 与宿主 `data-theme` 不同步**: `mountUmmOverlay()` 在 Vue 挂载前写入 `localStorage`，使主题 store 读取正确的扩展主题而非 OS 偏好
- **popup/options HTML 恢复 `@media (prefers-color-scheme: dark)`**: `color-scheme` 使用 OS 偏好 + 扩展主题兜底

### Changed
- **版本升至 4.4.0**: package.json + wxt.config.ts manifest
- **全局设计系统变量统一**: detail.css/photos.css :host 移除与 theme.css 重复的 font-family 和基础变量，统一继承；theme.css 新增 `--umm-link-hover` 变量
- **search.css 响应式化**: 标题/元数据字体、页面/空状态间距使用 `--umm-font-*` `--umm-space-*` 变量
- **detail.css 间距变量化**: `.umm-detail-left` gap 改用 `var(--umm-space-xl)`



### Added
- **共享 UmmMediaCard 组件**: defineComponent props 驱动双模式（grid + scroll），grid 模式 `@click="window.open"`，scroll 模式 `<a>` 包裹，详情页推荐区/首页媒体行统一使用
- **戏票/剧照/推荐 13 级响应式断点**: `detail.css` 网格列数从 3-4 级扩展为 320px-5120px 13 级自适应
- **meta 信息 chip 化**: 导演/演员/类型等元数据用 `/` 分割为独立 chip（`.umm-meta-chip`），保留原生 `<a>` 链接
- **better-than chip 化**: 评分对比区"好于 X%"从 `/` 拼接改为独立 chip（`.umm-better-chip`）
- **个人评分覆盖**: 已看推荐项 badge 显示 IndexedDB 个人评分，替代豆瓣大众评分
- **默认 footer**: `UmmPageLayout` 默认 footer 包含原生豆瓣链接 + GitHub 图标 + 扩展版本号，可通过 `#footer` slot 覆写
- **Doulist 主题系统**: 抽取 `createDialogTheme()` 替代 `c(l,d)` 内联 lambda，37 个语义化主题属性

### Fixed
- **演职员 @click 迁移**: 海报/排行榜/获奖提名/演职员/剧照/短评 9 处 `<a :href target="_blank">` → `@click="openLink()"`
- **Homepage 异步加载稳定性**: staggered re-parse（800/2500/6000ms）+ observer class 属性跟踪 + 轮询窗口 30s→60s + `start()` 立即首次解析
- **演职员 grid 列宽撑开**: 添加 `min-width: 0` 阻止长名撑开 CSS Grid `1fr` 列
- **Dark theme 颜色**: 新增 `--umm-text-primary/secondary/muted/link` 深色主题变量，提升评论、状态文字对比度
- **douban-neodb.ts 生产日志泄漏**: 15 处 `console.log` → `infoLog()`（production 默认静音）
- **CSRF 防护缺失**: `addToDoulist`/`removeFromDoulist` 补充 `X-Requested-With: XMLHttpRequest` 头
- **neodb-push.ts null safety**: `interestSect` 加 `?.` 可选链防止空值错误

### Changed
- **详情页字号缩减**: section heading `--umm-font-lg`→`--umm-font-md`，meta `--umm-font-md`→`--umm-font-sm`，正文 `--umm-font-md`→`--umm-font-base`
- **剧照/推荐 grid 最大列数**: 从 8/8 缩减至 4 列（base→480px→768px+ 三级递进）
- **海报列宽响应式**: 从固定 320px 扩展为 13 级（320px→5120px，320px→700px）
- **detail.css 移除 `:host` 独立变量**: 9 个 font 变量和 5 个 spacing 变量替换为 breakpoints.css 令牌，仅保留 `--umm-font-3xl`（标题）和 `--umm-font-display`
- **评分栏标签自适应**: `.umm-bar-label`/`.umm-bar-pct` 固定宽度改为 `flex-shrink: 0; min-width` 防止大字包裹

### Security
- **background.ts sender 校验**: `chrome.runtime.onMessage` 确认 `sender.id === chrome.runtime.id`（已有）
- **Doulist fetch**: 补充 CSRF 头 `X-Requested-With: XMLHttpRequest`
- **日志安全**: NeoDB handler 全部 `console.log` → `infoLog()`（DEVel 环境自动静音）

## [4.2.3] - 2026-06-29

### Added
- **标记 dialog 完整交互**: 支持"想看/在看/已看"三态选择、5星评分、标签(tags)推荐+自定义、短评输入(350字限制)，POST 豆瓣 API + IndexedDB 持久化
- **跨平台同步 (IMDb/TMDB/NeoDB)**: 第一次标记已看时自动扫描页面提取 IMDb/TMDB 链接，写入对应平台记录；NeoDB 自动推送（需配置）
- **我的短评展示**: 标记对话框保存的短评显示在 `#umm-interest-actions` 标记按钮下方
- **热门短评区域**: 从页面 `#comments-section` 解析热门短评并渲染到详情页 body
- **NeoDB 同步组件注入 Shadow DOM**: 页面加载+标记保存后注入到 overlay 内 `#umm-neodb-actions`，带按钮 loading 反馈和 toast 通知
- **演职员/剧照入口链接**: 复用原始页面的计数（全部 N / 预告片N / 图片N），点击跳转豆瓣原生页面

### Fixed
- **NeoDB 按钮操作失灵**: 使用事件委托 + `container.querySelectorAll` 替代 `document.getElementById` 穿透 Shadow DOM
- **NeoDB 容器样式丢失**: 移除内联 style，改用 CSS class（`.umm-neodb-push-buttons`）接入 Shadow DOM 设计令牌
- **NeoDB 首次注入时机**: 初始 `neoDBInjector` 在 Vue 挂载前运行 → 回退原生 DOM 被遮盖；改为 `onMounted` 中 `fetchInterest` 完成后主动触发
- **NeoDB 容器重复注入**: 清理旧按钮时优先 `shadowRoot?.getElementById`，兜底 `document.getElementById`
- **NeoDB watermark 层叠错误**: 补回 `.umm-neodb-btn { position: relative; z-index: 1 }`
- **添加到片单按钮缺 loading**: fetch 期间按钮显示"加载中…" + `[data-loading]` 属性
- **添加到片单 dialog 简化**: 移除"取消"/"保存"按钮，替换为"关闭"；二次确认携带片单名
- **"添加到片单"按钮浅色主题兼容**: `color: #fff` 替代 `--umm-text-primary`
- **年份显示不清晰**: `--umm-text-muted` → `--umm-text-secondary`，提升对比度
- **标记 dialog 保存无 toast**: 补全 DB 保存/跨平台同步/NeoDB 同步各阶段 toast 反馈

### Changed
- **UmmInterestBar 改用 Vue 渲染**: 从纯 `defineComponent("h")` 渲染，替代早期内联 HTML；dialog 及其交互状态通过 props 控制
- **useInterest composable**: 抽取豆瓣 interest API 封装（GET + POST），支持 MaybeRef subjectId，提供 loading/error 响应式状态
- **extractCrossPlatformLinks 接入**: 从页面 `#info` 提取 IMDb/TMDB 链接并双向同步记录

## [4.2.2] - 2026-06-28

### Added
- **豆瓣详情页"想看/已看"标记功能**: 在 Shadow DOM 详情页 overlay 中集成 `UmmInterestBar` 组件，支持下方面两项操作并通过豆瓣 API 同步状态:
  - "想看" / "看过" 开关按钮
  - 5-星评分选择器（选中"看过"后显示）
  - POST 至 `/j/subject/{id}/interest` 并持久化到 IndexedDB
  - CSRF token 从页面 `input[name="ck"]` 和 cookie 自动提取

### Fixed
- **详情页推荐评分丢失**: 修复 `.subject-rate` 选择器作用域错误（`linkEl` → `dl`），豆瓣 DOM 中评分元素不在 `<a>` 内部
- **添加到片单按钮在 Shadow DOM 中失灵**: 使用 `e.composedPath()` 替代 `e.target.closest()` 穿透 Shadow DOM 边界
- **片单 API 首调用返回空列表**: 添加 1 次重试（500ms 延迟），始终打开 dialog
- **添加到片单 `skind` 参数错误**: 修正为 `subject.cat`（cat_id 如 `1002`），原传入了 `kind`（`movie`）

### Added
- **创建新片单功能**: POST `/j/doulist/add`，footer 新增"＋ 新建片单"按钮，含名称输入、私密切换、自动刷新列表
- **加载动画反馈**: dialog 加载中 spinner、toggle 操作旋转动画、保存按钮 spinner+文字反馈

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
