# UMM 架构重构调研报告 — WXT 体系对齐与分层现代化（2026-08-21）

- **日期**: 2026-08-21
- **状态**: 调研定稿（纯调研，未改任何代码）→ **待用户批准执行**
- **基线**: v5.13.1 · 工作树干净 · wxt 0.21.4 / TS 6.0.3 / Vite 8.2.1(rolldown) / Vue 3.5.x / Tailwind v4
- **方法**: umpp 管线 P0–P3；本地证据（文件:行）+ node_modules 实测 + 官方 Releases 核对
- **标注**: [Fact]=本地/官方证据 / [Assumption]=推断未验证 / [Decision]=需拍板的取舍

---

## 0. Executive Summary

代码库**纪律良好且高度活跃**（ADR-008…016、type-check 干净、0 循环依赖），2026-08 架构扫描的多数遗留项已在后续 commit 中修复（本次逐条复核确认，见 §1.4）。**WXT 版本已是最新稳定版**（0.21.4，2026-08-11 发布 [Fact]）——重构主题因此不是"升级框架"，而是：

1. **对齐 WXT 官方工具层**：项目仅使用 `defineBackground`/`defineContentScript` 两个入口 API，未用 `wxt/utils/storage`（类型化 item + 版本迁移）、`browser` 统一对象等；自研层与之重复的部分应收敛（settings 存储是最大收益点）。
2. **分层补缺口而非推倒重来**：现有 `domain/features/shared/entrypoints` 与七层模型大体同构，真实缺口是 **scenario 层缺位**（跨平台同步编排散在三处）与少量边界违规。
3. **防过度工程**：Shadow DOM overlay 自研挂载体系（early/main 双入口）优于 WXT 内置 UI 工具对本场景的适配，保留；消息层自研已全链路类型化，替换为第三方库收益为负。

预估总工作量 **M（中等）**，4 个波次，每波独立可验证可回滚。

---

## 1. P0 现状盘点

### 1.1 技术栈版本对照 [Fact]

