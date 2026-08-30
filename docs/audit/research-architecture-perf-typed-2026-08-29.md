# UMM v5.14.0 全栈调研报告 — 架构结构 / 性能 / 结构冗余 / typed 类型安全

- **日期**: 2026-08-29 12:08 +08:00
- **状态**: 调研定稿（**纯只读，未改任何代码/配置，未 commit**）→ 待用户批准执行
- **交付定位**: 本地稿（`.um.agents/memory/`，gitignored，不 sync）；定稿后可转正至 `docs/audit/`
- **基线**: v5.14.0 · WXT 0.21.4 · TS 6.0.3 · Vite 8.2.1 · Vue 3.5.41 · Pinia 4.0.3 · Tailwind 4.3.3 · reka-ui 2.10.3
- **方法**: umpp 管线 P0–P3；4 路并行专项调研（架构/性能/结构/typed）+ 主 agent 独立复核高风险断言
- **标注**: **[Fact]** = 本地代码/命令证据 · **[Assumption]** = 推断未验证 · **[Decision]** = 需拍板的取舍
- **交叉标记**: 🆕=本次新发现 · ♻️=既有 ADR/audit 已覆盖（本次仅复核有效性）

---

## 0. Executive Summary

代码库在 ADR-009/014/015 与两轮 type-audit（2026-07/08）之后**纪律显著优于同规模项目**：`vue-tsc --noEmit` **0 errors / exit 0**（[Fact]，本次实测）；**0 循环依赖**（402 模块 / 1281 条 import 边 DFS 复核）；生产代码 **0 处真实 `as any`、0 处 `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`**；历史遗留 `utils/context.ts:29 message: any` 已修（现为 `RuntimeMessageEnvelope`）；既有 4 份 audit 的结论**绝大部分已被后续 commit 落地**（11 项已修复，1 项仍有效）。

**真正的短板集中在「产物形态」与「一个未被覆盖的第二同步引擎」**，而非数据层或类型基线：

| # | 发现 | 轴 | 量级 | 严重度 |
|---|---|---|---|---|
| 1 | `douban-main.js` **752.10 KB** 单 chunk，32 页面全量静态注入，每个豆瓣页全额解析 | 性能/结构 | 占包体 32% | **P0** |
| 2 | `icon-original.png` **680.60 KB** 死重（manifest 未引用） | 性能 | 占包体 29% | **P0** |
| 3 | 跨平台同步存在**两套语义分歧的引擎**，豆瓣侧会覆盖 IMDb/TMDB 的 rating | 架构/typed | 用户可见行为分叉 | **P1** |
| 4 | `safeSendMessage<T = any>` + `db/api send(): Promise<any>` → 响应体 100% any，2 个 any 单点源头 | typed | 全链路 | **P1** |
| 5 | `Platform.KNOWN` / `STORE_NAMES` / `RecordStoreName` **三重手工维护**，平台增员无编译期保护 | 架构/typed | 类型漂移 | **P2** |

预估总工作量 **M（中等）**。Wave 1 可**零运行时改动、纯类型层**消灭 2 个 any 源头；包体收益（发现 1+2）合计约占 dist 总量 60%，投入产出比最高。**建议本轮先做 Wave 1 + Wave 2，Wave 3 需特征测试铺垫。**

---

## 1. P0 现状盘点

### 1.1 基线测量（本次实测）

| 项 | 数值 | 证据 |
|---|---|---|
| `npm run type-check` | **0 errors, exit 0** | [Fact] `npx vue-tsc --noEmit` → `EXITCODE=0` |
| src 代码文件 | 402 个 `.ts/.vue` | [Fact] glob 计数 |
| 一级目录 | 9：composables / content / domain / entrypoints / features / shared / stores / types / utils | [Fact] |
| WXT 入口 | **9 个**（非 AGENTS.md 所述的 7 个） | [Fact] |
| Douban 页面类型 | 32 个（四件套 App.vue+config+data+types） | [Fact] |
| Barrel `index.ts` | 33 个（module-audit 时 42，已收敛） | [Fact] |
| >400 行文件 | 12 个 | [Fact] |
| 循环依赖 | **0 环**（DFS，含 `export *` 再导出边） | [Fact] |
| 测试 | 68 spec，**全在 tests/unit/，无 e2e**（`npm test` ≡ `test:unit`） | [Fact] |
| 既有 ADR | ADR-008 … ADR-022（15 份） | [Fact] |

### 1.2 产物体积实测（`dist/chrome-mv3`，62 文件 / **2,347.1 KB**）

| 文件 | 体积 | 占比 | 备注 |
|---|---|---|---|
| `content-scripts/douban-main.js` | **752.10 KB** | 32% | 🆕 单 chunk，无动态导入 |
| `icon-original.png` | **680.60 KB** | 29% | 🆕 manifest 未引用 |
| `chunks/vue-i18n-DotYYSMY.js` | 163.70 KB | 7% | 仅 popup/options |
| `content-scripts/content.js`（legacy 7+ 站） | 158.30 KB | 7% | 对照基线 |
| `background.js` | 71.20 KB | 3% | — |
| `chunks/style-DHTxKA9Y.js` | 80.10 KB | 3% | — |
| `youtube-homepage.js` / `bilibili.js` | 41.90 / 39.60 KB | 3% | — |

> douban-main 是 legacy content 的 **4.76 倍**，而其服务的站点数量更少。这是整个产物形态的核心失衡点。

### 1.3 工具链严格度现状

`tsconfig.json` 已启用：`strict: true`（隐含 8 项）+ `noUnusedLocals` + `noUnusedParameters` + `noFallthroughCasesInSwitch` + `noUncheckedSideEffectImports` + `erasableSyntaxOnly` + `isolatedModules` + `skipLibCheck` + `moduleResolution: bundler` + `lib: ES2024`。

