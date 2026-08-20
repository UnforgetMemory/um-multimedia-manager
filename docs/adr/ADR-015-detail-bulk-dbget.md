# ADR-015 — Detail 页跨平台同步链的 dbGet 批量化方案

- **日期**: 2026-08
- **状态**: Accepted（已实现 — onCrossPlatformSave 并行读 + 写合并 + 事件驱动，2026-08）
- **作者**: 架构调研子代理
- **范围**: `src/content/douban/pages/detail/` 的 DB 访问链路 + `src/utils/event-bus.ts` 的消费侧

---

## 1. 背景

### 1.1 串行 dbGet 风暴的证据

detail 页的单次「挂载 + 一次保存」流程中，每条 `Store.dbGet` / `Store.dbPut` 都是一次独立的 `chrome.runtime.sendMessage` 往返，全部经过 SW 的 `DataScheduler` 限流队列（`priority: 'HIGH'`，见 `src/entrypoints/background/handlers/db.ts:67-71`）。队列串行执行任务，因此 N 次消息往返至少 N×单任务延迟。

下表按代码位置清点调用点（不含异常分支）：

| 流程 | 文件:行 | 调用类型 | 次数 | 说明 |
|---|---|---|---|---|
| **A. `onCrossPlatformSave` 单次保存** | `useCrossPlatformSync.ts:24` | `dbGet('douban_records', key)` | 1 | 读 existing |
| | `:34` | `dbPut('douban_records', key, record)` | 1 | 写 douban |
| | `:51` | `dbPut('douban_records', key, record)` | 1 | linkedIds 变更后再写 douban |
| | `:57` | `dbGet(`${platform}_records`, linkKey)` | 0–2 | imdb/tmdb 各一次（循环内串行） |
| | `:59` | `dbPut(targetStore, linkKey, …)` | 0–2 | 同上 |
| | `:79` | `Store.getSettings()` | 1 | 设置读取（另一条消息） |
| | `:95` | `dbGet('neodb_records', neodbKey)` | 0–1 | Case 3：状态未变时读 neodb |
| | `:101` | `dbPut('neodb_records', neodbKey, …)` | 0–1 | 同上 |
| | `:86` / `:91` | → 进入 `syncToNeoDB` | 0–1 | 见流程 B |
| | `:113` | `dbGet('douban_records', key)` | 1 | 结尾再读一次刷新按钮 |
| | **小计（不含 syncToNeoDB）** | | **6–10** | |
| **B. `syncToNeoDB` 推送回调** | `:192` | `dbGet('douban_records', doubanKey)` | 1 | 重复读 douban（A 已读过） |
| | `:197` | `dbPut('douban_records', doubanKey, …)` | 1 | 写 douban.linkedIds.neodb |
| | `:203` | `dbGet('neodb_records', neodbKey)` | 1 | 读 neodb |
| | `:210` / `:219` | `dbPut('neodb_records', neodbKey, …)` | 1 | 写 neodb |
| | `:226` | `dbGet(targetStore, linkKey)` | 0–2 | imdb/tmdb 循环（重复读，A:57 已读） |
| | `:231` | `dbPut(targetStore, linkKey, …)` | 0–2 | 同上 |
| | **小计** | | **6–8** | |
| **C. `syncNeoDBOnLoad` 挂载时** | `:133` | `Store.getSettings()` | 1 | |
| | `:136` | `dbGet('douban_records', key)` | 1 | 重复读（`beforeMount` 的 `loadRecord` 刚读过） |
| | `:144` | → 进入 `syncToNeoDB` | 0–1 | |
| | `:146` | `dbGet('douban_records', key)` | 0–1 | 推送后再读一次刷新按钮（同 A:113） |
| | `:151` | `dbGet('neodb_records', neodbKey)` | 0–1 | |
| | `:157` | `dbPut('neodb_records', neodbKey, …)` | 0–1 | |
| | **小计** | | **3–4**（+ syncToNeoDB 6–8） | |
| **D. 3s 轮询 `loadRecord`** | `config.ts:34-43` | `intervalWhenVisible(loadRecord, 3000)` | 每 3s 1 次 | 挂载期间持续触发 |
| | `record-loader.ts:15` | `dbGet('douban_records', key)` | 1/tick | 同一 key 反复读 |

