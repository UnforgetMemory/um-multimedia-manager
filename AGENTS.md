# AGENTS.md

## 项目

**UMM（Unified Multimedia Manager）** — Chrome 扩展（Manifest V3），统一管理豆瓣/IMDb/NeoDB/TMDB/Bangumi/PT 站的观影收听记录，支持跨平台同步、PT 种子淡化、WebDAV 备份。Vue 3 + TypeScript + WXT + Tailwind CSS v4 + reka-ui。当前版本 5.14.0。

## 快速命令

```bash
npm run dev             # 开发（WXT 热更新）
npm run build           # 生产构建 → dist/chrome-mv3（含 fix-paths 后置步骤，不可跳过）
npm run type-check      # vue-tsc --noEmit（唯一质量门禁，提交前必跑）
npm run test:unit       # Playwright 单元测试
npm test                # 全部 Playwright 测试
npm run i18n:check      # i18n 键完整性检查
npm run package:patch   # 版本号 + 构建 + 打包（minor/major 同理）
npm run zip             # 构建 + 打包 Chrome 商店包
```

无 lint/format 命令。质量门禁：`type-check` → `build`。

## 架构

### 入口（entrypoints/，WXT 文件式入口）

| 入口 | 作用 |
|---|---|
| `background.ts` + `background/handlers/` | Service Worker：消息路由 + IndexedDB 单例 + DataScheduler。**所有 DB 访问必经此处** |
| `content.ts` + `content/` | legacy 注入系统：非 Douban 站点（IMDb/NeoDB/Mukaku/PT/Sehuatang/JavDB/TMDB） |
| `douban-early.content/` + `douban-main.content/` | 新 Douban 注入：document_start 建 Shadow DOM overlay，document_idle 挂载 Vue app |
| `popup/` `options/` | Vue SPA（统计/设置） |
| `bilibili.content/` `bilibili-homepage.content/` `youtube-homepage.content/` | 单站内容脚本 |

### 两套内容注入系统

1. **legacy**（`content.ts` → `content/router.ts` → `handlers/`）：服务所有非 Douban 站点。Douban 域名已在 content.ts 的 `excludeMatches` 排除。
2. **新 Douban**（`douban-early/douban-main` → `src/content/douban/`）：32 个页面类型，Shadow DOM 完全样式隔离。每页 `pages/{type}/App.vue + config.ts + data.ts + types.ts`。经 `content/douban/shared/legacy-bridge.ts` 复用 legacy 的 4 个模块（FloatingToast/i18n/neodb-push/injectGlobalStyles）。

### 领域层（domain/，纯 TS 无框架依赖）

- `record/StoreRecord.ts` — 不可变聚合根（Status/Rating 值对象，`toSnapshot()`/`fromSnapshot()` 序列化）
- `record/RecordService.ts` — 跨平台 sync（经 `IRecordRepository` 接口，仅 findByKey/save）
- `identity/Identity.ts` — 跨平台身份（`Identity.fromUrl()` 解析 URL）
- `platform/Platform.ts` — **`Platform.KNOWN` 是平台唯一清单**，`config.ts` 的 `Provider` 类型派生自它
- `platform/MediaType.ts` — `MediaTypeId` 联合（movie/tv/music/book/game）

### 消息流

```
Content/Popup → chrome.runtime.sendMessage({ type, payload })
  → background.ts handleMessage() switch
  → handlers/（payload 类型化，见 src/types/index.ts MessagePayloadMap）
  → mediaDB（经 DataScheduler）
  → sendResponse({ success, data/error })
```

消息类型与契约定义在 **`src/types/messages.ts`**（`MessageType` 联合 + `MessagePayloadMap` + `RuntimeMessageEnvelope` + `ResponseMessageMap`/`SuccessDataMap`，经 `types/index.ts` barrel 再导出）——新增消息类型必须四处同步：MessageType + MessagePayloadMap + background.ts switch + ResponseMessageMap/SuccessDataMap。后台 → 内容脚本广播走 `src/utils/event-bus.ts`（EVENT_BUS）。

### 数据系统

- `features/database/models.ts` — IndexedDB 单例（store 名 `{platform}_records`，键 `{type}::{providerId}`）
- `features/data-scheduler/` — 优先级队列 + 限流 + 重试，所有 DB 操作经此
- `features/cache/` — L1 内存 LRU（SW wake 即清空）

## 关键约定

- 路径别名 `@/` → `./src/`；组件库 shadcn/vue 在 `src/shared/ui/`（22 个组件）
- **Composition API + `<script setup>` + TypeScript**；禁止 `as any`/`@ts-ignore`
- 内容脚本禁止直接触 IndexedDB——一律走 `chrome.runtime.sendMessage`
- i18n 双系统：`src/shared/locales/`（vue-i18n，SPA）+ `src/entrypoints/content/i18n/`（自定义 t()，Shadow DOM 内无法用 vue-i18n）
- 共享工具：`src/utils/`（sleep/dateKey/error-message/throttle 等）；Douban 共享在 `src/content/douban/shared/`（retry/usePaginator/douban-extract）
- 版本号在 `package.json` + `wxt.config.ts`（`npm run package:*` 同时更新）
- 单元测试：Playwright（tests/unit/，**tests/ 源码被 git 跟踪**；仅 playwright-report/test-results 等产物被 ignore）
- 设置存储：`src/features/settings/items.ts` 类型化 item 层（物理键=STORAGE_KEYS，fallback 单源，ADR-017）；新增设置字段在此定义 item 并补 AppSettings 类型

## 添加新站点

1. `content.ts` matches + `content/router.ts` 路由
2. `content/handlers/` 建 handler（参照 `imdb.ts` / `create-detail-handler.ts`）
3. `Platform.ts` KNOWN（自动传导至 Provider 类型）+ `Identity.fromUrl()` 解析
4. `database/models.ts` STORE_NAMES + `wxt.config.ts` host_permissions
5. 消息类型：`types/messages.ts` MessageType + MessagePayloadMap + ResponseMessageMap/SuccessDataMap + background.ts switch
6. 两个 i18n 系统补键
7. （Douban 页面）`content/douban/pages/{type}/` 四件套 + url-detector + css-composer preset

## 项目结构（简化）

```
src/
├── entrypoints/          # WXT 入口（见上表）
├── content/douban/       # 新 Douban overlay（32 页面 + shared/ + styles/）
├── domain/               # DDD 领域层（record/identity/platform）
├── features/             # database / data-scheduler / cache / webdav / neodb /
│                         # adult-av / migration / settings / optimistic-lock(仅类型)
├── shared/               # ui 组件 / locales / plugins / 通用组件
├── types/                # 消息类型 + 数据接口（唯一权威）
├── utils/ composables/ stores/ config.ts
└── docs/                 # adr/（架构决策）+ audit/（审计与蓝图）
```
