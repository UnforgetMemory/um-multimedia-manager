# ADR-016 — 备份/同步链路纳入非敏感 settings，消除换机后配置脱节

- **日期**: 2026-08
- **状态**: Accepted（已实现 — `__settings__` 备份 + 凭证 opt-in 导出，2026-08）
- **作者**: 架构调研子代理
- **范围**: `src/entrypoints/background/handlers/webdav.ts`、`src/entrypoints/background/handlers/data.ts`、`src/types/index.ts`、`src/features/migration/models.ts`、`src/entrypoints/options/tabs/sync/ImportExportTab.vue`
- **关联**: ADR-011（备份版本化 + `BACKUP_STORES` 白名单 + dataset 版本门禁）

---

## 1. 背景

UMM 有两条独立的"备份/恢复"链路，但它们的 settings 覆盖范围不一致，导致换机后用户必须手动重填配置。三条脱节均有代码证据：

### 1.1 本地导出排除 WebDAV 凭证（安全决策正确，但换机后需手动重填）

`src/entrypoints/background/handlers/data.ts:24-37` 的 `EXPORT_SETTINGS_KEYS` 白名单：

```ts
export const EXPORT_SETTINGS_KEYS: Array<keyof AppSettings> = [
  'autoSync', 'autoSyncNeoDB', 'syncInterval', 'theme', 'language',
  'notificationEnabled', 'appearance', 'accentColor', 'grayColor',
  'debugEnabled', 'logLevel', 'neodbToken',
]  // 含 neodbToken，排除 webdavUrl/webdavUsername/webdavPassword
```

- `data.ts:48` `IMPORT_SETTINGS_KEYS = new Set(EXPORT_SETTINGS_KEYS)`：导入白名单与导出一致，同样排除 WebDAV 凭证。
- 安全注释（`data.ts:42-47`）明确说明：旧导入白名单曾用全部 `STORAGE_KEYS`，恶意备份可改写 WebDAV 目标到攻击者服务器，下一次同步会推送完整库 + 真实 WebDAV 密码过去。**此安全决策正确，不应回退。**
- `data.ts:78-95` `handleExportData`：仅从 `EXPORT_SETTINGS_KEYS` 逐键取值写入 `ExportData.settings`。
- `data.ts:169-179` `handleImportData`：逐键用 `IMPORT_SETTINGS_KEYS.has(key)` 过滤后 `chrome.storage.local.set`。
- **后果**：本地导出的 JSON 文件不含 `webdavUrl/Username/Password`，换机导入后 WebDAV 配置为空，用户必须手动重填三项凭证。

### 1.2 WebDAV 备份完全不含 settings（换机后所有设置丢失）

`src/entrypoints/background/handlers/webdav.ts:138-191` `handleWebDAVUpload`：

```ts
// webdav.ts:152-170 — 只遍历 BACKUP_STORES（record stores + jav_ids）
for (const storeName of BACKUP_STORES) {
  const entries = await mediaDB.getAll(storeName)
  // ... packageDataset + uploadDataset ...
  datasetMetas.push(meta)
}
// webdav.ts:172-178 — remoteMeta 只含 datasets，无任何 settings 字段
const remoteMeta: RemoteMeta = {
  schema: 'umm-meta', version: 1,
  generatedAt: new Date().toISOString(),
  datasets: datasetMetas,  // 纯 record dataset，零 settings
}
```

- `BACKUP_STORES`（ADR-011 定义，`src/features/database/models.ts`）= 7 个平台 record store + `jav_ids`，全是 `Record<string, StoreRecord>` 数据，**不含任何 settings 键值**。
- 上传链路从未读取 `settingsCache`，因此 `theme/language/autoSync/accentColor` 等 11 项非敏感 settings + `neodbToken` 全部丢失。

### 1.3 WebDAV 下载不恢复 settings

`src/entrypoints/background/handlers/webdav.ts:194-262` `handleWebDAVDownload`：

```ts
// webdav.ts:211-247 — 只遍历 remoteMeta.datasets，只写 record stores
for (const ds of remoteMeta.datasets) {
  if (ds.recordCount === 0) continue
  if (!BACKUP_STORES.includes(ds.key as RecordStoreName)) { ... continue }
  // downloadDataset → unpackageDataset → batchPut，仅 record 数据
}
```

