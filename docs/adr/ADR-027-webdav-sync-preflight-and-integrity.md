# ADR-027 WebDAV 同步预检与完整性校验（preflight / preview / 二次确认 / 合并语义加固）

- **日期**: 2026-10-04
- **状态**: **Accepted（2026-10-04 用户面板裁定并已实现）**
- **依据**: 用户报告「同步出现数据丢失，且云端数据可能整体被覆盖/残缺」。取证确认：`WEBDAV_SYNC` 为单点击黑盒执行，无任何预览与二次确认，且其判定语义为**数据集粒度「较新者胜」+ 上传整文件覆盖** —— 与 UI 宣称的「智能合并」不一致，具备静默销毁远端数据的能力。
- **关系**: 修订 ADR-011 决策 2 的一部分（同步链路的本地枚举与合并语义），不推翻 ADR-011 的版本化/白名单/迁移三项决策。

### 裁定记录（面板，2026-10-04）

| 决策项 | 用户选择 |
|---|---|
| 同步合并语义 | **并集 + 逐记录较新者胜**（D2 全量落地） |
| 预览界面落点 | **扩展确认对话框**（`ConfirmDialog` 支持结构化表格） |
| 变更指纹是否纳入 `comment` | **纳入**（D6） |
| 推进方式 | **进入实现** |

### 实现状态（2026-10-04）

D1–D6 全部落地；新增 `src/provider/webdav/plan.ts`（纯策略）与
`src/entrypoints/background/handlers/webdav-preview.ts`（只读预检），
`webdav.ts` / `webdav-sync.ts` 接入指纹与复核，`ConfirmDialog` 支持表格。
验证：14 道静态门禁 + `type-check` 全绿；新增 `tests/unit/webdav-sync-plan.spec.ts`
（方向矩阵 / 风险估算 / 指纹稳定性 / 并集守恒-幂等-可交换）。

---

## 背景与取证（全部来自当前 HEAD `1c8952e`，dev-2026-09-25）

### 现状：一次点击、零预览、零复核

`WEBDAV_SYNC` 的唯一触发点是 `src/entrypoints/options/tabs/sync/WebDAVTab.vue:121-144`：确认框只传通用文案（`sync.smartMerge` / `sync.smartMergeDesc`），不展示任何数据面——**用户无法知道本次同步会动哪张表、动多少条、方向为何**。执行结果仅以一个 toast 汇总（`webdav-sync.ts:256-272`）。

`src/store/confirm.ts` 的 `ConfirmDialogState.details` 是 **纯字符串**（`src/feature/ConfirmDialog.vue:43-45` 直接插值），当前不具备承载结构化预览的能力。

文案与实现不符：`src/libraries/locales/zh-CN.ts:169` 宣称「对比本地和云端数据，自动同步有变化的部分」，而实际执行的是整表覆盖（见下 RC-B）。

### RC-1｜本地枚举与备份白名单分叉 → 两张用户表永不参与同步

- `webdav-sync.ts:25-76`（`buildLocalMeta`）手写枚举：`RECORD_STORES`(7) + `jav_ids` + `__settings__`。
- 唯一事实源 `src/engine/database/schema.ts:58-65`：`ADULT_STORES` = jav/usav/sehuatang，`BACKUP_STORES` = 7 + 3 = **10 表**。
- 上传/下载走 `BACKUP_STORES`（`webdav.ts:79`、`webdav.ts:184`），**同步不走** → 缺 `usav_ids` / `sehuatang_ids`。
- ADR-025「不动：WebDAV 备份链（BACKUP_STORES 派生自动纳入）」这一假设**对同步链路不成立**。
- 测试盲区：`tests/unit/backup-stores.spec.ts` 只锁白名单含 10 表，全仓无 `webdav-sync` 语义测试。

### RC-2｜数据集粒度「较新者胜」+ 写侧不对称 → 覆盖式销毁

- 判定：`webdav-sync.ts:203` `if (local.updatedAt >= remote.updatedAt)` —— 比较的是**整表 max(updatedAt)**，不比较 `recordCount`，无包含性检查。
- 上传：`packageDataset(本地全量)` → `PUT` 整文件替换（`src/provider/webdav/api.ts:174-194`），**无远端并集**。
- 下载：`downloadDatasetIntoStore` → `batchPut` 逐记录 upsert，**不删除**（`webdav-restore.ts:210-214`）。
- 两侧语义不对称 ⇒ 合并既不幂等也不可交换。典型灾难：换机/重装后本机仅数条新记录，其 `updatedAt` 晚于远端 ⇒ **用数条整体覆盖远端全量**，远端其余记录不可逆丢失；三台设备场景下由第三台恢复时即表现为「大量数据丢失」。
- 远端 meta 整体替换（`webdav-sync.ts:242-254`）放大了后果：被覆盖的 dataset 连 meta 条目一并消失，成为 UI 不可达的孤儿 blob。

### RC-3｜变更指纹漏 `comment` → 注释改动对同步不可见

`src/libraries/utils/hash-utils.ts:29-35` 只哈希 `key/status/rating/linkedIds/url`。仅改注释 ⇒ hash 相等 ⇒ `webdav-sync.ts:196` 判「无变化」直接 skip；且在 RC-2 的覆盖路径中会被对方版本覆盖。

### 附带缺陷

同步路径多处硬编码 `dataVersion: 1`（`webdav-sync.ts:39,55,68,123,143,160,234`），当前 `CURRENT_DATASET_VERSION = 1`（`src/libraries/utils/dataset-version.ts:19`）巧合一致 —— 版本常量一旦上升即漂移。

---

## 决策（Accepted，2026-10-04）

### D1 — 同步改为五段式：预检 → 预览 → 二次确认 → 执行 → 复核

新增**只读**消息 `WEBDAV_PREVIEW`（`payload.mode: 'sync' | 'upload' | 'download'`），不写任何本地/远端数据，返回逐表对照计划：

