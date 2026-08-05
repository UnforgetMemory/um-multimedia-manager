# UMM 架构扫描报告 — 全代码分析（2026-08-03）

- **日期**: 2026-08-03
- **状态**: 调研定稿（纯调研，未改任何代码）→ **执行完成**：wave-4 按 §8/§9 落地，见 ADR-010 与 ADR-009「2026-08-03 后续执行」
- **方式**: team-mode 5 路并行分析（arch-consistency / douban-pages / health-scan / data-perf / legacy-bangumi）+ lead 补充调研
- **基线**: 版本 5.7.0；ADR-009（2026-08-02）5 波优化已全量执行；Bangumi 平台今日新增（7 commit）
- **标注**: [Fact]=代码证据 / [Assumption]=推断未验证 / [Cross]=2+ 路独立确认

---

## 0. Executive Summary

代码库**纪律良好、非破损状态**：type-check 干净、0 循环依赖、`@ts-ignore`/`as any` 均为 0、i18n 双系统 100% 完整、Bangumi 适配模式一致性高。本轮扫描为**演化**而非救火，全部建议遵循 umpp 原则（局部修复优先、禁止无谓抽象）。

**无 🔴 级架构破坏。** 发现 3 项高价值性能/去重问题（跨路确认）、一批 🟠 中等问题与 🟡 低风险清理项。ADR-009 遗留 4 项未修 + 2 项 ADR 滞后。

| 维度 | 核心发现 | 规模 | 严重度 |
|---|---|---|---|
| A. 平台 SSOT 漂移 | `storePlatformMap`/`usePlatformMeta` 缺 bangumi → 统计平台维丢失 | 3 文件 | 🟠 [Cross] |
| B. 去重 | bilibili↔youtube ~90% 同构（~400-500 行）；Douban 分页器 228×5；neodb 内联 sync 128 行 | 大 | 🟠 [Cross] |
| C. 性能 | dbGetAll 全库拉取未修（10+ 页/mount）；WebDAV/import 逐条 put 风暴 + 8s 超时误杀 | 高价值 | 🟠 |
| D. 死代码 | ~40 真死符号 + 2 整文件 + 1 整组件（~450-550 行） | 中 | 🟡 |
| E. 遗留核对 | C3/C8 未修；CSS D4 残留 ~200-250 行；useRecordCache 未统一 | — | 🟡 |

---

## 1. 🟠 平台 SSOT 漂移（[Cross] arch-consistency + legacy-bangumi 独立确认）

### 1.1 `storePlatformMap` 缺 bangumi → 统计平台维丢失 [Fact]
- `src/entrypoints/background/handlers/data.ts:45-52`：`storePlatformMap` 仅 6 平台（douban/imdb/neodb/tmdb/bilibili/youtube），**无 `bangumi_records`**。
- `handleGetStatistics`（data.ts:155-181）遍历 `RECORD_STORES`（**含** bangumi），但 `storePlatformMap[storeName] || 'unknown'`（:165），且 `Statistics` 类型（types/index.ts:238-250）无 bangumi/unknown 字段 → **bangumi 记录计入 stats.total 与媒体类型计数，但平台维计数全部丢失**；`handleGetAllRecords` 同样给 bangumi 记录标 `provider='unknown'`（data.ts:198）。
- 影响：popup/options 统计平台列看不到 Bangumi；记录列表 provider 显示 unknown。备份/导出不受影响（RECORD_STORES 已含）。
- 这是 Bangumi commit `4f458f2` 漏掉的第 6 个文件（补充清单见 ADR-009 及 bangumi-adaptation-research §7）。
- 修复：`storePlatformMap` 加 `[STORE_NAMES.BANGUMI]: 'bangumi'` + `Statistics` 接口加 bangumi 字段 + 统计 UI 对应。

### 1.2 `usePlatformMeta` 缺 bangumi/mukaku [Fact]
- `src/composables/usePlatformMeta.ts`：`PLATFORM_LABELS`/`PLATFORM_HUES` 仅 6 平台（douban/imdb/neodb/tmdb/bilibili/youtube），缺 bangumi 与 mukaku → 选项页平台分布图这两平台 fallback 默认色/标签。
- 修复：两常量补 bangumi + mukaku（mukaku 为既有遗漏，非 Bangumi 引入）。

