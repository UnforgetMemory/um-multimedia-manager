# Changelog

All notable changes to the UMM (um-multimedia-manager) project are documented here.

## [3.0.0] - 2026-06-12

### Added

- **色花堂列表页预览**: 新增 sehuatang.net/sehuatang.org 论坛列表页处理器，替换原始帖子列表为卡片网格预览，支持封面图片懒加载、磁力链接一键复制、已阅条目淡化
- **JavDB 已阅淡化**: 新增 javdb.com 增强器，自动淡化已阅 AV 条目（灰度 + 透明度），点击可标记为已阅
- **AV ID 数据存储**: 新增 `sehuatang_avids` IndexedDB store（v8 schema），存储 V2 格式 AV ID 记录（id/rating/updatedAt），支持批量导入 JSON
- **手动添加面板**: 新增浮动面板，支持手动输入 AV ID 或 JSON 数组批量添加已阅记录
- **查询已阅面板**: 新增可拖拽面板，输入 AV ID 查询已阅状态、评分和时间
- **轻量 i18n 模块**: 新增 content script 国际化支持（zh-CN/en-US/zh-HK/zh-TW），无需外部依赖
- **Background 消息处理**: 新增 `SEHUATANG_CHECK_VIEWED` / `SEHUATANG_ADD` / `SEHUATANG_BATCH_ADD` / `SEHUATANG_GET_ALL` 消息类型
- **Host 权限扩展**: 新增 sehuatang.net/sehuatang.org/javdb.com 域名权限
- **Popup 仪表盘**: Popup 精简为只读仪表盘（电影/剧集/音乐/成人视频四宫格 + 总记录 + 管理面板入口），支持亮色/暗色主题自动切换
- **Options Page**: 控制面板迁移到独立 Chrome 扩展页面（`options.html`），5 个一级 Tab（概览/评分管理/关联查询/数据同步/设置），Tab 懒加载
- **响应式排版系统**: CSS custom properties 定义字体层级（display/h1/h2/body/caption），支持 clamp() 响应式缩放
- **即时渲染**: Popup 布局立即渲染，统计数字异步填充（animate-pulse 骨架屏）

### Changed

- **IndexedDB 升级**: DB_VERSION 7→8，新增 `sehuatang_avids` object store（带 updatedAt 索引）
- **RECORD_STORES 扩展**: 新增 `sehuatang_avids` 到记录存储列表
- **Popup 架构重构**: 从 5 页面导航简化为单页仪表盘 + CTA 入口
- **构建脚本修复**: `fix-paths.js` 移除错误的动态导入路径重写（曾导致 popup 空白页）
- **Options Page 入口**: WXT 配置 `options_page` + `options_ui.open_in_tab: true`（通过 fix-paths 补丁）
- **版本更新**: 2.0.0 → 3.0.0

### Fixed

- **Popup 空白页**: 根因是 `fix-paths.js` 的正则 `/"\.\/(.*?)\.js"/g` 同时匹配静态和动态导入，给已正确解析的静态导入添加了 `chunks/` 前缀，导致双倍路径（`chunks/chunks/X.js` → 404）。修复：移除整个动态导入重写段落
- **Options Page 入口**: WXT 0.20.26 忽略 `open_in_tab` 配置，默认为 `false`。修复：在 fix-paths.js 中补丁 manifest.json

### Added

- **色花堂列表页预览**: 新增 sehuatang.net/sehuatang.org 论坛列表页处理器，替换原始帖子列表为卡片网格预览，支持封面图片懒加载、磁力链接一键复制、已阅条目淡化
- **JavDB 已阅淡化**: 新增 javdb.com 增强器，自动淡化已阅 AV 条目（灰度 + 透明度），点击可标记为已阅
- **AV ID 数据存储**: 新增 `sehuatang_avids` IndexedDB store（v8 schema），存储 V2 格式 AV ID 记录（id/rating/updatedAt），支持批量导入 JSON
- **手动添加面板**: 新增浮动面板，支持手动输入 AV ID 或 JSON 数组批量添加已阅记录
- **查询已阅面板**: 新增可拖拽面板，输入 AV ID 查询已阅状态、评分和时间
- **轻量 i18n 模块**: 新增 content script 国际化支持（zh-CN/en-US/zh-HK/zh-TW），无需外部依赖
- **Background 消息处理**: 新增 `SEHUATANG_CHECK_VIEWED` / `SEHUATANG_ADD` / `SEHUATANG_BATCH_ADD` / `SEHUATANG_GET_ALL` 消息类型
- **Host 权限扩展**: 新增 sehuatang.net/sehuatang.org/javdb.com 域名权限