```ts
interface DatasetPlanRow {
  key: string;              // store 名 或 __settings__
  localCount: number;
  remoteCount: number;      // 远端 meta 计数（不 Download ZIP）
  localLatest: string;      // 本地 max(updatedAt)
  remoteLatest: string;
  hashEqual: boolean;
  direction: 'upload' | 'download' | 'skip' | 'conflict';
  lossRisk: number;         // max(0, loserCount - winnerCount)，>0 即「将丢失 N 条」
}
interface SyncPreview {
  rows: DatasetPlanRow[];
  totals: { upload: number; download: number; skip: number; lossRisk: number };
  planFingerprint: string;  // 见 D3
}
```

UI 在 WebDAV 页签点击动作时先发 `WEBDAV_PREVIEW`，拿到计划后**在确认对话框内**渲染预览表（用户裁定：扩展 `ConfirmDialog`；`ConfirmDialogState` 增可选 `table`，`ConfirmDialog.vue` 负责渲染并按有无表格调整宽度），仅在用户确认后才发执行消息并携带指纹。

`ConfirmTable` 采用**通用形状**（`headers` + `rows[].cells` + 可选 `rows[].tone`），不耦合 WebDAV 类型：全局确认组件不为单个业务引入领域类型，业务映射留在 WebDAV 页签。

### D2 — 同步语义改为「并集 + 逐记录较新者胜」，同步路径永不删除

- **适用范围：仅 `WEBDAV_SYNC`。** 上传/下载保持其名义上的显式「覆盖 / 恢复」语义（用户动作本身即期望该效果，且被用作「以本机为准」的唯一出口），但必须经 D1 预检与 D4 风险确认——把不可见变为可见，而不是取消用户的选择权。
- **同步单表流程**：拉取远端 dataset → 与本地**并集**（同键取 `updatedAt` 较新者；时间相同则比内容签名，内容相同视为等价、内容不同则保留本地并登记冲突）→ `batchPut` 落盘 → 按落盘后的真实状态打包并上传。
- 因此同步是**幂等**的（`merge(merge(a,b), b)` 逐键一致）且**不丢任一侧独有记录**（结果集不小于任一侧）。
- **冲突**（同键、`updatedAt` 相同、内容不同）：保留本地并记 `warnLog`，计入回报的 `mergeConflicts`。
- **纪律**：同步链路不得出现删除语义（删除同步=墓碑机制，见「非目标」）。
- 代价（如实登记）：合并行需额外拉取远端 ZIP，网络与内存开销上升；单表上限沿用既有闸门（`zip-utils.ts:37-39`：50 MiB / 100k 记录），超限则**中止该表并回报**，绝不降级为覆盖。

### D3 — 完整性校验：TOCTOU 指纹 + 执行后复核

- 预检返回整体 `planFingerprint`（对 rows 的稳定序列化取 SHA-256）。
- 执行时 `WEBDAV_SYNC` 携带 `expectedFingerprint`；后台**重新计算**，不一致（预检后本地被并发写入 / 远端被另一设备改写）⇒ **中止且不执行任何写**，回报 `STALE_PLAN`。
- 执行后复核：每表写入后的计数必须等于预期并集计数；不匹配 ⇒ 回报 `verified: false` 并列出差异表，`sync:completed` 广播携带 `verified`。
- 预览数据仅作**计划**用途，不参与哈希指纹之外的权限判定。
- **调度预算**：合并行是「拉远端 + 推远端」双向往返（旧实现每表只走一个方向），60s 预算在分叉表较多时会提前超时；而调度器超时只 `reject`、**操作仍在后台继续**（`data-scheduler.ts` 的 `Promise.race` 语义），用户看到失败后重试就会与在跑的同步并发。故写路径预算改为：SYNC 180s / UPLOAD·DOWNLOAD 120s（只读 PREVIEW 保持 30s），UI 侧 200s 并显式 `retries: 1`（只发一次，绝不重试 —— 写操作盲重试等于重复执行）。

### D4 — 破坏性动作显式确认 + 文案订正 + 孤儿消除

- 任一行 `lossEstimate > 0` ⇒ 预览行标红，二次确认文案必须**列出「将丢失 N 条」**（`sync.lossWarning`）。
- `orphansRemote`（上传模式：本机该表为空而云端有数据）单独标记「云端数据将被清空」，并按 `lossEstimate = remoteCount` 计入估算。
- **孤儿消除**：原上传对空表只把 meta 计为 `recordCount: 0` 而不写 blob —— 既有云端 ZIP 因此变成下载侧（`recordCount === 0` 跳过）永远取不到的孤儿。现改为对这类行**写出空数据集**：覆盖名副其实（与按钮文案一致），且 meta 与实际 blob 一致、不再产生不可达数据。
- 执行后复核结果进入返回体（`verified`）与消息尾部提示，不再只报「成功」。
- D2 落地后同步路径的 `lossEstimate` 应恒为 0；该指标保留为**回归哨兵**——一旦非零即视为合并语义回退。
- 订正 `sync.smartMergeDesc` 等文案，使其描述真实语义（逐记录合并 / 不删除记录；覆盖类动作明确写出代价）。
- 三个向量的文案同时补齐：预览表头、方向标签、风险列（`sync.col*` / `sync.dir*` / `sync.risk*`），并新增 `sync.previewHint` 告知「先预检、后确认」。

### D5 — 枚举单一事实源 + 守卫

`buildLocalMeta` 改为遍历 `BACKUP_STORES` / `ADULT_STORES`（`schema.ts` 唯一事实源），并新增守护断言：同步本地枚举源必须**逐项等于** `BACKUP_STORES`（防未来新增表再次漂移）。

### D6 — 变更指纹纳入 `comment`

`hash-utils.ts` 字段集改由单一常量 `HASH_FIELDS` 定义并纳入 `comment`，配套 spec 锁字段集。兼容性说明：hash 仅用于「是否相同」判断，字段集变更只会让既有远端 meta 与本地判为不同 ⇒ 进入合并路径（D2 下无破坏），不影响版本门禁。

---

## 影响面（模块）

