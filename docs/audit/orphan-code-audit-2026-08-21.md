# 孤立代码溯源审计 — 2026-08-21

- **方法**: WXT 入口反向可达性分析（import/export-from/动态 import 边，402 文件建图）→ 活文件簇内 838 导出符号外部引用计数 → 文件内自用二分 → 消息契约逐成员接线核查。全部结论带可复现脚本路径与 grep 复核。
- **状态**: ✅ A/B 组已于同日执行（见文末执行记录），门禁三绿；C 组保持现状。

## 结论总览

| 层级 | 数量 | 说明 |
|---|---|---|
| 死文件 | **4** | 全部为纯转发 barrel（`export * from`），零引用 |
| 误排后存活 | 1 | `utils/dev-version.ts` —— 被 `wxt.config.ts:3` 构建期消费，src 图不可见 |
| 真死符号 | **2** | 全仓（含测试）仅声明行命中的函数/接口 |
| 契约锚定 | 1 | 形状是响应契约但类型名未被使用 |
| 过度导出 | 117 | 内部使用中、仅 export 关键字多余——非死代码，属可选收敛面 |
| 休眠消息类型 | **0 / 30** | 协议全接线，无死契约 |

## A. 可删除（高置信）

1. `src/features/migration/index.ts` — 纯 barrel，消费方均直引 `./models`
2. `src/features/neodb/index.ts` — 同上（直引 `./api`）
3. `src/features/webdav/index.ts` — 同上
4. `src/stores/index.ts` — 同上（消费方直引 `stores/app` 等）
5. `src/features/webdav/api.ts::deleteDataset()` — 函数体零调用（WebDAV 删除数据集走 unpackage 路径，此入口从未接线）
6. `src/content/douban/pages/music-homepage/types.ts::BannerItem` — 零引用接口

> 删除前门禁：type-check + build + test:unit 三绿即可（无运行时行为面）。

## B. 契约锚定（不建议直接删）

- `types/index.ts::MigrationStatus` — GET_MIGRATION_STATUS 响应的形状即此接口（handler 以字面量构造）。建议：handler 返回值改为 `migration: MigrationStatus` 类型标注（接线）或保留作文档。

## C. 过度导出面（117 个，非死代码）

典型：url-detector 的 40 个 `isXxxPage` 谓词（路由实际走 `detectPageType` 单入口）、各 data.ts 的内部结果接口、mount-factory/css-composer 的配置类型。处置选项：去 `export` 关键字收紧模块边界（纯机械、零风险），或维持现状作为文档型 API 面。完整清单：`.um.agents/memory/tmp-dead-exports.txt`（含真死/过度导出二分 JSON）。

## 方法论附注

- 初版符号扫描曾产出 182 候选，其中 css-map 44 个 CSS chunk 常量经聚合对象间接存活——**符号级判定必须以文件级可达性为先**。
- 两处工具 bug 教训（别名 Substring off-by-one / 边方向反置）已记入 `.um.agents/memory/gotchas.local.md` 同款陷阱清单。

## 执行记录（2026-08-21 同日落地）

| 项 | 动作 | 验证 |
|---|---|---|
| A1–A4 四个 barrel | 已删除（migration/neodb/webdav/stores 的 index.ts） | 消费方直引实体模块，零改动 |
| A5 `deleteDataset` | 已删除（webdav/api.ts -16 行） | type-check 0 |
| A6 `BannerItem` | 已删除（music-homepage/types.ts） | type-check 0 |
| B `MigrationStatus` | 已接线：`getMigrationInfo(): MigrationStatus` 显式返回类型（migration/models.ts），契约类型由文档态转为编译期约束 | type-check 0 |
| 门禁 | 全量复验 | type-check 0 · test:unit 786 passed（基线外零失败）· build exit 0 |