- 下载链路完全不处理 settings：不读 `remoteMeta` 中的任何 settings 字段，不调用 `settingsCache.updateAll()`。
- 即使 1.2 决定把 settings 纳入上传，下载侧也必须同步改造，否则 settings 写上了云端却拉不回本地。
- `handleWebDAVSync`（`webdav.ts:265-439`）同样只对 `datasets` 做 diff/merge，不涉及 settings。

### 1.4 类型与版本现状

- `src/types/index.ts:54-64` `AppSettings`：继承 `WebDAVSettings`（url/username/password）+ `NeoDBSettings`（neodbToken）+ `DebugSettings`（debugEnabled/logLevel），外加 9 项偏好（autoSync/autoSyncNeoDB/syncInterval/theme/language/notificationEnabled/appearance/accentColor/grayColor）。共 **15 个字段**。
- `src/types/index.ts:193-206` `DatasetMeta` / `RemoteMeta`：
  ```ts
  interface DatasetMeta { key: string; hash: string; updatedAt: string; recordCount: number; dataVersion: number }
  interface RemoteMeta { schema: 'umm-meta'; version: 1; generatedAt: string; datasets: DatasetMeta[] }
  ```
  `RemoteMeta` **无 settings 字段**。
- `src/features/migration/models.ts:43` `CURRENT_DATASET_VERSION = 1`（ADR-011 引入，用于 dataset ZIP 的 `meta.json` 版本门禁）。
- `src/features/settings/cache.ts` `settingsCache`：`init()` 全量读 `chrome.storage.local`（`:12-29`），`updateAll()` 写 local（`:42-46`）。**WebDAV 下载恢复 settings 时应走 `updateAll()`，与 `handleImportData` 一致。**

---

## 2. 方案设计

总目标：WebDAV 备份纳入非敏感 settings（11 项偏好 + neodbToken，共 12 项），下载时按白名单恢复；本地导出提供"可选包含 WebDAV 凭证"开关（默认关）；`RemoteMeta` 扩展为含 settings dataset 的版本化结构。

### 决策 1 — WebDAV 备份纳入非敏感 settings（11 项偏好 + neodbToken）

**纳入范围**：复用 `EXPORT_SETTINGS_KEYS`（`data.ts:24-37`），即 11 项偏好 + `neodbToken`，共 **12 项**。排除 `webdavUrl/webdavUsername/webdavPassword`（WebDAV 凭证本身——备份到 WebDAV 服务器上再回传这些凭证等于明文存储密码到云端，无意义且有泄露风险）。

> **为何不新建 `WEBDAV_BACKUP_SETTINGS_KEYS` 而复用 `EXPORT_SETTINGS_KEYS`？** 两者安全语义完全一致：都是"可安全导出/备份的非敏感 settings 子集"。分裂成两份白名单会引入维护漂移风险（新增 settings 字段时漏改其一）。`EXPORT_SETTINGS_KEYS` 已有安全注释（`data.ts:42-47`）和 `IMPORT_SETTINGS_KEYS` 镜像校验（`data.ts:48`），复用即继承这套安全约束。

**上传侧改造**（`webdav.ts:138-191` `handleWebDAVUpload`）：

在 `BACKUP_STORES` 循环之后、构造 `remoteMeta` 之前，新增 settings dataset 的打包上传：

```ts
// webdav.ts — handleWebDAVUpload 内，BACKUP_STORES 循环后
import { EXPORT_SETTINGS_KEYS } from './data'
import { settingsCache } from '@/features/settings/cache'

const appSettings = settingsCache.get()
const settingsPayload: Record<string, unknown> = {}
for (const key of EXPORT_SETTINGS_KEYS) {
  const value = appSettings[key]
  if (value !== undefined) settingsPayload[key] = value
}

// settings 作为特殊 dataset 上传：key = '__settings__'，复用 packageDataset 的 ZIP 打包
// 但 packageDataset 签名期望 Record<string, StoreRecord>——settings 是标量值，需适配
// 方案：settings dataset 用 JSON 文本 blob 直接上传，不走 packageDataset
const settingsBlob = new Blob([JSON.stringify(settingsPayload, null, 2)], { type: 'application/json' })
await WebDAV.uploadDataset(webdavUrl, webdavUsername, webdavPassword, '__settings__', settingsBlob)

// settings dataset meta
const settingsHash = await calculateStoreHash(
  Object.entries(settingsPayload).map(([k, v]) => ({ key: k, record: { value: v, updatedAt: '' } as any }))
)
datasetMetas.push({
  key: '__settings__',
  hash: settingsHash,
  updatedAt: new Date().toISOString(),
  recordCount: Object.keys(settingsPayload).length,
  dataVersion: CURRENT_DATASET_VERSION,
})
```