| 层 | 文件 | 变更 |
|---|---|---|
| domain/纯逻辑 | 新增 `buildSyncPlan` / `mergeDatasets` 纯函数模块 | 计划与并集合并，零 IDB 依赖，可单测 |
| provider | `src/provider/webdav/api.ts` | 复用既有 `downloadDataset`/`uploadDataset`；新增「上传前读远端」编排 |
| engine | `src/libraries/utils/hash-utils.ts`（libraries） | `HASH_FIELDS` 常量 + 纳入 `comment` |
| handler | `src/entrypoints/background/handlers/webdav-sync.ts`、新增预检 handler | 预检 + 合并改写；注意 `size:check` ≤600 行 |
| 契约 | `src/types/messages.ts` | 新消息四处同步（MessageType / MessagePayloadMap / ResponseMessageMap+SuccessDataMap / `background.ts` switch） |
| store | `src/store/confirm.ts` | `ConfirmDialogState` 增可选 `table: ConfirmTable`（通用形状） |
| UI | `src/feature/ConfirmDialog.vue`、`src/entrypoints/options/tabs/sync/WebDAVTab.vue` | 确认框渲染预览矩阵（含风险色调、按有无表格调宽）；页签三个动作改为「预检 → 确认 → 携带指纹执行」 |
| i18n | `src/libraries/locales/{en,zh-CN,zh-TW}.ts` | 新键 ×3（表头/方向/风险/数据集名/预检提示）+ 文案订正 |

---

## 验证策略

1. **纯函数矩阵**（新增 spec）：`buildSyncPlan` 覆盖 仅本地/仅远端/两空/空 vs 非空/hash 相等/hash 不等且本地新/hash 不等且远端新/非白名单 key/新增两表（usav、sehuatang）。
2. **合并代数性质**（新增 spec，当前实现恰恰缺失）：
   - 幂等：`merge(merge(a,b), b) == merge(a,b)`
   - 交换：`keys(merge(a,b)) == keys(merge(b,a))`，且同键取值均为较新者
   - 守恒：`|merge(a,b)| >= max(|a|,|b|)`（同步绝不减少任一侧）
3. **完整性**：TOCTOU 指纹失配 ⇒ 中止且零写入；执行后计数复核失配 ⇒ `verified: false`。
4. **回归哨兵**：`lossRisk > 0` 的预览必须阻断执行（此断言在 D2 后永真）。
5. 既有门禁全跑：`type-check` → `arch` → `ds` → `scope` → `naming` → `size` → `doc` → `orphan` → `any` → `isolation` → `console` → `cjk` → `i18n` → `lint` → `format` → `build`；单测基线「不新增失败」。
6. 真机验证：本地 WebDAV 桩 + 两份 profile（模拟双设备），构造「本地 2 条 vs 远端 100 条」场景，断言同步后远端 **102 条**（并集）而非 2 条（覆盖）。

---

### 模拟验证（`tests/e2e/x110-webdav-sync-preflight.spec.ts` 9 用例 + `x111-webdav-sync-ui.spec.ts` 2 用例，全绿）

真实构建产物 + 真实 MV3 service worker + **CONTEXT 级内存 WebDAV 桩**（SW 发出的请求只有 context 级 route 拦得到；ZIP 由 fflate 现场生成、上传字节再解包断言，使「落盘了什么」成为可判定事实）。桩与夹具在 `tests/e2e/fixtures/webdav-server.ts`（x110/x111 共用；同时把两个 spec 各自压到 ≤600 行）。

| # | 用例 | 断言要点 |
|---|---|---|
| 1 | 本地 2 条 + 云端 100 条 | 并集 102：本地 102 条、云端 ZIP 记录数 102、远端 meta 102；`lossEstimate = 0` |
| 2 | 三方向同轮共存 | 仅本地→upload / 仅远端→download / 两侧分叉→merge；本地与云端最终计数 |
| 3 | 预检后远端被改写 | `STALE_PLAN` + 零写入 + 零上传 |
| 4 | dataset `dataVersion = 99` | 该表**跳过且不写入**，其余 dataset 不受影响 |
| 5 | 远端 meta 注入 `ttl_cache` | 非备份白名单键被拒，不触本地表、不覆盖远端 dataset |
| 6 | 上传：本机空、云端 4 条 | 高危孤儿行 + `lossEstimate = 4`；执行后云端 ZIP 为空集、meta 记 0 |
| 7 | 下载执行 | upsert 不删本地（1+3=4）、`__settings__` 恢复进 settingsCache、`verified`、下载侧指纹保护 |
| 8 | 非法预检模式 | `INVALID_MODE`（不静默落进 else = download 语义） |
| 9 | 远端 meta「假成功」（PUT 201 但不落盘） | `verified: false` + 文案含「完整性复核未通过」——**证明该断言不空转** |
| 10-11 | UI 路径（x111） | 点同步 → 7 列对照矩阵（含 2 vs 100 与方向）→ 取消零写请求；确认后**本地真的多了记录** |

**模拟测试当场捕获的真实缺陷（已修）**：`buildLocalMeta` 对空表用 `new Date().toISOString()` 占位 `updatedAt`，`__settings__` 更是每次构建都取 `now` —— 指纹照单全收时，预检与执行（两次独立构建）**必然失配**，UI 上任何同步都会假报 `STALE_PLAN`。修复：指纹只让「计数 > 0 的一侧」的 `latest` 参与，`skipKeys`（`__settings__`）的 `latest` 完全不参与；侧别内容真的变了必然体现为计数 / `hashEqual` / 方向变化，仍会被检出。**该假阳性纯策略单测看不见，只有真实编排能暴露**。

### 审查轮（umreview）修复