### 1.3 契约遵守（已核实，未漂移）[Fact]
- 消息三处同步（MessageType + MessagePayloadMap + background switch）✓
- `Platform.KNOWN` SSOT 成立（Provider 派生，config 无独立清单）✓
- 内容脚本不直触 IndexedDB（Bangumi 走类型化 Store 消息层）✓
- 领域层纯度（domain/ 无框架依赖）✓
- wxt.config.ts 已含 bangumi 三域名 host_permissions（:57-59）✓
- **小格式瑕疵**：wxt.config.ts:54-55 bilibili 两条 host_permissions 缩进不一致（1 空格 vs 6 空格），顺手修。

---

## 2. 🟠 去重机会（最大工作量）

### 2.1 bilibili ↔ youtube-homepage ~90% 同构 [Cross]（health-scan §3-1 + legacy-bangumi §5）
- `src/entrypoints/bilibili.content/index.ts`（837L）与 `src/entrypoints/youtube-homepage.content/index.ts`（875L）**互为 ~90% 副本**：VideoProgressTracker（~150L）、主题系统（themeVars/tv/css/detectDark/startThemeWatch 逐名对应）、样式辅助（sBtnFloat/sBadge/sOverlay/… 14 个完全同名同构）、模态（createButton/applyBtnStyle/closeModal/applyModalTheme/showModal ~100L）、推荐位装饰（decorateRecommendations ~50L）、loadRecord/saveRecord（~100L）。
- **额外问题 [Fact]**：bilibili 手写 `chrome.runtime.sendMessage({type:'DB_GET'...}, (resp:any)=>...)`（bilibili:374-414），绕过类型化 Store API（8s 超时/错误归一），`(resp:any)` 违反类型约定；状态文案硬编码中文数组（:34），不用 legacy t()/FloatingToast/样式系统。
- **store key 三形态不一致 [Fact]**：`bilibili_records` 存在 `video::BV…`（bilibili.content）、裸 `BV…`（background/handlers/bilibili.ts:66）、`movie::BV…`（Identity.fromUrl bilibili→movie，Identity.ts:153-155）。data.ts:196-199 GET_ALL_RECORDS 已对 bilibili/youtube 归一化 type='video' 并注释承认——统计/同步知情处理，但 store key 未收敛。另 `BILIBILI_SAVE/BILIBILI_INJECT` 消息仍在 background.ts:384-387 但**全仓无发送方**（dormant 死路径）。
- 修复：抽 `src/entrypoints/content/ui/video-overlay.ts`（约 400L 参数化站点选择器），两文件各缩至 ~250L；loadRecord/saveRecord 改走 Store.dbGet/dbPut；清理 dormant 消息分支；store key 统一为 `movie::` 或 `video::` 二选一（**需用户决策**，§7-3）。

### 2.2 Douban 分页器解析 228 行 × 5 文件 [Cross]（health-scan §3-2 + douban-pages 2a）
- `book-authors-data.ts:72-101` == `book-reviews-data.ts:139-168` == `doulists-data.ts:227-256` == `user-celebrities-data.ts:66-95` == `user-reviews-data.ts:135-168`：`.paginator` DOM→pageLinks 解析逐字重复。
- 修复：抽 `shared/parse-douban-paginator.ts`（纯函数，低风险），5 处替换。

### 2.3 neodb.ts 内联 sync 128 行 vs RecordService 双实现 [Fact]（legacy-bangumi §2.2-1）
- `content/handlers/neodb.ts:145-271` onSave 内联跨平台同步，与 `domain/record/RecordService.ts:57-143` 是**同一策略的两份实现**（规则逐条对应）。RecordService 由 background DB_SYNC_PAGE_RECORD 调用，neodb.ts 却绕过消息层直接 Store.dbPut 手写同步。
- 修复：neodb.ts onSave 改调 `Store.dbSyncPageRecord`（api.ts:108-116 已有封装），删 128 行内联。风险中（行为需特征测试锁定）。

