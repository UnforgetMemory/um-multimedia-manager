# UMM 优化蓝图 — Architecture / Maintainability / Performance / TypeScript / Modern Syntax

- **日期**: 2026-08-02
- **状态**: ✅ **已全量执行**（5 波全部完成，2026-08-02；执行细节见 ADR-009）
- **依据**: `docs/audit/` 既有 7 份 audit（2026-07-12，部分已执行）+ AFT 健康快照 + 6 路并行侦查（2026-08-02 当前状态，含文件行号证据）
- **基线事实**: type-check 通过（strict + erasableSyntaxOnly）、0 循环依赖、`features/identity` 与 `douban-search-bar.ts` 已被删除、`withResolvers` 已在 `src/utils/requestQueue.ts` 使用（运行时底线已含 Chrome 119 API，无 `minimum_chrome_version` 声明）

---

## 0. Executive Summary

代码库**不是破损状态**——纪律良好（ADR 体系、audit 文化、type-check 干净）。本蓝图是**演化**而非救火，全部改动遵循 umpp 原则：**局部修复优先、禁止无谓抽象、每波可独立验证可回滚**。

| 维度 | 核心问题 | 规模 | 风险 |
|---|---|---|---|
| A. 死代码 | 158 项 dead code / 93 项未用导出；2 个死模块、1 个死类、2 套死 sync 实现 | 大 | 极低（删除为主） |
| B. TS 强化 | `Provider=string` 类型擦除、消息层 `any`、77 处 untyped catch、26 处 `payload!` | 中 | 低-中（逐批验证） |
| C. 性能 | N+1 消息往返、整库 `dbGetAll` 8 处、PT dimmer 全量重扫、SW wake 成本 | 高价值 | 中（需真机验证） |
| D. 去重 | 页面提取逻辑 7+ 副本、collect/reviews/profile 三大复制家族、CSS ~27% 重复 | 大 | 中（复制家族有安全分歧） |
| E. 现代语法 | 22 处内联 sleep、12 处星标串拼接、2 处 toSorted、retry 循环 16 处 | 机械 | 极低（type-check+build 门禁） |

**波次规划**（✅ = 已执行完成，每波独立可验证）：
- ✅ 波次 1：A（死代码清理）— 净删 ~2,900 行，2 个 SSOT 违规消除
- ✅ 波次 2：B（TS 强化）— Provider/STATUS SSOT、消息层全链路类型、26 payload! 归零、77 catch unknown
- ✅ 波次 3：E（现代语法机械替换）— sleep×22、★.repeat×12、withRetry×16、toSorted/??=/dateKey
- ✅ 波次 4：C（性能热点）— N+1→bulk、单事务 bulk、sync 事务架构解决、observer 清理
- ✅ 波次 5：D（去重合并）— parseRating×6、usePaginator×7、安全缺口×3；语义差异项评估后保留

---

## A. 死代码清理（波次 1，极低风险）

### A1. 🔴 重复 sync 实现（SSOT 违规，最高优先）
存在 **3 套** 跨平台 sync 逻辑，仅 1 套被调用：
1. `RecordService.syncRecord`（domain）— 被 `DB_SYNC_PAGE_RECORD` handler 使用 ✅ 保留
2. `MediaDatabase.syncPageRecord`（`models.ts:563`）— **0 调用者** 🗑️ 删除
3. `MediaDatabase.getRecordVersion`（`models.ts:317`）— **0 调用者** 🗑️ 删除
4. legacy `douban-sync/`（`syncToLocalStorage` + `syncCrossPlatformRecords`，自有状态映射 `pageStatusToNumeric`）— 见 A4

### A2. 🔴 死模块（0 消费者，AFT 确认）
| 模块 | 内容 | 处置 |
|---|---|---|
| `src/features/memoizer/` | `Memoizer` 类，无 import | 🗑️ 删除目录 |
| `src/features/memory-manager/` | `MemoryManager` 类，无 import（泄漏治理设施存在但从未接线） | 🗑️ 删除目录 |
| `src/features/optimistic-lock/optimistic-lock.ts` | `OptimisticLock` 类：**`write()` 甚至不落库**、0 消费者 | 🗑️ 删除类文件，保留 `types.ts`（被 models.ts 引用） |
| `TtlCacheStore`（L2 缓存） | `CacheManager` 仅一次实例化且**未传 l2**，生产路径永远走不到 L2 | 🗑️ 删除 `ttl-cache-store.ts` + `persist` 分支，或先补测试 |