**同步侧改造**（`webdav.ts:265-439` `handleWebDAVSync`）：

`buildLocalMeta`（`webdav.ts:59-98`）末尾追加 `__settings__` dataset meta，与上传侧逻辑一致。sync 的 diff/merge 逻辑对 `__settings__` dataset 特殊处理：
- **不按 recordCount/hash 做"覆盖式"合并**（settings 是标量，无主键合并语义）；
- **采用" updatedAt 较新者覆盖"策略**：本地 settingsUpdatedAt vs remote settingsUpdatedAt，新者覆盖旧者；
- 或更保守：**settings 只在 upload/download 路径全量替换，sync 路径跳过 settings**（settings 变更频率极低，用户通常只在一端改）。**推荐保守策略**：sync 不动 settings，避免双向 merge 语义复杂化。

### 决策 2 — neodbToken 纳入 WebDAV 备份

**纳入。** 理由：

- `neodbToken` 是 NeoDB 平台的 OAuth token，**不是 WebDAV 凭证**。它已包含在 `EXPORT_SETTINGS_KEYS`（`data.ts:36`）中，说明安全审查已认定其可随导出文件流转。
- 换机场景：用户在新设备恢复 WebDAV 备份后，若 `neodbToken` 丢失，自动同步到 NeoDB（`autoSyncNeoDB`）会立即失效，需重新走 NeoDB OAuth 授权流程——体验断裂。
- `neodbToken` 与 `autoSyncNeoDB` 是配对配置：恢复 `autoSyncNeoDB=true` 但丢失 `neodbToken` 会导致每次保存都触发失败的 NeoDB 推送。

**安全权衡**：
- `neodbToken` 明文存储于 WebDAV 服务器（与本地导出 JSON 文件同等风险）。
- NeoDB token 权限范围有限（读写用户标记/评分），泄露后攻击者可改写用户的 NeoDB 标记，但**无法**借此访问 WebDAV 服务器或其他平台账号。
- 若用户 WebDAV 服务器已被攻破，token 泄露是次要风险（攻击者已有 WebDAV 凭证本身）。
- **可接受**：风险等级与本地导出 JSON 文件一致，且低于 WebDAV 凭证泄露。

> **备选（不在本次范围）**：未来可为 `neodbToken` 提供单独的"是否纳入备份"开关。本次默认纳入，与本地导出行为对齐。

### 决策 3 — 本地导出提供"可选包含 WebDAV 凭证"开关（默认关）

**问题**：`handleExportData`（`data.ts:78-95`）当前不接受 payload，`EXPORT_DATA` 消息类型 payload 为 `void`（`types/index.ts:156`）。导出按钮（`ImportExportTab.vue:18-29`）直接 `safeSendMessage({ type: 'EXPORT_DATA' })`，无参数。

**方案**：

1. **类型扩展**（`src/types/index.ts:156`）：
   ```ts
   EXPORT_DATA: { includeWebDAVCredentials?: boolean }  // 原为 void
   ```
   向后兼容：`void` 调用时 `payload` 为 `undefined`，handler 内 `payload?.includeWebDAVCredentials ?? false`。

2. **Handler 改造**（`data.ts:78-95` `handleExportData`）：
   ```ts
   export async function handleExportData(
     payload: { includeWebDAVCredentials?: boolean } | undefined,
     sendResponse: SendResponse
   ) {
     // ... 现有 stores 逻辑 ...
     const appSettings = settingsCache.get()
     const settings: Record<string, unknown> = {}
     for (const key of EXPORT_SETTINGS_KEYS) {
       const value = appSettings[key]
       if (value !== undefined) settings[key] = value
     }
     // 可选追加 WebDAV 凭证
     if (payload?.includeWebDAVCredentials) {
       settings.webdavUrl = appSettings.webdavUrl
       settings.webdavUsername = appSettings.webdavUsername
       settings.webdavPassword = appSettings.webdavPassword
     }
     // ... 构造 ExportData ...
   }
   ```

3. **UI 改造**（`ImportExportTab.vue`）：在导出按钮旁新增 checkbox `t('export.includeWebdavCredentials')`，默认不勾选。勾选时导出按钮带 confirm 对话框警告"明文包含 WebDAV 密码"。