### 2.4 Douban 31 页其余重复（douban-pages 报告明细）
- **user-info 提取 3 份**：user-profile-data.ts:18-30 == user-celebrities-data.ts:17-29 == user-reviews-data.ts:17-29（`.user-info` hero 区块逐字复制）→ 抽 `extractUserProfileInfo` 进 douban-extract.ts。
- **collect 家族 221 行**：book-collect-data.ts:91-119 == music-collect-data.ts:94-122（+ user-media-data.ts:43-61 107 行）。
- **状态标签映射 5+ 份**：UmmInterestBar:76-82 / UmmStatusBadge:13-18 / UmmDynamicIsland:32 / collect 页 titleLabel / doulist-detail+series statusLabel → 抽 `shared/status-labels.ts`。⚠️ **game 状态值分叉**：series/game-explore 用 `'玩过'`，game-collect 用 `'已玩'`——需统一（**需用户决策**，§7-1）。
- **detail ↔ game-detail 7 项函数级重复**：enrichRecItems×2 + 第 3 份 map 构建（detail-data.ts:31-46 / game-detail-data.ts:287-310 / series-data.ts:147-169）、metaToChips、ratingBarWidth、starClass、onInterestSave → 抽 `pages/detail/shared/detail-ui.ts` 或上移 `shared/`。
- **useRecordCache vs load-record-map 分裂**：useRecordCache.ts:14-31 == load-record-map.ts:30-47（67 行）+ 各自消费者不同 → ADR-009 遗留，建议统一 composable。
- **跨页依赖**：game-detail import `detail/composables/*`、book-homepage import `homepage/composables/*` → 共享 composables 上移 `shared/composables/`（真实变化已发生，符合 Evolution First）。
- **四件套模式**：5 页缺 types.ts（albums/game-collect/game-explore/trailer/book-reviews——自行定义 data 形状）；5 页仅 extractors.ts 无 data.ts（homepage/music-homepage/book-homepage/artists-overview/genre）。命名分叉：data.ts vs extractors.ts vs xxx-data.ts。建议统一为 `data.ts`（含 extract 函数）+ 页面级 types 统一放 types.ts。**低优先**（模式已可用，统一是维护性改善）。

### 2.5 CSS D4 残留 ~200-250 行 [Cross]（legacy-bangumi §4 + arch-consistency）
- 共享文件已存在（empty-state.css 已合并 11 类、titlebar.css 25L、paginator.css 59L），但仍有：**7 个页面级近同构 paginator 变体**（.umm-reviews-paginator/-dlist-paginator/-doulist-paginator/-series-paginator/-celebrities-paginator/-umedia-paginator ×2，规则逐条同构 flex/min-width:28px/radius:6px）、music-collect 自有 .umm-mc-titlebar、empty-state 漏网（.umm-mc-empty/-series-empty/-doulist-cover--empty）。
- 修复：变体统一 `.umm-paginator` + `--umm-accent` 派生（token 体系已就绪）；每页 css 删块 + 共享文件加选择器别名，**一个 commit 一页**，配 QA 快照（qa-bangumi 本地快照法可复用）。

---

## 3. 🟠 性能（data-perf 报告，ADR-009 关联核对）

### 3.1 H1 — dbGetAll 全库拉取（ADR-009 C3 遗留，未修）[Fact]
- `dbGetAll`（features/database/api.ts:56-61）5 个调用点，触发 10+ 页面每次 mount：
  - detail/record-loader.ts:28（movie/tv 详情每次打开）
  - game-detail/game-detail-data.ts:294
  - shared/composables/useRecordCache.ts:12（homepage 家族 3 页）
  - shared/load-record-map.ts:29（search/albums/doulist-detail/game-explore/personage/series 6 页）
  - content/handlers/mukaku/cache.ts:98（miss 时全量）
- 影响：2000 条 douban_records（~1MB）→ 每次页面打开 ~100-500ms 扫描 + MB 级 structured-clone 传输。scheduler 5s TTL 仅缓解重复，SW wake 后清空 → 每次 wake 首个页面真落库。
- 建议：实施 C3 轻量摘要消息（仅 key+status/rating）或 `DB_GET_BULK` 单消息按 subjectId 批量匹配（复用 C2 getCacheEntries 单事务模式）。预期 detail 页消息体缩减 ~99%。