### A3. 🟠 RecordService / RecordRepositoryAdapter 死表面
- `RecordService` 仅 `syncRecord` 被调用；`bulkUpdateStatus`、`deduplicate`、`merge`、`getWatchedKeysAcrossStores` **0 调用者**；且 `deduplicate` 是坏的（计算合并结果后 `void base` 丢弃，宣称去重实际不落库）
- `RecordRepositoryAdapter` 仅 `findByKey`/`save` 被走通，`query`/`getAll`/`batchGet`/`getWatchedKeys` 等 ~90% 死表面
- 处置：删除死方法；`IRecordRepository` 收窄为实际使用的 2 方法（或按 module-audit 建议实现/删除接口）

### A4. 🟠 legacy Douban handler 链（不可达路径）
`content.ts` 对全部 Douban 域名有 `excludeMatches` → legacy `router.ts` 的 douban 路由**永远不可达**：
- 🗑️ 可删：`handlers/douban.ts`、`handlers/douban-sync/` 整链、`handlers/douban-toast.ts`、`handlers/douban-neodb.ts`（重导 neodb-push）、`enhancers/douban-search.ts`（被新 search overlay 取代）、router 中 douban 路由
- ⚠️ **必须保留**（被新系统经 `legacy-bridge.ts` 引用）：`douban-scanner.ts` 的 `extractCrossPlatformLinks`、`neodb-push.ts`、`utils/toast.ts`、`i18n/`、`styles/global.ts`、`ui/doulist-replace.ts`（detail/game-detail config 直接调用）
- ⚠️ 先做调用图验证再删，删除后 `legacy-bridge.ts` 的 import 需重指向

### A5. 🟡 SEHUATANG_* 后台消息（无发送方）
内容脚本已改用 `AdultAvStore`（ADULT_AV_*），`SEHUATANG_*` 4 个消息类型 **0 发送方**：
- 删除：MessageType 4 成员、background.ts switch 4 case、`adult-av.ts` 中 ~75 行 legacy 包装（`handleSehuatang*`）
- ⚠️ `content/handlers/sehuatang.ts`（站点处理）**保留**——它已用 AdultAvStore

### A6. 🟡 小项
- `errorMessage()` 复制在 4-5 文件（background.ts:41 / webdav.ts:18 / bilibili.ts / download.ts / webdav/api.ts）→ 提取共享 util（本项也可归 D）
- `storePlatformMap` 在 data.ts 两个 handler 内重复定义 → 模块级常量
- AFT 列出的其余 dead code / unused exports（`config.ts` 的 `VERSION`/`STATS_KEYS` 等 93 项）→ 逐一核实后删除或加测试引用（rating-scale、search-normalizer 属 test-only，**保留**）

---

## B. TypeScript 强化（波次 2）

### B1. 🔴 `Provider = string` 类型擦除（type-audit 判定 High）
`config.ts:108`：`type Provider = string`。4 文件 import。与 `Platform.KNOWN`（9 平台）**两份平台清单**，改一处忘另一处即静默漂移。
- 处置：`type Provider = (typeof Platform.KNOWN)[number]`（SSOT），或独立字面量联合。逐文件收窄，type-check 门禁

### B2. 🟠 消息层类型强制
现状：`MessageType` 联合 + `MessagePayloadMap` 已存在（36 成员），但：
- `background.ts` `RuntimeMessage.type: string`（非 `MessageType`）
- 7 个 handler 签名 `payload: any`（toast.ts:18, neodb.ts:33, adult-av.ts:234, webdav.ts:82, db.ts:49/95/139/185）
- `api.ts` `send(message: any)`、`adult-av/index.ts` `sendMsg(type: string, payload?: any)`
- `background.ts` 26 处 `message.payload!` 非空断言
- 处置：`send<K extends MessageType>(msg: MessagePayloadMap[K])` 泛型 + handler payload 按 `MessagePayloadMap[K]` 收窄 → 消除 `payload!`