| 发现 | 处置 |
|---|---|
| **Critical（评审中引入又当场拦截）**：UI 写动作用 `retries: 0` —— `safeSendMessage` 的 `retries` 是**尝试次数**（`for (attempt = 1; attempt <= retries; attempt++)`），0 会**一次都不发送**、静默返回 null | 改 `retries: 1`（只发一次、绝不重试）。**RED 验证**：改回 0 ⇒ x111「确认后真的执行」变红，报「写消息未真正送达后台」 |
| UI 写动作使用默认 `retries: 2` → **超时也重发**，对写操作等于重复执行（前一次可能已在后台改了数据） | 三个写动作显式 `retries: 1`，超时上限提到 200s（高于后台预算） |
| `WEBDAV_SYNC` 60s 调度预算 vs 合并行「拉远端 + 推远端」双向往返（旧实现每表只走一个方向）→ 超时后调度器只 reject、**操作仍在后台继续**，用户重试即并发 | SYNC 提到 180s、UPLOAD/DOWNLOAD 120s（`background.ts`）；并发单飞锁列为遗留项 |
| `WEBDAV_PREVIEW` 的 `payload.mode` 未校验 → 非法值静默落进 `else`（= download 语义），信任边界 fail-open | 白名单校验 + `INVALID_MODE`；e2e 用例 8 pin |
| `verifyRemoteMeta` 住在 merge handler 里却被上传路径反向依赖 | 移到 `webdav-preview.ts`（只读检查的家），消除 `webdav.ts → webdav-sync.ts` 依赖 |
| 新增 e2e 撞上 `size:check` 600 行棘轮（603 行） | 抽 `tests/e2e/fixtures/webdav-server.ts` 共享桩 + 拆出 `x111`（UI 与协议关注点分离） |

**RED 注入验证（T6，四项）**：
1. 指纹重新包含占位 `latest` ⇒ 单测「计数为 0 的一侧的 now 占位时间戳不参与指纹」**变红**；
2. 并集合并忽略远端条目（等价旧覆盖语义）⇒ e2e 用例 1 **变红**，实测 `Expected length: 102 / Received length: 2`（正是覆盖式丢失的症状）；
3. UI 写动作 `retries` 改回 0 ⇒ x111「确认后真的执行」**变红**，报「写消息未真正送达后台」；
4. 复核失败用例（用例 9）在去掉「假成功」桩后自然转绿 —— 反向证明 `verified` 不是恒真。

四项均还原后复跑全绿（单测 2820 / 0 failed；e2e 11/11）。


### umreview 遗留收口（2026-10-04 第二面板裁定：R1–R6 全部修）

| 遗留 | 处置 | 证据 |
|---|---|---|
| **R1 并发单飞** | 新增 `handlers/webdav-lock.ts`（进程内布尔锁）+ 三个写 handler 取锁/`finally` 释放；取锁失败即时回报 `WRITE_IN_PROGRESS`（**不排队**——排队会把「用户以为失败后重试」变成双重执行） | 单测 5 条（互斥/释放/幂等/50 轮无泄漏/reject 不自动释放）；e2e「连续两次同步都成功」证明锁被释放、「写锁不拦只读预检」 |
| **R2 上传原子性** | `uploadDataset` 改为**先 PUT `<hash>.zip.tmp` → MOVE 到最终名**（最终名任何时刻要么完整旧内容、要么完整新内容）；MOVE 不受支持（405/501/403）时清理暂存并**降级为直接 PUT**（能力对齐而非硬失败）。另加**读侧兜底**：远端 meta 的 `hash` 为 64-hex 时，ZIP 自述 hash 必须一致，否则拒绝吞入 | 单测 4 条（暂存+MOVE 序列、405 降级序列 `PUT→MOVE→DELETE→PUT`、409→MKCOL→重试、MOVE 5xx 不静默降级）；e2e：MOVE 成功路径 + 降级路径 + hash 不一致拒绝 |
| **R3 计数口径** | 合并行不再把「落盘后总数」记成上传量：`uploaded` = **只有本地才有的键**（远端真新增），`downloaded` = 采纳远端值的键；新增 `mergedTables` 字段与「合并 N 张表」文案 | e2e 用例 2 断言 `uploaded>0 && downloaded>0`；契约 `mergedTables` 入 `ResponseMessageMap`+`SuccessDataMap` |
| **R4 未知远端键** | 非备份 store 键**从新 meta 中丢弃**（不再回写），远端 meta 自净 + `errorLog` + 文案「N 个非备份数据集已丢弃」 | e2e 用例 5 新增断言：同步后远端 meta 不再含 `ttl_cache` |
| **R5 写侧上限** | 与读侧对齐：**写侧 `packageDataset` 也守 100k 记录**，否则并集超限时会写出「自己读不回」的备份（数据不可达）；`verified` 语义改为「本次写操作完整落地」（任一行失败即未通过）。内存口径更正：峰值是 **2 份记录集 + 1 份引用数组**，不是 3 份数据拷贝 | 单测 2 条（写侧拒绝 >100k；读侧用手工 ZIP 独立钉住，避免被写侧守卫一并挡死） |
| **R6 无关模块死代码** | `neodb-push.ts` 的 `retries: 0` → `1`，恢复「后台 toast 优先、本地 fallback 兜底」的原意 | 一行改动 + 注释说明 `retries` 是尝试次数 |
| **写失败时的 meta 诚实性**（R2 衍生） | 单表写入失败时，**不再推本地 meta**（会让远端 meta 声称 blob 已更新而实际没有，导致下次预检按旧 hash 判「无变化」而永不重试），改为推远端侧 meta / 空占位 | e2e「单表 PUT 500 ⇒ 该表写入失败可见 + 云端保持原状」 |

**偏差说明（如实记录）**：R5 面板选项写的是「按表分批合并」，实施后判定该方向**收益极小**——两侧记录集都必须完整驻留才能算并集，`merged` 只是**引用数组**（不复制记录体），分批无法降低峰值。故改为「读写侧上限对齐 + 口径澄清」，这是对同一风险的更有效处置，并在此显式记录与面板描述的差异。



### 审查轮 2（R1–R6 收口后复验，2026-10-04）