### 3.2 H2+H3 — WebDAV/import 逐条 put 风暴 + 8s 超时误杀 [Fact]
- webdav.ts:197/292/318 + data.ts:124-133（IMPORT_DATA）均 `for...await mediaDB.put(...)`；每条 put = read-modify-write 双步事务 + invalidateStoreCache 线性扫 LRU（O(500)）。3000 条 = 3000 事务 + 3000 次 LRU 扫描。
- IMPORT_DATA 先 `clearAll()` 再逐条写（data.ts:118-133）——中途失败库半空，**非事务性**。
- **H3**：background.ts:326,349-358 对 IMPORT/WEBDAV_* 未传 timeout → `DEFAULT_TASK_TIMEOUT=8000`（types.ts:136）→ 大库上传/导入 >8s 报失败但写实际发生（或部分发生）→ 重试导致重复/半写。
- 建议：新增 batchPut（单事务多 key，仿 getCacheEntries models.ts:541-576 模式）+ LRU 失效一次；webdav/import 传 `timeout: 60_000+`。

### 3.3 M 系列（data-perf 中严重度）
- **M1 限流队列挂起**：data-scheduler.ts:147-151 acquire 超时后 `break` 整个 while，剩余任务留队列，仅下次 schedule() 恢复 → 建议 break 改 await 后 continue（任务保留）。
- **M2 PT dimmer 缓存失效监听无效**：index.ts:82-88 监听 `chrome.storage.onChanged` 但记录写 IndexedDB 不触发 → 改订阅 EVENT_BUS `record:updated`。
- **M3 M-Team applyCacheFallback 死代码**：mteam.ts:205 无条件标记 resolved → unresolved 过滤恒空 → fallback 恒不执行（M-Team 永不查 pt_id_cache）→ 仅对 matched 行标 resolved，或删除链路。
- **M4 v8→v9 "rename sehuatang_avids → jav_ids" 未迁移数据**：models.ts:123-130 注释声称 migrate data，代码只 createObjectStore 未拷贝 → v8 及以下用户升级后成人记录孤儿化（**需用户决策**：补拷贝 or 文档化丢弃，§7-4）。

### 3.4 L 系列（data-perf 低严重度）
- **L1（ADR-009 C8 未修）**：data-scheduler.ts:169-171 executeTask timeout timer 从不 clear → 每条 DB 消息泄漏 1 个 8s timer，SW 不 sleep。保存句柄 race 后 clearTimeout。
- **L2**：detail 挂载链同 key DB_GET 重复 4 次（App.vue:83/114/162 + useCrossPlatformSync.ts:136），5s 缓存命中但 4 次往返。
- **L4**：background.ts:323-381 cacheKey 死配置（handler 返回 void → cacheManager.set(key, undefined) → 视为 miss 每次真执行）；且 ADULT_AV_CHECK/ADD 固定 cacheKey 不含 payload，未来若 handler 返回对象将造成跨 ID 错误缓存 → 现在删除或按 payload 生成 key。
- **L5**：count:/watched:/ptcache-bulk: 写后不失效（TTL 兜底 ≤10s 陈旧）。
- **L6**：pendingMessages 15s timer flush 后不清（50 上限 × 15s 窗口 SW 活跃）。
- **L7**：migration 惰性写回风暴（models.ts:248-253,354-357 fire-and-forget put，升级后首次 getAll N 个并发双步写）。
- **L8**：SYNC_LOGS store 创建无人写（死 store）；zip pretty-print 体积 ~1.3×；event-bus 全 tab 广播线性放大。

### 3.5 ADR-009 C 系列核对结论
- ✅ 已修：C1（PT N+1→bulk）、C2（bulk 单事务，限 pt cache）、C5（sync 事务架构）、C6（3s 轮询 intervalWhenVisible + dismiss 清理）
- ⏳ 未修：C3（dbGetAll 轻量摘要 = H1）、C8（clearTimeout = L1）

---

## 4. 🟡 死代码与健康（health-scan 报告，全部 [Fact] 已 grep/callgraph 核实）