| 技术 | 项目当前 | 最新稳定（2026-08-21 核对） | 结论 |
|---|---|---|---|
| wxt | 0.21.4 | **0.21.4**（[Releases](https://github.com/wxt-dev/wxt/releases)，2026-08-11） | ✅ 已最新，无升级需求 |
| @wxt-dev/storage | （随 wxt 传递） | 1.2.9 | 未使用 → 本计划采纳 |
| @wxt-dev/browser | 0.2.2（wxt 依赖） | — | 未直接使用 → 可选采纳 |
| TypeScript | 6.0.3 + erasableSyntaxOnly | TS 7.1 待 vue-tsc 支持（ADR-008 附录路径） | 维持既有路线，不在本计划内 |
| Vite | 8.2.1 rolldown 默认 | 8.2.x | ✅ 已最新线 |
| Vue | ^3.5.41 | 3.6 stable 待发布后一行升级（ADR-008） | 不在本计划内 |

### 1.2 WXT 能力使用矩阵 [Fact]（node_modules/wxt@0.21.4 实测导出 vs 源码 grep）

| WXT 能力 | 项目现状 | 判定 |
|---|---|---|
| `defineBackground` / `defineContentScript`（深路径导入） | ✅ 全部 7 个入口使用 | 保持 |
| auto-imports（unimport） | ❌ 未启用，全部显式深路径导入 | [Decision-D1] 保持显式（grep 友好、无 lint 现状）或启用，倾向保持 |
| `wxt/utils/storage`（defineItem/版本迁移/getItems 批量） | ❌ 未用；settings 为手写 flat-key 缓存（features/settings/cache.ts 108L）+ config.ts STORAGE_KEYS 清单 | ✅ **采纳迁移**（最大收益点） |
| `browser`（@wxt-dev/browser，promise 化跨浏览器 API） | ❌ 直用 `chrome.*`（113 处/32 文件） | [Decision-D2] 机械统一波次，中低优先 |
| content-script-ui（createShadowRootUi/integrated/iframe）+ ContentScriptContext | ❌ 自研 overlay 体系（douban-early/main 双入口 + mount-factory 130L + overlay/ 三模块 ~220L） | **保留自研**（FOUC-free 的 document_start 预建 Shadow DOM 是有意设计，WXT UI 工具的单入口生命周期模型不适配双入口时序）[Decision-D3] |
| `wxt/utils/messaging` | **0.21 无此导出** [Fact]；项目自研类型化消息层（RuntimeMessage 判别联合 + MessagePayloadMap + switch 分发，无 payload! 断言） | **保留自研**；@webext-core/messaging 未安装，引入为负收益 [Decision-D4] |
| `split-shadow-root-css` | ❌ 未用 | 备选：css-composer 若需要 CSS 分片再评估 |
| `.wxt/tsconfig.json` extend | ❌ 根 tsconfig 独立（types:["chrome"]）；`.wxt/tsconfig.json` 已生成但未被继承 | 低收益可选（不用 auto-imports 则缺的只有 wxt.d.ts 全局类型）|
| `@wxt-dev/i18n`（chrome.i18n/_locales） | ❌ 双 i18n 系统（vue-i18n 621L + 自研 t() 567L），无 _locales 目录 | **不迁移**（chrome.i18n 键静态化与 Shadow DOM 动态 locale 切换冲突）Non-goal |

### 1.3 分层现状 × 七层模型映射 [Fact 目录盘点 + Assumption 边界]

```
app       ≈ src/entrypoints/*（popup/options SPA 组装、background SW 组装、4 个内容脚本入口）
feature   ≈ src/content/douban/pages/*（32 页四件套）、options/tabs/*、popup/pages/*
store     ≈ src/stores/*（pinia 4 个，popup/options 用）、douban shared/composables/*
scenario  ≈ ⚠️ 缺位：跨平台同步编排散在 domain/record/RecordService + content/handlers/neodb.ts
            + background/handlers/data.ts 三处表达同一流程的不同段
provider  ≈ features/neodb/api.ts、features/webdav/*、content/handlers/mukaku/api.ts、pt config/sites.ts
engine    ≈ features/database/*（1187L IndexedDB 单例+Store 门面）、features/cache/*（L1 LRU+
            session L1.5，ADR-014）、features/data-scheduler/*（660L 队列）
library   ≈ src/utils/*（13 文件）、src/shared/*（非 ui 部分）
domain    ≈ src/domain/*（8 文件纯 TS：Platform/MediaType SSOT、Identity、StoreRecord 聚合根、
            RecordService、IRecordRepository 收窄接口）✅ 已是教科书式领域层
```

结论：**不需要目录大迁徙**。七层映射成立度约 85%，真实缺口是 scenario 归位与两处边界违规（见 §3.2）。禁止创建空抽象层（umpp 纪律）。

### 1.4 历史债务复核（architecture-scan-2026-08-03 逐条验证）[Fact]

| 扫描报告遗留项 | 本次复核结果 |
|---|---|
| §2.1 bilibili/youtube 共享抽取 | ✅ 已完成（`content/ui/video-overlay*.ts` + video-progress-tracker.ts 在库） |
| §2.2 分页器解析 228×5 | 🔶 共享 paginator.css 在库；页面级残留 4 文件含 paginator 相关规则（series/doulist-detail/search/personage-creations）→ 列入清理波次 |
| §2.3 neodb 内联 sync 128 行 | ✅ 已改走 `Store.dbSyncPageRecord`（neodb.ts:191） |
| §2.4 useRecordCache/load-record-map 分裂 | ✅ 已统一（shared/record-cache-core.ts，两者均为委托） |
| §3.3-M2 PT dimmer storage.onChanged 无效监听 | ✅ 已事件化（dimmer/index.ts:116 订阅 EVENT_BUS record:updated） |
| §6 waitForElement 三处副本 | ✅ 已收敛（mukaku/handler.ts:6 改 import utils/dom） |
| safeSendMessage untyped（utils/context.ts:29 `message: any`） | ❌ 未修 → 列入 Wave 2 |
| M3 M-Team applyCacheFallback 死链路 / L 系列 | ⏳ 未复核 → Wave 0 复核 |

> 教训沉淀：旧 audit 不能直接当 backlog 用——**执行前必须逐条复核**（本项目修复速度快于文档更新）。

---

## 2. P1 问题定义（Problem Statement）

- **What**: 在不改变产品行为的前提下，将 UMM 的基础设施层与 WXT 官方开发体系对齐（存储 item 化、API 对象统一、配置惯例固化），并把分层架构的真实缺口（scenario 层缺位、类型面碎片化）收敛到单一事实来源。
- **Why**: ① settings 存储是自研 flat-key 缓存 + 手工键名清单，无版本化迁移能力（新增设置字段靠手工兼容，ADR-011 的备份 schema 迁移已证明该痛点）；② `chrome.*` 直用 113 处导致回调/promise 两种风格并存（safeSendMessage 手写包装）；③ 同步编排逻辑三处分布使"改一处同步规则要追三个文件"；④ WXT 能力矩阵长期只用了 2/N，新人无法从代码看出哪些自研是有意设计、哪些是历史欠账（本次调研花费大量精力区分二者——需要 ADR 固化）。
- **Scope**: src/features/settings、src/types、src/utils/context.ts、config.ts STORAGE_KEYS、background handlers 编排归位、CSS/i18n 小额清理；不含业务功能变更。
- **Non-goal**: 不换 IndexedDB 封装、不合并双 i18n 到 chrome.i18n、不引入 Vapor Mode、不做 monorepo 拆分、不重命名现有目录结构、不升级 TS 7/Vue 3.6（等上游，ADR-008 既有路径）、不替换自研消息层与 overlay 挂载体系。

---

## 3. P2 工程规格

### 3.1 目标架构决策表

| # | 决策 | 内容 | 依据 |
|---|---|---|---|
| D1 | auto-imports | **保持显式导入**；在 ADR 中记录这是有意风格 | erasableSyntaxOnly/grep 友好一致；启用属团队口味非正确性问题 |
| D2 | `browser` 统一 | 采纳为独立机械波次（codemod 式 chrome.*→browser.*，113 处/32 文件）；若用户认为收益不足可砍 | promise 化统一、消 safeSendMessage 手写包装的一半动机；风险=纯机械，type-check 全覆盖 |
| D3 | overlay 挂载体系 | **保留自研**，写 ADR 说明为何不用 createShadowRootUi | early/main 双入口 FOUC-free 设计 [Fact mount-factory.ts 注释] |
| D4 | 消息层 | **保留自研**类型化协议；拒绝引入 @webext-core/messaging | 现有层已有判别联合+门控+超时治理，外部库无增量能力 |
| D5 | settings 存储 | 迁移 `storage.defineItem`：每设置一个 item（default+version+migrate），STORAGE_KEYS 清单由 item 定义派生 | @wxt-dev/storage 1.2.9 能力实测 [Fact]；消手写 cache 的同步读复杂度 |
| D6 | scenario 归位 | 新增 `src/scenario/`（或 domain/record 下沉编排，二选一见 §5-Q3）：以「同步编排」首个落地，把 background data handler 中的 IMPORT/WebDAV 编排语义与 RecordService 衔接收拢 | Evolution First：真实变化（同步规则三处分布）已发生 |
| D7 | types SSOT | src/types/index.ts（6.8KB 单文件）按域拆分为 messages / record / settings 三个模块，barrel 再导出保持 import 兼容 | 拆分不改行为，纯结构 |

### 3.2 分层收敛方案（最小改动集）

1. **Wave-S1 settings 引擎替换**: `features/settings/cache.ts`（108L 手写缓存+onChanged 监听）→ `features/settings/items.ts`（defineItem 集）+ 薄读缓存层（保留现有消费方 API `getSettings()/updateSettings()` 签名不变，内部换实现）。迁移函数处理存量 flat keys → versioned items（一次性，v→v+1）。
2. **Wave-S2 scenario 首例**: `handleGetStatistics/handleGetAllRecords/IMPORT_DATA` 中的记录聚合语义下沉；neodb-sync 与 RecordService 的衔接点收敛为显式 scenario 函数（签名级单测锁定）。
3. **Wave-S3 类型拆分**: messages/record/settings 三模块 + barrel；`utils/context.ts safeSendMessage` 泛型化接入 MessagePayloadMap（删 `any`），或随 D2 直接被 browser.* 取代后废弃。
4. **Wave-S4 表面清理**: CSS paginator 变体 4 文件收敛至共享 `.umm-paginator`；wxt.config bilibili 缩进瑕疵类小项。
5. **MV3 官方实践核对结论** [Fact，来源 developer.chrome.com]：三层缓存（含 storage.session）= 官方对 SW 的推荐姿势（[storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)）；周期任务走 alarms ✅ 已符合（[SW events](https://developer.chrome.com/docs/extensions/get-started/tutorial/service-worker-events)）；监听器在 defineBackground main() 同步注册 ✅ 合规（[lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)）；offscreen 经 ADR-012 评估为部分推荐未采纳 ✅ 边界清晰。**结论：数据/SW 架构已与官方当前指引同构，无需返工。**

### 3.3 模块影响面

| 波次 | 触碰文件（估） | 高风险点 |
|---|---|---|
| S1 | settings/cache.ts、config.ts、background.ts:96-120（日志配置读取）、stores/theme.ts、options 各 tab 读设置路径 | 存量数据迁移（老用户 flat key 必须无损搬迁）；settingsCache.init 的 wake 时序 |
| S2 | background/handlers/data.ts、domain/record/RecordService.ts、features/neodb/api.ts 衔接 | 行为漂移（统计口径）；需特征测试先行 |
| S3 | types/index.ts → 3 文件 + barrel、utils/context.ts、17 处 sendMessage 调用点的类型面 | 纯类型层，type-check 门禁即可 |
| S4 | 4 个 douban styles css、共享 paginator.css | 视觉回归（一页一 commit + QA 快照法，沿用既有惯例） |

### 3.4 风险表

| 风险 | 缓解 |
|---|---|
| S1 设置迁移丢数据 | 迁移前导出特征样本；fake-indexeddb/storage 内存桩单测「flat→item」往返；灰度读回退（item miss 时 fallback 读旧 key 一个版本期） |
| S2 统计口径变化 | 先写 Statistics 特征测试（现有 store 数据跑出快照），重构后 diff 为空才合入 |
| D2 browser.* 波次面广 | 纯 codemod + type-check；可独立回滚 revert |
| 双入口 overlay 误伤 | D3 明确不动 overlay/mount-factory，波次内禁止触碰该目录 |

### 3.5 测试策略

1. 门禁不变：`npm run type-check` → `npm run build`（含 fix-paths）→ `npm run test:unit`。
2. S1 新增：settings items 迁移单测（fake storage 环境，Playwright unit 已有 fake-indexeddb 先例）。
3. S2 新增：Statistics/sync 编排特征测试（快照锁定）。
4. S4：QA 本地快照法（项目既有惯例）一页一验。

---

## 4. P3 波次规划与原子 TODO

> 执行状态（2026-08-21 起）：用户已批准全部波次；Q1=保留 browser 波；Q3=scenario 并入 domain/record。

| Wave | 内容 | 依赖 | 规模 |
|---|---|---|---|
| **W0 复核与锁定** ✅ | M3/L 系列复核结论：**全部已修**（mteam.ts:215 M3 注释在案、scheduler clearTimeout :203/:214、L4/L5 cacheKey 机制整体移除、sync_logs 死 store migrate.ts:65 处置）；Statistics 特征测试已补齐——纯函数抽取至 `domain/record/statistics.ts`（computeStatistics/flattenRecords），handler 委托化，特征测试 7 例锁定（并当场捕获一处平台维计数抽取笔误，证明测试有效） | 无 | S |
| **W1 settings 引擎** ✅ | 落地形态与计划有一处**有意偏离**：`wxt/utils/storage`(v1.2.9) 的 driver 在模块求值时捕获全局且无注入点，在 Playwright 复用 worker 下产生跨文件串写（实测证据：探针 CALLS=[]）。改为 **~90 行自持类型化 item 层** `features/settings/items.ts`——契约完全保留（物理键不变零迁移、fallback 单源、批量读、`version/migrations` 声明式钩子、`<key>$` 元数据语义对齐官方），另加 `__bindSettingsAreaForTests` 注入接缝。消费方切换：webdav/neodb/background/content/theme 共 5 文件；i18n 插件**保持原样**（其"未设置→浏览器语言"回退语义与 fallback 冲突，切换属行为变更）。附带修复两个跨文件全局泄漏 spec（database-api-retry / pt-dimmer-cache-memo 无 afterEach 恢复）。新增 settings-items.spec 8 例。门禁：type-check 0 / build 0 / 全量三连稳（786 passed，仅剩 11 个既有 personage 快照缺失失败=基线） | W0 | M |
| **W1 settings 引擎** | D5+S1：items.ts 定义（version+migrate）、cache.ts 换实现保 API、STORAGE_KEYS 派生、迁移单测 | W0 | M |
| **W2 类型面收敛** ✅ | `types/messages.ts` 抽取（MessageType/MessagePayloadMap/ToastType + 新增 RuntimeMessageEnvelope 信封），index.ts barrel 兼容零改动消费方；background.ts 本地 RuntimeMessage 重复定义删除改用共享信封；`safeSendMessage` 消息参数 any→RuntimeMessageEnvelope（响应体保持调用方可选泛型，属有意残留）；WEBDAV_TEST 契约修正为双方言超集（handler 本就 `webdavUrl ?? url` 兼容，属声明不全非运行 bug）；两处边界 cast 附注释。门禁：type-check 0 / build 0 / 786 passed | W1 | S-M |
| **W3 browser 统一波** ❌ **取消（证据驱动）** | 执行前复核发现 @wxt-dev/browser 在模块求值时一次性捕获全局 chrome/browser 且无注入点——与本项目 61 个 spec 直接导入 src 模块、按文件 stub 全局的测试基建正面冲突，全量替换会把 W1 刚根除的"worker 加载顺序脆弱性"扩散到全仓（113 处/32 文件）。收益端经 W1/W2 已吸收殆尽。依据 umpp 纪律取消；决策记录见 ADR-017 D2'。若未来引入 WxtVitest+fakeBrowser 官方单测体系可重评 | — | — |
| **W4 scenario 归位 + CSS 清理** ✅ **验证即完成（范围消解）** | 同步编排接缝复核：neodb-sync.ts 已是纯决策构建器 + RecordService 经 DB_SYNC_PAGE_RECORD 委托，行为由 record-service-sync.spec + neodb-sync-characterization.spec 双锁定（2026-08-07 C1 清理完成）+ W0 statistics.ts 抽取——S2 目标已达成，无需新代码。CSS paginator 复核：共享 paginator.css 明确注释 series/doulist-detail 为「有意保留的带边框分页器」（2026-08-08 决策），search 已用共享类，personage-creations 为带边框变体——**有意设计分歧而非重复**，按 Evolution First 不做合并。i18n:check ✅ 100% | W0 | S |
| **W5 文档同步** ✅ | ADR-017（WXT 工具层采纳边界：D1-D7 + D2'/D5' 证据驱动修订）已入库 `docs/adr/ADR-017-wxt-tooling-boundary.md`；本蓝图各波状态回写；AGENTS.md 修正两处过时表述（tests/ 跟踪状态、消息类型权威位置→types/messages.ts）并新增 settings items 约定条目 | 全部 | S |

## 执行总结（2026-08-21）

- **落地**：W0（统计纯函数抽取+特征测试）、W1（settings item 化，含测试隔离根治）、W2（消息契约模块化+信封类型）、W4（验证即完成——编排接缝与 CSS 分歧均为既有有意设计）、W5（ADR-017+文档）
- **取消**：W3 browser.* 全量替换（捕获时序地雷 vs 测试基建，证据驱动，见 ADR-017 D2'）
- **净效果**：+3 新模块 / +15 特征测试用例 / 消息协议单源化 / settings 默认值单源化 / 2 个跨文件测试污染源修复；零行为变更（除 WEBDAV_TEST 契约声明补全）

## 5. 待用户决策项

| # | 问题 | 选项 | 建议 |
|---|---|---|---|
| Q1 | D2 browser.* 统一波是否执行 | (a) 执行；(b) 砍掉维持 chrome.* | 建议 (a)，但属"锦上添花"，砍掉不影响其余波次 |
| Q2 | D1 auto-imports | (a) 保持显式（推荐）；(b) 启用 unimport | (a) |
| Q3 | scenario 归位位置 | (a) 新建 `src/scenario/`；(b) 编排并入 domain/record | 倾向 (b)——避免新顶层目录，RecordService 已承担部分编排职责；若后续 scenario 数量 >3 再升目录 |
| Q4 | W3/W4 波次顺序 | browser 先 or scenario 先 | scenario 先（业务价值高），browser 最后 |

## 6. 验证门禁

1. `npm run type-check` exit 0（唯一语言门禁）
2. `npm run build` exit 0（含 fix-paths 后置）
3. `npm run test:unit` 全绿（新增迁移/特征测试在内）
4. `npm run i18n:check` 通过（S4 触及文案时）
5. 文档同步：ADR-017 + 蓝图勾选 + AGENTS.md 核对

## 7. 参考

- WXT Releases（0.21.4 latest）：https://github.com/wxt-dev/wxt/releases
- 本地实测：node_modules/wxt@0.21.4 exports（dist/package.json）、@wxt-dev/storage dist/index.d.mts、.wxt/tsconfig.json
- 项目既有：docs/adr/ADR-008…016、docs/audit/architecture-scan-2026-08-03.md、docs/CONSISTENCY_CHECKLIST.md
