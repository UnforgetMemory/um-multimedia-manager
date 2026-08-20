# ADR-009: 2026-08 全面优化执行记录 — 死代码清理 / TS 强化 / 现代语法 / 性能 / 去重

- **日期**: 2026-08-02
- **状态**: Accepted
- **依据**: `docs/audit/optimization-blueprint-2026-08-02.md`（5 波规划，用户批准全量执行）

## 背景

用户要求「探索源代码每一个角落，全面优化架构和维护便捷以及提高性能还有加强 ts；采用高性能且简洁的现代新语法」。
代码库纪律良好（0 循环依赖、type-check 干净、ADR 体系），本次为**演化**而非救火。

## 决策与执行结果

### 波次 1 — 死代码清理（净删除 ~2,900 行）

1. **删除 3 套并行 sync 实现中的 2 套**：`MediaDatabase.syncPageRecord`（0 调用者）、`getRecordVersion`（0 调用者）。
   存活路径为 `RecordService.syncRecord` → `IRecordRepository` → `RecordRepositoryAdapter` → `mediaDB.put`。
2. **删除死模块**：`features/memoizer/`、`features/memory-manager/`、`optimistic-lock.ts` 类
   （`write()` 甚至不落库）、`cache/ttl-cache-store.ts`（L2 从未接线）。
3. **删除不可达 legacy Douban handler 链**：`content.ts` 已 excludeMatches 全部 Douban 域，
   router 的 douban 路由永不可达 → 删 `handlers/douban*.ts`（8 文件）+ `enhancers/douban-search.ts` +
   `observers/rating.ts`。`extractCrossPlatformLinks` 迁移至 `content/douban/shared/cross-platform-links.ts`
   （新系统经 legacy-bridge 消费，必须保留）。
4. **删除 `SEHUATANG_*` 后台消息**（0 发送方，内容脚本已用 AdultAvStore）+ `SehuatangAvId`。
5. **`RecordService` 死方法**（`bulkUpdateStatus`/`deduplicate`/`merge`/`getWatchedKeysAcrossStores`，
   0 调用者；`deduplicate` 计算后丢弃不落库——坏代码）+ `IRecordRepository` 收窄为 `findByKey`/`save`。
6. **`errorMessage()` 5 副本 → `src/utils/error-message.ts`**；`storePlatformMap` 提升模块级。

### 波次 2 — TypeScript 强化

1. **`Provider` 派生自 `Platform.KNOWN`**（`type Provider = (typeof Platform.KNOWN)[number]`）——
   消除 config 与 domain 双平台清单漂移。`Platform.KNOWN_IDS` 拓宽视图消除 `as readonly string[]` cast。
2. **`STATUS` 字符串值派生自 domain `Status.legacyString`**（保留向后兼容导出）。
3. **消息层全链路类型化**：`send<K extends MessageType>(type, payload: MessagePayloadMap[K])` 泛型、
   handler `payload: any` → 类型化、`RuntimeMessage.type: MessageType` + `payload` 非可选
   → **26 处 `message.payload!` 归零**。
4. **77 处 untyped catch → `catch (e: unknown)`**，复用 `errorMessage()` 收窄。
5. **弱类型收窄**：`AdultAvId.source` 字面量联合、`DB_QUERY.value: IDBValidKey`、
   `DB_SYNC_PAGE_RECORD.platform: Provider`、`NEODB_PUSH_RATING.record` 类型化、
   `MediaTypeId` 联合导出 + `MediaType.id: MediaTypeId`。

### 波次 3 — 现代语法（机械替换，行为零变化）

1. **22 处内联 `new Promise(r => setTimeout(...))` → `sleep()`**（含 5 个文件 backoff）。
2. **12 处星标循环 → `'★'.repeat()`**（`Math.max(0, …)` 保护负边界——`repeat(-1)` 会抛错，
   for 循环不会，直接替换是行为变更，必须 clamp）。
3. **16 个 config.ts retry 循环 → 共享 `withRetry()`**（`src/content/douban/shared/retry.ts`，
   保留 `baseDelay * (i+1)` 缩放与 truthy 校验语义）。
4. **`toSorted()` ×2**（hash-utils + scheduler-monitor，见 blueprint E3）、**`??=` ×5**（data.ts）、
   **`== null` ×1**（search/App.vue）、**`dateKey()` 共享 ×5**（OverviewTab + HeatmapCalendar）。

### 波次 4 — 性能

1. **C1 PT 站 N+1 消除**：`nexusphp.ts process()` 逐行 `ptIdCacheGet` → 收集后单次
   `ptIdCacheGetBulk`；循环起点跳过 `data-umm-resolved` 行（避免每轮 MutationObserver 重扫全表）。
   M-Team 已用 bulk，无需改。
2. **C2 `handlePtIdCacheGetBulk` 串行 → 单事务批量**：新增 `MediaDatabase.getCacheEntries()`
   （单事务 + 统一规范化），handler 一次 scheduler 调度完成。
3. **C5 sync 事务**：架构性解决——`syncPageRecord` 全库事务已随波次 1 删除，
   存活路径经 adapter `save` → `mediaDB.put`（自带缓存失效）。
4. **C6**：详情页 3s 轮询已有 `intervalWhenVisible`（隐藏暂停）+ dismiss 清理（非泄漏）；
   `useHomepageObserver` 增加容器 Set 清理（DOM 已移除的引用删除）。

### 波次 5 — 去重

1. **`parseRating` ×6 → `shared/douban-extract.ts`**（6 份字节级相同）。
2. **`usePaginator` composable ×7 页**（music-collect/book-collect/game-collect/user-media/
   book-authors/user-celebrities/doulists）——currentPage/totalPages/onPageChange/isSafeDoubanUrl 四件套。