**叠加峰值**（挂载 + 一次保存，开启 NeoDB 自动同步且 imdb/tmdb 链接都存在）：

```
C.syncNeoDBOnLoad(3) + C.syncToNeoDB(8) + A.onCrossPlatformSave(6) + B.syncToNeoDB(8)
= 10–14 次串行消息往返（不含 3s 轮询）
```

每次往返约 5–15ms（SW 调度 + IDB + 回调），峰值约 50–210ms 的纯消息延迟，且全部占据 SW 的 HIGH 优先级队列，挤占其他页面的 DB 访问。

### 1.2 已具备的基础设施

- **`DB_GET_BULK` 消息**：`src/types/index.ts:116`（MessageType）、`:148`（MessagePayloadMap `{ storeName, keys }`）。
- **`Store.dbGetBulk` 封装**：`src/features/database/api.ts:103-109`，返回 `Array<{ key, record }>`。
- **SW 处理器**：`src/entrypoints/background/handlers/db.ts:118-132`（`handleDbGetBulk`），单事务 `batchGet`，带 `bulk:{store}:{keys}` 缓存（TTL 5s）。
- **`EVENT_BUS` + `record:updated` 事件**：`src/utils/event-bus.ts`；写操作已在 `db.ts:86/102/191/202` 广播 `record:updated`，payload 为 `{ storeName, key }`。
- **既有事件订阅先例**：`src/content/douban/shared/composables/useRecordCache.ts:56-67` 已订阅 `record:updated` 做实时刷新，证明该事件足以驱动 detail 页同类需求。
- **`initEventBus` 已在 detail 页所在注入系统初始化**：`src/content/douban/main.ts:103`。

> 结论：批量化与事件驱动所需的全部基础设施均已就绪，本次不新增消息类型、不动 SW、不动类型层。

---

## 2. 方案设计

总目标：将 detail 页单次保存的 10–14 次串行往返压缩至 **2 次读取 + 2–3 次写入**，并把 3s 轮询替换为零开销事件订阅。

### 2.1 批量读取：`onCrossPlatformSave` 开头一次性拉取 4 个 key

**问题**：A 流程在 `:24`、`:57`、`:95`、`:113` 分四次读 `douban_records` / `imdb_records` / `tmdb_records` / `neodb_records`，其中 douban key 还在 `:113` 重复读。

**方案**：在 `onCrossPlatformSave` 入口（`useCrossPlatformSync.ts:23` 之后、`:24` 之前）构造 key 集合，**按 store 分组**调用 `dbGetBulk`。由于 `dbGetBulk` 的 `keys` 属于同一 store（`handleDbGetBulk` 单事务单 store），跨 store 需并行多条消息——这仍是一次 `Promise.all`，而非串行。

```ts
// useCrossPlatformSync.ts 新增（伪代码，仅示意结构，非最终实现）
const key = `${identity.type}::${identity.providerId}`
// 预提取链接（纯 DOM，无 DB），用于决定要读哪些 linked store
const previewLinks = extractCrossPlatformLinks(identity, {})

const readKeys: Record<string, string[]> = {
  douban_records: [key],
}
if (previewLinks.imdb) readKeys.imdb_records = [previewLinks.imdb]
if (previewLinks.tmdb) readKeys.tmdb_records = [previewLinks.tmdb]
// neodb key 未知（依赖 douban.existing.linkedIds.neodb），第二轮再读

const snapshots = await Promise.all(
  Object.entries(readKeys).map(async ([store, keys]) => {
    const entries = await Store.dbGetBulk(store, keys)
    return [store, entries[0]?.record ?? null] as const
  }),
)
const existing = snapshots.find(([s]) => s === 'douban_records')?.[1] ?? null
const existingImdb = snapshots.find(([s]) => s === 'imdb_records')?.[1] ?? null
const existingTmdb = snapshots.find(([s]) => s === 'tmdb_records')?.[1] ?? null
```