4. **导入侧不动**：`IMPORT_SETTINGS_KEYS`（`data.ts:48`）**保持排除 WebDAV 凭证**。即使导出文件含凭证，导入时仍被白名单过滤丢弃——**安全门禁单向**：可导出（用户显式同意），不可导入（防恶意备份注入凭证）。

> **为何导入也拒绝？** 导入路径的安全模型与导出不同：导出是用户主动行为（自己的数据导给自己的文件），导入是接受外部文件（可能是他人构造的恶意备份）。若导入允许 WebDAV 凭证，恶意备份可将 `webdavUrl` 设为攻击者服务器，下次同步即泄露全部数据 + 真实密码（正是 `data.ts:42-47` 注释描述的原始漏洞）。**导出可选、导入禁止**是正确的安全边界。

### 决策 4 — RemoteMeta 扩展 + 版本化

**问题**：`RemoteMeta`（`types/index.ts:201-206`）只有 `datasets: DatasetMeta[]`，无 settings 字段。决策 1 需要在 `RemoteMeta` 中表达 settings。

**方案 A（推荐）：settings 作为特殊 `__settings__` dataset，复用现有 `datasets` 数组**

- 不修改 `RemoteMeta` 结构，`datasets` 数组中追加一项 `{ key: '__settings__', ... }`。
- 下载/同步侧通过 `ds.key === '__settings__'` 分流到 settings 恢复逻辑，不走 `unpackageDataset → batchPut`。
- **优点**：`RemoteMeta` 结构不变，`RemoteMeta.version` 保持 1，**无需提升版本号**，旧客户端读取新 meta 时只是多看到一个 `__settings__` dataset（会被 `BACKUP_STORES.includes` 白名单跳过，`webdav.ts:217-220`）。
- **向后兼容**：旧客户端下载新 meta → 遇到 `__settings__` dataset → `BACKUP_STORES.includes('__settings__')` 为 false → 跳过并 `errorLog`（`webdav.ts:218`）。无破坏。

**方案 B（不推荐）：`RemoteMeta` 新增 `settings?: RemoteSettingsMeta` 字段**

- `RemoteMeta.version: 1 → 2`，新增 `settings?: { hash, updatedAt, keys, dataVersion }`。
- 需要提升 `RemoteMeta.version`，旧客户端读到 `version: 2` 的 meta 行为未定义（当前无 `RemoteMeta.version` 校验逻辑）。
- **缺点**：引入 `RemoteMeta` 版本化开销，且 settings 与 datasets 两套 meta 结构割裂。

**选择方案 A**。`__settings__` 作为虚拟 dataset key，是 `DatasetMeta.key` 的扩展用法，不破坏 `RemoteMeta` schema。

**`CURRENT_DATASET_VERSION` 是否提升？**

**不提升。** `__settings__` dataset 的 `dataVersion` 仍为 `CURRENT_DATASET_VERSION`（=1）。settings 的 schema 版本由 `EXPORT_SETTINGS_KEYS` 白名单隐式管理（字段增删即 schema 变更），不需要独立的 `CURRENT_SETTINGS_DATASET_VERSION`。若未来 settings 字段发生不兼容变更（如字段重命名），再引入 settings 专属版本号。

**`BACKUP_STORES` 是否纳入 `__settings__`？**

**不纳入。** `BACKUP_STORES`（`models.ts`）是 IndexedDB store 名白名单，`__settings__` 不是 IDB store。在 `handleWebDAVDownload` 的白名单校验（`webdav.ts:217`）中，需为 `__settings__` 开**专用例外**：

```ts
// webdav.ts:211-247 handleWebDAVDownload
for (const ds of remoteMeta.datasets) {
  if (ds.key === '__settings__') {
    // 分流到 settings 恢复逻辑（见决策 5）
    continue
  }
  if (ds.recordCount === 0) continue
  if (!BACKUP_STORES.includes(ds.key as RecordStoreName)) { ... continue }  // 原有校验
  // ... record 恢复 ...
}
```

### 决策 5 — 安全门禁：WebDAV 下载恢复 settings 时走白名单校验

**问题**：WebDAV 下载的 settings 数据来自外部服务器，是攻击者可构造的不可信输入。若直接 `chrome.storage.local.set(remoteSettings)`，恶意服务器可注入任意键（包括 `webdavUrl` 等凭证键——即使上传侧不含，恶意服务器可伪造）。

**方案**：下载侧恢复 settings 时，**复用 `IMPORT_SETTINGS_KEYS` 白名单**（`data.ts:48`），与本地导入路径安全模型一致。