**TS 6.0.3 可用但未开启**（评估见 §5.7）：`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`verbatimModuleSyntax`、`noImplicitOverride`、`noPropertyAccessFromIndexSignature`、`noImplicitReturns`。

---

## 2. 架构与结构全面分析

### 2.1 七层模型映射（v5.14.0 成立度）

| 层 | 映射 | 成立度 | 关键证据 |
|---|---|---|---|
| app | `entrypoints/*`（9 个 WXT 入口） | 高 | background / content / douban-early+main / popup / options / bilibili / bilibili-homepage / youtube-homepage |
| feature | `content/douban/pages/*`（32 目录）、`options/tabs`、`popup/pages` | 高 | 32 页四件套 |
| store | `stores/*`（pinia 4 个）、douban `shared/composables` | 高 | — |
| scenario | ⚠️ **仍缺位** | 中 | 见 §2.2 P1-1 |
| provider | `features/neodb`、`webdav`、`content/handlers/mukaku/api`、pt `config/sites` | 高 | — |
| engine | `features/database`（660 行）、`cache`（含 ADR-014 L1.5）、`data-scheduler` | 高 | — |
| library | `utils/*`、`shared/*`（非 ui） | 高 | — |
| domain | `domain/*`（9 文件纯 TS） | 高 | 仅 domain 内部 import，零框架依赖 |

结论：refactor-plan（2026-08-21）的「约 85% 成立度」**依然成立**；唯一真实缺口仍是 scenario，其余层边界健康。

### 2.2 架构发现

#### P1-1 🆕 跨平台同步是「两套语义分歧的引擎」——本轮最重要的架构发现

**[Fact] 我自己复核确认的代码分歧**（`useCrossPlatformSync.ts:66-86`）：

```ts
if (!existingTarget || existingTarget.status !== newStatus) {
  linkedWrites.push(
    Store.dbPut(targetStore, linkKey, {
      url: ..., status: newStatus,
      rating: newRating,          // ← 直接覆盖目标平台既有 rating
      comment: comment || '',
      ...
    } as StoreRecord),
  )
}
```

对照 `domain/record/RecordService.ts:124-138`（注释 :134 `"rating is NOT updated"`）：**不覆盖 linked 平台既有 rating、已看完即跳过**。

| 维度 | `RecordService`（domain 层） | `useCrossPlatformSync`（detail 页 composable） |
|---|---|---|
| rating 覆盖 | ❌ 不覆盖（:124-138） | ✅ **覆盖**（:76-86） |
| 写入判据 | `existingTarget.status !== newStatus` 等 | `!existingTarget \|\| existingTarget.status !== newStatus` |
| 底层 API | 经 `IRecordRepository` | `Store.dbGet` / `Store.dbPut` **直调**（grep 18 处确认） |
| 是否走 `dbSyncPageRecord` | — | ❌ 不走 |
| NeoDB 侧 | ✅ 已下沉（`neodb.ts:191` 委托） | — |

**[Fact] refactor-plan W4 的「scenario 归位=验证即完成」只覆盖了 NeoDB 侧与统计侧，`useCrossPlatformSync` 是未被该报告纳入的第二套引擎。**「三处散落」因此只是缩到「两套语义」，并未根除。

- **影响** [Assumption]：从豆瓣保存会覆盖 IMDb/TMDB 的 rating；从 NeoDB 保存则保留。**同一用户动作的语义随入口而变**——这是用户可见的正确性问题，不是纯技术债。
- **建议 [Decision]**：将 `useCrossPlatformSync` 的 cross-platform 段改为委托 `Store.dbSyncPageRecord`（与 neodb 对齐）；行为差异先用特征测试锁定（`record-service-sync.spec` 已有先例）。

#### P1-2 🆕 `src → entrypoints` 反向依赖

**[Fact]** `@/entrypoints/` 被 import 的 13 处中，6 处来自 `src/content/douban`（反向），全部指向 legacy 入口 `entrypoints/content`：`main.ts:21,24`（injectGlobalStyles / FloatingToast）、`overlay/theme-sync.ts:13`、`overlay/create-overlay.ts:9`（styles/tokens）、`pages/detail/config.ts:4`、`pages/game-detail/config.ts:6`（ui/doulist-replace）、`shared/legacy-bridge.ts:17-20`。
`legacy-bridge.ts:5-15` 注释自承「re-exports from the legacy system…should move to shared/」。
- 无环（legacy 不 import douban），但**新 Douban 体系无法独立演进**。
- **建议 [Decision]**：按 bridge 注释把 FloatingToast / t / tokens / doulist-replace 逐步上移 `shared/`。

#### P2-1 🆕 平台/store 名三重手工维护

**[Fact]** `'douban_records'` 等硬编码 ≥20 处：`useCrossPlatformSync.ts`（27/38/39/40/74/92）、`record-loader.ts:15,37`、`record-cache-core.ts:53,55`、`game-detail/*`、`pt/dimmer/cache.ts:28,34-35`、`mukaku/cache.ts:131`、`mukaku/refresh.ts:22`、`bilibili-homepage.content/index.ts:21`、`neodb-push.ts:276`、`tmdb.ts:50-51` 等，未统一引 `STORE_NAMES`（`models.ts:32-43`）。
**[Fact]** `RecordStoreName`（`types/index.ts:27`）是**手写字面量联合**（7 store + jav_ids），未从 `STORE_NAMES` 派生；而 `Provider` 已正确派生自 `Platform.KNOWN`（`config.ts:35`）——**同一项目内两种派生纪律并存**。
- **影响**：新增平台需手工同步 3 处（`STORE_NAMES` / `RecordStoreName` / 散落字面量），且无编译期保护。
- **建议 [Decision]**：`RecordStoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES]`；散落字面量改引常量。

#### P2-2 ♻️ PLATFORM_HUES 非单源

**[Fact]** `composables/usePlatformMeta.ts:1-8` 仍是手写平台清单，含 `local: 200` 一个**非** `Platform.KNOWN` 成员。architecture-scan §1.2「缺 bangumi/mukaku」已修复（现含 `bangumi:355` / `mukaku:300`）。
- **建议**：KNOWN 派生平台部分，`local` 作为 UI 特殊值单列。

#### P2-3 🆕 `features/database` barrel 泄露 IndexedDB 单例

**[Fact]** `features/database/index.ts` 为 `export * from './models'`，使 `mediaDB`（IndexedDB 单例）与 `Store`（消息门面）同 barrel 暴露。当前**无** content/popup/options 实际 import `mediaDB`（grep 确认仅 `background.ts:13` 与 4 个 background handler），但**import surface 已把 IndexedDB 单例放进每个内容脚本的可达范围**。
- 约定「内容脚本禁触 IndexedDB」目前**靠纪律而非 barrel 强制**。
- **建议 [Decision]**：barrel 只 `export { Store }` + 显式导出 `STORE_NAMES`，`models` 走单独路径。

#### P2-4 🆕 `bilibili-homepage.content` 手写 sendMessage + 硬编码

**[Fact]** `bilibili-homepage.content/index.ts:152-165` 手写 `chrome.runtime.sendMessage({type:'DB_GET'...}, (resp)=>{...})`，绕过 typed Store API；`:21` 硬编码 `STORE = 'bilibili_records'`；`:23` 硬编码中文状态数组。对照 `bilibili.content`（已收编至 `video-overlay.ts` 共享模块，仅 173 行）。

#### P2-5 🆕 共享模块寄生于单一入口目录

**[Fact]** `entrypoints/content/ui/video-overlay.ts`（577 行）是 bilibili/youtube 两入口的共享模块（`bilibili.content:19`、`youtube-homepage.content:26`），但物理上位于 content 入口目录下。

#### P3 ♻️ `content.ts` vestigial 豆瓣代码 + 冗余 match/exclude

**[Fact]** `content.ts:25-36` matches 仍列 douban 域名，`excludeMatches:122-133` 又排除同批域名（冗余对）；`:169` `isDoubanGamePage` 恒 false → 死代码。与 architecture-scan §6 结论一致，未清理。

### 2.3 耦合与依赖量化

- **出边最多的枢纽**：`content/douban/css-map.ts` **45**、`content/douban/main.ts` 39（页注册/CSS 聚合，预期型）、`background.ts` 22、`router.ts` 16、options 各 tab 15-16、`detail/App.vue` 15。
- **被 import 最多的核心**：`src/types` **52**、`UmmPageLayout` 32、`utils/cn` 30、`src/utils` 26、`features/database` 24、`src/config` 15、`utils/logger` 11、`utils/event-bus` 10。
- **入口/依赖方向**：`entrypoints→src` 单向成立，唯一反向是 `content/douban→entrypoints/content`（6 处，P1-2）。无跨入口互引成环。

---

## 3. 性能优化调研

### 3.1 性能发现清单

#### P0-1 🆕 Douban 全量代码打进单一 chunk

**[Fact]** `douban-main.js` 实测 **752.10 KB**（770,160 B）。`main.ts:26-92` **静态 import 全部 31 个页面 config**；`css-map.ts:11-55` 静态 `?raw` import 全部 CSS（源码合计 257,357 B / 44 文件）；产物中**无任何 `import(`**（grep 验证）。
> WXT 对 content script 的 IIFE 打包将 `importApp: () => import('./App.vue')` **内联**，代码切分完全失效。这是 css-map.ts 出边数 45（全库第一）与 P0-1 的**同一根因**：结构问题直接转化为性能问题。
- **影响** [Assumption]：每个匹配 `*://*.douban.com/*` 的页面（含无 overlay 的 `/subject/x/comments`、`/coming`、`/celebrity/*`）在 `document_idle` 都解析/执行 ~752 KB。Chrome 从磁盘加载 content script **无 gzip**，解析成本全额落在每次豆瓣页面打开。
- **手段 [Decision]**：(a) 按页面组拆多个 content script entry（各配窄 `matches`）；(b) CSS 改 `cssInjectionMode` / 独立 `web_accessible_resources` 按需注入，不要把 44 份 CSS 全打进 JS；(c) 至少把非匹配页在 `main()` 顶部短路。
- **收益**：高（首屏解析体积可从 ~752 KB 降至每页 ~30–60 KB）。**成本**：中。**风险**：中（改入口结构，需逐页 QA）。

#### P0-2 🆕 `icon-original.png` 680.60 KB 死重

**[Fact]** `wxt.config.ts:38` `publicDir: 'icons'` 将 `icons/` 全量拷入 dist；实测 `dist/chrome-mv3/icon-original.png` **696,923 B**，但 `manifest.json` 的 `icons` 仅引用 `icon-16/48/128.png`；`icon-original.png` 仅被 `scripts/resize-icons.ts:14`（构建期脚本）引用。占包体 **29%**。
- **手段 [Decision]**：移出 `icons/` 到 `scripts/` 输入目录（或加入 WXT 忽略），仅保留三尺寸 PNG。
- **收益**：高（包体 −29%）。**成本**：极低。**风险**：极低。

#### P0-3 ♻️ DataScheduler 全局串行队列 + 重试/超时交互

**[Fact]** `data-scheduler.ts:155-174` `processLoop` 逐个 `await executeTask`（**严格串行**）；`rate-limiter.ts:11-12` 令牌桶 `maxRequestsPerSecond=10`、`burst=5`；`types.ts:130-133` `DEFAULT_TASK_TIMEOUT=8000`、`MAX_QUEUE_SIZE=1000`；`types.ts:82-87` `maxRetries=3, baseDelay=1000, maxDelay=10000`（回退 1s+2s+4s=7s）。
- **影响** [Assumption]：`GET_STATISTICS` / `GET_ALL_RECORDS` / `EXPORT_DATA` / `WEBDAV_*` 是 60s 级长任务（`background.ts:323-358`），单任务独占队列期间其他标签页的 `DB_GET` / `DB_PUT` 全部排队。重试回退 7s + 执行时间**可超过 8s 任务超时** → 超时已触发但 `opPromise` 仍后台续跑（`data-scheduler.ts:196-245` late-settle 路径），形成「报失败但实际继续写」的语义。速率 10/s 意味着若某路径退化为逐条消息写，3000 条 = 最低 300s。
- **手段 [Decision]**：(a) 长任务走独立低优先级队列或旁路，不与交互级 DB 读写争抢串行槽；(b) 重试回退与任务超时解耦（超时按「单次尝试」计，不包裹整个 retry 循环）；(c) 保留 `batchPut` 单事务路径，禁止新增逐条 put。

#### P1-1 🆕 NeoDB 请求无超时，SW 挂起风险

**[Fact]** `features/neodb/api.ts:59-76` `fetchWithRetry` 用裸 `fetch`，**无 AbortController/超时**，仅对 5xx 与网络异常各重试 3 次；对比 `features/webdav/api.ts:18,39-58` 有 30s 超时。`background.ts:362-364` `NEODB_PUSH_RATING` **未过 scheduler**，直接 `await` 网络调用。
- **影响** [Assumption]：NeoDB 挂起时 SW 被该 Promise 保活、消息端口悬挂；内容侧 `api.ts:50` 8s 超时放弃后，SW 仍在跑该 fetch。
- **手段 [Decision]**：`fetchWithRetry` 加 AbortController 超时（与 WebDAV 对齐 15–30s）；`NEODB_PUSH_RATING` 纳入 scheduler 或显式超时。

#### P1-2 ♻️ PT dimmer 写后全表重扫 × 全 tab 广播放大

**[Fact]** `event-bus.ts:12-31` `broadcast` 用 `chrome.runtime.sendMessage` 向**所有** content script 广播；每次 `DB_PUT/DELETE/SYNC`（`db.ts:87/103/210/221`）与 import（`data.ts:201`）都触发。PT 页 `dimmer/index.ts:223-241` 收到写入后 `clearResolvedMarkers()`（`querySelectorAll('[data-umm-resolved]')` 全表清标记）+ 300ms 去抖后 `process()` 整表重扫。
- **影响** [Assumption]：开 N 个标签页时，任意一次保存 = N 次消息投递；若在 PT 列表页开着，保存一条豆瓣记录即全表重扫一次。
- **手段 [Decision]**：广播按 `tabs.query` 只投递给订阅了该事件的 tab（或引入按 tab 订阅注册）；dimmer 只对受影响行 patch。

#### P1-3 ♻️ SW wake 冷启动残余

**[Fact]** ADR-014 已把 **watched-ids + settings** 放进 L1.5 session（`db.ts:161-174`、`settings/cache.ts:36-48`、`cache-invalidation.ts:64`），但 scheduler 的 `get:/all:/bulk:` 与 `MediaDatabase.readCache` 仍只在 L1（`cache-manager.ts:27-33`、`models.ts:110-113`），SW wake 即清空（`data-scheduler.ts:11-15` 注释自认）。
- **影响** [Assumption]：每次 SW 唤醒后首次 `GET_STATISTICS` / `GET_ALL_RECORDS` / `EXPORT_DATA` 触发 `collectStoreEntries` 对 7 个 store 做**全表 cursor 扫描**（`data.ts:219-229`、`models.ts:346-393`），重度用户为数百 ms~秒级。`getWatchedIds` 仍每次 `console.log`（`models.ts:474`）——SW 热路径无效日志。
- **手段 [Decision]**：统计/导出走索引（`count()` + `status`/`updatedAt` 索引）而非 `getAll` 全扫；移除 `models.ts:474` 热路径日志。

#### P2 级残余

- **P2-1 ♻️** `PriorityQueue.dequeue()` 用 `Array.shift()` O(n)（`priority-queue.ts:44`）。`MAX_QUEUE_SIZE=1000` 时排空总代价 O(N²)（约 5×10⁵ 次搬移）。→ 改 head 指针。收益/成本/风险均低-极低。
- **P2-2 ♻️** i18n 双系统数据重复 + vue-i18n 167KB chunk。`shared/locales/` 三语 24,511 B vs `entrypoints/content/i18n/locales.ts` 24,358 B，两套词典独立；`vue-i18n-*.js` 163.70 KB 仅供 SPA（懒加载，非 content 路径）。源码层 ~49 KB 重复维护。
- **P2-3 ♻️** 高频轮询/观察器残余：`useHomepageObserver.ts:78-92` 观察 `document.body` subtree + **1s×60s** `setInterval` 兜底（3 个 homepage 各一份）；`video-progress-tracker.ts:121-142` 双 `setInterval`（2s poll + fallback）；`bilibili.content:133`、`youtube-homepage.content:302` 3s URL 轮询；`dimmer/index.ts:186-195` body subtree MutationObserver（260ms throttle）。ADR-009 C7 的容器 Set 清理已修（`:45-49`）。

### 3.2 关键调度参数表

| 参数 | 值 | 来源 |
|---|---|---|
| RateLimiter | 10 req/s，burst 5，acquire 超时 10s | `rate-limiter.ts:11-12`、`types.ts:65-68` |
| Retry | 3 次，1s/2s/4s 回退 + jitter | `types.ts:82-87` |
| 任务超时 / 缓存 TTL / 队列上限 | 8s / 5s / 1000 | `types.ts:130-133` |
| WebDAV 超时 | 30s | `webdav/api.ts:18` |
| NeoDB 超时 | **无**（裸 fetch） | `neodb/api.ts:59-76` |

---

## 4. 结构优化与冗余调研

### 4.1 既有结论复核（11 项已修复 / 1 项仍有效 / 0 误报）

| 既有结论 | 复核 |
|---|---|
| `enhancers/douban-search-bar.ts` 死文件 | ✅ 已删（`Test-Path`=False） |
| 4 个纯转发 barrel（migration/neodb/webdav/stores） | ✅ 已删 |
| `deleteDataset()` 死函数 | ✅ 已删（grep 0 命中） |
| `BannerItem` 死接口 | ✅ 已删 |
| `MigrationStatus` 契约接线 | ✅ 已修（`migration/models.ts:341` 显式返回类型） |
| legacy douban 链（douban.ts/douban-neodb/douban-toast/douban-sync/douban-scanner/douban-search） | ✅ 已删（`neodb-push.ts`/`doulist-replace.ts` 按要求保留） |
| `memoizer/`、`memory-manager/`、`features/identity/`、`ttl-cache-store.ts` | ✅ 已删 |
| `optimistic-lock.ts` 死类（仅留 types.ts） | ✅ 已修 |
| `errorMessage()` 收敛到 utils | ✅ 22 处全部 `import { errorMessage }` |
| `migrate-data.ts` 孤儿脚本 | ✅ 已删 |
| tmp-true-dead.json 三符号 | ✅ 全部已删 |
| **`add-umm-prefix.js` 孤儿脚本** | ⚠️ **仍有效**（`Test-Path`=True，package.json 无引用） |

### 4.2 死导出检测（独立复核）

**[Fact]** src+tests+scripts 全量具名导出 **175 项「零外部引用」**，三分法：

1. **真死（可删，3 项）**：`content/styles/tokens.ts:73/80/87` 的 `COLOR_MINUS_START_DARK`、`COLOR_PLUS_START_DARK`、`COLOR_ORIGINAL_START_DARK`。全仓含 `check-design-tokens.cjs` 均无引用——**ds:check 只校验 LIGHT 变体**（`scripts/check-design-tokens.cjs:101-105`），DARK 变体从设计上就无人校验。
2. **误报（44 项）**：`css-map.ts` 的 CSS chunk 常量，经 `cssMap` 聚合对象间接存活（`mount-factory.ts:32 import { cssMap }`）。**[Assumption]** 聚合对象消费、不逐名引用，非死代码。
3. **过度导出（~128 项）**：文件内自用但 `export` 多余。最大簇：`url-detector.ts` 40 个 `isXxxPage` 谓词（路由仅走 `detectPageType` 单入口）、`css-composer`/`mount-factory` 配置类型、各 `data.ts` 结果接口、`domain/*` 的 `IdentitySnapshot`/`StatusCode`/`MediaTypeId` 等类型面。

> **机制根因** [Fact]：`noUnusedLocals` **只查局部变量，不查未用导出**——这是死导出持续累积的结构性原因。项目无 lint（AGENTS.md 确认「无 lint/format 命令」），因此该检测缺口无人补位。

### 4.3 🆕 `Utils` 单例约 200 行死方法

**[Fact]** `src/utils/index.ts` 的 `Utils` 单例（267 行）约 200 行为死方法。外部仅调用 `clampRating10` / `formatRating10`（grep `Utils\.` 13 命中，仅这 2 个为外部，分布在 6 文件）。`safeParse`/`normalizeStatus`/`nowISO`/`normalizeUrl`/`dimElement`/`getRandomDelay`/`canonicalArrayMap`/`toArrayOfObjects`/`formatRelativeTime` 及三个 `@deprecated` 委托（`throttle`/`debounce`/`sleep`）与废弃 `waitForElement`（:107-138）零调用。
其中 `Utils.dimElement`（mouseenter 匿名监听泄漏版，:143-156）与 PT 模块活用的 `pt/utils.ts:8 dimElement`（classList 版）**重复**。
- **影响**：死面掩盖真实 API 面；`normalizeStatus` 与 domain `Status` 值对象构成**第三重状态表示**（blueprint B5 未清完）。
- **建议**：删死方法，保留 2 个活跃方法并独立导出。规模 −~200 行，风险极低。

### 4.4 超大文件 Top 榜（>400 行共 12 个）

| 行数 | 文件 | 拆分建议 |
|---|---|---|
| 702 | `content/styles/global.ts` | CSS 字符串常量，按 concern 拆（scrollbar/badge/neodb/chip）或迁 css 文件 |
| 659 | `database/models.ts` | IDB 单例 + 迁移 + sync 混居 → 拆 `idb.ts` / `sync.ts` |
| 652 | `handlers/mukaku/handler.ts` | 单 handler 过长 → 拆 DOM 抓取 / 渲染 |
| 576 | `content/ui/video-overlay.ts` | 两入口共享模块，寄生于 content 目录（见 §2.2 P2-5） |
| 560 | `background/handlers/webdav.ts` | 上传/下载/同步三职责 → 拆子模块 |
| 518 | `content/i18n/locales.ts` | 4 locale × 452 键单文件 → 拆 `locales/{en,zh-CN,zh-TW,zh-HK}.ts` |
| 511 | `content/utils/toast.ts` | FloatingToast 单文件，样式模板可外置 |
| 464 | `options/tabs/OverviewTab.vue` | SFC 拆子组件 |
| 460 | `douban/pages/detail/App.vue` | 模板已外置 composables，可继续拆 |
| 454 | `content/ui/doulist-replace.ts` | 弹窗模板 + 逻辑混居 |
| 412 | `background.ts` | switch 已分 handler，剩余多为样板 |
| 403 | `domain/identity/Identity.ts` | 含 URL 解析大表 → 拆 `url-table.ts` |

> 382–317 行的 8 个（含 `personage-creations-data.ts` 377、`game-detail-data.ts` 319、`user-profile-data.ts` 343）为页面数据提取器，行数高但**内聚单一，不建议强行拆**。

### 4.5 重复逻辑组

| 组 | 状态 | 建议 |
|---|---|---|
| 分页器 | ✅ 已收敛（blueprint D1），仅剩 `series/data.ts:65` 与 `doulist-detail-data.ts:154` 各 1 行薄包装 | 可内联 2 处 |
| `escapeHtml` | 🔴 **新发现残留**：`utils/escape-html.ts`（canonical）→ `content/utils/dom.ts:10` re-export，但 `handlers/sehuatang.ts:49` **仍有一份手写复制** | 改 import 共享版，−6 行 |
| `dimElement` | 🔴 新发现：`Utils.dimElement`（死）vs `pt/utils.ts:8`（活） | 删死的，唯一化 |
| toast 浮层 | 🟡 已半收敛：`shared/toast.ts`（类型/常量 SSOT）+ `composables/useToast.ts`（SPA）+ `content/utils/toast.ts`（511 行 DOM 版） | [Decision] 两个渲染实现因 Shadow DOM 边界保留，合理 |
| retry/backoff | 🟡 仍 5 处：`douban/shared/retry.ts` vs `data-scheduler/retry-policy.ts` vs `utils/context.ts:72`、`neodb/api.ts:64`、`background/handlers/neodb.ts:74` 内联 | 后 3 处内联 backoff 可调 `retry-policy` |
| `formatRating10` | `handlers/bangumi-list-extract.ts:99` 注释明言「与 Utils 完全一致但零依赖」刻意复制 | [Decision] 有意隔离，保留补注释 |

### 4.6 模块边界与配置健康

- **[Fact] 命名冲突仍未解决**：`shared/identity.ts` 与 `domain/identity/Identity.ts` 同名。typed 调研确认前者已 delegate 到 domain（`shared/identity.ts:14` 起），module-audit 称已改名 `DomainIdentity` 别名——但**名字本身仍冲突**。另有 `src/utils/escape-html.ts` 与 `content/utils/dom.ts` 的 escapeHtml re-export 形成 `utils→content` **反向依赖**。
- **[Fact] `optimistic-lock/` 单文件目录**：仅 `types.ts`（`WriteResult`），被 `database/models.ts:26` import。建议并入 `database/` 或升为 `domain/`。
- **[Fact] barrel 风险仅剩 1 处**：`features/database/index.ts` 混出 `Store` + `models`（§2.2 P2-3）。`shared/ui/*/index.ts` 13 个为 shadcn 组件桶（每桶 1–8 行，健康）。`shared/ui/card/index.ts` 的 `CardTitle/CardDescription`、`dialog/index.ts` 的 `DialogScrollContent` 零引用。
- **[Fact] 脚本**：scripts/ 14 文件，孤儿 3 个（`add-umm-prefix.js`、`qa-bangumi-e2e.mjs`、`qa-bangumi-selectors.mjs`）。职责重叠：`data-export.js`/`data-import.js`/`unpack.js` 三脚本共享 adm-zip 数据格式逻辑但各自实现。`fix-paths.js` 必要性复核**成立**（注释 :66：WXT 0.20.26 强制 `open_in_tab=false`，需后置补丁；CI `.github/workflows/ci.yml:47-49` 仅 chrome 分支执行）。
- **[Fact] `components.json` 别名漂移**：`"components":"@/components"` 指向不存在的目录（实际在 `src/shared/ui/`）、`baseColor:"slate"` 与 ADR-018 品牌色偏离、`"config":""` 空。
- **[Fact] 元数据冗余**：`wxt.config.ts:9 VERSION` 与 `package.json` version 双源手工同步（注释自认）；`README.md`（126 行/5KB）vs `README.en.md`（570 行/27KB）**分叉 4.5×**，内容已不对称；`CHANGELOG.md` 1834 行/143KB 单文件。
- **[Fact] 门禁盲区**：`scripts/*.ts` 与 `tests/` **不在 tsconfig include**（仅 `src/**`），`type-check` 不覆盖 `resize-icons.ts` 与全部 68 个测试源码。
- **[Fact] i18n 结构**：`shared/locales/`（vue-i18n，192 键 × 3 locale）vs `content/i18n/locales.ts`（自研 t()，452 键 × **4** locale 含 zh-HK）。键名重叠：`platform.douban/imdb/tmdb/bangumi`、`status.*`、`neodb.*` 两处维护。**locale 数量不一致（3 vs 4）** → 至少统一 zh-HK 取舍。ADR-017/refactor「不迁移 chrome.i18n」仍成立（Shadow DOM 内 vue-i18n 不可用，键模型也不同——content 侧是「英文句为键」flat 结构）。
- **[Fact] 测试覆盖盲区**：popup/options 全部 Vue 组件、`shared/ui` 组件、4 个 composables、3 个 stores、`css-composer.ts`/`mount-factory.ts`、`background.ts` 主 switch、`bilibili*.content`/`youtube-homepage.content` 入口、`webdav/api.ts`/`neodb/api.ts` 客户端主体。已有覆盖密集于 domain、mukaku、pt、douban 提取器。

---

## 5. typed 类型安全优化调研

### 5.1 断言/any 全量统计（生产 vs 测试分离）

| 模式 | src | tests | 备注 |
|---|---|---|---|
| `as any` | **2（均在注释）** | 3 | 实际代码 = **0** |
| `as unknown as` | **12** | 26 | 见 §5.3 |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | **0** | **0** | — |
| `: any`（类型标注） | **41**（17 文件） | 0 | 见 §5.3 |
| `= any`（泛型默认） | 2 | 0 | `context.ts:33`、`utils/index.ts:11` |
| `any` 总词频 | 101（63 文件） | 20 | — |
| `as const` | 62（28 文件） | — | — |
| `satisfies` | **4** | — | `items.ts` 是唯一关键用例 |
| `<const` 类型参数 | **0** | — | 未采用 |
| 其它 `as X` | 435（149 文件） | — | 多为 DOM 边界 |
| `as HTMLElement` | 112（48 文件） | — | DOM 边界 |

**[Decision 结论]** AGENTS.md「禁止 `as any`/`@ts-ignore`」在生产代码被 **100% 遵守**。残余集中在 `as unknown as`（12）与 `: any`（41）。

### 5.2 🆕 消息层类型化强度

- **[Fact]** `RuntimeMessageEnvelope`（`messages.ts:111-115`）是**真正的判别联合**，每个成员带字面量 `type`。且 **union→map 完整性有类型层保证**：向 `MessageType` 增员而不在 `MessagePayloadMap` 加键，会因 `MessagePayloadMap[K]` 索引报错被 vue-tsc 拦下。**反向（map 多键、union 缺）无保证**（多余键静默无用）。
- **[Fact] 我自己复核确认**：`background.ts:389-391` 存在 `default: debugLog('Unknown message type'…) + sendResponse({success:false,...})`，且 `handleMessage` 返回 `void` → **无 exhaustiveness check（无 `never` 断言）**。「新增消息类型」的第三处同步（switch case）**无编译期保护**，遗漏静默落入 default。既有 type-audit §6 提过「3 处同步」但**未指出 switch 无 never 断言**。
- **[Fact]** `sendResponse` **未类型化为判别联合**：`error-message.ts:14` `type SendResponse = (response?: unknown) => void`，所有 handler 的 `{success,data/error}` 是 ad-hoc 形状。
- **[Fact]** 响应体 100% any 的 3 个源头（**主 agent 复核确认**）：
  - `utils/context.ts:86` `sendMessageWithTimeout(...): Promise<any>`
  - `features/database/api.ts:44,49` `send(...): Promise<any>` + `new Promise<any>`
  - `features/adult-av/index.ts:4` `sendMsg<K>(...): Promise<any>`
- **[Fact]** 裸 `chrome.runtime.sendMessage` 9 处/5 文件，其中**绕过类型化信封 2 处**：`bilibili-homepage.content/index.ts:152`（内联 `{type:'DB_GET'}`）、`content/douban/pages/photos/App.vue:125`（`DOWNLOAD_FILE` fire-and-forget）。
- **风险 P1 / 手段**：定义 `ResponseMessageMap` + 泛型 `sendResponse<T>` / `safeSendMessage<K>`，返回 `{success:true;data:X}|{success:false;error:string}` 判别联合。**规模 S-M，零运行时改动。**

### 5.3 高危断言 Top 清单

| # | 位置 | 级别 | 理由 |
|---|---|---|---|
| 1 | `utils/context.ts:86` `Promise<any>` | **P1** | 全仓消息响应默认 any，最大单点泄漏 |
| 2 | `features/database/api.ts:44/49` `Promise<any>` | **P1** | DB API 层响应无类型，调用方靠 `res?.record` 猜 |
| 3 | `utils/error-message.ts:14` `SendResponse = (response?: unknown) => void` | **P1** | 响应无判别联合，handler 可返回任意形状 |
| 4 | `content/neodb-push.ts:70/172/183` `currentIdentity: any` | **P1** | 真实 `UrlIdentity` 被擦成 any 贯穿 push 全链路 |
| 5 | `features/neodb/api.ts:119` `{ uuid; [key:string]: any }` | **P1** | NeoDB 目录响应索引签名 any |
| 6 | `features/webdav/api.ts:168` `return raw as RemoteMeta` | **P1** | 外部 meta.json 断言信任（下游有 allowlist 兜底，但本函数无守卫） |
| 7 | `features/migration/models.ts:83/165/264` `(record:any)=>any` / `migrateRecord(raw:any)` / `as MigrationResult<StoreRecord>` | P2 | 迁移引擎全 any + 硬断言 |
| 8 | `entrypoints/background.ts:151` `mediaDB as unknown as DbAdapterForRepo` | P2 | 领域仓储适配器接缝硬断言 |
| 9 | `shared/plugins/i18n.ts:33` `messages as unknown as Record<Locale, MessageSchema>` | P2 | locale 消息表整体断言，键缺失静默 |
| 10 | `features/settings/cache.ts:79` `(cache as unknown as Record<string,unknown>)[key] = …` | P2 | 动态键写，绕过字段类型 |
| 11 | `domain/record/statistics.ts:67` `stats as unknown as Record<string,number>` | P2 | 本可显式字段，断言掩盖键漂移 |
| 12 | `features/adult-av/index.ts:7` `{type,payload} as RuntimeMessageEnvelope` | P2 | 泛型对不可证为联合成员（已注释，受控边界） |
| 13 | `features/data-scheduler/requestQueue.ts:22-24` `Promise<any>`/`(value:any)`/`(reason:any)` | P2 | 队列内部 any，削弱 `enqueue<T>` 泛型 |
| 14 | `entrypoints/background.ts:116-117` `newValue as boolean \| undefined` / `as LogLevel` | P2 | storage.onChanged 的 newValue 直接断言 |
| 15 | `features/database/record-repository-adapter.ts:16` `get(...): Promise<any>` | P2 | 仓储适配器响应 any |
| 16 | `entrypoints/background.ts:67` `message: any` | P2 | storage.onChanged 载荷 |
| 17 | `window.__X__` 全局注入 6 处（create-overlay:91、detail/config:69、game-detail/config:55、game-explore-data:282、search-data:27、bangumi.ts:37） | P3 | **边界不可避免** |
| 18 | `app._instance.proxy as unknown as …`（detail/config:55、game-detail/config:48） | P3 | Vue 内部 proxy 类型 any，边界不可避免 |
| 19 | `utils/logger.ts:47/53/59/65` `...args: any[]`；`utils/index.ts:81/93` throttle/debounce | P3 | console 透传惯例，纯防御 |
| 20 | `utils/index.ts:168/182` `canonicalArrayMap(raw:any)` / `toArrayOfObjects(raw:any)` | P3 | Tampermonkey 迁移遗留 |

### 5.4 领域层类型质量

- **[Fact]** `StoreRecord` 聚合根不可变性被**双强制**：8 个 `readonly` 字段 + `constructor` 内 `Object.freeze(this)` + `linkedIds` 单独 freeze（`StoreRecord.ts:42/60/63`）。
- **[Fact] 但序列化形式弱化**：`StoreRecordSnapshot.status: number`（:255）、`rating: number`（:256）**非字面量联合**——`StatusCode(0|1|2|3)` 与评分 0–10/0.5 步在 wire 层退化为 `number`。更关键：`types/index.ts:24` `StoreRecord = StoreRecordSnapshot`（@deprecated 别名）使 DB/消息层拿到的「StoreRecord」是**可变快照**，`models.ts:238/251/283/289/333` 直接 `record.updatedAt=… / record.recordVersion=…` 原地改。
  > **不可变性只在 domain 类上成立，跨层即失。** 这与 §2.2 P1-1 中 `useCrossPlatformSync.ts:85` 的 `as StoreRecord` 断言是同一问题的两面：断言掩盖了形状分叉。
- **[Fact]** `Status` 用 `StatusCode = 0|1|2|3` 字面量联合（`Status.ts:21`），构造器私有、只能经 `fromCode/require`；`Rating` 内部 `number` **无 branded type**，约束靠 `fromNumber` 运行时校验。二者未用 branded type，snapshot 层穿透的裸 `number` 无类型防线。
- **[Fact]** `Identity.fromUrl` 返回 `Identity | null`（`Identity.ts:82`）——解析失败分支已用 nullable union 表达（够用，虽非 Result/Option）。⚠️ 附带运行时缺陷：`Identity.ts:162-167` YouTube 分支是**文档自认的死路径**（`canonicalizeUrl` 先剥离 query 导致 `searchParams.get('v')` 永不命中），类型系统无法捕获。
- **[Fact]** `IRecordRepository`（`IRecordRepository.ts:15/21`）`storeName: string` **未收窄**：任意字符串可穿透。应改为 `RecordStoreName` 或由 `Platform.KNOWN` 派生的联合。

### 5.5 API 边界与外部输入

- **[Fact] IndexedDB 读侧有运行时校验（优于同类项目）**：`normalizeStoreRecord`（`migration/models.ts:241-265`）做对象类型检查 + `RECORD_FIELD_WHITELIST` + status/rating 范围/整数校验 + 未知字段剥离（CWE-915）。**但输入签名是 `any`**，迁移链全程 any，最后靠 `as MigrationResult<StoreRecord>` 硬断言回信任形状。
- **[Fact] 网络响应纯 `as T` 信任，无 zod/valibot/类型守卫**（zod 未安装）：`webdav/api.ts:159` `raw.datasets.map((ds: any)=>…)` + `:168 return raw as RemoteMeta`，meta.json 来自外部服务器，仅 `Array.isArray(raw.datasets)` 一层检查；下游 handler 有 `BACKUP_STORES.includes(ds.key as RecordStoreName)` 守卫（`webdav.ts:321/417`）兜住，但 `fetchRemoteMeta` 自身可被构造出非 string 的 `key/hash`。`neodb/api.ts:119/142/168/196` 响应与请求体全 any。
- **[Fact] 空值处理质量良好**：`querySelector(...)!` 仅 4 处、`getElementById(...)!` 5 处（2 文件）。DOM 空值多为 `if (!el) return` / 可选链。

### 5.6 设置层与配置

- **[Fact] 项目内最到位的类型设计**：`items.ts:140-142` 的 `satisfies { [K in keyof ResolvedAppSettings]: { defaultValue: ResolvedAppSettings[K] } }` 保证 AppSettings 15 字段 ↔ 15 个 item 一一对应，**缺一个字段即编译错**（全仓 4 处 `satisfies` 之一）。`defaultAppSettings()` 由 item fallback 派生，fallback 单源（ADR-017 D5' 落地）。
- **[Fact] 但双源一致性有缺口**：`STORAGE_KEYS`（`config.ts:14-30`，15 键）与 items（15 项）各自维护，物理键经**命名约定**对齐，**无类型层交叉校验**——改坏某 `STORAGE_KEYS` 常量的字符串会静默落到错误物理键（数据兼容性风险）。可加 `satisfies Record<keyof AppSettings, string>`。
- **[Fact]** 既有 type-audit「`Provider = string`」✅ **已修**：`config.ts:35` `export type Provider = (typeof Platform.KNOWN)[number]`，**完整覆盖 10 平台**。但 `RecordStoreName` 与 `STORE_NAMES`/`RECORD_STORES` 仍是手工硬编码联合，与 `Platform.KNOWN` 无派生关系——`javdb/mukaku/sehuatang` 在 KNOWN 中却不在 `RECORD_STORES`（走 jav_ids），这条「平台→store」映射是**隐性约定**，平台增员不触发 store 名单的编译检查。（与 §2.2 P2-1 同一发现，从 typed 角度确认。）

### 5.7 Vue 层与工具链

- **[Fact]** `defineProps<T>` **93 处/93 文件**，`defineEmits<T>` 12 处，`withDefaults` 7 处；**无任何 defineProps 含 `any`**。Pinia store（`stores/app.ts`）state 用 `ref<StoreRecord[]>` 显式类型化，但 action `loadData` 内 `safeSendMessage` 返回 `any` → `recordsRes.records` 失去类型（**上游 any 污染 store**）。
- **[Fact]** 32 个 Douban 页面四件套类型共享质量高：以 `detail` 为例，`types.ts` 独立接口 + `detail-data.ts` barrel 再导出 + `config.ts` 组装，`DetailData.identity: import('@/types').UrlIdentity`（`types.ts:71`）**复用全局 DTO 类型**。页面级提取器仍有 1 `: any` + 15 `as` 断言，属 DOM 抓取边界。
- **[Decision] 工具链开关评估**（TS 6.0.3 可用）：

| 选项 | 预期收益 | 预估报错量/成本 |
|---|---|---|
| `verbatimModuleSyntax` | 强制 `import type` 显式、可空置；与 `erasableSyntaxOnly` 正交 | **小**：项目已大量手写 `import type`，预计 <50 处 |
| `noUncheckedIndexedAccess` | 数组/Record 索引返回 `T\|undefined`，命中 `stats[dimension]`、`linkedIds[k]`、`items[key]` 等高频点 | **大**：预计 100-300 处需加 `??`/guard |
| `exactOptionalPropertyTypes` | 区分 `prop?: T` 与 `prop?: T\|undefined`，防 `undefined` 穿透 | **中**：AppSettings 全可选字段需统一语义 |
| `noPropertyAccessFromIndexSignature` | 禁点访问索引签名 | 中（`neodb [key:string]:any` 等会暴露） |
| `noImplicitReturns` / `noImplicitOverride` | 显式 return / 显式 override | 小-中 |

- **[Fact]** `satisfies` 仅 4 处（可推广到 `STORAGE_KEYS` / `RecordStoreName` 派生校验）；`const` 类型参数 **0 处**（`as const` 62 处仍靠值侧断言，可用 `<const T>` 收敛）。

---

## 6. 交叉发现（本轮综合价值所在）

单一专项看不到、但四轴叠加后清晰浮现的结构性根因：

### X-1 🆕 一个根因，三轴症状：scenario 层缺位

`useCrossPlatformSync.ts` 这一个文件同时踩中三条：
- **架构**（P1-1）：第二套同步引擎，rating 语义分歧 → 用户可见正确性问题。
- **typed**（§5.4）：`:85` `as StoreRecord` 硬断言掩盖形状分叉；直调 `Store.dbGet/dbPut` 绕过 `IRecordRepository` 收窄接口。
- **架构**（P2-1）：内部硬编码 `'imdb_records'` / `'tmdb_records'` / `${platform}_records`（:38/39/74），未引 `STORE_NAMES`。

> **推论 [Assumption]**：修这一个文件同时消除 3 处症状。这是本轮**优先级最高的单一改动**。

### X-2 🆕 `css-map.ts` 出边 45（全库第一）= P0-1 单 chunk 的根因

结构轴测出「耦合枢纽」，性能轴测出「单 chunk 752 KB」，二者是同一件事：`css-map.ts:11-55` 静态 `?raw` import 44 份 CSS，`main.ts:26-92` 静态 import 31 个页面 config，WXT 对 content script 的 IIFE 打包使 `importApp: () => import(...)` **内联失效**。
> **推论**：结构重构（拆 entry / CSS 外置）与性能修复（降解析体积）是同一个动作，不是两笔工作。

### X-3 🆕 `Platform.KNOWN` / `STORE_NAMES` / `RecordStoreName` 三重手工维护

- `Provider` ✅ 已派生自 `Platform.KNOWN`（`config.ts:35`）
- `RecordStoreName` ❌ 手写字面量联合（`types/index.ts:27`）
- `PLATFORM_HUES` ❌ 手写清单且混入非 KNOWN 成员 `local`
- store 名字面量 ❌ 散落 ≥20 处
- `IRecordRepository.storeName` ❌ 未收窄为 `string`

> **项目内两种派生纪律并存**：派生的（`Provider`）无漂移，手写的（其余）已产生隐性约定。[Decision] 统一到 `satisfies` + 派生模式，是**零运行时改动**的类型锁定。

### X-4 🆕 门禁盲区构成死代码的累积机制

- `noUnusedLocals` 只查局部，**不查未用导出** → 128 项过度导出、3 项真死常量长期存活。
- `tsconfig include` 仅 `src/**` → `scripts/*.ts`（含 `resize-icons.ts`）与 **68 个测试文件全部不经过 type-check**。
- 项目**无 lint**（AGENTS.md 确认）→ 无人补位上述两个检测缺口。

> **推论**：死代码不是纪律问题，是**检测缺口**。加 lint（`unused-imports`）或扩大 tsconfig include 是治本；继续手工 audit 是治标。

### X-5 🆕 域不可变性跨层失守 × typed 严格度冲突

`StoreRecord` 在 domain 内 `Object.freeze` 双强制不可变（§5.4），但 `types/index.ts:24` 的 deprecated 别名把它退化为可变快照，`models.ts` 5 处原地改，`useCrossPlatformSync.ts:85` 用 `as StoreRecord` 断言构造。
> **推论**：开启 `noUncheckedIndexedAccess` 前**必须先解决快照可变性**，否则两条线会在同一批代码上互相制造噪音。这是一个真实的排序约束。

---

## 7. 集成优化路线图（跨四轴去重后）

> 原则：波次内互不依赖、可并行；每波独立可验证可回滚；**禁止空抽象层**（umpp 纪律）。

### Wave 1 · 零运行时改动，纯类型层 + 纯包体（立即做，低风险）

| # | 动作 | 轴 | 规模 | 依据 |
|---|---|---|---|---|
| 1.1 | 外移 `icon-original.png`（P0-2）→ 包体 −29% | 性能 | XS | §3.1 |
| 1.2 | 删 `models.ts:474`、`neodb/api.ts:93-94` 等 SW 热路径日志 | 性能 | XS | §3.1 P1-3 |
| 1.3 | 定义 `ResponseMessageMap` + `sendResponse<T>` + `safeSendMessage<K>` + `db/api.send` 返回判别联合，**消灭 2 个 any 源头** | typed | S-M | §5.2 |
| 1.4 | `background.ts` switch 加 `assertNever` 穷尽检查 | typed | XS | §5.2 |
| 1.5 | `neodb-push.ts:70/172/183` `currentIdentity: any` → `UrlIdentity`；`statistics.ts:67` 断言改显式字段；`IRecordRepository.storeName` → `RecordStoreName` | typed | S | §5.3 |
| 1.6 | 删真死代码：`COLOR_*_START_DARK` 3 常量 + `Utils` 单例 ~200 行死方法 + `sehuatang.ts` escapeHtml 复制 + `card/dialog` 桶零引用成员 | 结构 | S | §4.2–4.5 |
| 1.7 | 删 3 个孤儿脚本（`add-umm-prefix.js`、`qa-bangumi-e2e.mjs`、`qa-bangumi-selectors.mjs`） | 结构 | XS | §4.6 |

**验收**：`type-check` 0 errors + `build` exit 0 + `ds:check` + `i18n:check` + `test:unit` 不新增失败（基线 11 个既有失败见 gotchas.local.md）。

### Wave 2 · 高收益中等工作量（逐页 QA）

| # | 动作 | 轴 | 风险 |
|---|---|---|---|
| 2.1 | **拆分 `douban-main` 单 chunk**（P0-1 / X-2）：先「非匹配页顶部短路 + CSS 移出 JS」降 ~250KB，再按页面组拆 entry | 性能+结构 | 中 |
| 2.2 | **`useCrossPlatformSync` 委托 `Store.dbSyncPageRecord`**，先补特征测试锁定现有行为差异（X-1） | 架构 | 中 |
| 2.3 | NeoDB `fetchWithRetry` 加 AbortController 超时；`NEODB_PUSH_RATING` 纳入 scheduler | 性能 | 低 |
| 2.4 | `RecordStoreName` 由 `STORE_NAMES` 派生；散落 store 名字面量改引常量；`STORAGE_KEYS` 加 `satisfies Record<keyof AppSettings,string>`（X-3） | 架构+typed | 低 |
| 2.5 | `features/database` barrel 只导出 `Store` + `STORE_NAMES`（P2-3） | 架构 | 低 |
| 2.6 | `optimistic-lock/types.ts` 并入 `database/`；`content/i18n/locales.ts` 拆 4 locale 文件；`components.json` 别名修正 | 结构 | 低 |

### Wave 3 · 需特征测试铺垫（治理类）

| # | 动作 | 轴 | 前置 |
|---|---|---|---|
| 3.1 | DataScheduler 长任务旁路 + 重试/超时解耦（P0-3） | 性能 | 调度语义特征测试 |
| 3.2 | `event-bus` 定向广播（`tabs.query`）+ dimmer 行级 patch（P1-2） | 性能 | PT dimmer 测试 |
| 3.3 | 为 `webdav fetchRemoteMeta` / `neodb` 响应加手写类型守卫 `isRemoteMeta()` / `isDataset()`（零依赖，zod 未装） | typed | — |
| 3.4 | 超大文件拆分：`global.ts` / `models.ts` / `webdav.ts` / `toast.ts` 按职责拆 | 结构 | 构建回归 |
| 3.5 | `content/douban` → `entrypoints/content` 反向依赖上移（FloatingToast / t / tokens / doulist-replace 入 `shared/`） | 架构 | 逐页 QA |

### Wave 4 · 严格度与基建（独立波次，勿与 Wave 1 混批）

| # | 动作 | 预估工作量 |
|---|---|---|
| 4.1 | `verbatimModuleSyntax` 开启 | <50 处 |
| 4.2 | 解决 §5.4 快照可变性（`StoreRecordSnapshot.status: StatusCode` + `models.ts` 原地改改重建），**这是 4.3 的前置** | S |
| 4.3 | `noUncheckedIndexedAccess` 开启（**单独成波**） | 100–300 处收窄 |
| 4.4 | `exactOptionalPropertyTypes` 开启 | 中 |
| 4.5 | 扩大 tsconfig include 覆盖 `scripts/` + `tests/`（先跑通修存量） | 中 |
| 4.6 | 为 X-4 的死导出检测缺口引入 `unused-imports` lint | 中 |
| 4.7 | 为 §4.6 盲区模块补特征测试 | 中-大 |

---

## 8. 不做清单（有意设计，勿动）

**[Decision]** 以下均经 ADR 或 refactor-plan 判定，边界合理，本次仅建议补注释：

1. **Shadow DOM overlay 自研挂载体系**（douban-early/main 双入口）：FOUC-free 的 `document_start` 预建 Shadow DOM 是有意设计，WXT 内置 UI 工具的单入口生命周期模型不适配双入口时序。（refactor-plan D3）
2. **自研类型化消息层**：`RuntimeMessageEnvelope` + `MessagePayloadMap` + switch 分发，无 payload 断言；`@webext-core/messaging` 未安装，引入为负收益。（D4）
3. **不迁移 `@wxt-dev/i18n` / chrome.i18n**：键静态化与 Shadow DOM 动态 locale 切换冲突；content 侧是「英文句为键」flat 结构，与 vue-i18n 键模型不同。
4. **保留显式深路径导入**（不启用 auto-imports）：grep 友好、无 lint 现状。（D1）
5. **`chrome.*` 不切换 `browser.*`**：机械统一波次，中低优先。（D2'）
6. **两个 toast 渲染实现**（SPA `useToast` + content 511 行 DOM 版）：类型/常量已 SSOT 化，两个渲染实现因 Shadow DOM 边界保留。
7. **`bangumi-list-extract.ts` 的 `formatRating10` 复制**：注释明言「零依赖」刻意隔离。
8. **WXT 0.21.4 不升级**：已是最新稳定版（2026-08-11 发布）。重构主题是工具层对齐，不是升级框架。
9. **32 页四件套的行数**：`personage-creations-data.ts`/`game-detail-data.ts`/`user-profile-data.ts` 等提取器行数高但内聚单一，不强行拆。

---

## 9. 验证与证据附录

### 9.1 主 agent 独立复核项（非转述）

| 断言 | 复核方式 | 结果 |
|---|---|---|
| `vue-tsc --noEmit` 0 errors | `npx vue-tsc --noEmit` → `EXITCODE=0` | ✅ 确认 |
| dist 体积 62 文件 / 2,347.1 KB | pwsh `Measure-Object` | ✅ 确认 |
| `douban-main.js` 752.10 KB | pwsh 排序 | ✅ 确认 |
| `icon-original.png` 696,923 B 且在 dist 中 | `Test-Path` + `Length` | ✅ 确认 |
| `useCrossPlatformSync` 覆盖 rating | read :30-99，:49 与 :81 均 `rating: newRating` | ✅ 确认 |
| `background.ts` switch 无穷尽检查 | read :378-405，:389 `default:` | ✅ 确认 |
| 3 个 `Promise<any>` 响应源头 | grep | ✅ 确认（context.ts:86 / api.ts:44,49 / adult-av:4） |
| 源码 402 个 .ts/.vue | glob 计数 | ✅ 确认 |

### 9.2 方法学限制

- **git 不可用** [Fact]：`git.exe` 被沙箱拒绝（`dubious ownership` + `拒绝访问`），`git config --global --add safe.directory` 修改全局配置超出 workspace-write 策略，未执行。因此**无 git log/grep 证据**；「已修复」类结论以**当前文件系统状态**为准（`Test-Path` / ripgrep），非 git 历史。
- **无联网** [Fact]：`web_search` 服务在本环境持续 404，版本信息均取自 `package.json` / `node_modules` / `CHANGELOG`。
- **madge 不可用**：循环依赖检测用自写 pwsh import 图 DFS（含 `export *` 再导出边）替代。
- **PowerShell shim 噪音**：`npm.ps1` 经 `StandardOutputEncoding` 捕获输出会崩溃，改走 `cmd /c`；`npm-prefix.js` 报错为环境问题，非项目问题。
- 死导出扫描：175 项零外部引用逐一核 `ownHits`；44 项 cssMap 误报判定为 **[Assumption]**（聚合对象消费，不逐名引用）。

### 9.3 既有结论复核矩阵（跨轴汇总）

| 来源 | 结论 | 当前有效性 |
|---|---|---|
| ADR-014 | L1.5 session（watched-ids + settings） | ✅ 有效；pt_id_cache 二期未实施（符合 ADR） |
| ADR-014 | get/all/bulk 未接 session 层 | ⏳ 有意保留（ADR 明确不纳入） |
| ADR-015 | detail 批量 dbGet + 事件驱动，3s 轮询移除 | ✅ 已落地；但**未触达统一 sync 引擎**（见 X-1） |
| ADR-016 | backup-settings（EXPORT_SETTINGS_KEYS / IMPORT_SETTINGS_KEYS 白名单） | ✅ 有效 |
| ADR-017 | settings 双源收敛（`items.ts:121-139` 全引 `STORAGE_KEYS`，fallback 单源派生） | ✅ 有效 |
| ADR-009 | C3 dbGetBulk / C8 timeout 清理 / M1 限流挂起 / H2 batchPut / H3 60s 超时 | ✅ 全部落地 |
| architecture-scan 08-03 | §1.1 storePlatformMap 缺 bangumi；§1.2 PLATFORM_HUES 缺 bangumi/mukaku；§2.1 bilibili/youtube 抽取；§2.3 neodb 内联 sync；§6 waitForElement 收敛 | ✅ 全部已修 |
| architecture-scan 08-03 | §6 content.ts vestigial 豆瓣代码 | ⏳ 未清（P3） |
| type-audit | CRITICAL 重复 URL 解析；HIGH `Provider=string`；MEDIUM StoreRecord 命名；LOW 消息魔法字符串；`safeSendMessage message:any` | ✅ 全部已修 |
| refactor-plan 08-21 | W0–W5 全波次获批准执行；D1/D2'/D3/D4 取舍 | ✅ 已执行；但 W4「scenario 归位」**未覆盖 douban detail 侧**（X-1） |
| dead-code / orphan-code audit | 11 项（死文件/死 barrel/死函数/死接口/legacy douban 链/死模块） | ✅ 已删 |
| script-audit | `add-umm-prefix.js` 孤儿 | ⚠️ 仍有效 |

---

## 10. 总评

**代码库健康度：良好。** 类型门禁干净（0 error / 0 `as any` / 0 ts-ignore）、0 循环依赖、domain 层纯净、`Provider`/`STORAGE_KEYS` 单源、内容脚本零 IndexedDB 直触、既有 ADR 与 audit 的结论**绝大部分已真实落地**——这是一份明显被认真维护过的代码库，不是技术债堆积的仓库。

**真正的短板只有两处，且都不是数据层或类型基线问题：**

1. **产物形态失衡**：`douban-main.js` 752 KB 未切分 + `icon-original.png` 681 KB 死重，二者合计约占 dist 总量 61%。前者直接转化为**每次豆瓣页面打开的解析成本**（content script 无 gzip），是投入产出比最高的方向。
2. **一个未被 2026-08-21 报告覆盖的第二同步引擎**：`useCrossPlatformSync` 与 `RecordService` 的 rating 语义分歧会造成**用户可见的正确性分叉**（豆瓣侧覆盖 IMDb/TMDB rating，NeoDB 侧保留）。这是本轮唯一带正确性后果的发现，建议优先于所有纯优化项。

**排序建议**：先做 Wave 1（零运行时、消灭 any 源头 + 包体 −29%）→ Wave 2.2（同步引擎收敛，带特征测试）→ Wave 2.1（chunk 拆分）→ Wave 3（治理）。Wave 4 的 `noUncheckedIndexedAccess` 必须等 §5.4 快照可变性解决后再开，否则两条线互相制造噪音（X-5）。

**本文件为本地稿，未修改任何源码，未 commit。** 执行前需用户批准，并按 umpp 纪律逐项过 `type-check → build → ds:check → i18n:check → test:unit` 门禁。

---

## 11. 复核附注（2026-08-29 13:5x，同日独立复调研后转正）

> 本稿转正时经一次独立复调研（重跑门禁 + 逐项实测），结论：**决策相关断言全部复现，符合**。

| # | 复核断言 | 独立证据 | 判定 |
|---|---|---|---|
| 1 | type-check 0 errors / exit 0 | 重跑 `npm run type-check` → vue-tsc EXITCODE=0 | ✅ |
| 2 | douban-main.js 752.10 KB 单 chunk | 实测 770,160 B；产物 grep `import(` 0 命中 | ✅ |
| 3 | icon-original.png 680.60 KB 死重 | dist 实测 696,923 B；manifest icons 仅 16/48/128 | ✅ |
| 4 | dist 2,347.1 KB / 62 文件 | 实测 62 文件 / 2,403,432 B | ✅ |
| 5 | 两套同步引擎 rating 分歧 | useCrossPlatformSync :76-86 `rating: newRating` vs RecordService :124-138「rating is NOT updated」 | ✅ |
| 6 | 响应体 any 源头 | context.ts:33/86、api.ts:44/49、adult-av/index.ts:4、record-repository-adapter.ts:16 | ✅ |
| 7 | 三重手工维护 | types/index.ts:27 ∥ models.ts:32-43 ∥ Platform.ts:14 | ✅ |
| 8 | 0 真 as any / 0 ts-ignore | 全 src grep：as any 仅 2 处均在注释；ts-ignore 族 0 | ✅ |
| 9 | content.ts vestigial 豆瓣 | matches :25-35,119-120 ∥ excludeMatches :122-133；isDoubanGamePage :169 恒 false | ✅ |
| 10 | 工具链基线 | package.json：wxt ^0.21.4 / TS ^6.0.3 / Vite ^8.2.1 / Vue ^3.5.41 等 | ✅ |

**原稿 3 处小出入（已在执行时按实测修正）**：
1. `requestQueue.ts` 实际位于 `src/utils/requestQueue.ts`（原稿写 `features/data-scheduler/requestQueue.ts`，该路径已不存在）。
2. `useCrossPlatformSync` rating 覆盖段实为 `:76-86`（原稿 `:66-86`，内容一致，行号漂移 10 行）。
3. `@/entrypoints/` 源侧反向引用实测 12 处（原稿 13 处），同源发现成立。

**执行偏差 2 处（相对原稿建议，执行时按项目约定收窄）**：
1. `IRecordRepository.storeName` 未改（原稿建议纳入接口）：domain 纯度约定禁止 domain 层 import `@/types`，改在 `record-repository-adapter` 基础设施层收窄。
2. `Utils` 保留单例形态、仅留 `clampRating10`/`formatRating10` 两方法（原稿建议独立导出）：为避免 6 文件无谓 churn 取最小改动。

**方法学限制延续**：web_search 本轮仍无结果，WXT「0.21.4 为最新稳定版」仍为 [Assumption]；0 循环依赖与 402 模块计数继承原稿 DFS 证据，本轮未重测。

**批准记录 [Decision]**：2026-08-29 用户批准——执行范围 **Wave 1 + Wave 2.2**；本稿转正 docs/audit/。执行证据见 CHANGELOG 与提交记录。