- **收益**：A 流程的 4 次串行 `dbGet` → 1 次 `Promise.all`（3 条并行消息，SW 端 3 个 HIGH 任务并发排队但无串行等待）。
- **细节**：
  - `extractCrossPlatformLinks` 是纯 DOM 操作（`cross-platform-links.ts:17-44`，无 DB、无 await），可在入口安全调用两次（入口一次预览、`:48` 一次正式合并）——或直接在入口合并后复用，消除第二次调用。
  - `neodb_records` 的 key 依赖 `existing.linkedIds.neodb`，只能在第一轮读到 douban 后才能确定。若 `existing?.linkedIds?.neodb` 存在，追加一次 `dbGet('neodb_records', neodbKey)`（单次，不阻塞主链）。这是不可避免的二轮读，但仅 1 次而非现状的 2–3 次。

### 2.2 去重读：`syncToNeoDB` 接收已读 record，不再自读

**问题**：`syncToNeoDB`（`:166-242`）在 `:192` 重新 `dbGet('douban_records', doubanKey)`，而调用方 A（`:86`/`:91`）和 C（`:144`）刚读过同一条记录；`:203` 再读 neodb、`:226` 循环读 imdb/tmdb 也都是重复。

**方案**：将 `syncToNeoDB` 的签名从「自读」改为「传入」：

```ts
// 现签名（:166）
async function syncToNeoDB(
  identity, doubanKey, mergedLinks, status, rating, comment,
): Promise<void>

// 改为
async function syncToNeoDB(
  identity, doubanKey, mergedLinks, status, rating, comment,
  ctx: {
    doubanRecord: StoreRecord | null      // A:24 / C:136 已读
    neodbRecord: StoreRecord | null       // A:95 / C:151 已读
    linkedRecords: Record<string, StoreRecord | null>  // { imdb, tmdb } A:57 已读
  },
): Promise<void>
```

- `:192` 的 `dbGet('douban_records', doubanKey)` → 直接用 `ctx.doubanRecord`。
- `:203` 的 `dbGet('neodb_records', neodbKey)` → `ctx.neodbRecord`。
- `:226` 的循环 `dbGet` → `ctx.linkedRecords[pfx]`。
- **注意**：`syncToNeoDB` 在推送后仍需写回 douban.linkedIds.neodb（`:197`）。此时 `ctx.doubanRecord` 是写前快照，写入时应基于快照 + 新 linkedIds 构造新对象（不可变更新），而非重读。这与现有「重读再写」的语义等价，因为推送是同步链中唯一的写竞争源——detail 页单线程内无其他写者。

- **收益**：B 流程的 6–8 次往返中，3–4 次读取消除，仅保留 3–4 次写入。

### 2.3 事件驱动：3s 轮询 `loadRecord` 改为订阅 `record:updated`

**问题**：`config.ts:34-43` 用 `intervalWhenVisible(loadRecord, 3000)` 每 3s 拉取一次同一 key，是典型的高频低效轮询——99% 的 tick 读到同一记录（无变更）。而 SW 端每次写都广播 `record:updated`（`db.ts:86`），`useRecordCache.ts:57` 已证明该事件可驱动刷新。

**方案**：

1. **移除** `config.ts:34-43` 的 `intervalWhenVisible(...)` 及其 `recordPoller.destroy()`（`:46`）。
2. **新增** `record:updated` 订阅，过滤 `storeName === 'douban_records'` 且 `key === data.identity` 对应的 key：

```ts
// config.ts afterMount 改造（伪代码）
const { loadRecord } = await import('./detail-data')
const targetKey = `${data.identity.type}::${data.identity.providerId}`

const unsubscribe = onEvent('record:updated', (data: unknown) => {
  if (!isRecordUpdatedPayload(data)) return
  if (data.storeName !== 'douban_records' || data.key !== targetKey) return
  void loadRecord(data.identity!).then((updated) => {
    if (updated && app._instance) {
      const vm = app._instance.proxy as unknown as Record<string, unknown>
      if (vm && typeof vm.updateRecord === 'function') vm.updateRecord(updated)
    }
  })
})
;(window as any).__ummDismissDetailMask = () => {
  unsubscribe()
  app.unmount()
}
```