```ts
// webdav.ts — handleWebDAVDownload 内，__settings__ 分支
import { IMPORT_SETTINGS_KEYS } from './data'

if (ds.key === '__settings__') {
  const blob = await WebDAV.downloadDataset(webdavUrl, webdavUsername, webdavPassword, '__settings__')
  const text = await blob.text()
  let rawSettings: Record<string, unknown>
  try {
    rawSettings = JSON.parse(text)
  } catch {
    errorLog(`WebDAV download: __settings__ dataset is not valid JSON, skipping`)
    continue
  }
  // 白名单过滤——与 handleImportData:169-179 完全一致
  const filtered: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rawSettings)) {
    if (IMPORT_SETTINGS_KEYS.has(key)) {
      filtered[key] = value
    }
  }
  if (Object.keys(filtered).length > 0) {
    await settingsCache.updateAll(filtered)  // 走 cache，与 handleUpdateSettings 一致
  }
  continue
}
```

**安全保证**：
- `IMPORT_SETTINGS_KEYS = new Set(EXPORT_SETTINGS_KEYS)`（`data.ts:48`），排除 `webdavUrl/webdavUsername/webdavPassword`。
- 恶意 WebDAV 服务器即使伪造 `__settings__` dataset 含 `webdavUrl: 'https://evil.com/dav/'`，白名单会丢弃该键——**无法改写 WebDAV 目标**，与本地导入路径安全模型完全对齐。
- `settingsCache.updateAll()`（`cache.ts:42-46`）内部 `Object.assign(cache, settings)` + `chrome.storage.local.set`，与 `handleImportData:177` 的 `chrome.storage.local.set(filtered)` 语义等价，但额外更新内存缓存（避免 SW 被杀后缓存过期前读到旧值）。

**`handleWebDAVSync` 的 settings 处理**：

按决策 1 推荐的保守策略，sync 路径**跳过 settings**：

```ts
// webdav.ts handleWebDAVSync — allKeys 循环内
if (key === '__settings__') {
  // settings 不参与双向 merge，仅保留 local meta（若有）或 remote meta
  resultingMetas.push(local || remote || { key, hash: 'empty', updatedAt: ..., recordCount: 0, dataVersion: 1 })
  continue
}
```

用户若需同步 settings，使用显式 upload/download。这避免 settings 双向 merge 的语义复杂度（settings 无主键，无法 per-field merge）。

---

## 3. 风险评估

### 3.1 备份格式变更

| 变更 | 影响 | 兼容性 |
|---|---|---|
| `RemoteMeta.datasets` 新增 `__settings__` 项 | 新客户端上传的 meta 多一项 | 旧客户端读新 meta：`__settings__` 不在 `BACKUP_STORES`，被 `webdav.ts:217` 跳过 + errorLog，**不破坏** |
| WebDAV 服务器多一个 `__settings__.zip`（或 `.json`）文件 | 服务器目录结构变化 | 旧客户端不读取该文件，**无影响** |
| `EXPORT_DATA` payload 从 `void` 改为 `{ includeWebDAVCredentials?: boolean }` | `MessagePayloadMap` 类型变更 | `void` → 可选字段，旧调用方传 `undefined` 仍合法，**向后兼容** |

### 3.2 向后兼容

- **旧备份恢复**：不含 `__settings__` dataset 的旧 meta → 下载侧不触发 settings 恢复 → settings 保持本地现状。**行为与当前一致**。
- **旧客户端读新 meta**：`__settings__` 被白名单跳过，record 恢复正常。**无破坏**。
- **新客户端读旧 meta**：无 `__settings__` dataset → settings 不恢复 → 行为与当前一致。
- **`RemoteMeta.version` 保持 1**：不引入版本门禁开销（ADR-011 的 `validateDatasetVersion` 针对 dataset ZIP 的 `meta.json`，不针对 `RemoteMeta`）。

### 3.3 安全权衡

| 维度 | 本地导出（现状） | WebDAV 备份（本方案） | 评估 |
|---|---|---|---|
| 非敏感 settings（11 项偏好） | ✅ 含 | ✅ 新增含 | WebDAV 服务器可读，但无敏感凭证 |
| `neodbToken` | ✅ 含 | ✅ 新增含 | NeoDB token 泄露风险 = 本地导出文件泄露风险 |
| WebDAV 凭证 | ❌ 排除（正确） | ❌ 排除（本方案保持） | WebDAV 凭证不上传到 WebDAV 服务器自身（无意义且有风险） |
| 本地导出可选凭证 | 无此功能 | N/A | 新增开关默认关，用户显式同意才导出凭证 |
| 导入恢复 settings 白名单 | ✅ `IMPORT_SETTINGS_KEYS` | ✅ 复用同一白名单 | 安全模型一致，恶意备份无法注入 WebDAV 凭证 |

