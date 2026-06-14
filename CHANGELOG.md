# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.3.0] - 2026-06-14

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

[3.2.0]: https://github.com/username/um-multimedia-manager/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/username/um-multimedia-manager/compare/v3.0.0...v3.1.0