### B3. 🟠 untyped catch（77 处）
全部 77 处 `catch (e/err/error...)` 均未类型标注（tsconfig 未开 `useUnknownInCatchVariables`）。其中约半数读取 `e.message` 等。处置：`catch (e: unknown)` + 逐点收窄；未使用 binding 的改 `catch {}`。非机械，需逐文件

### B4. 🟡 弱类型清理
| 位置 | 现状 | 处置 |
|---|---|---|
| `types/index.ts:93` | `AdultAvId.source: string`（注释明言应 `'javdb'\|'sehuatang'\|'mukaku'`） | 字面量联合 |
| `types/index.ts:159` | `DB_QUERY.value: any` | `IDBValidKey` |
| `types/index.ts:162` | `DB_SYNC_PAGE_RECORD.platform: string` | `Provider` |
| `types/index.ts:190` | `NEODB_PUSH_RATING.record.type/provider: string` | 联合类型 |
| `api.ts:138/145/152` | `( {} as AppSettings )` 3 处 | 显式默认值 |
| `types/index.ts` | `StoreRecord` 接口 ≡ `StoreRecordSnapshot`（命名冲突） | 改导出 Snapshot（type-audit #3） |
| 15 处 | `as unknown as X` | 逐一评估 |

### B5. 🟡 SSOT 类型收敛
- `config.ts STATUS`（`'done'/'none'/'wish'` 字符串）vs domain `Status`（0/1/2/3）— 第三种状态表示
- `toast.ts VALID_TOAST_TYPES` vs `types/index.ts ToastType` 联合 — 双份

### B6. 🟢 `satisfies` 机会
仅 1 处使用（`shared/locales/index.ts`）。候选：`SITE_CONFIGS`、`PAGE_CSS_PRESETS`、`url-detector` 配置对象

---

## C. 性能热点（波次 4，每项需真机/Playwright 验证）

### C1. 🔴 N+1 `ptIdCacheGet`（PT 站最大延迟源）
`nexusphp.ts:98`：`process()` 对**每个未解析行** `await Store.ptIdCacheGet(url)`（逐行串行消息往返）；且循环**从不读** `data-umm-resolved`（line 112/161 写入但 56 行循环起点无检查）→ 每次 MutationObserver 触发（见 C4）重复整个 N+1 风暴。
- 处置：改用 `ptIdCacheGetBulk` 一次批量；循环起点跳过 `data-umm-resolved` 行

### C2. 🔴 `ptIdCacheGetBulk` 不批量（db.ts:199）
`handlePtIdCacheGetBulk` 内部 **`for...await` 逐个 schedule**，50 个 URL = 50 次串行 DB 读 + rate-limiter 100ms 节流 → 一次 bulk 需数秒。M-Team dimmer 每轮 dim 循环都调它。
- 处置：单事务批量 get；`applyCacheFallback` 只在首次/失效时调（已部分如此，需确认）

### C3. 🔴 整库 `dbGetAll('douban_records')` 8 处
`douban-search.ts:225`、`useRecordCache`、`load-record-map`、detail `enrichRecItems`、albums、user-media、book-collect、game-detail 等——每个 Douban 页面挂载都全量拉取整库（含 comment 的完整 StoreRecord）经消息端口 structured-clone。后台 `__list__` 缓存仅 5s，快速翻页即失效。
- 处置（择一，需讨论）：(a) 新增轻量「records 摘要」消息（仅 key+status，用于搜索/卡片徽章）；(b) 内容脚本侧 LRU；(c) 后台按 prefix 过滤

### C4. 🟠 PT dimmer 全量重扫
`dimmer/index.ts:123-132`：MutationObserver 监听 `document.body` subtree，260ms throttle 后**整表重扫重 dim**；`nexusphp.ts` 的 `onTaskComplete` 每完成一个扫描任务就 `querySelectorAll(整表)` 一次（N 任务 = N 次全表扫描）。`storageChangeListener`（line 82-88）对**任意** local storage 变更失效 watched-id 缓存 → 无关设置变更触发重新全库拉取。
- 处置：`data-umm-resolved` 标记跳过已处理行；扫描任务改为逐行 patch；缓存失效只监听 EVENT_BUS 相关事件

