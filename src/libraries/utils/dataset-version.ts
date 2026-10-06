/**
 * Dataset（备份 ZIP）格式版本常量（纯数据，libraries 层）。
 *
 * 归属说明：这两个常量是**格式契约的字面值**，不含任何逻辑或错误类型，
 * 因此可安全置于 libraries —— `features/migration`（engine，持有
 * validateDatasetVersion 等校验逻辑）与 `utils/zip-utils`（libraries，
 * 负责打包/解析）都依赖它，方向均合法。
 *
 * 为什么不把 validateDatasetVersion 一并放这里：该校验抛 `MigrationError`
 * （域错误类型，含 IMPORT_INCOMPATIBLE / VERSION_TOO_NEW 等 code），
 * 若下沉会让 libraries 耦合域错误语义。按「解析与策略分离」原则，
 * zip-utils 只负责解析，版本兼容策略由调用方（WebDAV 导入链路）负责。
 */

/** Minimum supported dataset (backup ZIP) version */
export const MIN_SUPPORTED_DATASET_VERSION = 1;

/**
 * Current dataset (backup ZIP) version.
 *
 * v2（2026-10-05）：哈希签名字段纳入 `comment`（ADR-027）—— 哈希语义是数据集格式
 * 的一部分，签名变更必须 bump 版本，读侧才能按版本轴选择解读规则（见
 * hash-utils 的 `hashFieldsForDatasetVersion`）。v1 为历史版本：其哈希存在
 * **歧义带**（发布版 gen-1 无 comment / ADR-027 WIP 构建 gen-2 有 comment 共用
 * v1），读侧对 v1 逐代尝试识别。
 */
export const CURRENT_DATASET_VERSION = 2;