- **`isRecordUpdatedPayload` 复用**：`useRecordCache.ts:9-13` 已导出该守卫，可提升至 `shared/` 共享，避免重复实现。
- **跨 tab 生效**：`broadcast` 用 `chrome.runtime.sendMessage` 广播到所有 content script，detail 页在 tab A、保存发生在 tab B 时也能收到——比 3s 轮询更及时且零空转。
- **保留兜底**：若担心事件丢失（MV3 SW 被杀时广播可能丢），可保留一个 **60s** 的低频兜底轮询（而非 3s），作为「最终一致」的安全网。这是可选项，默认不加。

- **收益**：D 流程从「每 3s 1 次往返」降至「仅变更时 1 次往返」。挂载 5 分钟的页面从 100 次往返降至 0–2 次。

### 2.4 写合并：同一 key 的多次 dbPut 合并

**问题**：A 流程对 `douban_records` 写 2 次（`:34` 初次写、`:51` linkedIds 变更后再写）；B 流程再写 1 次（`:197` 写 neodb link）。三次写都落在同一 key，后两次基于前一次的增量。

**方案**：在 `onCrossPlatformSave` 内部维护一个 **写缓冲**（plain object），key 为 `${storeName}::${key}`，value 为最终待写的 `StoreRecord`。流程末尾统一 flush：

```ts
// 伪代码
const writes = new Map<string, { store: string; key: string; record: StoreRecord }>()
function queueWrite(store: string, key: string, record: StoreRecord) {
  writes.set(`${store}::${key}`, { store, key, record })
}
// ... 流程中所有 dbPut 改为 queueWrite ...
// 末尾：
await Promise.all(
  [...writes.values()].map((w) => Store.dbPut(w.store, w.key, w.record)),
)
```

- **合并点**：
  - `:34` + `:51` + `:197`（syncToNeoDB 内）→ 合并为 1 次 `dbPut('douban_records', key, finalRecord)`。
  - `:59`（imdb/tmdb）+ `:231`（syncToNeoDB 内）→ 同 key 合并。
  - `:101` + `:210`/`:219`（neodb）→ 同 key 合并。
- **注意：syncToNeoDB 的写需在 NeoDB API 推送成功后才能确定**。`syncResponse.catalogUuid`（`:188`）决定 neodb key。因此写缓冲的 flush 应分两阶段：
  1. 主流程写（douban/imdb/tmdb）在 `onCrossPlatformSave` 末尾 flush。
  2. `syncToNeoDB` 推送成功后，其内部写（douban.linkedIds.neodb、neodb、imdb/tmdb.linkedIds.neodb）单独 flush——但这些 key 可能与阶段 1 重叠，因此阶段 1 的 flush 必须在 syncToNeoDB **之前**完成，或采用「单一写缓冲贯穿整个保存流程」的方案（推荐）。
- **推荐：单一贯穿式写缓冲**：`onCrossPlatformSave` 创建缓冲，传给 `syncToNeoDB`（作为 `ctx` 的一部分），syncToNeoDB 的写也入队，末尾由 `onCrossPlatformSave` 统一 flush。这样同一 key 的多次写天然合并为最后一次。

- **收益**：写次数从 6–8 次降至 **3–4 次**（每 key 一次），且并行 flush。

### 2.5 综合效果

| 流程 | 现状往返数 | 方案后往返数 | 备注 |
|---|---|---|---|
| A. onCrossPlatformSave | 6–10 | 2 读取（bulk + neodb 二轮）+ 0 写（入队） | 读合并 |
| B. syncToNeoDB | 6–8 | 0 读取（ctx 传入）+ 0 写（入队） | 读消除 + 写入队 |
| 末尾 flush | — | 3–4 写（并行） | 写合并 |
| C. syncNeoDBOnLoad | 3–4 + B(6–8) | 1 读取（settings，可缓存）+ bulk 读 + 3–4 写 | 同 A+B 思路 |
| D. 3s 轮询 | 1/3s | 0（事件驱动） | 仅变更时 1 次 |
| **挂载+保存峰值** | **10–14 + 轮询** | **≈3 读取 + 4 写入 = 7**（无轮询） | **↓ 50%+** |