### C5. 🟠 `syncPageRecord` 跨全库事务 + 缓存失效缺失
`models.ts:622`：`db.transaction(allStoreNames, 'readwrite')` 每次 sync 锁全部 6 个 store；且 linked store 直接写 `tx.objectStore().put()`，**绕过** `put()` 的 `invalidateStoreCache` → sync 后 linked store 读到过期缓存（真 bug）。
- 处置：收窄事务范围；linked 写入后显式失效相关 store 缓存

### C6. 🟠 详情页挂载消息风暴 + 3s 轮询
- `detail/App.vue onMounted` + `syncNeoDBOnLoad` + `onCrossPlatformSave`：单次挂载 ~10-14 次串行 `sendMessage` + 1 网络请求；冷 SW 时每个都走 rate-limiter 队列
- `detail/config.ts:34`：`afterMount` 每 **3s** `loadRecord` 轮询（`intervalWhenVisible`），页面挂着不关 = 每小时 1200 次消息往返
- 处置：挂载链并行化/合并消息；轮询改为事件驱动或加长间隔

### C7. 🟠 `useHomepageObserver` 全 body 观察 + 内存泄漏
`useHomepageObserver.ts:46-69`：观察 `document.body` subtree；每次 mutation 遍历所有 addedNodes 做 selector 匹配；`observedContainers` Set **从不移除已卸载节点**（泄漏）；另有 1s × 60s 轮询兜底。三个 homepage（homepage/music/book）各一份 + 各自 `setTimeout(refreshFromDom, 800/2500/6000)` 硬编码重试。
- 处置：收敛观察目标、及时清理 Set、把重试逻辑并入 observer composable

### C8. 🟡 SW wake 周期成本
- `settingsCache.init`：每次 wake `chrome.storage.local.get(null)` 全量读（`settings/cache.ts:12`）
- `DataScheduler.executeTask`（data-scheduler.ts:169-171）：**clearTimeout 从不调用**，任务完成 timer 仍挂到 8s 超时 → 高频消息时 SW 被无效保活、timer 累积
- `background.ts` pendingMessages 每个 15s timer
- `getWatchedIds`（models.ts:464-495）：全 cursor 扫描 + 每 10s 重扫 + **每调用一次 `console.log`**
- 处置：settings 按需 key 读取；timer 随任务完成清理；移除 hot-path console.log

### C9. 🟡 杂项
- `optimisticPut` = get + put(内含再读) 3 次 IDB 请求，且版本检查基于 **30s 读缓存**（可能过期→误判）
- 每次 `put` 全 store 缓存失效（models.ts invalidateStoreCache）→ 写后必重扫
- `dimElement`（utils/index.ts:143-156）mouseenter/mouseleave 匿名监听永不移除
- `metaToChips` 字符级 `+=` 构建 HTML（detail/App.vue:226，O(n²) 中间串）——且与 game-detail 重复（→ D 处理）
- 8 处 `dbGetAll` 的后台侧：`handleDbGetAll` 经 scheduler 缓存 5s，但数据 handler（`data.ts`）绕过 scheduler 直连 mediaDB——访问模式不一致

---

## D. 去重与合并（波次 5，最大工作量，每组合并前先写特征测试）

### D1. 🔴 页面提取 helpers 复制（7+ 副本）
| Helper | 副本数 | 位置 |
|---|---|---|
| `parseRating`（星标 class→10 分制） | 7 | book-profile:12, book-reviews:4, user-profile:30, book-review-detail:4, user-reviews:3, review-detail:3, game-collect/App:42 |
| 星标解析（`allstar`/`rating\d`/×2 换算） | 49 匹配/20 文件 | 散布页面 |
| `extractRating({rating,ratingCount})` | 2 | series:3, doulist-detail:52 |
| `extractPaginator()` | 3 | series:64, doulist-detail:153, genre:58 |
| `extractCelebrities()` | 2 | detail/extra-extractor:16, celebrities:86 |

处置：抽取 `shared/douban-extract.ts`（parseRating/extractRating/extractPaginator/starHtml/dateKey 等），各页 import。