| 发现 | 严重度 | 处置 |
|---|---|---|
| MOVE 不可用只覆盖 405/501/403 —— 而「支持 MOVE 但不接受绝对 `Destination` 形态」的服务器（或代理）会返回 **400**，此时我们抛错且**永不降级** ⇒ 该表备份**永久失败** | 必改（本轮引入） | 不可用集合扩为 `{400,401,403,405,501,502}`（`MOVE_UNUSABLE_STATUSES`），全部走降级；`warnLog` 保留可诊断性。单测覆盖 400/401/502 三个状态码 |
| 硬失败（网络中断 / MOVE 5xx）会留下 `<file>.tmp` 孤儿，行为未记录 | Consider | 明确记录：**最终名不被触碰正是原子性的价值**（旧内容得以保全），孤儿会在下次上传同名 store 时被覆盖。单测断言「5xx 时没有任何 PUT 命中最终名」 |
| hash 不一致触发读侧拒绝后，该表在后续同步中**持续被拒**（错误 hash 被原样回写），形成「暂停同步」而非自愈 | Consider | **刻意保留拒绝**（不因无法验证的 blob 去猜数据），但把出路写进回报文案：「可用「上传」以本机为准收敛」。新增 e2e 证明出路可达：拒绝 → `WEBDAV_UPLOAD` 重写 blob+meta → 后续同步 `verified:true` |
| 下载侧 `verifyLocalNeverShrunk` 的 false 分支**无任何用例**（与首轮「`verified` 可能恒真」同类风险） | Consider | 新增 e2e：先等第一次 dataset GET（证明 handler 已越过「下载前快照」），再删除本地记录 ⇒ `verified:false`。**断言不再可能恒真** |

#### 真机验证（SURFACE：真 TCP + 真 HTTP + 真 fs，`tests/unit/webdav-api-live.spec.ts` 10 用例）

route 桩里的 MOVE/DELETE 是我们自己解释的语义，证明不了客户端用的 `Destination`/`Overwrite` 形态符合 RFC 4918，也证明不了盘上真实落了什么字节。故补一层零依赖真实服务器（`node:http` + `node:fs`，刻意保留 409/405/401 与真实 rename）：

- MKCOL 真的建出 `umm-data/`；原子上传后**盘上只有 `<hash>.zip`、没有 `.tmp`**，请求序列 `MKCOL → PUT .tmp → MOVE`；
- 父集合缺失由真实 **409** 驱动 `MKCOL` 重试（`PUT → MKCOL → PUT → MOVE`）；
- MOVE 405 时真实 **DELETE** 清暂存 + 直接 PUT，盘上仍只有最终名且可解包；
- **MOVE 500 时盘上旧字节与上传前 `Buffer.compare === 0`** —— 原子性从「桩说」升级为「盘上是」；
- 真实 fs 上手工改写 `meta.json` 的 hash ⇒ `assertDatasetHash` 拒绝；一致时不误报。

配套重构：hash 判定从 `webdav-restore.ts` 内联下沉为 `plan.ts` 的纯函数 `assertDatasetHash`（解析与策略分离），形态矩阵（`undefined`/`empty`/`unknown`/非 64-hex 一律不参与）可脱离 IO 单测。

**实测口径的已知噪音**：隔离运行该 spec 时 Node 24 + Windows 可能在 worker 退出时打印一次 libuv 断言（keep-alive 连接在退出瞬间被拆）；**全量套件运行 0 次**，不影响结果与退出码。清洁升级路径（服务器移入子进程）已写进该 spec 头注。



## 备份完整性审计（umreview，2026-10-05）

用户报告「WebDAV 备份似乎没有完全 record」。按假设逐一取证，结论如下。

### 审计方法与结论

| 检查项 | 方法 | 结论 |
|---|---|---|
| 是否有 store 被写入但不在备份清单 | `STORE_NAMES`(12) vs `BACKUP_STORES`(10) vs 写侧引用点逐一对照 | **无遗漏**：写入口只落 7 平台表 + 成人三表 + `ttl_cache`/`pt_id_cache`（后者是派生缓存，按设计不备份） |
| 是否有其他数据库持有用户数据 | `indexedDB.open` 全仓扫描 | 只有主库 `umm-media-db`（已备份）+ `umm-sehuatang-cache`（详情缓存，可重建，按 ADR-024 不进备份） |
| 记录字段是否被白名单悄悄丢掉 | `RECORD_FIELD_WHITELIST` vs `StoreRecordSnapshot` | **无丢字段**：8 个字段全在，唯一未列入的 `avId` 是派生索引字段（写侧按键重算） |
| `getAll` 是否过滤记录 | 读 `recordStore.getAll` | 无过滤，整表游标 ✓ |

⇒ **不存在「某些 store / 字段被系统性排除」的问题**。真正的两条路径如下。

### U1｜上传没有逐表错误隔离（Critical，已修）

`handleWebDAVUpload` 的 10 表循环原本共用**一个** try/catch：任何一张表的读/打包/上传抛错，都会中止整轮 —— 后续每张表都不进备份，且 **`uploadMeta` 从不执行**（远端 meta 停在上一次的样子）。更糟的是：已写成功的 blob 与陈旧 meta 跨代不一致，会命中本 ADR 新增的读侧 hash 一致性校验，让那些表在后续下载/同步里被**连带拒绝**。

修复：逐表 try/catch，失败时推**远端侧旧条目**（远端没有该表则记 0，如实表示「云端没有这份数据」）并计数，继续其余表；`verified = failedStores === 0 && 元数据复核`；回报文案给出「N 张表上传失败（云端保持原状）」。settings 数据集同样隔离。

### U2｜遗留 `sehuatang_avids` 残留既不可见也不进备份（必改，已修）

`sehuatang_avids` 是 v7→v8 引入、v8→v9 由 `jav_ids` 取代的旧名 store。v13 的迁移块会整表复制它，但：① 该块**只在 `oldVersion < 13` 时执行一次**；② 每条复制失败都被 `preventDefault()` 容错（只 warn）⇒ 可能留下残留；③ 旧 store 从不删除，且**不在任何读路径、也不在 `BACKUP_STORES`**。⇒ 一旦残留，那些记录永久不可见、不进备份。