> **实现偏差说明**（2026-08 落地后回填）：`dbGetBulk` 最终未采用——它是单 store 多 key，而跨平台链接分散在 imdb/tmdb/neodb 三个 store 且各至多 1 个 key，故改为 `Promise.all` 并行 3 路 `dbGet`。实际读取为 **4 次 dbGet 消息（1 次 douban 串行 + 3 路并行）**，CHANGELOG 记为「8→4」；`syncToNeoDB` 读 3→0、douban 写 2→1 均已落地。§3.2 建议 7 项测试实际落地 4 项（`cross-platform-save-bulk.spec`），事件驱动/生命周期/跨 tab 未补测试。

---

## 3. 风险评估

### 3.1 行为变更点

| 变更点 | 风险 | 影响范围 |
|---|---|---|
| **入口预提取 `extractCrossPlatformLinks`** | 在 `existing` 读出前调用，当前实现不依赖 existing（`cross-platform-links.ts:21` 用 `existingLinkedIds = {}`）→ 语义一致 | 仅 detail 页 |
| **`syncToNeoDB` 改为传入 ctx** | 若调用方未传 ctx 或传错 record 快照，推送后写回的 douban.linkedIds.neodb 会基于过期快照 → 丢失其他字段的并发更新 | A/C 调用方 |
| **写缓冲合并同一 key** | 若流程中途有「读自己刚写的值」的逻辑，缓冲会返回内存值而非 DB 值——当前代码无此模式（写后不立即读同 key） | 全流程 |
| **3s 轮询 → 事件驱动** | (a) MV3 SW 被杀时 `broadcast` 的 `sendMessage` 可能无接收端（`event-bus.ts:20-26` 已吞 `Could not establish connection`）→ 事件丢失，页面不刷新；(b) 同 tab 内保存后 SW 广播回同 tab，`initEventBus` 的 listener（`main.ts:103`）需已就绪 | detail 页挂载期间 |
| **跨 tab 一致性** | 事件驱动天然支持跨 tab（优于轮询），但 detail 页 `vm.updateRecord`（`config.ts:40`）若在 unmount 后被回调触发 → 需确保 `unsubscribe` 在 `__ummDismissDetailMask` 中先调用 | 生命周期边界 |
| **neodb 二轮读** | `existing.linkedIds.neodb` 依赖一轮 bulk 读的 douban record，若 douban record 缺失则无 neodb key → 与现状一致（现状 `:81` 也基于 existing） | 无新增风险 |

### 3.2 特征测试需求

建议补充以下 Playwright 单元测试（`tests/unit/`）：

1. **`onCrossPlatformSave` 批量读**：mock `Store.dbGetBulk`，断言单次保存只触发 1 次 `dbGetBulk`（douban+imdb+tmdb 合并）+ 至多 1 次 `dbGet`（neodb 二轮），而非 4+ 次 `dbGet`。
2. **`syncToNeoDB` 传入 ctx**：断言 `syncToNeoDB` 内部不再调用 `Store.dbGet`，写入的 record 字段值与 ctx 传入的一致。
3. **写合并**：对同一 key 的多次逻辑写（douban 在 A:34/A:51/B:197），断言最终只 `dbPut` 1 次，且 record 内容为三次写的合并结果（status/rating/comment 来自 A、linkedIds.neodb 来自 B）。
4. **事件驱动刷新**：挂载 detail 页后，触发 `record:updated` 事件（`storeName: 'douban_records', key: 目标key`），断言 `vm.updateRecord` 被调用；触发非目标 key 的事件，断言不调用。
5. **轮询移除**：断言 `config.ts` 不再调用 `intervalWhenVisible`（或调用频率改为 ≥60s 兜底）。
6. **生命周期**：unmount 后触发 `record:updated`，断言 `vm.updateRecord` 不再被调用（unsubscribe 生效）。
7. **跨 tab 场景**：模拟 SW 广播，断言 tab B 保存后 tab A 的 detail 页刷新（事件链路完整）。

### 3.3 兼容性

- **不动 SW**：`handleDbGetBulk` 已存在且缓存 key 为 `bulk:{store}:{keys.join(',')}`（`db.ts:127`），批量读会命中 5s LRU 缓存——对高频保存场景有额外收益。
- **不动类型层**：`DB_GET_BULK` 的 payload（`types/index.ts:148`）不变。
- **不动 `EVENT_BUS`**：`record:updated` 事件已存在，仅新增消费侧订阅。
- **不影响其他页面**：`useRecordCache.ts` 已独立订阅同一事件，detail 页新增订阅不冲突（`subscribers` 是 `Set`，`event-bus.ts:57-59`）。