### D2. 🔴 三大复制家族
1. **Collect 家族**（music-collect, user-media, book-collect, game-collect, book-authors, user-celebrities）：`currentPage`/`totalPages`/`onPageChange`/`titleLabel` 四件套逐字复制；模板同为 UmmUserBar + titlebar + grid + UmmPaginator。⚠️ **user-media 缺少 `isSafeDoubanUrl` 守卫而其他 3 家有**——复制漂移已造成安全分歧，先修此不一致
2. **Reviews 家族**（book-reviews/user-reviews 近乎逐字相同；review-detail/book-review-detail 近乎逐字相同）→ 参数化 `UmmReviewsPage` / `UmmReviewDetail`
3. **Profile 家族**（book-profile, user-profile, music-profile, movie-profile）：hero + statbar + sections + doulists 各自重写 → `UmmHero`/`UmmDashSection`/`UmmReviewCard`

### D3. 🟠 跨页依赖 + 状态标签多源
- `game-detail` import `detail/composables/*`、`book-homepage` import `homepage/composables/*` → 共享 composables 上移 `shared/`
- `useInterest` 返回裸 ref（模板 8 处 `.value`）→ `reactive` 或 `toRefs` 设计修正
- **状态标签映射 5+ 份**：UmmInterestBar:76-82 / UmmStatusBadge:13-18 / UmmDynamicIsland:32 / collect 页 titleLabel / doulist-detail+series statusLabel → `useStatusLabels` 共享
- `starHtml` 4 份（book-reviews:27, user-reviews:25, review-detail:9, book-review-detail:10）
- `metaToChips`/`ratingBarWidth`/`starClass`/`onInterestSave`：detail ↔ game-detail 重复 → 共享 composable
- `getItemRecord`/`starRating`/`formatCount`：doulist-detail ↔ series
- `openLink` 4 处；`recordFor` 3 处（homepage 家族）
- `recordMap` 5 页 prop-drill vs 3 页 useRecordCache composable → 统一 composable
- `useRecordCache.ts` 与 `load-record-map.ts` 循环体重复

### D4. 🟠 CSS 重复 ~27%（约 1215 行，css-audit 2026-07-12，**执行前需重新核实现状**——git 63b578a 已做过一轮 consolidation）
- scrollbar 6 份、pagination 8 份、title-bar 7 份、empty-state 8 份、hero 3 份、user-bar 5 份、media-chip 2 份逐字相同
- token 分歧：style.css vs design-tokens.css 共享 `--umm-*` 名称 36% 值不一致（`--umm-color-status-*` 语义都不同）
- 处置：`shared/styles/` 抽取 scrollbar/paginator/title-bar/empty；token 对齐

### D5. 🟡 组件风格分裂 + i18n
- 5 个共享组件（UmmMediaCard/UmmInterestBar/UmmPageLayout/UmmRating/UmmStatusBadge）用 `defineComponent`+裸 `h()`，31 个页面全 `<script setup>` → 统一或至少注释说明
- overlay 大量硬编码中文（UmmInterestBar/UmmDynamicIsland/collect 页 titleLabel）vs 部分走 `t()` → i18n 覆盖补齐（与 content-i18n 键对齐）
- `platform.douban/imdb/tmdb` 键在两个 i18n 系统重复定义（i18n-conclusion 判定两系统不可合并，但键可单向复用）
- settings 双键：`appearance`（settingsCache）vs `umm:appearance`（theme store）→ 单一事实源
- `RecordRepositoryAdapter` 中 `record: any` + `batchGet` 死方法（归 A3）

---

## E. 现代语法机械替换（波次 3，每批 type-check + build 门禁）

### E1. 🟢 sleep 统一（22 处 → 1 个 util）
`utils/index.ts:101` 已有 `sleep()`，但 16 个 config.ts retry 循环 + 6 处 backoff 各自内联 `new Promise(r => setTimeout(r, ...))` → 全部改调 `sleep()`（retry 循环用 `sleep(300*(i+1))` 保持原延迟）