修复：新增 `engine/database/legacy-store-rescue.ts`，DB 打开时（`connection.ts` 的 `onsuccess`，fire-and-forget，不阻塞打开）执行一次**幂等且只增不删**的救援 —— 只把 `jav_ids` 中尚不存在的键补进去（已存在的键不覆盖），并补写 `avId` 派生字段。救援后遗留表仍保留（不做破坏性清理），留待后续版本处理。

### C｜被跳过的记录对 `verified` 不可见（Consider，已修）

`readDatasetEntries` 的逐记录跳过（形状非法 / 单条迁移失败）原先只写 `errorLog`，`verified` 看不到 ⇒ 一份**部分损坏的数据集会「部分恢复 + 复核通过」**。修复：暴露 `skippedRecords`，`WEBDAV_DOWNLOAD` 与 `WEBDAV_SYNC` 都把它折进 `verified` 并在文案里报出「N 条记录被跳过（格式不合）」。

### 验证

- 新增 `tests/unit/legacy-adult-rescue.spec.ts`（3 条，fake-indexeddb 构造「已到 v15 且遗留表有残留」的前置态）：init 自动救援可见、已存在键不被覆盖、`avId` 补齐、幂等（二次 `rescued=0`）、无遗留表零成本。
- `x112` 新增 2 条：上传逐表隔离（断言 **`metaPuts === 1`**，修复前必为 0）、单条记录格式不合 ⇒ `verified:false` + 文案含「跳过」。
- **RED 注入（T6）**：把逐表 catch 改回 `throw` ⇒ 隔离用例变红（`Expected: true / Received: false`）；把 `skippedRecords === 0` 短路成 `true` ⇒ 跳过可见性用例变红（`Expected: false / Received: true`）。两者还原后复绿。



## 预览诚实性修复（用户实测驱动，2026-10-05）

用户提供了两份实测证据：① 选项页「云端覆盖本地」的确认框 DOM（矩阵显示 本地豆瓣 0 / 云端 15018、本地 B站 0 / 云端 1851、本地 IMDb 0 / 云端 789、本地 NeoDB 0 / 云端 1233、本地 成人日系 0 / 云端 9668，另有 TMDB 117/117、YouTube 31/31、Bangumi 2/2 均判「下载」）；② popup 总览显示总记录 **150**（= 117+31+2）。

**定位结论（非缺陷）**：dev 构建与正式版是**两个扩展源**（不同解包目录 ⇒ 不同扩展 ID ⇒ 不同 origin ⇒ 不同 IndexedDB），所以 dev 会话里只累积了它自己的 TMDB/YouTube/Bangumi 记录；云端备份完好。修复前必须先纠正先前给出的操作建议：**本地近空时点击「上传」会用空数据集清空云端**（D4 的孤儿消除行为），正确动作是「下载」。

由该证据暴露的三处**表达不诚实**，已修：

| # | 问题 | 修法 |
|---|---|---|
| P1 | 计数为 0 的一侧仍显示「本地最新 = 刚刚」（`buildLocalMeta` 对空表用 `now` 占位），用户截图里就出现了 `本地最新 2026-10-05 00:05` 而本地 0 条 | `buildPreview` 内统一收敛：**该侧计数为 0、或数据集非合并（`skipKeys`）时 `latest` 为空串**。规则收敛到一处后，指纹侧不再重复判断（移除 `FingerprintOptions.volatileKeys`），UI 经 `formatTime('')` 显示 `—` |
| P2 | `download` 只在「本地更晚」时告警；**等时间戳但内容不同**（典型是本地写过的注释）会被静默回退 | `revertsNewer` 扩展为「本地更晚 **或** 时间戳相同且 `hashEqual === false`」；`sync.riskRevert` 文案改为「本地版本将被云端覆盖」（覆盖两种情形） |
| P3 | 上传的丢失告警只给总数，不点名会被清空的表 | 新增 `sync.lossStores`（涉及：{stores}），把 `lossEstimate > 0` / `orphansRemote` 的表逐个列出 |

验证：`webdav-sync-plan.spec` +3（`__settings__`/空表时间戳收敛为空串、等时间戳内容不同必须告警、hash 相同不得误报）、`x110` +1（协议层钉住等时间戳 + 内容不同的 `revertsNewer`）。



dev 产物的**文件数不是稳定判据**（chunk 组成会随重构漂移）。权威判据 = manifest 引用可解析 + 与生产产物做集合对照 + 特征标记存在性。探针 `tmp-probe/dev-artifact-check.mjs`（gitignored）实测：

- `manifest.version = 5.18.0.1733`（package.json 版本 + 开发段，形如 1–4 段点分整数）；
- manifest 引用的脚本全部可解析（9 个），内容脚本入口集合与生产一致（8 个）；
- 产物含 ADR-027 运行时标记 `WEBDAV_PREVIEW` / `expectedFingerprint` / `STALE_PLAN` / `mergeConflicts` / `umm-data`。

注意：**函数名不能当产物体征**（压缩器会重命名）—— 只选字符串字面量与属性名。

**体积代价（如实记录，2026-10-04 实测）**：生产产物总量 **2.45 MB**（本 ADR 之前 2.41 MB，+40 kB）；承载全部 WebDAV 逻辑的后台 SW `background.js` **86.6 kB**。dev 产物 2.78 MB / `background.js` 86.7 kB。增量来自新增的纯策略层（`plan.ts`）+ 预检编排（`webdav-preview.ts`）+ 单飞锁（`webdav-lock.ts`）与契约字段扩展，属功能新增的正常代价，非回归。

## 非目标（本轮明确不做）

- 记录删除的双向同步（墓碑/软删除机制）——需独立 ADR。
- `__settings__` 参与合并（沿用 ADR-016 决策 5：设置不参与双向合并）。
- 定时/自动 WebDAV 同步（当前不存在；`autoSync` 设置实为 NeoDB 开关）。
- 远端 blob 的垃圾回收（孤儿 blob 清理）。

