# ADR-014: 引入 chrome.storage.session 作为 L1.5 跨 wake 缓存层 — 三层缓存架构

- **日期**: 2026-08-05
- **状态**: Accepted（已实现 — `session-cache.ts` L1.5 层 + watched ids/settings 快照，2026-08）
- **依据**: UMM Service Worker（MV3）30s 空闲即终止，模块级内存变量（`LruCache` / `SettingsCache.cache` / `DataScheduler` 队列）随 wake 丢失；现状仅 L1 内存 LRU → IndexedDB 两层，每次 SW wake 后首请求必落 IndexedDB（异步、有 I/O 延迟）。`chrome.storage.session` 跨 SW wake 存活、浏览器重启即清、无磁盘 I/O，可在 L1 与 IndexedDB 之间充当跨 wake 热数据快照层。

---

## 背景

### UMM 当前缓存分层

UMM 的 Service Worker 数据访问经 `DataScheduler.schedule()` 统一调度，缓存现状为两层：

| 层级 | 实现 | 位置 | 生命周期 | 命中延迟 |
|---|---|---|---|---|
| **L1** | `LruCache`（`src/features/cache/lru-cache.ts`） | SW 进程内存（`Map`） | SW 单次存活（≤30s 空闲即终止） | 同步，~0ms |
| **L2** | IndexedDB（`MediaDatabase`，`src/features/database/models.ts`） | 浏览器磁盘 | 持久（跨重启） | 异步 I/O，~1-10ms |

关键缓存实例有三处：

1. **`DataScheduler.cacheManager.l1`**（`data-scheduler.ts:39`）—— 调度器缓存，键形如 `get:{store}:{key}` / `all:{store}` / `bulk:{store}:{keys}` / `watched:{store}` / `ptcache:{ptUrl}`，TTL 5-10s。SW wake 即清空，首请求必落 IndexedDB。
2. **`MediaDatabase.readCache`**（`models.ts:110`）—— DB 层 LRU，maxSize=500、TTL=30s。同样 SW wake 即清空。
3. **`SettingsCache.cache`**（`settings/cache.ts:5`）—— 已解析的 `AppSettings` 对象。SW wake 即清空，每次 wake 通过 `chrome.storage.local.get(null)` 全量读回（`cache.ts:12`）并逐字段重建。

### Service Worker wake 问题

MV3 的 Service Worker 在约 30s 空闲后由浏览器终止以节省内存。唤醒（由消息事件触发）时，所有模块级变量重新初始化：

- `LruCache.map` 清空 → `DataScheduler.cacheManager` 失效
- `SettingsCache.cache` 变 `null` → 下次 `get()` 返回默认值直到 `init()` 完成
- `DataScheduler.queue` / `RateLimiter` / `SchedulerMonitor` 全部重置

`data-scheduler.ts:11-15` 的注释明确记录了这一约束："The scheduler is re-created on every Service Worker wake (MV3) so in-memory state (queue, cache, metrics) is ephemeral"。

**后果**：每次 SW wake 后的"冷"请求必走 IndexedDB，对于 PT 站点批量查询 watched ids（`DB_GET_WATCHED_IDS`，可能扫数千条记录）或 settings 首次读取，存在可感知的延迟。

### chrome.storage.session 能力

`chrome.storage.session` 是 MV3 提供的内存级存储区域：

- **跨 SW wake 存活**：数据在浏览器会话期间持久，SW 终止/重启不影响
- **浏览器重启即清**：关闭浏览器后数据消失（与 `chrome.storage.local` 的持久性不同）
- **无磁盘 I/O**：数据存于内存，读写比 IndexedDB 快
- **配额限制**：见下方调研结论

引入 L1.5 session 层后，三层架构为：

```
L1 内存 LRU（SW 单次存活，同步） 
  → L1.5 session（跨 SW wake 存活，异步但无 I/O）
    → L2 IndexedDB（持久，异步 I/O）
```

---

## 调研结论

### Fact 1 — 配额：1MB 基线，Chrome 122+ 提升至 10MB