### E2. 🟢 星标串拼接（12 处 → `'★'.repeat()`）
book-review-detail/user-reviews/book-reviews/review-detail 4 个 App.vue（各 2-3 处 `for...{s+='★'}`）+ game-detail-data.ts:139 → `'★'.repeat(full) + '☆'.repeat(empty)`（项目内 `repeat` 已有 4 处先例：user-profile/book-profile）

### E3. 🟢 toSorted（2 处，运行时底线已确立）
`hash-utils.ts:27`、`scheduler-monitor.ts:83` 已是 `[...x].sort()` 拷贝排序 → `x.toSorted()`（lib ES2024 已含；`withResolvers` Chrome 119 已在使用，floor 一致）。其余 5 处就地 `.sort()` 为局部变量，改为 toSorted 需确认后续无依赖原始顺序

### E4. 🟢 nullish 收敛（9 处）
`data.ts` 5 处 `x === undefined` 填充 → `??=`；`search/App.vue:72` `=== null || === undefined` → `== null`；其余逐一

### E5. 🟢 retry 循环抽象（16 个 config.ts）
`for i<8 { extract; if(valid) break; await sleep }` 模式 → 共享 `withRetry(fn, {attempts, baseDelay})` util

### E6. 🟢 Date key 统一（8 处/2 文件）
HeatmapCalendar.vue + OverviewTab.vue 各 4 处 `YYYY-MM-DD` 手拼 → 共享 `dateKey()`（**不引入 Intl**——Intl 用于 locale 显示，对 key 生成反而更慢）

### E7. ⚪ 确认无需改动（已现代化/不可机械改）
- `indexOf(x)>-1` 包含判断：**0 处**（15 处均为定位用途）✅
- `.concat(`：**0 处** ✅
- `JSON.parse(JSON.stringify())` 深拷贝：**0 处**；`structuredClone`：0 处 ✅
- `new Set([...])` 往返：仅 1 处且合理 ✅
- `.filter(x=>x).map()` → flatMap：仅 2 处且谓词复杂，不适用 ✅
- 3 处 `Object.assign`：均属**原地变更语义**（Pinia state/CSS style/缓存对象），改 spread 会破坏行为 → 保留
- `for...of` 已占主导（162 vs 31 索引循环）

---

## 风险与门禁

### 每波验收门禁（umpp Phase 5）
1. `lsp_diagnostics` 对修改文件 clean（每次编辑后）
2. `npm run type-check` 通过（exit 0）
3. `npm run build` 通过（含 `fix-paths.js`）
4. 回归场景 PASS（A/C 波涉及删除与性能，需 Playwright 冒烟：PT 页 dimmer、Douban 详情/搜索/首页 overlay、popup 统计）
5. 文档同步（本蓝图各波完成后勾选；架构性决策补 ADR）

### 主要风险
| 风险 | 缓解 |
|---|---|
| A4 legacy 链删除破坏新系统（legacy-bridge 引用） | 删除前跑 `aft_callgraph` 确认消费方；先删 router 路由验证无回归 |
| D2 复制家族合并改变渲染 | 合并前写特征测试锁定当前行为（书评/影评两页近乎逐字相同，可用 diff 验证） |
| D4 CSS 合并基于 3 周前 audit | 执行前重跑 css 比对，只合并确认重复的块 |
| C3 整库拉取改轻量摘要 | 需与用户确认方案（涉及消息契约变更） |
| E3 toSorted 运行时 | 已与 withResolvers 使用一致（floor 119+），无需额外处理 |

---

## 建议执行顺序与工作量估计

| 波 | 内容 | 相对工作量 | 建议 |
|---|---|---|---|
| 1 | A 死代码（含 2 个 SSOT sync 删除） | S | 立即做，收益/风险比最高 |
| 2 | B TS 强化 | M | 紧接 A（删除后类型面收窄） |
| 3 | E 现代语法 | S | 机械，穿插在 A/B 后做 |
| 4 | C 性能（先 C1/C2/C5 高价值项） | M | 需真机验证环境 |
| 5 | D 去重合并 | L | 最后，分批特征测试锁定 |

**总计**: 5 波均完成后预计删除 ~2000+ 行死代码/重复，SSOT 违规清零，PT 站与 Douban 页面延迟显著下降。