---

## 回滚

- **D1/D3/D4/D5/D6**：纯增量（只读预检 + UI + 守卫 + 字段集），可独立回滚，无数据风险。
- **D2**：语义回滚**不代表数据可回到覆盖式结果**——但方向是安全的：D2 只会让并集变大，永不减少。因此 D2 的回滚点是「接受并集结果」，不存在「回滚丢数据」路径。
- **应急**：在 D2 落地前，**暂停使用「同步」**；需要把本地全量推到远端时使用「上传」（遍历 `BACKUP_STORES`、无新旧判断），但**本机为新建/空库时禁止上传**（空表跳过的 dataset 会在新 meta 中记为 `recordCount: 0`，使远端既有数据在后续下载中被跳过）。

---

## 后续（不在本轮）

### 本轮已收口

原 R1–R6 全部修复（见上「umreview 遗留收口」节）。其中 R5 的实施方向与面板描述有偏差，已在该节显式记录。

### 仍遗留

- **跨设备「执行中途」并发写**：本次同步以自己完整的 meta 覆盖远端，因此第三方设备在同步途中写入的 meta 条目会被覆盖（其 blob 变孤儿，需该设备下次同步自行收敛，并集幂等故不丢数据）。同设备并发已由单飞锁挡住；跨设备收敛需要服务端 CAS / 版本号协议，属独立 ADR。
- **单飞锁的真并发触发不可在 harness 复现**：触发条件是「调度器超时（>180s）后操作仍在后台跑」，e2e 无法用可接受的时长构造。故覆盖策略为：单测钉锁语义（互斥/释放/幂等/无泄漏），e2e 钉「释放不泄漏」（连续两次同步都成功）与「写锁不拦只读预检」。
- **T1 注释英文化**：本轮新增注释为中文（仓库既有惯例），与 umreview 宪章「英文注释」条款冲突；用户裁定**后续统一英文化**（含存量），另开一波。
- `validateDatasetVersion` 单一入口化（ADR-011 遗留）。
- ~~同步路径的 `dataVersion` 由硬编码改为 `CURRENT_DATASET_VERSION`~~ —— **本轮已消解**：`webdav-preview.ts` / `webdav-sync.ts` / `webdav.ts` 全部改走 `CURRENT_DATASET_VERSION`（实测 `grep "dataVersion: 1"` 在这三个 handler 与 `provider/webdav/*` 零命中）。
- 孤儿 blob 清理与 WebDAV 服务端版本历史利用。

---

## R2 修正（2026-10-05）：代际偏斜自愈 —— judgeDatasetHash 取代一刀切拒绝

### 背景（真机实证）

用户云端在旧版本（无原子交换、单表失败中止整轮）反复写入后，`imdb/neodb/bilibili/jav/douban`
五表的 meta.json 声明 hash 与 ZIP 自述 hash 全部不一致（另有 `__settings__` 有 meta 无 blob）。
原 R2 一刀切拒绝吞入，结果是：本地为空、云端为唯一副本的用户**被产品自己的历史写入格式困死**，
只能靠仓外脚本修 meta —— 混装由产品自身写入造成，自愈责任在代码，不在用户。

### 裁决

R2 的本意是「不吞进半截/被篡改的 blob」。但 ZIP 由 `packageDataset` 原子写出（data.json 与
自带 manifest 同时生成），**经 unzipSync CRC + 「数据重算哈希 == 自带 manifest hash」双重校验
即可证明该 ZIP 是完整一代** —— 这个证明强于与一个可能陈旧的远端声明做等值比较。据此把
`assertDatasetHash`（不一致即抛）升级为 `judgeDatasetHash`（四态裁决）：

| 条件 | 裁决 |
|---|---|
| expectedHash 非 64-hex（`'empty'`/`'unknown'`/旧格式） | accept（兼容口径不变） |
| expectedHash == ZIP 自述 hash | accept（快路径） |
| ZIP 数据重算 hash ≠ 其自带 manifest hash | **refuse-corrupt-zip**（真损坏，与本地状态无关） |
| ZIP 自洽 + 本地该表为空 | **accept-stale-generation**（自愈：无数据可丢，回报显式列出，下次上传收敛 meta） |
| ZIP 自洽 + 本地有数据 | **refuse-generation-skew-with-local**（防旧代回退本地较新记录，交给同步/上传收敛） |

### 影响

- `readDatasetEntries` 增加 `localCount` 入参（download 链取自 `buildLocalMeta` 快照，
  sync 链取自 `mediaDB.getAll`/`localMap.recordCount`），重算仅在 hash 实际不一致时发生
  （常见路径零开销）。
- 回报新增「N 张表按 ZIP 自述恢复（云端 meta 代际陈旧，已自愈）」；`verified` 不因自愈降级
  （恢复本身完整落地），真损坏/本地有数据拒绝仍照旧折进 `verified:false`。
- `scripts/repair-webdav-meta.mjs` 保留为仓外检查工具（dry-run 报告各表状态），正常场景不再需要。
- 已知边界：自愈后远端 meta 该表 hash 仍陈旧 ⇒ 后续预览该表持续显示「下载」直至一次上传收敛；
  属噪音级，不丢数据。

### 测试锚点

- 纯函数矩阵：`webdav-sync-plan.spec.ts`（judgeDatasetHash 形态矩阵）、
  `webdav-api-live.spec.ts`（真文件系统混装 → 分本地空/非空两态断言）。
- 端到端：`webdav-full-pipeline.spec.ts` F 用例（清空 imdb + 改陈旧 meta ⇒ 1039 条自愈恢复；
  对照 douban 本地有数据 ⇒ 维持拒绝）。

### R2 修正补遗（同日二次）：哈希算法生成表 —— 用户裁定「缺版本兼容逻辑」后补齐

首版 R2 修正的「内部自洽重算」只用**当前算法**（HASH_FIELDS 含 `comment`），但云端 ZIP
可能由更早代次的算法写入（≤5.18.0 发布版的签名字段集**无 `comment`**，真机实证：
用户的五张表在该实现下仍全部误判 corrupt）。校验逻辑必须配套**备份格式的版本兼容**：