**新增攻击面**：
- `neodbToken` 明文存于 WebDAV 服务器。若 WebDAV 服务器被攻破，攻击者获得 NeoDB token。**缓解**：NeoDB token 可随时 revoke（NeoDB 账号设置页），泄露影响有限。
- `__settings__` dataset 被恶意服务器伪造 → 白名单过滤丢弃凭证键 → **无法**改写 WebDAV 目标。与本地导入路径安全模型完全对齐。

### 3.4 行为变更

| 变更点 | 风险 | 影响范围 |
|---|---|---|
| WebDAV 上传额外打包 settings | 上传耗时增加（settings 体积 <1KB，可忽略） | upload 路径 |
| WebDAV 下载恢复 settings | 覆盖本地 settings（白名单内 12 项） | download 路径——用户预期"云端覆盖本地"，符合 UI confirm 对话框语义（`WebDAVTab.vue:92-96` `sync.cloudOverwriteDesc`） |
| `EXPORT_DATA` payload 类型变更 | TypeScript 类型收紧（`void` → 可选字段对象） | `MessagePayloadMap` 消费方需类型检查；旧调用 `{ type: 'EXPORT_DATA' }` 无 payload 仍合法 |
| 导出 UI 新增 checkbox | 用户可能误勾选"含凭证" | 默认关 + confirm 警告 |

---

## 4. 回滚方案

按文件粒度可回滚：

1. **决策 1（WebDAV 备份含 settings）**：删除 `handleWebDAVUpload` 中 `__settings__` 打包逻辑 + `buildLocalMeta` 中 `__settings__` meta → 上传行为恢复为纯 record。单一函数回滚。
2. **决策 5（下载恢复 settings）**：删除 `handleWebDAVDownload` 中 `ds.key === '__settings__'` 分支 → 下载行为恢复为纯 record。单一函数回滚。
3. **决策 3（导出可选凭证）**：`handleExportData` 签名改回无 payload，`MessagePayloadMap.EXPORT_DATA` 改回 `void`，删除 UI checkbox。三处回滚。
4. **决策 2（neodbToken 纳入）**：与决策 1 同批回滚（`EXPORT_SETTINGS_KEYS` 不变，neodbToken 仍在白名单）。

**全局回滚**：`git revert` 单个 PR 的 commit 即可。无需数据迁移——`__settings__` dataset 在 WebDAV 服务器上是额外文件，回滚后不读取即可，旧文件可手动清理或忽略。

**云端残留**：回滚后 WebDAV 服务器上可能残留 `__settings__.zip`/`.json` 文件，旧客户端不读取，无安全风险（内容已是白名单内非敏感数据）。可手动删除。

---

## 5. 后续（不在本次范围）

1. **`RemoteMeta.version` 版本门禁**：当前 `RemoteMeta.version` 硬编码 1 且无校验逻辑。未来若 `RemoteMeta` 结构发生不兼容变更（如新增必填字段），需引入 `validateRemoteMetaVersion()`，类似 `validateExportVersion`（`models.ts:293-311`）。本次方案 A 不触发此需求。
2. **settings 双向 merge**：本方案 sync 路径跳过 settings（保守策略）。若用户在多端频繁修改 settings 且期望自动 merge，可引入 per-field `updatedAt` 时间戳 + 字段级 last-writer-wins。需扩展 `AppSettings` 为 `{ value, updatedAt }` 包装——破坏性变更，单独立 ADR。
3. **`neodbToken` 加密存储**：当前明文存于 `chrome.storage.local` + WebDAV 服务器。未来可评估用 Web Crypto API（基于用户口令派生密钥）加密 token 后再备份。需用户设置主口令——体验成本高，待评估。
4. **`getMigrationInfo` 暴露 settings 备份状态**：`MigrationStatus`（`types/index.ts:181-189`）可扩展 `settingsBackupIncluded: boolean`，供诊断页显示当前备份是否含 settings。
5. **WebDAV 备份元数据诊断**：`WebDAVTab.vue` 可显示远端 meta 的 `__settings__` dataset 是否存在 + `updatedAt`，帮助用户确认 settings 已备份。