- **Fact**：`chrome.storage.session` 配额默认为 **1 MB**（`QUOTA_BYTES = 1048576`）。自 **Chrome 122**（2024-02 发布）起，配额提升至 **10 MB**（`QUOTA_BYTES = 10485760`）。
- **来源**：
  - [Chrome for Developers — Storage and quotas](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session-QUOTA_BYTES)
  - [MDN — chrome.storage.session](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session)（MDN 文档滞后，仍标注 10MB 为 Firefox 行为；以 Chrome 官方文档为准）
  - [Chromium 源码 `chrome/common/extensions/api/storage.json`](https://source.chromium.org/chromium/chromium/src/+/main:chrome/common/extensions/api/storage.json)（`QUOTA_BYTES` 常量定义）
- **对 UMM 的影响**：`wxt.config.ts` 未声明 `minimum_chrome_version`，Chrome Web Store 默认接受较旧版本。保守按 **1 MB 基线**评估配额；若声明 `minimum_chrome_version: "122"` 或仅支持现代 Chrome，可按 10MB 规划。

### Fact 2 — 持久性：会话级（浏览器重启即清）

- **Fact**：`chrome.storage.session` 数据在浏览器会话期间存活（包括 SW 终止/重启、标签页切换），但在**浏览器完全关闭后清除**。这与 UMM 对"热数据快照"的期望一致：跨 wake 存活，但不需要跨浏览器重启持久化（持久数据仍由 IndexedDB / `chrome.storage.local` 承载）。
- **来源**：
  - [Chrome Developers — Storage area](https://developer.chrome.com/docs/extensions/reference/api/storage#type-StorageArea)（"cleared when the browser is closed"）

### Fact 3 — 性能：内存级，无磁盘 I/O

- **Fact**：`chrome.storage.session` 存储于浏览器进程内存，读写无磁盘 I/O。相比 IndexedDB（需事务 + 序列化 + 磁盘读写），延迟更低。但 API 仍为异步（`Promise`），需 `await`。
- **来源**：
  - [Chrome Developers — Storage API overview](https://developer.chrome.com/docs/extensions/reference/api/storage)
- **实测参考**：社区基准测试显示 `chrome.storage.session.get` 约 0.1-0.5ms（小数据），而 IndexedDB 单次 `get` 约 1-5ms（含事务开销）。对于 SW wake 后的冷读，session 层可减少 1 个数量级的延迟。

### Fact 4 — content scripts 默认不可访问，需 setAccessLevel

- **Fact**：`chrome.storage.session` 默认仅 extension contexts（SW / popup / options）可访问。若需在 content scripts 中直接读取，须调用 `chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })`。
- **来源**：
  - [Chrome Developers — setAccessLevel](https://developer.chrome.com/docs/extensions/reference/api/storage#method-StorageArea-setAccessLevel)
- **对 UMM 的影响**：UMM 架构约定内容脚本不直接触 IndexedDB，一律走 `chrome.runtime.sendMessage`（见 `AGENTS.md`）。因此 content scripts **不应**直接读 session 层；session 层仅由 SW 读写，content scripts 仍经消息路由访问。**无需调用 `setAccessLevel`**。

### Fact 5 — 单次 set 有 8KB / 项的隐含约束（QUOTA_BYTES_PER_ITEM 已移除）

- **Fact**：早期文档提及 `QUOTA_BYTES_PER_ITEM`（单项 8KB 限制），但该限制在 MV3 中**已移除**（仅 `chrome.storage.local` 的旧 `bytesInUse` 计算逻辑残留）。`chrome.storage.session` 仅受总配额约束。
- **来源**：
  - [Chrome Developers — Storage and quotas](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session-QUOTA_BYTES)
- **对 UMM 的影响**：可将整个 watched ids 集合作为一个大 value 写入 session（只要总量不超配额），无需拆分。

---

## 可行性评估

### 哪些热数据适合放 session 层

按"跨 wake 频繁读取 + 数据量可控 + 一致性容忍度"三维度评估：

| 候选数据 | 读取频率 | 跨 wake 价值 | 预估大小 | 一致性要求 | 适配度 |
|---|---|---|---|---|---|
| **watched ids 集合** | 高（PT 站每页加载） | 高（SW wake 后 PT 站立即需查询） | ~280-350KB（重度用户 14000 条） | 最终一致（写时失效 + 浏览器重启清空） | ✅ **强烈推荐** |
| **settings 已解析快照** | 高（每次 SW 消息处理） | 高（避免每次 wake 全量读 `storage.local`） | ~400 字节 | 强一致（`onChanged` 监听已存在） | ✅ **强烈推荐** |
| **pt_id_cache 摘要** | 中（PT 详情页） | 中 | ~100-200KB（500 条） | 最终一致（TTL 5s） | ⚠️ 可选 |
| **scheduler get:/all:/bulk: 缓存** | 高 | 中 | **500KB-2.5MB**（500 条 StoreRecord） | 最终一致（TTL 5s + 写时失效） | ❌ **不推荐**（超 1MB 配额风险） |
| **MediaDatabase.readCache** | 高 | 中 | 同上，StoreRecord 量大 | 最终一致 | ❌ **不推荐**（同上） |

#### 详细分析

**1. watched ids 集合 — 强烈推荐迁移到 session 层**

- **现状**：`handleDbGetWatchedIds`（`db.ts:134`）经 `scheduler.schedule` 缓存于 L1，键 `watched:{store}`，TTL 10s。SW wake 后 L1 清空，PT 站首次加载时需对每个 store 跑 `getWatchedIds`（`models.ts:457`，`openKeyCursor` 扫描 status 索引）。重度用户（7 平台 × 数千条）可能接近 8s 调度超时（`DEFAULT_TASK_TIMEOUT`）。
- **session 层收益**：SW wake 后直接从 session 读取，跳过 IndexedDB 扫描。PT 站页面加载延迟可从"可能超时"降至亚毫秒级。
- **大小估算**：键格式 `type::providerId`（如 `movie::37332784`，约 18 字节）。重度用户 14000 条 → JSON 数组约 280KB。1MB 配额内安全。
- **一致性策略**：写入 record 时（`handleDbPut` / `handleDbDelete` / `handleDbSyncPageRecord`）同步失效 session 中对应 store 的 watched 集合；浏览器重启清空兜底（session 层无 TTL）。

**2. settings 已解析快照 — 强烈推荐迁移到 session 层**

- **现状**：`SettingsCache.init()`（`cache.ts:8`）每次 SW wake 调用 `chrome.storage.local.get(null)` 全量读取并逐字段重建 `AppSettings`。`get()` 在 `init()` 完成前返回默认值（`cache.ts:36`），可能导致 SW wake 后早期消息处理使用错误配置。
- **session 层收益**：SW wake 后从 session 读取已解析的 `AppSettings` 快照，避免全量 `storage.local` 读取 + 字段映射。`storage.local` 仍为持久源，session 仅作热缓存。
- **大小估算**：`AppSettings` 约 15 个标量字段 → JSON 约 400 字节。极小。
- **一致性策略**：`SettingsCache.startListening()` 已监听 `chrome.storage.onChanged`（`cache.ts:48`）。session 层写入需在同一 `onChanged` 回调中同步更新。

**3. pt_id_cache 摘要 — 可选**

- **现状**：`handlePtIdCacheGetBulk`（`db.ts:232`）批量查 PT→平台 ID 映射，L1 缓存 `ptcache-bulk:{urls}`，TTL 5s。
- **session 层收益**：中等。PT 详情页加载时批量查询，SW wake 后可从 session 恢复。
- **大小估算**：每条 `PtIdCacheEntry` 含 `ptUrl`（~70 字节）+ 平台 ID 映射，约 300 字节。500 条 → ~150KB。
- **一致性策略**：`handlePtIdCachePut` 已失效 L1，扩展为同步失效 session。
- **建议**：二期实施，一期聚焦 watched ids + settings。

**4. scheduler get:/all:/bulk: 缓存 — 不推荐**

- **现状**：`DataScheduler.cacheManager` 缓存完整 `StoreRecord` 对象，键 `get:{store}:{key}` / `all:{store}` / `bulk:{store}:{keys}`，TTL 5s。
- **不推荐原因**：单条 `StoreRecord` 含 `linkedIds`、`status`、`rating`、`comment` 等字段，序列化后 1-5KB。500 条 LRU 接近 500KB-2.5MB，**存在超 1MB 配额风险**。且这些数据本质是 IndexedDB 查询结果缓存，SW wake 后重新查询成本低（单次 `get` ~1-5ms），跨 wake 价值有限。
- **建议**：保持现状（L1 内存 LRU → IndexedDB）。

### 配额估算汇总（1MB 保守基线）

| 数据 | 预估大小 | 1MB 占比 | 是否纳入 |
|---|---|---|---|
| watched ids（7 平台 × 2000 条 = 14000 条） | ~280-350KB | ~28-35% | ✅ |
| settings 快照 | ~400 字节 | <0.1% | ✅ |
| pt_id_cache 摘要（500 条） | ~150KB | ~15% | ⚠️ 二期 |
| **小计（一期）** | **~280-350KB** | **~28-35%** | — |
| **小计（含二期）** | **~430-500KB** | **~43-50%** | — |
| scheduler get:/all:/bulk:（500 条 StoreRecord） | ~500KB-2.5MB | 50-250% | ❌ 超配额 |

**结论**：一期（watched ids + settings）在 1MB 保守基线下占用约 35%，安全。若纳入 pt_id_cache（二期）约 50%，仍在 1MB 内。scheduler 完整结果缓存不可纳入。

### 一致性策略

session 层作为 L1.5 缓存，一致性模型与 L1 一致：**写时失效 + 浏览器重启清空**。

| 写操作 | L1 失效（现状） | L1.5 session 失效（新增） |
|---|---|---|
| `handleDbPut` | `invalidateStoreCaches`（`db.ts:85`） | 同步 `chrome.storage.session.remove(watched:{store})` |
| `handleDbDelete` | `invalidateStoreCaches`（`db.ts:101`） | 同上 |
| `handleDbSyncPageRecord` | `invalidateStoreCaches`（`db.ts:190`） | 同上 |
| `SettingsCache.updateAll` | `Object.assign` 更新内存（`cache.ts:44`） | 同步 `chrome.storage.session.set({settings: snapshot})` |
| settings `onChanged` | `cache.ts:49-65` 更新内存 | 同步更新 session |
| `handlePtIdCachePut` | L1 `invalidateCache: true`（`db.ts:227`） | 同步 `chrome.storage.session.remove(ptcache:{url})` |

**一致性风险**：
- session 写入失败（超配额）时降级为仅 L1 + IndexedDB，不阻塞主流程。
- session 数据可能比 IndexedDB 旧（浏览器会话内）。对 watched ids 可接受——PT 淡化基于"曾看过"，短暂过期不致功能错误。

---

## 决策建议

### 推荐：实施三层缓存架构（L1 → L1.5 session → L2），分期推进

**推荐理由**：

1. **watched ids 是 PT 站核心热路径**，SW wake 后从 session 恢复可消除"冷启动超时"风险（`getWatchedIds` 扫描在重度用户下接近 8s 调度超时）。
2. **settings 快照体积极小但读取极频繁**，session 层消除每次 wake 的 `storage.local.get(null)` 全量读。
3. **1MB 保守基线下占用约 35%**，安全余量充足。
4. **一致性策略与现有 L1 写时失效模型一致**，无新的一致性范式。
5. **content scripts 无需直接访问**（经消息路由），避免 `setAccessLevel` 的安全面扩大。

**不推荐纳入的数据**：
- scheduler 的 `get:/all:/bulk:` 完整结果缓存（超配额风险 + 跨 wake 价值低）。
- `MediaDatabase.readCache`（同上）。

### 三层架构设计

```
┌─────────────────────────────────────────────────────────┐
│  Service Worker（单次存活 ≤30s）                          │
│                                                          │
│  L1 内存 LRU（同步，~0ms）                               │
│  ├─ LruCache (DataScheduler.cacheManager.l1)             │
│  ├─ LruCache (MediaDatabase.readCache)                   │
│  └─ SettingsCache.cache (内存对象)                       │
│         │  miss                                           │
│         ▼                                                │
│  L1.5 session（异步无 I/O，~0.1-0.5ms，跨 SW wake 存活） │
│  ├─ watched:{store}    → Set<string> 的 JSON 数组         │
│  ├─ settings:snapshot  → AppSettings 对象                │
│  └─ (二期) ptcache:{url} → PtIdCacheEntry               │
│         │  miss                                           │
│         ▼                                                │
│  L2 IndexedDB（异步 I/O，~1-10ms，持久）                 │
│  └─ MediaDatabase (各 store)                             │
└─────────────────────────────────────────────────────────┘
```

**读取流程**（以 `handleDbGetWatchedIds` 为例）：

```
1. L1 命中？ → 返回（同步）
2. L1.5 session.get(watched:{store}) 命中？ → 返回（不回填 L1，session 读足够便宜）
3. L2 IndexedDB getWatchedIds() → 回填 L1 + L1.5 + 返回
```

**写入流程**（以 `handleDbPut` 为例）：

```
1. L2 IndexedDB put()
2. 失效 L1 (invalidateStoreCaches)
3. 失效 L1.5 session.remove(watched:{store})
4. broadcast('record:updated')
```

### 实施分期

- **一期**（本次 ADR 范围内的设计目标）：watched ids + settings 快照迁入 session 层。
- **二期**（后续 ADR）：pt_id_cache 摘要迁入。
- **不实施**：scheduler 完整结果缓存、`MediaDatabase.readCache`。

---

## 回滚方案

三层架构的回滚成本极低，因为 session 层是**纯加法**——L1 和 L2 的现有逻辑不变，session 层仅在两者之间插入一次可选检查。

### 回滚步骤

1. **移除 session 读取**：在 `DataScheduler.peekCache` / `SettingsCache.get` / `handleDbGetWatchedIds` 中删除 session 查询分支。读取路径自动降级为 L1 → L2（现状）。
2. **移除 session 写入**：在写操作中删除 `chrome.storage.session.set/remove` 调用。
3. **清理 session 数据**：`chrome.storage.session.clear()`（可选，浏览器重启自动清除）。
4. **无需数据迁移**：session 层无持久数据，IndexedDB 是唯一持久源，回滚零数据风险。

### 回滚触发条件

- session API 在目标 Chrome 版本表现异常（如 wake 后数据丢失率超预期）。
- 配额超限导致 `set` 失败率超过 1%（监控指标）。
- 一致性问题导致 PT 淡化误判（watched ids 过期）的用户反馈。

---

## 后续（不在本次范围）

以下事项属于后续 ADR 或实施工单，本 ADR 仅记录决策方向。标注 ✅ 者已随本 ADR 落地（2026-08）：

1. ✅ **实施工单：watched ids session 层**——`src/features/cache/session-cache.ts` + `handleDbGetWatchedIds` 三层读取。
2. ✅ **实施工单：settings 快照 session 层**——`SettingsCache.init()` session-first + miss 回填。
3. **二期 ADR：pt_id_cache session 层**——评估 PT 详情页的 SW wake 命中率后再决策。（未实施）
4. **监控**：在 `SchedulerMonitor` 中新增 `session:hit` / `session:miss` 事件，量化 L1.5 层命中率。（未实施）
5. ✅（部分）**`minimum_chrome_version` 声明**——已声明 `119`（`Promise.withResolvers` 运行时底线）；10MB 配额需 `122`，故仍按 1MB 保守基线评估。
6. ✅ **一致性测试**——`session-cache.spec` / `settings-session-snapshot.spec` 已覆盖降级/异常/round-trip。

---

## 参考文件

- `src/features/cache/lru-cache.ts` — L1 内存 LRU 实现
- `src/features/cache/cache-manager.ts` — L1 缓存管理器
- `src/features/settings/cache.ts` — SettingsCache（session-first，miss 回退 `storage.local`）
- `src/entrypoints/background/handlers/db.ts` — DB handler（scheduler.schedule + cacheKey）
- `src/features/data-scheduler/data-scheduler.ts` — DataScheduler（调度 + 缓存）
- `src/features/data-scheduler/types.ts` — `CACHE_TTL = 5000`、`DEFAULT_TASK_TIMEOUT = 8000`
- `src/features/database/models.ts` — `MediaDatabase.readCache` + `getWatchedIds`
- `wxt.config.ts` — manifest（已声明 `minimum_chrome_version: '119'`）