---

## 4. 决策建议

**推荐立即采纳方案 2.1 + 2.2 + 2.3，写合并 2.4 列为 P1 紧随其后。**

理由：
- 2.1/2.2/2.3 的基础设施全部就绪（`DB_GET_BULK`、`record:updated`、`initEventBus`、`useRecordCache` 先例），零新增消息类型、零 SW 改动，实现风险最低。
- 2.4（写合并）需重构 `syncToNeoDB` 的写时序，与 2.2 的 ctx 改造耦合，建议同批落地以避免两次重构同一函数。
- 三项叠加可将峰值 10–14 次往返降至 ≈7 次，且消除 3s 轮询的持续开销，ROI 最高。
- 建议在 **一个 PR** 中完成 2.1–2.4，配套补齐 §3.2 的特征测试，避免分批引入「读已批量化但写未合并」的中间态。

**不推荐**：
- 新增 `DB_PUT_BULK` 消息类型——写合并用 `Promise.all(dbPut)` 已足够，SW 端 `handleDbPut` 已并发调度，新增消息类型得不偿失。
- 改 `DataScheduler` 的队列优先级——detail 页的 HIGH 优先级是合理的（用户交互触发），问题在调用次数而非优先级。

---

## 5. 回滚方案

方案按文件粒度可回滚：

1. **2.1（批量读）**：恢复 `onCrossPlatformSave:24` 的单次 `dbGet`，删除入口的 `dbGetBulk` 逻辑——单一函数内回滚。
2. **2.2（syncToNeoDB ctx）**：恢复 `syncToNeoDB` 原签名，内部重新 `dbGet`——单一函数回滚，调用方去掉 ctx 参数。
3. **2.3（事件驱动）**：恢复 `config.ts:34-43` 的 `intervalWhenVisible(loadRecord, 3000)`，删除 `onEvent` 订阅——单一文件回滚。
4. **2.4（写合并）**：恢复各 `dbPut` 调用点，删除写缓冲——与 2.2 同批回滚。

四项互相独立：回滚 2.3 不影响 2.1/2.2/2.4；回滚 2.4 仍可保留 2.1/2.2 的读优化。建议提交时按 2.1→2.2→2.4→2.3 的顺序分 commit，便于单点 revert。

**全局回滚**：`git revert` 单个 PR 的 commit 即可，无数据迁移、无 schema 变更、无 SW 状态依赖。

---

## 6. 后续（不在本次范围）

以下事项与本次方案相关但不在本 ADR 范围内，记录待后续评估：

1. **`Store.getSettings()` 缓存**：A:79 / C:133 每次保存都读设置。设置变更频率极低，可在 content script 侧加内存缓存 + 订阅 `settings:changed` 事件（`event-bus.ts:1` 已定义该事件类型）。
2. **`syncNeoDBOnLoad` 与 `onCrossPlatformSave` 的职责重叠**：C 流程在挂载时调 `syncToNeoDB`，A 流程在保存时也调——若用户挂载后立即保存，同一 NeoDB 记录可能在 1s 内被推送两次。可引入「最近推送时间戳」去重。
3. **`DB_GET_BULK` 跨 store 批量化**：当前 `dbGetBulk` 单 store 单事务。若需一次消息读多个 store（如 douban+imdb+tmdb+neodb 一条消息），需新增 `DB_GET_BULK_MULTI` 消息类型——本次不必要（`Promise.all` 3 条已够快），但若未来出现 10+ store 场景可评估。
4. **detail 页 `injectNeoDBPushButtons` 的末尾读**（A:113 / C:146）：推送按钮注入依赖最新 douban record。方案 2.4 的写缓冲 flush 后，可直接用内存中的 finalRecord 注入，消除这次读。
5. **`intervalWhenVisible` 的其他消费方**：若 detail 页是唯一用户，可考虑从 `visibility.ts` 标记 deprecated。需先 grep 确认无其他调用方。