3. **安全缺口修复 ×3**：user-media、user-celebrities、doulists 的 `onPageChange` 缺少
   `isSafeDoubanUrl` 同源校验（其他 collect 页均有）——复制漂移造成的开放重定向防护缺失。
4. **评估后不合并**（umpp「抽象来自变化」原则）：
   - 状态标签两套语义不同（UmmInterestBar `wish/do/collect/mark` vs UmmStatusBadge
     `done/wish/none/doing`）——非重复，是不同 UI 语义；
   - `useRecordCache`（响应式 ref）vs `load-record-map`（一次性）——非重复；
   - `extractRating`（series 取 `.star .pl` vs doulist 取 `nextElementSibling`）——DOM 结构不同；
   - `extractPaginator`（返回类型不同）——结构同形但类型各异。

## 影响

- 净删除约 **2,900 行**（35 文件），新增 5 个共享模块（error-message/retry/douban-extract/
  usePaginator/cross-platform-links）
- type-check 0 错误、150 单测通过、build 通过（含 fix-paths）
- 新增类型安全：消息层全链路类型化、77 catch 收窄、Provider/STATUS SSOT
- 性能：PT 站 dimmer 从 O(rows) 消息往返降为 O(1) 批量；bulk cache 从 O(n) 事务降为 O(1)
- 安全：3 个页面开放重定向防护补齐

## 回滚

- 各波次改动独立：波次 1/2 可整体 revert（纯删除与类型层）；波次 3 为机械等价替换；
  波次 4/5 为行为保守改动（守卫只收紧非法 URL，合法 URL 行为不变）

## 2026-08-03 后续执行（架构扫描 §8 遗留核对，wave-4 全量落地）

依据 `docs/audit/architecture-scan-2026-08-03.md` §8 遗留清单逐项执行：

| 遗留项 | 状态 | 落地方式 |
|---|---|---|
| C3 dbGetAll 轻量批量读取 | ✅ 完成 | 新增 `DB_GET_BULK` 消息（MessageType/MessagePayloadMap/background switch 三处同步 + `handleDbGetBulk` 单事务批量），`dbGetBulk()` 封装；detail 推荐区 / game-detail / useRecordCache 等调用点改走批量 |
| C8 executeTask timeout timer 清理 | ✅ 完成 | `data-scheduler.ts` `executeTask` 保存 `timeoutHandle`，成功/失败两路径均 `clearTimeout`（注释声明防 SW 保活）（T19）；顺带修 M1 限流队列挂起（`break` → backoff `continue`，队列任务保留） |
| CSS 共享波（D4） | ✅ 完成 | 分页器变体收敛至共享 `paginator.css`（aliases：reviews/doulist/celebrities/umedia 四变体 + token 派生）；仅 doulist-detail / series 因边框样式差异保留页内定义（共享文件注释声明）（T17） |
| useRecordCache/load-record-map 统一 | ✅ 完成 | 两入口统一委托 `shared/record-cache-core.ts` 的 `loadRecordEntries`（支持按 id 批量读）；`useRecordCache` 上移 `shared/composables/`，load-record-map 保留兼容导出（T16） |
| 死代码清理 2 轮 | ✅ 完成 | Wave 1 增量：删 `shared/constants.ts` 整文件（MEDIA_FORMATS 三常量死）、skeleton-loader 整组件、`optimistic-lock/types.ts::ConflictAction` 等（Wave 1） |
| bilibili/youtube 共享抽取 | ✅ 完成 | 抽 `entrypoints/content/ui/video-overlay*.ts`（overlay/tracker/styles/pure 四模块）；bilibili.content 837→167L、youtube-homepage 875→321L；loadRecord/saveRecord 改走类型化 Store + `storeKey()`（T18） |
| neodb 内联 sync 去重 | ✅ 完成 | `neodb.ts` onSave 删 128 行内联，改调 `Store.dbSyncPageRecord` → `RecordService.syncRecord`（fork 决策 (b)）；规则单一来源 `neodb-sync.ts` + domain RecordService（T12） |
| 平台 SSOT 补齐（§1.1） | ✅ 完成 | `storePlatformMap` 补 `[STORE_NAMES.BANGUMI]: 'bangumi'`（统计平台维恢复）（Wave 1） |

## 后续（不在本次范围）

- `RecordRepositoryAdapter` 90% 死表面收窄（仅 findByKey/save 活）——已随接口收窄完成
- `RecordService` 与 `IIdentityRepository` 的 repo 接口方向（implement or remove）待产品确认
- TS 7.1 升级路径见 ADR-008 附录

## 2026-08-05 后续执行（v5.8.0 review 补记）

代码审查发现 `status-labels.ts` 引用「per ADR-009」的标签决策未在本 ADR 记录——补记如下：

1. **Decision-1：game 状态完成标签统一为「玩过」**（原「已玩」）——`shared/status-labels.ts` 三族
   标签单一来源（movie/music/book/game × done/wish/none/doing），跨 UmmStatusBadge /
   UmmInterestBar / doulist-detail 统一消费。
2. **collect 页标题标签统一为完成态短标签**：book-collect「读过」→「已读」、
   music-collect「听过」→「已听」、user-media「看过」→「已看」——与 status-labels
   `done` 字段对齐（此前各页手写不同文案）。
3. **FAMILY 1/2 提取函数保留（T14 测试锁定）**：`douban-extract.ts` 的 `extractUserProfileInfo` /
   `extractCollectPageShell` 无生产调用者，但有 audit §2.4 T14 专属测试
   （`tests/unit/douban-extract-families.spec.ts`）锁定——判定为**计划性提取**（非死代码），
   保留为测试保护的构建块，文件头注释已声明计划属性；待 user-media/user-celebrities/
   movie-profile/doulists 页面实际迁移时接入。