- **生成表** `HASH_FIELDS_GENERATIONS`（新→旧）：gen-2 当前 / gen-1 ≤5.18.0。
  `identifyStoreHashGeneration(entries, zipSelfHash, expectedGeneration?)` 逐代重算识别
  （新备份由 `packageDataset` 在自带 manifest 写入 `hashGeneration` 标注 ⇒ 只验该代，
  零猜测；旧备份无标注 ⇒ 逐代尝试）。全代不中 = 数据连自带 manifest 都不符 = 真损坏。
- `judgeDatasetHash` 改收 `zipInternallyConsistent: boolean`（代际识别归调用方），裁决
  规则不变（本地空自愈 / 本地有数据拒绝）。
- 前向兼容：未来再改签名字段集时，**在生成表头部插入新代 + 递增 `CURRENT_HASH_GENERATION`**
  即可，旧备份永远可读（与记录 schemaVersion 迁移同一哲学）。
- 测试锚点：`repair-script-hash-parity.spec.ts`（双代 parity + 「无 comment 两代同哈希 /
  有 comment 两代必不同」语义锚）、`webdav-full-pipeline.spec.ts` G 用例（手工构造
  gen-1 ZIP + 陈旧 meta + 本地空 ⇒ 自愈，精确复刻用户云端形态）。
- `scripts/repair-webdav-meta.mjs` 同步双代识别（含 `hashGeneration` 透传）。

---

## 历史版本缺陷登记与义务对账（2026-10-05，用户裁定登记）

**结论**：ADR-027 之前的同步/上传/下载机制存在五项结构性缺陷——缺版本控制、缺原子性义务、
缺完整性自校验义务、缺失败如实上报义务、缺自愈/恢复义务——共同造成用户云端备份的代际错乱
（五张表 meta 与 blob 跨代混装、settings 有目无 blob、计数与内容不符）。以下逐项登记：
缺陷 → 真机/取证证据 → 现机制中的义务承担者。

| # | 缺陷 | 证据（2026-10-05 真机） | 义务承担者（现机制） |
|---|------|------------------------|---------------------|
| D-1 | **非原子上传**：blob 直 PUT + meta 后写，中断即「blob 新 / meta 旧」跨代混装 | 用户云端 5 表 meta 声明 hash ≠ ZIP 自述 hash（如 neodb 992425… vs 92e23a…），另有 `__settings__` 有 meta 无 blob | 原子上传：暂存名 PUT + MOVE（R2/`uploadDataset`），失败留暂存可清理 |
| D-2 | **格式语义变更不 bump 版本**：`HASH_FIELDS` 纳入 `comment` 未 bump `dataVersion`，同版本号两种哈希语义 | gen-1（≤5.18.0，无 comment）与 gen-2（当前）ZIP 同标 `dataVersion: 1`，读侧无法直接判定算法代 | 版本轴：`CURRENT_DATASET_VERSION` 1→2 + `HASH_FIELDS_GENERATIONS` 生成表 + `identifyStoreHashGeneration`（v2+ 精确、v1 歧义带逐代） |
| D-3 | **缺完整性自校验义务**：读侧不重算「数据 vs 自带 manifest」，双声明串通即可吞入任意内容 | 用户云端 ZIP 内层与 meta 声明不一致仍曾被旧版吞入/拒绝策略摇摆 | 无条件重算识别：`readDatasetEntries` 对每个数据集重算哈希并按代际表核验，不符即 `refuse-corrupt-zip` |
| D-4 | **缺失败如实上报义务**：dataset 级失败（404/坏 ZIP/版本不符/混装）只写日志就 continue，`verified` 不翻转，UI 照报成功 | 用户首次「覆盖成功」实际五表全被拒（旧版语义下无任何可见痕迹） | `failedDatasets`/`failedNames`/`skippedRecords` 全部折进 `verified` 与回报文案（umpp D 用例 RED→GREEN） |
| D-5 | **缺自愈/恢复义务**：对混装状态一刀切拒绝且无收敛出路，本地非空时「覆盖拒、同步也拒」两头困死 | 用户三次点击覆盖均零进展，本地 14666/810/9489… 与云端 15018/1851/9668… 长期背离 | 代际偏斜自愈：完整一代 ZIP 一律采纳（download 显式 cloud-wins 幂等 / sync 逐记录较新者胜并集），meta 随下次上传收敛；`repair-webdav-meta.mjs` 作仓外诊断工具 |

**永久义务（后续演进约束）**：
1. 数据集格式的任何语义变更（哈希字段、结构、编码）**必须 bump `CURRENT_DATASET_VERSION`**
   并在 `HASH_FIELDS_GENERATIONS` 生成表登记旧代——旧备份永远可读（与记录 schemaVersion
   迁移同一哲学）。
2. 上传必须保持原子性（暂存 + MOVE）；任何绕过原子上传的新写入路径一律视为缺陷。
3. 读侧对备份的完整性自校验（数据 vs 自带 manifest）不可省略，且必须随生成表演进。
4. 一切部分失败必须折进 `verified` 与用户可见文案——「恢复不完整不能报成功」。

### 原子上传的服务端兼容补遗（2026-10-05 深夜）：坚果云 MOVE 一律 409

真机实证：坚果云 WebDAV 对 MOVE 返回 **409 Conflict**（直传 PUT 正常）。旧版从不 MOVE
（D-1 直传）故从未暴露；ADR-027 的原子上传在坚果云上全部 `Failed to finalize dataset:
HTTP 409`。修复：409 入 `MOVE_UNUSABLE_STATUSES` 降级集合——坚果云备份走**非原子直传**
（服务端能力限制下的已知取舍，D-1 风险在坚果云上无法消除，靠「每次全量覆盖 + 逐代自愈」
缓解）。本地夹具 `move: 'conflict'` 形态 + live 测试钉死降级链路。