### 4.1 真死代码（可立删，~40 符号 + 2 整文件 + 1 整组件，~450-550 行）
| 位置 | 内容 |
|---|---|
| `src/config.ts` | `VERSION`(L10)/`STATS_KEYS`(L37)/`MISC_KEYS`(L42)/`CONFIG`(L101)/`Status`(L116) + 随葬 `DATASET_ORDER`(L50)/`STATUS`(L65)/`UI`(L72)/`NETWORK`(L80)/`MUKAKU`(L90)。存活：STORAGE_KEYS/Domain/Provider |
| `src/features/adult-av/models.ts` | `JAV_IDS_VERSION`(L2)/`parseKey`(L22)/`buildKey`(L29)/`normalizeTime`(L46) 0 引用；`AdultAvId`/`AdultAvIdInput`(L6/L14) 与 types/index.ts:91-106 **同名重复定义**（types 版被 6 处使用，models 版 0 引用）→ 删 models 版 |
| `src/entrypoints/content/styles/global.ts` | `addStyleRule`(L717-729) 0 引用 |
| `src/entrypoints/content/styles/tokens.ts` | 6 常量死（COLOR_PRIMARY_SHADOW_HOVER/_ACTIVE/COLOR_NEOGLOW_BRIGHT_DARK/COLOR_CHIP_SHADOW_DARK/_HOVER_DARK/_BORDER_DARK） |
| `src/content/douban/shared/constants.ts` | **整文件死**（MEDIA_FORMATS/FORMAT_LABELS/FORMAT_COLORS 0 引用），且逻辑被 UmmSearchCard.vue:15-27 + albums/App.vue:16-26 各自内联重写 → 删文件，两处改 import 共享版（顺带消 2 处重复） |
| `src/entrypoints/content/handlers/` | `imdb.ts::getIMDbTitle`(L58)/`neodb.ts::getNeoDBTitle`(L54)/`tmdb.ts::getTMDBTitle`(L160) 均仅声明无调用 |
| `src/entrypoints/content/i18n/index.ts` | `setLocale`(L35)/`getLocale`(L45) 0 引用（t()/startLocaleSync 直读写 currentLocale） |
| `src/entrypoints/content/enhancers/pt/config/index.ts` | `getSiteConfig`(L107)/`isSupportedDetailPage`(L114)/`getScannableDomains`(L119) 0 引用 |
| `src/entrypoints/content/enhancers/pt/dimmer/cache.ts` | `invalidateIdCache`(L168) 0 引用 |
| `src/utils/` | `logger.ts::getLogConfig`(L47)/`visibility.ts::pauseWhenHidden`(L65)/`event-bus.ts::subscribe`(L26) 0 引用 |
| `src/types/` | `index.ts::MessagePayload`(L181)/`ToastOptions`(L190)/`CacheItem`(L199)/`SyncDecision`(L234)、`messages.ts::RuntimeMessage`/`SendResponseFn` 0 引用 |
| 其他 | `optimistic-lock/types.ts::ConflictAction`(L9)、`data-scheduler/types.ts::CacheEntry`(L127)、`database/query-utils.ts::batchPut`(L134)、`shared/index.ts` **整文件**（唯一 re-export 无消费方）+ 随之 `shared/identity.ts::isPTSite`/`isPTDetailPage`/`isPTListPage`(L48/55/63) 3 函数、`movie-profile/types.ts::MovieProfileReview`(L26) |
| **今日新增即死** | `content/handlers/bangumi.ts::scanBangumiPageStatus`(L70) 0 引用 |
| **整组件** | `shared/ui/skeleton-loader/`（SkeletonLoader.vue + index.ts，全库无消费方——其他 8 个 ui barrel 均有消费方） |

### 4.2 类型卫生（Fact，干净）
- `@ts-ignore`/`@ts-expect-error`/`as any`：**均 0 处**。
- `as unknown as`：9 处，8 处合理（window 全局注入/适配器边界/聚合统计，有注释）；1 处可疑：`visibility.ts:52` `-1 as unknown as ReturnType<typeof setInterval>` 魔法哨兵，应为联合类型 `| null`。
- 裸 `any`：~15 处（migration/models.ts 6 处版本化 schema、neodb/api.ts:176/443 + webdav/api.ts:145 外部 API 响应、youtube/bilibili fetch 回调 4 处、record-repository-adapter.ts:17）。
- **漂移隐患**：`background.ts:216` 本地 RuntimeMessage 与 `types/messages.ts` 重复定义 → 去重（health-scan §1-K）。

