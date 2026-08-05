# ADR-011: 备份版本化 + jav_ids 纳入备份白名单 + 导入路径 schema 自动迁移 — 2026-08-04

- **日期**: 2026-08-04
- **状态**: Accepted
- **依据**: 备份/导入链路缺少版本门禁与 schema 迁移；`jav_ids`（成人记录）此前不在备份白名单内，WebDAV 上传遗漏成人观影历史；导入路径手工补字段而非走完整迭代迁移。

## 背景

备份链路（`webdav.ts` handlers + `zip-utils.ts`）存在三处缺口：

1. **备份 ZIP 无版本语义**：`meta.json` 的 `dataVersion` 硬编码 `1`，`unpackageDataset`
   读回时从不校验——将来 dataset 格式演进（例如记录 schema 升级）时，新旧格式无法区分，
   旧备份会被静默当作新格式导入。
2. **`jav_ids` 不在备份白名单**：上传仅遍历 `RECORD_STORES`（7 个平台 store），
   JavDB/Sehuatang 成人记录存在 `jav_ids`，从未被备份；下载侧也没有显式白名单，
   `remoteMeta.datasets` 中的任意 store 名都会被写入（远程元数据可被恶意 WebDAV 服务器伪造）。
3. **导入/下载路径不做 schema 迁移**：导入（`handleImportData`）手工补 `comment` 等字段，
   下载路径直接写库——旧版导出/备份中的旧 schema 记录（缺字段、缺 `schemaVersion`）不会走
   `migrateRecord` 迭代迁移，后续读路径虽会兜底 normalize，但写入时即应归一。

## 决策与执行结果

### 决策 1 — Dataset 版本化（`DatasetMeta.dataVersion` + `validateDatasetVersion`）

- `DatasetMeta` 增加 `dataVersion: number`（`src/types/index.ts`）；
- `src/features/migration/models.ts` 新增：

  ```ts
  export const MIN_SUPPORTED_DATASET_VERSION = 1
  export const CURRENT_DATASET_VERSION = 1
  export function validateDatasetVersion(datasetVersion: number): boolean
  // < MIN_SUPPORTED → MigrationError('IMPORT_INCOMPATIBLE')
  // > CURRENT     → MigrationError('VERSION_TOO_NEW')
  ```

- `packageDataset` 写入 `dataVersion: CURRENT_DATASET_VERSION`；`unpackageDataset`
  解析 `meta.json` 后立即 `validateDatasetVersion(meta.dataVersion)`，不兼容即抛
  `MigrationError` 并向上传播（下载/同步 handler 按 dataset 跳过并记日志，不中断整体）。
- 当前 `CURRENT_DATASET_VERSION = 1` 与既有备份格式向后兼容（旧 `meta.json` 缺该字段时
  `undefined` 会触发 too-old 分支——WebDAV API 侧 `ds.dataVersion ?? ds.version ?? 1` 兜底，
  见 `webdav/api.ts`）。

### 决策 2 — `BACKUP_STORES` 白名单：`RECORD_STORES` + `jav_ids`

- `src/features/database/models.ts` 新增唯一清单：

  ```ts
  export const BACKUP_STORES: readonly string[] = [...RECORD_STORES, STORE_NAMES.JAV_IDS]
  ```

  共 **8** 个 store：7 平台记录 store + `jav_ids`。`javdb`/`sehuatang` 平台记录存于
  `jav_ids`（无自有 `{id}_records` store）；`mukaku` 为纯扫描辅助平台，不持久化媒体记录，
  故不在白名单内。
- **上传**（`handleWebDAVUpload`）遍历 `BACKUP_STORES`：成人观影历史随备份一并上传；
- **下载/同步**（`handleWebDAVDownload` / `handleWebDAVSync`）对每个 `remoteMeta.datasets`
  的 `ds.key` 先做 `BACKUP_STORES.includes` 白名单校验，不在白名单的 dataset 整体跳过并
  `errorLog`——`remoteMeta` 来自外部 WebDAV 服务器、可被攻击者伪造，白名单保证恶意服务器
  无法写入任意 store（例如 `ttl_cache` / `pt_id_cache` 或未来新增 store）。
- 与 DB 层白名单（`handlers/db.ts` `ALLOWED_DB_STORES` = `RECORD_STORES` + `ttl_cache` +
  `pt_id_cache` + `jav_ids`）交叉一致：`BACKUP_STORES ⊆ ALLOWED_DB_STORES`。

### 决策 3 — 导入/下载路径 schema 自动迁移

- **导入**（`handleImportData`）：逐记录 `normalizeStoreRecord(record).record`（完整迭代
  0→1→2 迁移），`MigrationError` 时跳过该记录并 warn（不中断整批导入）；
- **下载/同步**：`unpackageDataset`（版本门禁）→ `batchPut`（写时 `stampRecordVersion`
  打当前 schemaVersion）→ 读路径（`get`/`query` 等）经 `normalizeStoreRecord` 兜底迁移
  旧 schema 记录；
- 迁移失败/版本过新的记录按 dataset 级跳过，下载其余 dataset 不受影响。

## 影响

- 备份 ZIP `meta.json` 携带 `dataVersion`，格式可演进；不兼容版本在 `unpackageDataset`
  即被拒绝，`MigrationError` 语义（`IMPORT_INCOMPATIBLE` / `VERSION_TOO_NEW`）与导出导入链路一致；
- 成人记录（`jav_ids`）首次纳入 WebDAV 备份/恢复范围；
- 下载/同步增加白名单门禁：非 `BACKUP_STORES` 的远程 dataset 被拒绝，防恶意 WebDAV 服务器写任意 store；
- 导入路径从「手工补字段」收敛为「完整迭代迁移」，与读路径 normalize 行为一致；
- `CURRENT_DATASET_VERSION = 1`：既有备份（硬编码 `dataVersion: 1`）无缝兼容。

## 回滚

- 决策 2（白名单）：删除 `BACKUP_STORES` 定义并将上传/下载校验改回 `RECORD_STORES` 即可，
  纯增量可逆；
- 决策 1（版本化）：移除 `meta.dataVersion` 校验与常量即可——旧备份本就无版本字段，
  回滚后行为与现状一致；
- 决策 3（导入迁移）：改回手工补字段或直接 `put` 即可，无数据破坏；已迁移记录多出的
  `schemaVersion`/`comment` 字段对旧代码无副作用（读路径 normalize 幂等）。

## 后续（不在本次范围）

- `meta.json` 缺 `dataVersion` 字段的兜底路径（`webdav/api.ts` `?? ds.version ?? 1`）待统一为
  `validateDatasetVersion` 单一入口
- `getMigrationInfo` 可扩展暴露 `currentDatasetVersion` 供诊断
