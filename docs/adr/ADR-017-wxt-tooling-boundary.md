# ADR-017: WXT 工具层采纳边界 — settings item 化 / browser.* 不切换 / 消息层与 overlay 保留自研

- **日期**: 2026-08-21
- **状态**: Accepted（随 refactor-plan-wxt-alignment-2026-08-21.md W0–W5 执行落地）
- **依据**: docs/audit/refactor-plan-wxt-alignment-2026-08-21.md（用户批准全波次）；WXT 深度调研（wxt 0.21.4 为最新稳定版，无内置 messaging）

## 背景

项目此前仅使用 `defineBackground`/`defineContentScript` 两个 WXT 入口 API，其余基础设施全部自研。本次重构调研逐项评估「官方工具层 vs 自研」的边界，执行中以实测证据修正了三处计划假设。

## 决策

### D5' settings 存储：自持类型化 item 层（偏离原计划的采纳决定）

**原计划**：迁移到 `storage.defineItem`（@wxt-dev/storage v1.2.9）。
**实际落地**：`src/features/settings/items.ts` —— ~90 行自持实现，契约与官方对齐：

| 契约 | 实现 |
|---|---|
| 物理键不变 | `local:webdavUrl` 等与 v5.x flat key 同键，存量数据零迁移 |
| fallback 单源 | `defaultAppSettings()` 由 item fallback 派生，删除第二份字面量 |
| 版本化迁移钩子 | `version` + `migrations` + `<key>$` 元数据行，语义镜像官方（当前全部 v1 未触发） |
| 批量读 | `resolveAppSettings()` 单次 `area.get(keys)` 取代 `get(null)` 全库扫描 |

**偏离原因（实测证据）**：@wxt-dev/storage 的 driver 在模块求值时经 `@wxt-dev/browser` 一次性捕获全局（`browser = globalThis.browser?.runtime?.id ? … : globalThis.chrome`），且 v1.2.9 无 `defineExtensionStorage` 注入点。本项目 Playwright 单测（60+ spec，fullyParallel 复用 worker 进程）按文件安装 `globalThis.chrome` stub——捕获时序导致 items 单例绑死"首个定义时的 area 实例"，产生跨文件静默串写（探针实测 `CALLS: []` 而断言空 Map）。自持层改为**调用时解析全局 + 显式测试绑定接缝**（`__bindSettingsAreaForTests`），生产行为不变、测试按构造确定。

### D2' chrome.* → browser.*：不切换（推翻原 Q1 决定）

原批准保留该机械波次。执行前影响面复核发现同一捕获时序地雷适用于全仓 113 处/32 文件：其中核心模块（features/database/api 等）被 61 个 spec 直接导入，全量替换会把"worker 加载顺序决定 browser 是否为 undefined"的脆弱性扩散到整个套件。收益端在 W1/W2 落地后仅剩类型便利（promise 风格已统一、settings 直读已 item 化）。依据 umpp 纪律（禁止大规模重构替代局部修复）**取消该波次**；未来若引入 WxtVitest+fakeBrowser 测试体系（官方单测路线），可重新评估。

### D3/D4 维持（调研结论固化）

- **overlay 双入口挂载保留自研**：douban-early(document_start 预建 Shadow DOM)/douban-main(document_idle 挂载 Vue) 的 FOUC-free 时序是 WXT `createShadowRootUi` 单入口生命周期模型不适配的有意设计；mount-factory 已工厂化。
- **消息层保留自研**：WXT 0.21 无内置 messaging（官方推荐第三方 @webext-core/messaging）；现有 RuntimeMessage 判别联合 + MessagePayloadMap + switch 分发已全链路类型化，外部库无增量能力。W2 将协议契约抽至 `types/messages.ts` 并新增 `RuntimeMessageEnvelope` 信封类型，`safeSendMessage` 与 background switch 共用它。

## 影响

- 新增：`features/settings/items.ts`、`types/messages.ts`、`domain/record/statistics.ts`
- 改写：`features/settings/cache.ts`（API 保持）、webdav/neodb/background/content/theme 五处消费方
- 测试：`tests/unit/statistics-characterization.spec.ts`(7)、`tests/unit/settings-items.spec.ts`(8)；修复两个跨文件全局泄漏 spec（database-api-retry / pt-dimmer-cache-memo 补 afterEach 恢复）
- 门禁基线：type-check 0 / build 0 / test:unit 786 passed（11 个 personage 快照缺失失败为既有基线，依赖 gitignored `.localref/`）

## 回滚

- items.ts ↔ cache.ts 为单模块替换，revert 即回手写缓存（物理键未变，数据无损）
- types/messages.ts 抽取为纯结构移动，barrel 兼容，可整体 revert