### Changed

- **IndexedDB 升级**: DB_VERSION 7→8，新增 `sehuatang_avids` object store（带 updatedAt 索引）
- **RECORD_STORES 扩展**: 新增 `sehuatang_avids` 到记录存储列表
- **版本更新**: 2.0.0 → 3.0.0

## [2.0.0] - 2026-06-11

### Added

- **Settings 内存缓存**: Background Service Worker 新增 SettingsCache，避免重复读取 chrome.storage.local
- **DB 读取缓存**: MediaDatabase 添加 LRU 缓存层，30s TTL 单条缓存，5s 列表缓存，store 级失效
- **EventBus 广播总线**: Background → Content Script 事件广播，record:updated/deleted 事件推送
- **Popup vue-router 懒加载**: 2456 行 App.vue 拆分为 5 个路由组件（RecordsPage, PlatformsPage, RatingsPage, LinkedPage, SettingsPage），每个页面 ~2-16KB chunk

### Changed

- **URL 检测简化**: 从 4 层（popstate + pushState + MutationObserver + setInterval）精简为 2 层（popstate + pushState）
- **PT Dimmer 行级缓存**: extractMTeamIds 结果缓存到 row data 属性，减少 ~50% 冗余解析
- **escapeHtml 正则化**: 替换 DOM 操作为纯正则替换，无需创建临时 DOM 元素
- **DB 事务优化**: syncPageRecord 改为单事务批量操作
- **样式注入合并**: content.ts 和 douban.ts 重复 CSS 合并到 global.ts
- **Console 清理**: 替换 console.log/warn 为 logger 工具
- **消息队列限流**: 添加 MAX_QUEUE_SIZE = 50 限制，防止 DB 初始化期间内存无限增长
- **版本更新**: 1.5.5 → 2.0.0

### Fixed

- **Vue provide/inject ref 解包**: RecordsPage 和 PlatformsPage 中 inject 返回原始 ref 对象，改为 stats.value.total / records.value 访问
- **Background toast XSS**: handleShowToast innerHTML 未转义，添加 escapeHtml() 转义
- **IMPORT_DATA 安全**: 设置导入无 key 白名单，可覆盖敏感配置（webdavPassword 等），现仅允许 STORAGE_KEYS 中的 key
- **消息发送者验证**: sender.id 未验证是否为本扩展，改为检查 sender.id === chrome.runtime.id
- **DB storeName 白名单**: DB 消息处理器未验证 storeName，添加 isAllowedStore() 校验
- **Host 权限过宽**: 移除 <all_urls>，保留具体域名列表

### Security

- Background toast innerHTML XSS 防护（High）
- IMPORT_DATA settings key 白名单（Medium）
- sender.id 身份验证（Medium）
- DB storeName 白名单校验（Medium）
- 移除 <all_urls> host permission（Medium）
- .gitignore 添加 .env / .env.local / playwright-report/

## [1.5.5] - 2026-06-10

### Fixed

- **豆瓣弹窗误判已看**: 修复豆瓣详情页打开记录弹窗时，扩展误判为"已看"状态导致 NeoDB 同步按钮错误显示的问题。新增 `#dialog` 弹窗可见性检测，弹窗打开时跳过状态扫描
- **NeoDB 按钮分数不更新**: 修复修改已看评分后，NeoDB 同步按钮中基准分数未实时更新的问题。重构后的 `handlers/douban.ts` 回归了 `localRecord?.rating` 旧逻辑，现改为优先从页面 DOM 读取评分（`scanDoubanPageStatus().rating`），降级到本地缓存。同时补充 `#n_rating` 的 `input`/`change` 事件监听，修复 MutationObserver 无法捕获 `input.value` property-only 变更的问题
- **未看页面按钮闪现**: 修复在未看页面点击星星评分时，NeoDB 按钮短暂闪现的问题。旧版 `injectNeoDBPushButtons()` 缺少 `status === 'done'` 守卫，导致 rating observer 触发时直接注入按钮
- **音乐详情页功能丢失**: 修复 `form[action="remove"]` 检测条件过严导致音乐详情页扩展功能失效的问题。音乐页面采用纯文本匹配，电影/书籍页面采用文本+表单双重验证

### Changed

- **已看状态检测优化**: `scanDoubanPageStatus()` 从单一 `innerText.includes` 升级为弹窗检测 + 文本匹配 + 删除表单三重信号验证
- **版本更新**: 1.5.4 → 1.5.5

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