### 4.3 大文件评估（>15KB，13 个）
| 文件 | 规模 | 建议 |
|---|---|---|
| youtube-homepage/bilibili.content | 875L/837L | **拆**：抽共享 video-overlay 模块（§2.1） |
| content/ui/doulist-replace.ts | 702L/31KB | **拆（中优先）**：`buildThemedDialog` L269-624 356 行单体（~10 嵌套闭包 + 3 异步链 + 内联 CSS），先抽 CSS 字符串常量 + renderItems/createForm |
| content/styles/global.ts | 729L/23KB | **保留**：~690 行是 CSS 字符串数据，删 addStyleRule 后即可 |
| features/database/models.ts | 645L/23KB | 可拆（低优先）：pt-cache ~90L 抽 pt-cache.ts；init() 125L 升级逻辑抽 migrate-schema.ts |
| content/i18n/locales.ts | 520L/24KB | 保留（词典数据） |
| detail/App.vue | 505L/22KB | 保留（旗舰页），低优先 |
| background.ts | 420L/16KB | 微调：handleMessage 182L 为扁平 switch 分发表，可换 `Map<MessageType, handler>` 注册表（纯装饰） |

### 4.4 其他
- 0 符号 index.ts：全部为单行 re-export barrel（非异常），除 skeleton-loader 整组件死（§4.1）。
- wxt.config.ts:54-55 bilibili 缩进瑕疵（§1.3）。

---

## 5. Bangumi 适配质量（legacy-bangumi §1 + arch-consistency 交叉）

**总体：合格，模式一致性高** [Fact]：
- 详情页复用 `createDetailPageHandler` 工厂（工厂新增 `resolveIdentity` 钩子 +24L，合理扩展非绕行）；DOM 读取隔离在纯提取函数（可单测）；DB 走类型化 Store 消息层。
- 注册完备：Platform.KNOWN/displayName/Identity.fromUrl/buildCanonicalUrl/STORE_NAMES/DB_VERSION 12/RecordStoreName/content.ts matches/wxt.config host_permissions 全部到位；零新增消息类型。
- 测试配套高于既有站点：Platform.spec + bangumi-extract.spec（204L）+ bangumi-list-extract.spec（243L）+ 2 个 QA 脚本（18/18 选择器验证）。
- Identity.fromUrl 正确：bgm.tv/subject/123 → (bangumi, tv, 123)；URL 不编码类型是**有意设计**（真实类型经 infobox 推断 + resolveIdentity 替换），store key 与实际类型一致，列表页 extractProviderIdFromKey 剥前缀自洽。

**小问题**：
- 🟡 双写：renderFn 自保存 + 工厂 base-save 两次 dbPut（bangumi.ts:12-14 已注释声明，每次页面-done 多一次写）→ 建议只留其一。
- 🟡 `/subject/{id}/ep` 剧集页映射未实测（QA 只覆盖 subject/browser 快照）→ QA 加 ep 页快照。
- 🟡 小副本：k()（utils/dom.ts:56-63）== labelKey()（bangumi-list-extract.ts:59-66）；bangumiListRatingText 是 Utils.formatRating10 零依赖副本（自注释声明）。
- 🟡 bangumi.ts:187 硬编码 store 名 `'bangumi_records'`（应引 STORE_NAMES.BANGUMI）。
- 🟡 bangumi-list.ts 直引 `dbGetAll` vs tmdb.ts 用 `Store.dbGetAll` 两种 import 风格。
- 🟡 create-detail-handler.ts:5 注释过期："Three consumers: imdb, tmdb, neodb" → 现 4 个。
- 🟡 bangumi-list-extract.ts:81-82 注释失实（声称"extractPaginator 处理空态"实为 for 循环）。

---

## 6. legacy 系统边界（legacy-bangumi §2-3）

- **路由规模**：router.ts 287L / 11 条规则，无冲突；Bangumi 两条路由用提取函数门控，与既有风格一致。
- **waitForElement 三处副本**：utils/dom.ts:14-40 / mukaku/handler.ts:161-184 / pt/utils.ts:12-69 → mukaku 与 pt 改引 utils/dom。
- **neodb.ts 硬编码中文 toast**（:185,200,239,254,265，'✅ 已保存 NeoDB 观看状态' 等）不走 t()（同文件 scanNeoDBPageStatus 却用 t()）→ 顺手 i18n 化（预存问题，非 Bangumi 引入）。
- **content.ts vestigial 豆瓣代码**：isDoubanDetailPage(:261-266) 因 excludeMatches 永远 false、observeThemeChanges(:268-285) 只对豆瓣生效 → 实际不可达；其中 injectNeoDBPushButtons 调用不可达（但 import 仍由 overlay 侧用）→ 可删 vestigial 代码，保留 bridge 导出。
- **legacy-bridge 4 模块全活**（injectNeoDBPushButtons 被 detail/App.vue + useCrossPlatformSync + game-detail 用；FloatingToast/t/extractCrossPlatformLinks 全站用）→ **勿移除**；neodb-push.ts:12 注释自承 "duplicate, needs merge"（与新系统状态扫描重复，债务已标注）。

---

## 7. 待用户决策项

| # | 决策 | 选项 | 建议 |
|---|---|---|---|
| 1 | game 状态 done 文案 | `'玩过'`（series/game-explore）vs `'已玩'`（game-collect） | 统一 '玩过'（更多页面使用），随 §2.4 状态标签单源落地 |
| 2 | C3 全库拉取方案 | (a) 轻量摘要消息（仅 key+status）；(b) DB_GET_BULK 按 subjectId 批量匹配 | 推荐 (b)——detail 推荐区仅需 ~10 个 id，复用 C2 单事务模式，且不引入新消息契约面 |
| 3 | bilibili/youtube store key 统一 | `movie::`（随 Identity）vs `video::`（现状归一） | 推荐 `movie::`（Identity.fromUrl 已产出），但需同步 GET_ALL_RECORDS 归一逻辑 + 历史数据迁移 |
| 4 | v8→v9 jav_ids 迁移 | 补数据拷贝 vs 文档化丢弃 | 推荐补拷贝（一次性升级路径，成本低） |

---

## 8. ADR-009 遗留核对（本轮验证）

| ADR-009 遗留项 | 状态 |
|---|---|
| C3 dbGetAll 轻量摘要 | ⏳ 未修（= H1，§3.1） |
| C8 executeTask timeout timer 清理 | ⏳ 未修（= L1，§3.4） |
| CSS 共享波（D4） | 🔶 部分执行（共享文件已存在，残留 ~200-250L，§2.5） |
| useRecordCache/load-record-map 统一 | ⏳ 未修（§2.4） |
| RecordService 与 IRecordRepository 接口方向 | ✅ 已定（IRecordRepository 已收窄为 findByKey/save），但 **ADR-009:95 未更新** → ADR 滞后 |
| TS 7.1 / Vue 3.6 升级 | 📅 待版本发布（ADR-008 附录路径） |
| Bangumi 接入 | 📝 **无 ADR-010** → 建议补记（平台 SSOT 扩展 + resolveIdentity 钩子决策） |

---

## 9. 建议执行顺序

1. **P0（低风险立删，一次 commit）**：§4.1 全部死代码（~40 符号 + 2 整文件 + 1 组件，-450~550 行）+ §1.3 wxt 缩进 + §5 小项（注释过期/硬编码 store 名）+ §2.2 分页器抽共享（-228 行）。type-check 门禁。
2. **P1（平台补齐 + 高价值修复）**：§1.1/§1.2 平台 SSOT 补齐（统计平台维恢复）；§3.1 H1（DB_GET_BULK，决策项 2）；§3.2 H2+H3（batchPut + 超时参数）；§4.2 RuntimeMessage 去重 + visibility.ts 哨兵。
3. **P2（去重）**：§2.1 bilibili/youtube 共享抽取（决策项 3）；§2.3 neodb sync 去重（先特征测试）；§2.4 Douban 页重复家族（决策项 1）；§2.5 CSS 共享波。
4. **P3（治理）**：§3.3 M 系列（M1 队列挂起 / M2 缓存失效 / M3 M-Team 死链路 / M4 迁移，决策项 4）；§3.4 L 系列；§6 legacy 清理；ADR 补记（ADR-010 Bangumi + ADR-009 状态更新）。

---

## 10. 风险与门禁

| 风险 | 缓解 |
|---|---|
| P0 死代码删除 | 全部已 grep/callgraph 二次核实；删后 `npm run type-check` + `npm run build` |
| H1 消息契约变更 | 新增 DB_GET_BULK 需三处同步（MessageType/MessagePayloadMap/background switch）+ 特征测试 |
| H2 batchPut 重构 | 仿 getCacheEntries 既有单事务模式；导入流程加特征测试（含中途失败语义） |
| §2.1 共享抽取 | 两文件先写行为特征测试（QA 脚本已覆盖站点选择器）再合并 |
| CSS 共享波 | 一 commit 一页 + QA 本地快照法 |
| M4 迁移 | 决策后补拷贝需 DB_VERSION 13 新迁移段（v12 已发布） |
