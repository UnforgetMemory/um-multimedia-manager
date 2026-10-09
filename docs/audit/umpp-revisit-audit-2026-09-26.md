# UMM 重构回访审计 — 决策级 + 需求级双层核验（2026-09-26）

- **状态**: 只读回访定稿 + 缺口处置登记（**Fact** = 磁盘/命令证据；**Decision** = 已拍板；**Gap** = 待处置）
- **动机**: ADR-026 状态表逐行已标 ✅，但「标绿」不等于「真实达成」。本文以磁盘现状为唯一权威，做**两层**核验：决策行（D1–D8）与原始 14 项需求——后者能暴露决策行覆盖不到的部分达成项
- **方法**: 两组独立取证（决策行组 / 需求组），每条主张到 `文件:行` 或命令输出落实证据；不采信会话记忆

---

## 1. 决策行层（D1–D8）核验结论

| 决策 | 主张 | 核验 | 证据 |
|---|---|---|---|
| D1 分层 + X7 逻辑重构 | 记录刷新单源 / 无 `_instance` hack / 无轮询 / 32 键注册表 | **真**（但曾失实两处，见 §2） | `shared/composables/use-record-refresh.ts:39`；`pages/detail/App.vue:54`、`pages/game-detail/App.vue:28`；全仓 `app._instance` / `__ummDismissDetailMask` / `exposeDismiss` **0 命中**；`main.ts:60` 32 键 |
| D2 全量 Vapor | 106 SFC vapor + 互操作插件各根一次 | **真** | `grep -l '<template vapor>'` = 106（overlay 44 + SPA 62）；注册点 `overlay/mount-app.ts:77`、`popup/main.ts:15`、`options/main.ts:15` |
| D3 RC + overrides | vue `3.6.0-rc.9` | **真**（计数曾错） | `package.json` overrides 实数 **12** 项 |
| D4 双轨 | main 冻结 | **真** | `main` 末次提交 = 5.17.2 发布 chore；工作全在 `dev-2026-09-25` |
| D5 契约冻结 | 33 消息 + schema + 令牌/dimmer | **真**（版本曾滞后） | `contract-freeze.spec.ts` 20 例运行通过；代码 `DB_VERSION = 15`（`schema.ts:11`），文档曾写 v14 |
| D6 七层 + 守卫 | arch/naming 守卫 exit 0 | **真** | `check-architecture.cjs` / `check-naming.cjs` / `check-design-tokens.cjs` 各 exit 0 |
| D7 前缀统一 | `--usl-`/`--sht-` 清零 + 裸选择器收口 | **真** | 残留计数 0；`scope:check` PASS；`style.css:2` `@import 'tailwindcss' prefix(umm)` |
| D8 工具链 | oxlint 零告警 + Oxfmt 全仓 | **真** | `.oxlintrc.json` / `.oxfmtrc.json`；未采纳 vite-plus 本体与调研结论一致 |

## 2. 「假完成」证据（已全部修正，**Fact**）

1. **「>600 行文件 6 → 0」为假**——实测 **7 个 src + 1 个 spec** 超线（`models.ts` 698 / `video-overlay.ts` 677 / `OverviewTab.vue` 668 / `sehuatang-controls.ts` 635 / `mukaku/handler.ts` 631 / `webdav.ts` 631 / `doulist-replace.ts` 623 / `sehuatang-controls.spec.ts` 1040）。根因：**一次性清理无门禁**，故一个波次内反弹 → **Decision**：新增 `size:check` 棘轮门禁（≤600 行，基线只降不升，达标未删亦报错），入 CI Static Gates；8 项全部按职责缝拆分，基线清空
2. **D5 schema 版本滞后**：文档 v14 vs 代码 v15（`a46ddad` 加 avId 索引）→ 已在 ADR 注记演进
3. **overrides 计数错**：11 → 实际 12
4. **D1 证据计数错 + 状态过期**：用例数与 `test:unit` 通过数滞后；`exposeDismiss` 已删但仍写「留待裁决」

## 3. 需求层（14 项）核验结论

| # | 需求 | 判定 | 关键证据 / 缺口 |
|---|---|---|---|
| 1 | UI 统一 | **部分达成** | 23 组件库在 `libraries/ui/`，但仅 SPA 消费；`scenario/` + `entrypoints/content` 对 `@/libraries/ui`/`@/feature` **0 引用**（overlay 为自研 `Umm*` + TS 样式常量）。令牌层已统一（ds:check） |
| 2 | 函数梳理 | **部分达成** | `sleep`/`dateKey` 等已单源（`libraries/utils/index.ts:81,88`）；**Gap**：toast 渲染栈 4 份、`debouncedQuery` 在 `LinkedTab.vue:322` 与 `RatingTab.vue:299` 各一份 |
| 3 | TS 全覆盖 | **达成** | 活体 `as any`/`@ts-ignore` = **0**（唯一命中为注释）；`noUncheckedIndexedAccess` 开启 |
| 4 | 大数据性能 | **达成** | v15 索引 + 游标驱逐（`a46ddad`）；`record-query.ts` 分页；X1 全表扫描清零 |
| 5 | 全场景交互反馈 | **部分达成** | 已接：sehuatang app（`app.ts:207,234`）、WebDAV tab、ConfirmDialog；**Gap**：`LinkedTab` 查询失败被吞（仅文本态）、doulist 对话框零反馈通道、`app.ts:126` 裸 `.catch(() =>` |
| 6 | 颗粒度动效 | **达成** | `3404acb`：后代通配过渡收窄、纯 opacity 挂载淡入、reduced-motion 兜底、`transition: all` 清零 + 门禁 spec |
| 7 | Vapor / vite-plus | **达成（Vapor）+ 已裁决不采纳（vite-plus）** | Vapor 106 SFC 落地；vite-plus 全仓 **0 引用**——两轮调研定论（WXT/Vite 轨道不兼容），属**记录在案的决策**而非遗漏 |
| 8 | 按需减包 | **部分达成** | 动态 import 已落地（`options/router.ts:13-38`、32 页 `config.ts`）；**Gap**：`douban-main.js` 仍 **852 kB**（WXT 内容脚本打包把 32 个懒页内联为单文件） |
| 9 | 七层 + provider 内部分层 | **部分达成** | 七层由 arch:check 强制；**Gap**：四 provider 内部扁平（`webdav/api.ts` 248 / `neodb/api.ts` 250 / `sehuatang-cache/models.ts` 212 / adult-av 三件），无 transport / mapping / test-seam 分层 |
| 10 | 禁大文件 | **达成** | 现最大 `pages/detail/App.vue` 595 行 + `size:check` 门禁持续防护 |
| 11 | Tailwind v4 + umm 前缀 | **达成（含设计豁免）** | `@tailwindcss/vite` + 单一 `style.css` 前缀 `umm`；Shadow DOM 侧对偶块为有意设计（`style.css:14-16`），由 ds/scope 门禁约束 |
| 12/13 | 先记忆 / 多智能体 | **流程达成** | `.um.agents/memory/` 波次记录 + `docs/audit/` 14 份产物；X1–X10 波均并行分派 |
| 14 | 测试与门禁证据链 | **达成（单元/模拟），交互层本波补齐** | `tests/unit` 122 文件 / ~1347 用例；**Gap**：`tests/e2e/` 与 `playwright.e2e.config.ts` 此前不存在 → X9-C 建真实扩展 E2E（`--load-extension` + 路由拦截伪造豆瓣页） |

## 4. 缺口处置登记

| 缺口 | 处置 | 波次 |
|---|---|---|
| 8 项 >600 文件无门禁 | 拆分 + `size:check` 棘轮进门禁/CI | X9-A（已完成） |
| 6 处一次性大批量 DOM 写入 | 共享基元 `runChunked` 接入 + 读写相位分离 + 防抖/Fragment | X9-B（已完成） |
| 11 个环境性测试失败（`.localref` 机器依赖） | 合成豆瓣同构夹具仓库化，断言零删除 → **1335 passed / 0 failed** | X9（已完成） |
| 交互/登录页无真实浏览器测试 | 扩展级 E2E + 路由本地模拟页 | X9-C（进行中） |
| provider 内部扁平（需求 9） | transport / mapping / index 缝统一 + 纯函数补测 | X10-A（已完成：42 例纯函数测，四包统一三件套） |
| `debouncedQuery` 重复 + 吞错反馈（需求 2/5） | 单源 composable + 复用既有 toast 反馈通道 | X10-B（已完成：16 例；两处吞错 catch 改走 toast + 清 hasQueryed） |
| toast 契约三处复制（需求 2/5） | a11y 契约单源模块（渲染器按运行时差异**不合并**，循 D7「同名≠同构」裁决） | X10-C（已完成：`@/libraries/toast-aria` + 6 例；顺带修掉两处「非 error 也 role=alert」的真实缺陷） |
| 33/38 提取模块零单测（约 5,930 行） | 合成分页夹具 + JSDOM 行为锁定，六批次并行 | X11（进行中） |
| 14 处「唯一事实源」注释指向已迁移掉的旧路径 | 全部修正 + `doc:check` 门禁（含 `--self-test`）进门禁/CI | X10 回访（已完成，见 §6） |
| 需求 1 overlay 不消费组件库 | **不强行合并**：Shadow DOM + Vapor 约束下自研 `Umm*` 为既有设计；统一发生在令牌与 a11y 契约层。若要真正合并需独立波次（DOM 契约对照 + 视觉基准），先例见 D7 徽章裁决 | 未排期（**Decision 待定**） |
| 需求 8 `douban-main` 852 kB | 根因是 WXT 内容脚本单文件打包，非懒加载缺失；可行方向 = 图标改内联 SVG 消除 VDOM 运行时（约 −94 kB），属独立体积决策 | 未排期（**Decision 待定**） |

## 5. 第二轮回访（X10 完成后，逐条自测取证）

| # | 回访项 | 结论 | 证据（本机实测） |
|---|---|---|---|
| 1 | 提取层是否真被测到 | **未测面被高估为已覆盖** | 38 个 `*-data.ts` / `*-extract.ts` 中 **33 个零单测引用**（≈5,930 行解析逻辑），此前无任何计量。共享层（douban-extract / parse-douban-paginator）确已覆盖，缺的是逐页选择器契约 → 立 X11 覆盖波 |
| 2 | 注释里的「唯一事实源」指针是否仍可解析 | **14 处死指针，已全清并门禁化** | L1 迁移后 `src/shared/*`、`src/content/*`、`src/features/*` 旧路径仍写在注释里；新增 `scripts/check-doc-paths.cjs`：51 处指针 **0 失配**，`--self-test` 4/4（含 glob 不误判、豁免脚本）；`doc:check` 进 package.json + CI Static Gates + AGENTS.md，门禁由十升为**十一** |
| 3 | 三层令牌是否真的单源 | **无漂移（非问题）** | `tokens.static.css`(146) ↔ douban Tier-2(66) 同名变量交集 **0 值差异**；Tier-2 全为 `var(--umm-static-*)` 别名零字面量，Tier-3 JS 由 ds:check 对齐 → 需求 11「统一 CSS」在令牌层成立 |
| 4 | 大列表渲染是否仍有集中运算 | **SPA 侧有界（非问题）** | options/popup/feature 19 处 `v-for` 全为有界集合（热力图 52×7、平台×类型、按日 items），无需虚拟化 |
| 5 | `adult-av` 三处 `getAll` 全表扫描 | **语义必需，登记为决策项不静默改** | 三处分别是「列全部番号 / 三段计数 / 已看后缀集合」。番号三表在 v15 已补 `avId` 索引（ADULT_AV_CHECK L2 的全表扫描即由此消除），但**没有 `status` 索引**，按 status>=2 计数无法走索引；改造 = v16 `createIndex` + 存量回填（blast radius 触及已发布用户数据），且仅由 options 面板按需触发、非每帧热路径 → 不擅自做 |
| 6 | 需求 1「overlay 消费组件库」的真实障碍 | **架构分歧，非疏漏** | `dist/.../douban-main.css` 内 Tailwind 工具类 **0 处**；44 个 overlay SFC 全为 `<template vapor>`，**0 个** import reka-ui / `@/libraries/ui`。合并前置条件 = 影子根注入 Tailwind 运行时表（体积 + 宿主级联风险）或组件层 Vapor 重写 |
| 7 | 需求 8 包体数字 | **旧数需更新** | 本次构建实测 `douban-main.js` = **871,414 B**（此前文档记 852 kB），lucide 导入点 13 处 |

| 8 | 测试覆盖面的真实计量（此前从未量化） | **35% 的 src 模块零测试引用** | 可复现扫描：`src` 下 259 个 `.ts` 模块（排除 `.d.ts`/index/types/config/constants）中 **91 个（35.1%）从未出现在任何测试源文件里**。分布：`scenario/douban/pages/*` 31（= 需求 14 的提取层，X11 六批并行清）、`engine/database` 6（**恰是 X9-A 机械拆分产物，拆分零漂移此前无证明**）、`content/ui` 8、`douban/components` 6、`libraries/utils` 5（含 XSS 边界 `escape-html.ts` 与 X7 缺陷修复点 `event-bus.ts`）、`data-scheduler` 2（限流/重试纯策略）、`feature/composables` 3、其余零散 → X12 第二梯队 |
| 9 | 「新模块必须被测」仍是人工约定 | **须棘轮门禁化** | 循 §6 信条：指标定义 = 引用级孤儿（非行覆盖率），基线只可缩小；在 X11/X12 落债后一次性生成基线并接 `package.json` + CI + AGENTS.md |

## 6. 复核信条

> 状态表的 ✅ 只记录「当时结论」，不记录「持续条件」。凡靠人工遵守的约定（尺寸、单源、作用域）都必须门禁化，否则一个波次即反弹——本轮 8 项超线文件全部在**上一次「清零」之后**产生，就是这条教训的直接证据。

## 7. 第三轮回访（X11–X13 完成后，合并取证）

前两轮各波只报「自家测试全绿」，从未一起跑过。本轮把 207 个 unit spec 与全部十一门禁**合并复跑**，并对「跨进程契约」做首次真实取证。

| # | 回访项 | 结论 | 证据（本机实测） |
|---|---|---|---|
| 1 | ADR-015「写库 → 注入 UI 实时刷新」是否真的在跑 | **此前全程死特性，已修复** | MV3 语义：Service Worker 的 `chrome.runtime.sendMessage` 只投递给**扩展页面**，内容脚本永远收不到。单腿广播 → douban 徽章 / PT 淡化 / mukaku 的订阅者从未被触发。首条红灯来自 e2e（`book-home-live-refresh`），**44 个相关单测全部绿灯**——证明「跨进程消息通道契约」不可能由单测证明。修复为 runtime + `chrome.tabs.sendMessage` 双腿，e2e 4/5 → 5/5（9.5s） |
| 2 | 单测合并跑是否等价于各波分别跑 | **不等价：全局桩会跨文件污染** | 合并首跑 2272 passed / **7 failed** / 12 did not run，而在隔离跑中这 7 例全绿。根因是修复引入的 `chrome.tabs` 裸引用在**无 `chrome` 绑定**的 Node 侧 spec（直接 import background handler）抛 `ReferenceError`，async 内变成 unhandled rejection，把同 worker 后续无关 spec 一起拖红。改经 `globalThis` 取柄后合并复跑 **2292 passed / 0 failed**，`event-bus.spec.ts` 补第 15 例把该契约钉住 |
| 3 | 格式化门禁是否覆盖不该覆盖的东西 | **夹具必须出局** | `format:check` 首跑 exit 1，28 个 `tests/fixtures/**/*.html` 报待格式化。这些是爬取 DOM 的字节忠实夹具，元素间空白参与文本节点断言，格式化会改变渲染文本并制造假失败。新增 `.oxfmtignore` + `format` / `format:check` 双 `--ignore-path`（保留 `.gitignore` 语义），exit 0，771 文件仍受管 |
| 4 | 分片写入是否真的挡住集中运算 | **有界，且断言未放宽** | 200 行 NexusPHP 列表真实扩展内跑：PerformanceObserver `longtask` **0 次 / max=0ms / >50ms 0 次**；分片清除 200 个 resolved 标记观测到 `160,120,100,80,60,40,20` 的逐帧衰减（24 个采样刻度）。`CLEAR_CHUNK_SIZE=20` 的路径由真实 `IMPORT_DATA`（`key:'*'` 生产者）驱动，非夹具伪造 |
| 5 | 显式 `any` 是否仍在文档承诺之外 | **src 内 25 处真实 `any`（另 6 处仅在注释提及），X14 清零 + 门禁化** | 逐行清点：`engine/migration/models.ts` 8、`pt/dimmer`+`pt/types` 8、`libraries/utils/{logger,index}` 6、`provider/neodb/mapping.ts` 2、`ImportExportTab.vue` 1；测试侧另有 6。AGENTS.md 的「禁止 `as any`」至今无人行使闸门 |
| 6 | 零覆盖模块是否反弹 | **由 91 → 待棘轮重算，并门禁化** | X11/X12 补 ~90 spec 后，孤儿计量改由 `scripts/check-orphan-tests.cjs` 承担：基线 JSON 只可缩小、新增不可测模块即 exit 1 |
| 7 | 包体数字（滚动更新） | **872,620 B / 2,140,805 B** | 本次构建产物 mtime `2026-09-27 04:17`：`content-scripts/douban-main.js` 872,620 B，`dist/chrome-mv3` 全量 2,140,805 B。§5-7 的 871,414 B 与更早的「852 kB」均为历史快照 |

### 由此固化的两条复核规则

1. **跨进程契约（消息通道、注入边界、扩展生命周期）必须有一条 `tests/e2e` 断言**，单测绿灯不能替代——本轮回访中唯一的 P0 缺陷恰好藏在 44 个绿灯单测背后。
2. **波次自测不算完成**；只有「全量 unit + 全量 e2e + 十一门禁在同一次仓库级复跑中同时为绿」才写回状态表，且必须留 exit code 与产物 mtime 两条磁盘证据。

## 8. 第四轮回访（X14–X18 完成后，审查组交叉取证）

本轮换了取证方式：不再由「写完代码的代理自报全绿」，而是派**独立只读审查组**（R1–R4）按五轴反查已声明完成的波次，并把结论逐条拿去复测。结果是**三项此前被认为已收口的东西被推翻**，并暴露出一条此前无人测量的门禁盲区。

| # | 回访项 | 结论 | 证据（磁盘 / 复测） |
|---|---|---|---|
| 1 | 「十一门禁」是否真能挡住它声称挡住的东西 | **部分 fail-open，R4 逐条列出** | 审查发现：`any:check` 不扫 `<template>` 表达式与 `tests/**/*.vue`；`orphan:check` 把「仅被再导出的桶文件」计为已覆盖，且**删除模块也会让基线变小**（清理被误奖励为改进）；`naming:check` 不扫 `tests/`；`arch:check` 残留一条 `features/`→`feature/` 的死规则；`i18n` 在 CI 跑非 strict 档。这些不是「有 bug」而是**门禁计量口径与声明不一致**——收口声明的可信度必须逐门禁核验 |
| 2 | 单测「全绿」是否等于可重复 | **不等于：CI 配置在掩盖顺序依赖** | CI 用 `workers:1` + `retries:2`。模块作用域改写 `globalThis` 的 spec 在同一 worker 内污染后继文件；被污染而失败的那一例随后在**全新 worker 进程**中重试并通过 ⇒ 构建绿灯，缺陷永不可见。第三轮 §7-2 已见过同型问题（2272 passed / 7 failed 合并首跑），当时按个案修，未门禁化 |
| 3 | 泄漏面到底多大 | **76 个 spec 无还原写入（正则清点曾报 55，漏 21）** | 新增第 14 道门禁 `isolation:check`（`scripts/check-test-globals.cjs`，TS-AST 而非正则）：实测 **224 spec 扫描 / 90 文件改写测试全局 / 76 无还原泄漏**。`--self-test` 7 夹具双向自检（2 类泄漏必捕、3 类干净必不误报、只读与自有对象 `defineProperty` 不误报）exit 0；仓库外探针证实真咬。第 3 次印证「**正则清点不是门禁**」 |
| 4 | ADR-015 文档表述是否仍与其纠正后的实现一致 | **不一致，已就地更正三处** | §2.3 原写「跨 tab 生效」并据此解释——而 MV3 下 SW 的 runtime 消息根本不投递给内容脚本，这正是本 ADR 自己记录的 P0 根因。补「原表述有误，2026-09-26 回访更正」并写明双腿语义；§3.1 风险行改列「漏第二条腿即静默失效（实测踩中）」；§2.5 追记「44 个绿灯单测背后藏着一条完全不通的事件通道；组件卸载/取消订阅生命周期仍无专项测试」。更正后 `doc:check` exit 0（60 处指针全部可解析） |
| 5 | 「写库 → 注入 UI 刷新」的代价是否被测量过 | **否，本轮首次量化** | 单次 `DB_PUT` 发 1 条广播；`DB_SYNC`（`db.ts:227`）另加**每个 linked 平台 1 条**（`:238` 循环）⇒ 1+L 条。每条广播付一次 `tabs.query({})` + 每开一个 tab 一次 `sendMessage`。接收侧不对称：PT 淡化有 300ms 尾沿去抖（`dimmer/index.ts:257`）会把同批事件并成一次重算，**`use-record-cache.ts:52-62` 完全没有去抖**，且 `key` 缺失/通配即 `load(true)` ⇒ 全表 `dbGetAll` 重扫。这正是需求 13「避免集中运算」的剩余面，由 X22-B 处置 |
| 6 | 事件通道是否存在死链路 | **存在，两条，已登记为裁决项未擅删** | `EventType` 四事件实测：`settings:changed` **零生产者 + 零订阅者**；`sync:completed` **四个生产者**（`adult-av.ts:232`、`data.ts:234`、`webdav-sync.ts:263`、`webdav.ts:203`）**零订阅者**。即每次批量同步/导入/恢复都向全 tab 白播一次无人接收的消息。删除等于砍掉一条对外可见的通知通道（且需求 6 可能正要用它做跨页反馈），属契约裁决而非死码清理 ⇒ 入「悬置决策」表待人工定夺 |
| 7 | 上一轮 `tv::` 孤儿键的「证伪」是否成立 | **证伪被推翻，判定为真缺陷（Critical），修复在途** | R2 反证：`RatingTab.vue:91` 的 `type = selectedDomain` 使写入侧可产出 `tv::<id>`，而读取侧按 `movie` 前缀过滤 ⇒ 该批记录对读取路径永久不可见。**不做用户数据迁移**（改既有键语义属用户数据变更，须人工裁决），X22-A 按「先 RED 复现 → 修生产者 → 读取侧廉价容错」执行，并同时裁定 `query-utils.ts:101` 的 `hasMore` 判定 |
| 8 | 文档承诺的文件路径是否还存在 | **否，AGENTS.md 引 6 处陈旧 PascalCase 路径** | `StoreRecord.ts`/`RecordService.ts`/`Identity.ts`/`Platform.ts`/`MediaType.ts` 与 `extract-risk.ts` 均已 kebab 化（磁盘为 `store-record.ts`、`record-service.ts`、`identity.ts`、`platform.ts`、`media-type.ts`、`risk-extract.ts`）。讽刺点是 `naming:check` 本身就会判这些名字违规——**门禁只管 `src`/`tests` 内的注释指针，文档整体不在扫描范围内**（`check-doc-paths.cjs:12` 明示「docs/ 下的 ADR/审计不扫描：历史决策文档按当时路径书写属正确」，`SCAN_DIRS=['src','tests']`）。已改正并复跑 `doc:check` exit 0 |

### 本轮新增的三条复核规则

3. **门禁的计量口径必须与它的宣传语一致**：一条「已覆盖」的判定若把再导出桶算作覆盖、或让删除模块也能缩小基线，那它给出的是清洁感而非清洁度。
4. **重试配置会掩盖顺序依赖**：任何依赖 worker 隔离性的绿灯，都应在 `retries:0` 下复现一次才算可重复。
5. **代理事实源必须与门禁同源**：`doc:check` 只校验 `src`/`tests` 内的注释指针，`docs/` 下 ADR 按当时路径书写属正确而**有意豁免**——但 `AGENTS.md` 是每个代理会话开头就被注入的**现行**事实源，性质等同源码契约而非历史记录，如今却与 ADR 一起落在豁免区内，本轮 6 处陈旧路径正是它腐烂的证据。处置：把 `AGENTS.md`（及 ADR-026 这类「仍然活着」的决策文档）纳入路径解析，属 X23 门禁硬化项；**不得**为了让门禁变绿而批量改写已定版 ADR 的历史路径。

## 9. 第五轮回访（R3 入口层审查 + X17-B e2e 恢复 + X19 隔离修复完成后）

| # | 回访问题 | 结论 | 证据与处置 |
|---|---|---|---|
| 1 | 「77 个入口文件是否真的逐一看过」 | **是，且高危结论全部经主线独立复核为真** | R3 交回逐文件裁决表（77/77，无抽样无跳档）。主线**不复述代理叙事**，改为逐条读码复核其 1 Critical + 3 High + 2 条安全 Medium：`download.ts:29-37`、`neodb-push.ts:227/251/280/337/341`、`RatingTab.vue:350-354` vs `:214-216`、`data.ts:47` 与 `webdav-restore.ts:78-86` ⇒ **六条全为真**，方开修复波 |
| 2 | 宿主页面数据能否在宿主 principal 下执行 | **能（Critical，已修）** | `download.ts` 的 `catch` 分支把 `a.href = url; a.click()` 注入 `world: 'MAIN'`，而 `url` 全链无校验：`photos-data.ts:95-127` 抓宿主 `img[src]`/`data-src` → `PhotoItem.src` → `App.vue:121-139` 发消息 → `background.ts:481` → `handleDownloadFile:46` 只判真值。`javascript:` 即可在豆瓣页面执行。X26-A 在入口加 `isSafeDownloadUrl()` 只放行 http(s)，非法协议不注入；anchor 兜底对 http(s) 语义原样保留（它是 Referer 门控 CDN 的既有行为，不在本波收窄） |
| 3 | 一次性操作失败后 UI 是否可自恢复 | **否，两处同类（High）** | ①`neodb-push.ts` 的 `restoreBtns()` 只在 `:337`/`:341` 调用，而缺 token（`:251`）与后台超时（`:280`）两条早退路径直接 `return` ⇒ 推送按钮永久 `disabled + opacity:0.5`，非刷新不可恢复；②`event-bus` 之外新发现一整类：**一次性后台读取静默降级后永久缓存**——`provider/adult-av/transport.ts:56-66` 吞错返回空集、`:77-85` 返回全零，`scenario/sehuatang/app.ts:119-124` 把这些零值当权威缓存，`:126` 的重试分支因 provider 从不重抛而**不可达**；`content/ui/bilibili-listing.ts:401-403` 同一类。两条真实浏览器 e2e 因此仍为红（列表统计停在 `["0","0","0"]`、暗化计数 0/4；bilibili 卡片 `Expected 30, Received 0`）。处置：X26-D 修「降级必须可与真相区分，且失败不得入缓存」，主线不以「负载导致」结案 |
| 4 | 生命周期泄漏是个案还是根因 | **根因：路由层无 teardown 契约** | `content/router.ts` 只给 PT dimmer 做 unmatch 清理，其余 handler 各自持有资源 ⇒ 同一根因长出 8 项症状（IMDb body 级观察者无清理、TMDB 观察者+2s 轮询仅 `beforeunload`、JavDB 模块级 `observer` 被覆写不 disconnect、bilibili/youtube homepage 的 waiting 观察者闭包局部不可达、`later()` 句柄不入册、`video-overlay` 内部 3s 定时器不被 `cleanup/destroy` 取消）。X26-C 落 `RouteDisposer` 契约（`:220-245`  disposer 先于下一 handler 运行 + `dispatchSeq` 防重叠），并配 `x26c-router-teardown.spec.ts`（4 例，含「PT dimmer 单例仍被释放＝既有行为不回退」） |
| 5 | 「playwright 实际全面的交互测试」这一需求条款是否成立 | **不成立（口径首次量化）** | 实测分母：`css-composer.ts` 注册 **35** 个页面 preset、`pages/` 下 **32** 个 `definePageMount` 配置；分子：`tests/e2e/` 仅 **11** 份 spec，且全目录出现的 overlay id 只有 **2** 个。即真实浏览器交互覆盖面是页面类型的少数。登记 X27：按「页面类型 × 是否有真实交互断言 × 是否已有登录态本地夹具」矩阵补齐，禁止为凑计数写空断言 |
| 6 | 修复泄漏的机制自身是否也需要复查 | **是：新机制有两处 fail-open** | `tests/unit/helpers/global-sandbox.ts` 的 per-file 归属靠 `test.info().file` 或错误栈里找 `*.spec.ts` 帧；**归因失败时 `install()` 照样写 `globalThis` 但不入 scope** ⇒ 静默泄漏（该响亮失败）。更隐蔽的一处：若文件 B 在文件 A 的桩仍活着时于模块作用域装同名键，B 记录的 `prev` 是 **A 的桩**而非真原值，而 A 的 `afterAll` 因身份校验失配不再撤销 ⇒ A 的桩永久遗留（链式遮蔽）。实测并不成立＝34 份 spec 正序/逆序/重分组/洗牌多轮 390 例全绿，故列为 X23 ⑩/⑪ 的门禁化项而非返工 |
| 7 | 审查代理会不会漏掉「测试面」的口径 | **会，且漏在三个方向** | R3 静态统计：`tests/` 只 import **23/77** 个入口模块；四个 `content/i18n/locales/*` 的 136 键对等**无任何测试**（须人工逐值 diff 才能确认）；`contract-freeze.spec.ts:128-141` 只在**编译期**锁四张消息表，`background.ts` 的 `switch` 路由（第四处）与三条 switch 前预分支**零运行时断言**——重排即静默落入 `default`。处置：并入 X27/X23 断言面 |
| 8 | 凭据在备份里的暴露面是否对称 | **不对称，属契约裁决非清理** | WebDAV 三凭据走 `includeWebDAVCredentials` 显式 opt-in（`data.ts:108-117`），而 `neodbToken` 直接列在 `EXPORT_SETTINGS_KEYS:47` ⇒ 每个备份文件明文含豆瓣外推凭据，导入侧 `IMPORT_SETTINGS_KEYS = new Set(EXPORT_SETTINGS_KEYS)` 又无门控地回写。收窄会改变既有备份的可恢复性（用户数据面），**本波不动**，入悬置决策表 |
| 9 | 上一轮「14 门禁全绿」是否与 CI 实际一致 | **一致（本轮复核）** | `.github/workflows/ci.yml` 的 `Static Gates` 实跑 12 项（arch/ds/scope/naming/size/doc/orphan/any/isolation/format/i18n + 前置 typecheck），`Build` `needs: [typecheck, static-gates, unit-tests]`；本轮本地复跑 type-check exit 0、lint exit 0（747 文件 0 告警）、isolation exit 0、doc exit 0（61 指针）。基线仍「可缩 66」，须合并复跑后统一 `--baseline` 锁定 |

### 本轮新增的三条复核规则

6. **修复引入的机制与被修缺陷同等复查**：隔离 helper 的自愈/归属设计解决了泄漏，但其自身两处 fail-open（归因失败不响亮、`prev` 链式遮蔽）只有把新机制当作缺陷对象才看得见。任何「基础设施类」修复都要单独走一遍口径核验。
7. **覆盖面按需求对象计数，不按测试文件数**：e2e 的分母是页面类型/用户可交互对象，不是 spec 文件个数——否则 11 份文件也会被读成「已有 e2e」。
8. **代理报告里的每条行号断言，落地前由主线读码复核**：本轮 9 条高危结论复核后全部为真，但同期修复代理新引入了一条绕过 debug 门禁的 `console.warn`（`imdb.ts:220`，已由主线改 `warnLog`）——写码代理与审码代理一样会引入回归，「谁写的」不构成免检理由。

## 10. 第六轮回访（R7 e2e 审查 + X26-B 收口完成后）

| # | 复核问题 | 结论 | 证据与处置 |
|---|---|---|---|
| 1 | 第五轮自己写下的分母是否算对 | **否，两处口径错误（主线自纠）** | 第五轮行 5 记「**35** 个 preset / overlay id 只有 **2** 个」。本轮重数：`sed -n '/PAGE_CSS_PRESETS/,/^};/p' \| grep -cE "^  [a-zA-Z'\"-]+: \\{"` = **33**；被驱动的应用级 shadow host 实为 **3** 个（`#umm-detail-mask`/`#umm-douban-overlay`/`#umm-sht-overlay`），2 是把口径误设为「id 字面含 `overlay`」的结果（另两个命中项 `#umm-global-styles`/`#umm-bili-homepage-styles` 是样式节点不是应用根）。33≠32 也已解释：`video` preset 复用 `trailer` 页面分块。**旧行保留不删**，仅在 §3/ADR 侧就地更正——审计记录的价值在于错误可见 |
| 2 | 「有 11 份 e2e」是否等于「有真实交互」 | **按页面类型：Douban 仅 2/33 有 e2e，31 个为零** | detail（点击→`/j/` POST→SW IndexedDB→广播→overlay 与 popup 双端刷新）与 book-homepage（外部 `DB_PUT`→不重载翻牌）两条是真契约；其余 31 类（search / 全部 profile / doulist / review / collect / game / music / photos / trailer / genre / series / artists…）只有 jsdom 级 extract 单测，**零真实浏览器覆盖**。X27 分母改为按此矩阵逐类补齐并禁止空断言凑数 |
| 3 | e2e 夹具是否可信（本轮最重要的新缺陷类） | **夹具是循环论证：由被测解析器反推生成** | 每份夹具的选择器与生产查询**逐条相同**（Douban detail 的 `#content h1 [property=v:itemreviewed]`/`.rating_num`/`input[name=ck]` 一一对应 `detail-extract.ts:33-84`；PT/Sehuatang/Bangumi/Bilibili 同）。夹具头部自述「verified against `*-extract.ts`, not invented」＝**自证**。`.localref/` 现存只有 4 份真实 Bilibili 页面存档，豆瓣/IMDb/Bangumi/PT/Sehuatang **无任何真实抓取**。后果：站点 DOM 漂移时 11 份 spec 可全绿。处置：X27 必带「真实页面存档 → 夹具」的生成/比对路径，且解析器契约测试须至少一份由外部来源（真实存档）驱动 |
| 4 | 掉帧门禁是否真在度量卡顿 | **否，两处可空过（High）** | `overlay-probe.ts:223-232` 的 `PerformanceObserver` 初始化 `catch` 后返回空表，而 `pt-dimmer-live-refresh.spec.ts:181-188`、`bilibili-homepage-chunked.spec.ts:169-171` 只断言 `max(duration) ≤ 200ms`、**不断言 `tasks.length ≥ 1`** ⇒ 观察者未安装即绿灯；且 200 ms ≈ 丢 12 帧，`>50ms` 计数已在 `pt:182-187` 算出却从未被断言。真正的非同步性证据反而是 5 ms 采样器的「中间态必须可见」断言（`bilibili:148-166`、`pt:248-275`）。处置：X23 加「长任务断言必须自证观察者已安装」+ 收紧阈值并断言已算出的 `over50` |
| 5 | 在途写者是否会污染只读审查结论 | **会，本轮实测发生（新增规则 9）** | R7 判定「一次性降级永久缓存」为 **REFUTED**，理由是 `transport.ts:56-58` 返回 `ok:false`、`background-reads.ts:117-129` 只缓存 `ok` 结果。但主线核查 mtime：`src/provider/adult-av/transport.ts` **09-27 06:55**、`src/scenario/sehuatang/background-reads.ts` **06:57**，均为**在途 X26-D 正在写入**的产物（两文件 `git status` = `??` 未跟踪）。即 R7 读到的是**修复后**的代码，其「证伪」是读取时刻的假象而非对缺陷的否定；缺陷原判据是 X17-B 的**真实红点运行**（统计 `["0","0","0"]`、bilibili `Expected 30, Received 0`）。处置：R7 关于该项的 verdict 作废，改由 X26-D 落地后以 e2e 复跑重新判定；同时把「读码复核」升级为「**读码复核须在冻结树上，或报告内标注读取时刻 + 当时在途写者**」 |
| 6 | X26-B 的结是否属实 | **属实（主线重跑核验）** | 读码确认：`record-input-parser.ts`（275 行纯函数）成立且 arch 规则 C 的位置裁决正确；`RatingTab.vue:159` 与 `LinkedTab.vue:63/:77` 均以 `!parsed.valid` 拒写；`common.wish` 三处翻正（`RatingTab.vue:58/:66`、`LinkedTab.vue:227`）；`WebDAVTab.vue` `as string` 计数 **0**；SettingsTab 改 `saveTimers: Map<SaveSlot, …>` + `onUnmounted` 冲刷。`type: 'video'` 与 `${lp}_records` 经 `git show HEAD:` 对照确认为**旧代码既有**、非新引入分裂。测试重跑：`options-tabs-parse` + `x26b-settings-save-race` + 相邻既有两批 = **53 passed / exit 0**；`any:check`（730 文件 0 any）、`size:check`（≤600 基线 0）、`naming:check`（479 文件）exit 0 |
| 7 | X26-B 声称的「行为变更」是否需另行裁决 | **不需，但必须入档** | LinkedTab 裸数字 ID 不再无条件猜豆瓣，改为尊重所选平台。核验依据：`auto-detect.spec.ts:62/:68` 已把「plain numeric ID 不自动判为豆瓣＝尊重当前平台」写成既有契约，且 `LinkedTab.vue:182` 的输入 watch 先跑 `autoDetectPlatform` 纠偏；旧行为（静默改写用户的平台选择）才是分裂方。**残余风险披露**：用户在 TMDB 下粘贴豆瓣纯数字 ID，旧显豆瓣记录、今显「无记录」——属可感知 UX 变化，X27 应以 e2e 钉住新语义 |

### 本轮新增的复核规则

9. **只读审查必须声明其读取时刻的树状态**：多代理并发时，审查代理读到的是「修复后」还是「修复前」取决于秒级 mtime；对「缺陷是否成立」的 verdict 若不带时间戳与在途写者清单，就会把「已被并行修复」误报成「当初不存在」（本轮 R7 对 X26-D 目标项即发生此类）。判据优先级：**真实运行红点日志 > 代码文本**。
10. **夹具的独立性要单独审计**：与被测选择器同源生成的夹具只能证明自洽，不能证明对真实站点的保真——「全部绿灯」在这种夹具下是预期结果而非证据。

## 11. 第六轮回访续（R5a + R6：`tests/unit` 132 份 spec 逐份读码诚实性审查）

审查面：`tests/unit/[a-d]*`（62 份，R5a）+ `tests/unit/[e-p]*`（70 份，R6）。两组的代表项均由主线读码复核，未采信叙述文本。

| # | 复核问题 | 结论 | 证据与处置 |
|---|---|---|---|
| 1 | 第五轮所记「90 文件写全局 / 76 无还原」是否为真 | **否，系统性低报（主线自纠）** | `scripts/check-test-globals.cjs:38` 的 `GLOBAL_OBJECTS = new Set(['globalThis','global','window','self'])` 只匹配**字面根名、无别名跟踪** ⇒ `const g = globalThis as …; g.indexedDB = …` 对门禁完全隐形。AST 探针（temp 脚本，**仅计量非门禁**）实测：**15 份 spec / 41 条别名写入，0 份在 76 条基线内**（`adult-av-index-migration`/`bulk-ops`/`db-connection`/`db-migrate-branches`/`db-migration`/`download-handler`/`get-watched-ids-characterization`/`pt-dimmer-row-memo`/`pt-id-cache`/`query-utils`/`record-query`/`record-store`/`sehuatang-controls`/`sehuatang-render`/`x26a-download-url-scheme`）。棘轮宣称的「只可缩小」在盲区上不成立。处置：X23 ⑧ 由「收紧探测器」升级为「**探测器口径缺陷＝headline 数字虚高安全，基线须按 ≥91 重述**」 |
| 2 | 「测试名 = 测试内容」是否成立 | **否，2 例 Critical（假覆盖）** | ①`bilibili-listing-layout.spec.ts:274` 标题声称测 `runListingDimmerPass`，体内注释自述「Inline minimal pass (mirrors runListingDimmerPass)」并在 `page.evaluate` 重写一份生产逻辑，断言打在副本上 ⇒ 生产改动永不翻红（真函数另有 `bilibili-listing.spec.ts` 覆盖，故属**假覆盖标记**而非真空洞）；②`heatmap-range-responsive.spec.ts:95-141` 更彻底：先 inline stub，**再用 `expected` 亲手把 active 写成期望值**后断言 `finalActive === expected`（纯重言式），`:140` 的 `expect(active === null \|\| typeof active === 'string')` 恒真，全程未 mount `HeatmapCalendar`、未调 `applySmartDefaultRange` |
| 3 | 名字夸大内容的另一类 | **是，2 例 High** | ①`hash-utils.spec.ts:84-95` 名为「reordered keys collide」，而 `rebuilt` 与 `direct` 是同序同值数组，键序不敏感性从未触发（真正测交换的是 `:80-82`）；②`import-settings-whitelist.spec.ts:31-36` 名为「import/export 白名单对称」，实断言只有 `size === length`（去重计数），**元素级对称零断言**，且其注释推论「EXPORT 不含凭据即保证 import 安全」**前提为假**——`neodbToken` 正在 `EXPORT_SETTINGS_KEYS`（`data.ts:47`，§9 行 8） |
| 4 | 直写全局而不走 sandbox helper 的规模 | **两组合计 20+ 份，含零恢复实例** | R5a：`db-migration.spec.ts:20`（直写且**整份文件无任何恢复**）、`db-connection.spec.ts:24/:62`、`bulk-ops.spec.ts:39`、`db-migrate-branches.spec.ts:81`、`adult-av-{db-layer,index-migration,transport}`、`db-put-immutable`、`download-handler`（手写 `withChrome`）、`data-scheduler`（setTimeout 猴补丁）。R6：`pt-id-cache.spec.ts:34-36`、`get-watched-ids-characterization.spec.ts:32-36`、`pt-dimmer-{cache-memo,chunk,row-memo}`、`nexusphp-rowmap.spec.ts:19`、`music-*`/`personage-data`/`photos-data`（helper 内装但缺模块顶层 `initFileSandbox()`＝X23 ⑩ 类）、`neodb-fetch-timeout.spec.ts:11/:29`（**注释声称 helper 会在 afterAll 恢复 fetch，实际未 init 即不注册钩子＝注释为假**）。主线抽样 4 份核实，其中 3 份确认不在基线内（与 #1 盲区完全对应） |
| 5 | 「推测夹具」是否只存在于 e2e 层 | **否，单测层同病（High）** | `personage-creations-extract.spec.ts:256-267` 标题自述「分组布局（按标记排序**推测**结构）」，用本地 `mutateToGrouped` 造形后测生产选择器 ⇒ 与 §10 行 3（R7 H1）同一类自证夹具跨层出现；R5a 亦报 `tests/fixtures/douban/*.html` 为手写、无抓取元数据 |
| 6 | 是否存在被禁用/弱化的断言 | **否（本轮扫描零命中）** | `tests/unit` 全量 grep `test.skip\|test.fixme\|.fail(\|expect(true)\|expect(false)` **无匹配**，`.only` 同零；`detail-extract-edge.spec.ts` 与 `extra-extract.spec.ts:150-161`（`预告片(13)` 格式疑点）是带「疑点已上报」注释的**显式表征 pin**，属合法用法而非弱化 |
| 7 | 审查代理自身是否免检 | **否，三处需主线裁决** | ①R6 对「一次性降级永久缓存」的 REFUTED 已作废（见 §10 行 5：读到 06:55/06:57 的在途修复）；②R5a 与 R6 **独立**命中同一别名写入类（跨 [a-d]/[e-p] 两半），反向增强 #1 结论可信度；③R5a 把 `adult-av-batch.spec.ts:59` 的模块级 `defineGlobal('indexedDB', …)` 判为「未使用＝低于阈值」，主线改判：它是**有恢复的活写入**，不计泄漏但应作死夹具清理，否则基线重述时会被误计。 |
| 8 | 「源码文本 pin」是否在冒充行为测试 | **否，全线已声明（本轮洗清一项怀疑）** | 探针实测（temp 脚本，非门禁）：`tests/unit` 中 **47 份** spec 以 `readFileSync` 取源码/HTML 为测试对象，**0 份未在文件头声明该方法**（措辞如「SFCs cannot be compiled by this runner (precedent: …)」）；真正依赖**字面串包含**的只有 **6 份 / 52 条断言**（`motion-discipline` 18、`spa-toast-a11y` 15、`options-tabs-parse` 8、`x26b-settings-save-race` 8、`options-query-feedback` 2、`douban-mark-dialog-a11y` 1）。其余 extract 类是「读 HTML 夹具 + 跑真解析器」，不属本类。**残余风险如实登记**：字面串 pin 锁得住「接线存在」，锁不住时序与渲染后果（`x26b-settings-save-race` 断言 `clearTimeout` 在场，却不能证明 debounce 真按槽位生效），此类须由 X27 的 e2e 层承接；仓内已存在可用真挂载路径（`umm-page-layout.spec.ts:97` 的 Vite `ssrLoadModule`），故「SFC 不可测」只是成本选择而非不可越过障碍 |
| 9 | 性能主张「已消除一次性大批量 DOM 修改」是否需要再修 | **本轮重测未见新缺陷，但结论只能是静态的** | AST 探针（temp 脚本，非门禁）按「循环体内 ≥3 次 DOM 写」筛出 **15** 处候选，逐处读码分类：①宿主 DOM 上的规模化写入**已全部经 `runChunked`**（PT dimmer 三站 + bilibili/youtube listing + doulist-dialog + `dom-chunk.ts` 本体，共 7 文件）；②纯属性写且无读回的（`mukaku/apply.ts:38` 每卡一次 `classList.add`、`neodb-push.ts:215/:228` 按钮 disabled）由浏览器合并为一次样式失效，不构成卡顿面；③UMM 自建容器内的定长构造（bangumi 状态菜单 4-5 项、sehuatang 分页窗口约 7 项、video-overlay 弹窗固定 11 行）；④`card-render.ts:41` 骨架卡用 `createDocumentFragment` 一次插入（正解）。**判据与数字一同公布**：风险不是「循环里有写」，而是「宿主节点批量 append」或「写与几何读交叠」（`offsetHeight`/`getComputedStyle` 一类；本轮在候选文件内 grep 为零）。**局限声明**：分片之外是否仍卡顿只能由真实浏览器长任务断言证明，而 §10 行 4 已判该门禁可空过（H2）⇒ 本行是静态结论，不替代 X23 ⑬/X27 的运行时证据 |

### 本轮新增的复核规则

11. **门禁的盲区必须量化，不能只报命中数**：一条「76 项待清零」的棘轮若看不见另外 41 条写入，给出的是比现实更好的安全感。凡 AST/正则探测器都须配「故意写入但不该匹配」与「该匹配却漏掉」双向反例夹具，并把漏检数公布。
12. **「名字即契约」要专门审**：本轮 4 例假覆盖/弱断言全部表现为**标题承诺强于体中断言**（含一例纯重言式：先写期望值再断言期望值）。固定问法一句——「把生产函数改坏，这条 test 会变红吗？」答不出链路即判假覆盖。
13. **两个独立审查代理命中同一模式，才算模式**：别名写入盲区由 R5a/R6 各自在自己半区报出后才升级为门禁级结论；单代理的孤例只按个案处置，不据此改口径。
14. **怀疑某类测试在冒充行为之前，先量「是否已声明」**：本轮我怀疑 X26-B 的新 spec 是「文本 pin 冒充行为」，实测结论相反——47 份读源码的 spec **全部在文件头声明了方法**，字面串 pin 仅 6 份/52 条。把怀疑写成结论而不计量，就会误杀一个已经诚实的约定。**证伪与证实同等入档**（与 §11 行 8 同一实例）。

## 12. 第六轮回访续二（R5c：`tests/unit/[q-z]*` 80 份 + `helpers/global-sandbox.ts`）

| # | 复核问题 | 结论 | 证据与处置 |
|---|---|---|---|
| 1 | 后半区是否也有假覆盖 | **无（0 Critical），缺陷分布是偏科的** | 80 份逐份判定：**Critical 0 / High 18 / Medium 5**，且 18 项 High **全部是隔离类**（未恢复/未登记的全局泄漏或错误恢复），无一项是断言强度问题。对照 §11：`[a-d]` 出 1 例假覆盖、`[e-p]` 出 1 例重言式，而 `[q-z]` 零命中 ⇒ 「名字与内容不符」集中在前半区，「全局桩泄漏」集中在 sehuatang 家族（13/18）。**收口策略因此分两刀，不用同一副药** |
| 2 | 缺 `initFileSandbox()` 的规模 | **11 份，每份一行即可闭合** | 装桩只发生在 test/hook 内因而从不注册钩子的家族：`record-repository-adapter`、`review-detail-data`、`search-data`、`series-data`、`session-cache`、`settings-session-snapshot`、`trailer-data`、`user-{celebrities,media,profile,reviews}-data`（`zip-utils-boundaries` 在模块作用域条件安装，自注册，豁免）。另有 5 份**绕开 helper 用漂移的本地 `defineGlobal` 副本**（`sehuatang-constants`/`-detail-loader`/`-home-extract`/`store-theme` + 裸写若干）。最危险单项：`sehuatang-render.spec.ts` 经**别名 `g.`** 写入 document/window/Element/MutationObserver/rAF 及**一个功能性 chrome sendMessage 路由器**，既不在基线也不被探测器看见 |
| 3 | 门禁的第二处失明是否被实例证实 | **是（第三次独立命中）** | `store-theme.spec.ts` 在模块作用域装 **10 个** DOM 键且无人恢复（其唯一 `afterEach` 只恢复挂在**自建 dom.window** 上的 `matchMedia`），却过门禁——只因该 `afterEach` 体内出现了 `originalMatchMedia` 这个词（`CLEANUP_PATTERN` 词匹配即豁免整份文件）。别名写入失明则由 R5a/R6/R5c **三个独立代理**各自半区命中（规则 13 满足）⇒ X23 ⑧ 的两条子项由「理论缺陷」升为「已见证」，并新增 ⑨-b：**cleanup 判定必须看到实际的 restore 调用目标，不能靠词** |
| 4 | 恢复代码自身会不会就是泄漏源 | **会，新缺陷一类：prev 采集晚于安装** | `utils-context.spec.ts:160-172` 的 `prevWindowValue()` 在 `fakeWindow` **已装入之后**才取值，于是「恢复」把假 window 又写回去，永久遗留 ⇒ 清理动作本身成为泄漏源。同类不可逆损坏见 `sehuatang-constants.spec.ts`：`afterEach` 把 `navigator`/`localStorage` 恢复成 **undefined**，Node 真实 `navigator` 一去不返。登记 X29 |
| 5 | 第五轮对「链式遮蔽」的判定是否成立 | **不成立，本轮推翻自己的结论** | §9 行 6 我曾写「实测并不成立＝34 份 spec 多轮组合全绿，故列门禁化项而非返工」。R5c 给出可今日的**具体配对**：未注册钩子的文件把桩留在 worker 上（`review-detail-data` 泄漏 `window`；`record-repository-adapter` 泄漏 chrome 桩），其后任何模块作用域装同名键的文件就会把**别人的桩**记成 `prev` 并"忠实恢复"这个孤儿（`event-bus.spec.ts:65`/`overlay-mount-failure.spec.ts:49`/`use-locale-sync.spec.ts:36` 都在模块作用域装 chrome）。**改判：链式遮蔽现实可达，须与 X29 同波收口**，不能只挂门禁 |
| 6 | helper 自身与死码 | **归因 fail-open 覆盖面比原先估计更大** | 全仓约 **15 份**文件在模块作用域装桩，其注册完全依赖 `specFileId()` 的**错误栈扫描**分支（`test.info()` 在测试外不可用）；该分支一旦失效即静默不入册（响亮失败仍是 X23 ⑩）。另 `restoreGlobals()`（`global-sandbox.ts:123-136`）**全仓零调用**＝死导出，而 `orphan:check` 只扫 `src/`，测试侧死码无人管 ⇒ 并入 X23 计量口径项 |
| 7 | 注释与机制不符 | **两份 spec 的注释是错的** | `record-repository-adapter.spec.ts:470` 与 `neodb-fetch-timeout.spec.ts:35` 均写「sandbox helper 会在 afterAll 恢复」，而在缺少 `initFileSandbox()` 的调用形态下**根本不会**——注释把缺陷写成了保证。处置：随 X29 逐行加 init 后注释自动转真，不改措辞掩盖 |

### 本轮新增的复核规则

15. **「实测不成立」必须给出反例搜索的范围**：§9 行 6 我用「390 例组合全绿」否证了链式遮蔽，但绿测只能证明**该次文件→worker 分配**没撞上，不能证明配对不存在。凡「某危害不成立」的结论，须同时写明搜索过的配对空间；否则下一轮就会像本轮一样被推翻。
16. **清理代码要当作与被清理代码同级 objects 审查**：`prev` 采集时点晚于安装、把真实全局恢复成 `undefined` 两类，都是「修泄漏的动作本身造泄漏」。判据固定两句：*prev 是在装桩**之前**取的吗？*恢复目标是 globalThis **还是**自建对象？

## 13. 第七轮回访（主线自审 + 首次全仓合并复跑，2026-09-27 00:14）

本轮对象：X26-C2 的收口、isolation 口径的第三次重测、以及**第一次仓库级合并复跑**（14 门禁 + build + 全量 unit + 全量 e2e，脚本 `/tmp/umm-sweep.sh`，每步字面 exit 与产物 mtime 入日志）。

| # | 复核问题 | 结论 | 证据与处置 |
|---|---|---|---|
| 1 | X26-C2 超轮中止时树是否处于半改状态 | **是，且被门禁抓到** | 中止瞬间 `npm run type-check` **exit=2**，4 处报错全在 `tests/unit/x26c2-bilibili-detail-entry.spec.ts`：`messages()` 标注 `: number` 实返 `Sent[]`（:240/:262/:263）。改 1 行标注后 exit=0，该代理 4 份 spec 共 **25 例全绿**。结论：不得以「代理已完成」结案，半改状态确实会以门禁红点形式落地 |
| 2 | isolation:check 的盲区到底几处 | **三处，其中一处此前从未被识别** | ①`:83` 的 `GLOBAL_SETTER_HELPERS` 分支位于 `isPropertyAccessExpression(node.expression)` 之内，而 `defineGlobal('chrome', …)` 是 **Identifier 调用** ⇒ helper 安装恒计为 0 写入；②`:125` 见到 `from '…global-sandbox'` 直接 `return true`（判「已恢复」）；③别名写入不可见（见行 4）。①+②叠加 ⇒ **83 份**（tests/unit 内出现 defineGlobal/defineGlobals 调用的 spec 实测数）**同时逃过写入计数与恢复判定**，门禁绿灯对这 83 份的泄漏量零断言。已登记 X23 ⑭ |
| 3 | 「缺 init 的文件」真实规模 | **19 份，其中 17 份走真 helper、2 份走本地副本；R5c 的 11 份偏低** | 判据不是「有没有 init 文本」而是**是否存在模块作用域的首次安装**（`global-sandbox.ts:51-103`：`atLoadContext=false` 则 `hooksRegistered` 永假 ⇒ 无 `afterAll` 恢复、无 `beforeEach` 自愈）。19 份逐一给出行号与键名（探针 `/tmp/umm-qz-probe2.cjs`），高危键含 `window/document/location/Node/Element/HTMLElement`。另有 **8 份混合式**靠同名模块安装侥幸注册，须一并显式 init |
| 4 | 别名盲区规模（对我上一轮结论的复核） | **16 份 / 45 条写入，且 16 份全部不在基线** | 同一 AST 在 `resolveAliases=false`（复刻门禁 `GLOBAL_OBJECTS`）与 `=true` 下对拍（`/tmp/umm-qz-probe3.cjs`），逐文件报 `gateSees/aliasResolved/inBaseline`。**我此前所记「15 份 / 41 条」偏低**，原因是只统计「门禁完全看不到任何写入」的文件，漏掉 `adult-av-index-migration`(1→3)、`pt-dimmer-row-memo`(2→6)、`sehuatang-cache-transport`(2→5) 三份「部分可见」的文件；已在 X23 ⑧ 内改正并写明旧口径的错法 |
| 5 | 是否存在 globalThis 之外的泄漏通道 | **存在，新类：模块级单例绑定** | `store-theme.spec.ts:278` 在合并复跑中拿到 `chromeSet=[]`（期望 `[{theme:'auto'}]`）。根因**不是**全局桩，而是 `src/engine/settings/items.ts:43` 的 `testAreaOverride` 模块变量：`settings-items.spec.ts:76` 在 `beforeAll` 绑定后，其 `afterAll` 只恢复 `globalThis.chrome`，**从不 `__bindSettingsAreaForTests(undefined)`** ⇒ 绑定跨文件存活，后续文件经「生产态实时查找」写入别人的 area。`isolation:check` 只看 `globalThis`，对此零覆盖。修法：afterAll 解绑 + `beforeEach` 重申（抗 chunk 边界抹除），已落地 |
| 6 | e2e `samples[0]===0` 是竞态还是真实变更 | **真实且确定：首观测值恒为 10，不是竞态** | 临时探针（跑完即删）实测 `head=[10,40,50,50,50,60] first=10 maxStep=30`，单跑与全量 e2e 一致。10 恰为 X26-C2 在 `bilibili-listing.ts:37` 新设的 `LISTING_CHUNK_SIZE`——它把写入颗粒度改为「10 卡/帧，读相先行」以消除逐卡 forced layout。原断言实际度量的是**采样器 5ms 首拍与首帧的先后**，非生产保证 ⇒ 改为三条可证伪契约：首观测值必须为部分值、步进单调不减、单步增幅 ≤ 语料一半（一次性全量写入会被后者抓到）。**披露：这是断言范围变更，不是删除；生产侧行为变更需在 CHANGELOG 同条记录** |
| 7 | 主线自己的方法错误 | **连续 6 次空跑被误读成「确定性失败」** | 我用 `npx playwright test tests/e2e/<spec>` 复跑，日志实为 `Error: No tests found`（e2e 由 `playwright.e2e.config.ts` 独立配置，默认 config 的 testDir 匹配不到该路径），而我把 exit=1 当成了红点。正确命令下的三轮单跑与全量套件均为绿。教训固化为规则 17 |
| 8 | 合并复跑第一次的真实结果 | **3 项非零：formatcheck / unit / e2e** | `formatcheck exit=1`（5 份文件：X26-C2 的 4 份 spec + `video-overlay.ts`）→ `npm run format` 后 `format:check exit=0`；`unit exit=1`＝2448 passed / **2 failed**（行 5 的 store-theme、以及行 8 的字面量 pin）；`e2e exit=1`＝13 passed / **1 failed**（行 6）。其余 11 门禁 + build 全绿，产物 mtime 07:44:45/07:44:50，最大出货文件 `douban-main.js 878,663 B`。修复后全量 unit **2450 passed / exit=0** |
| 9 | 字面量文案 pin 的脆弱性 | **已被实例证实，改契约 pin** | `options-query-feedback.spec.ts:63` 断言整句日志文本 `'… global stats read failed, degrading to zero:'`，X26-D 因语义改为 `'… placeholder kept:'` 即打破。处置：pin 形状而非措辞（`console.warn('[UMM] Sehuatang global stats read failed…', error)` 的正向匹配，保留「错误必须透传」这一真实保证），并在此登记为断言范围变更 |

### 本轮新增的复核规则

17. **命令必须先自证「跑到了东西」**：`exit!=0` 不等于测试失败。Playwright 的 `No tests found` 同样以非零退出，而 e2e 与 unit 分属 `playwright.config.ts` / `playwright.e2e.config.ts` 两套配置。任何「复现/证伪」结论须同时引用 **passed/failed 计数**，计数缺失即视为空跑，不得进入判定。
18. **模块级单例是第二类泄漏通道，globalThis 门禁对其无效**：`beforeAll` 写入、`afterAll` 只恢复全局而被测模块自身持有模块级可变绑定（`testAreaOverride` 一类）时，污染跨文件存活且红点出现在**别的文件**里。判据：凡测试通过「显式 bind API」改变生产模块内部状态，就必须成对出现「解绑」，且 `beforeEach` 重申以抗 chunk 边界。
19. **断言文案的字面量 pin 必须降级为形状 pin**：以整句日志文本作断言时，无关的措辞改进即会造成红点，把「门禁抓到回归」变成「门禁抓到词典改动」。契约形状（调用形态 + 前缀 + 错误透传）足以承载「不得静默吞错」的保证。





## 14. 第八轮回访（isolation 门禁口径硬化 X23⑭⑮ + 泄漏面重测，2026-09-27 00:43）

本轮对象：把第七轮测出的三处盲区**修成门禁能力**（而不是继续用临时探针补认知），再以硬化后的门禁重测全仓泄漏面。门禁改动前 `isolation:check` 报「224 扫描 / 90 写全局 / 基线 76 泄漏」，该口径下 **83 份 helper 文件与全部别名写入处于无人监管状态**。

| # | 复核问题 | 结论 | 证据与处置 |
|---|---|---|---|
| 1 | 盲区①（helper 调用不可见）能否修 | **已修**：`findGlobalWrites` 现按 callee 名判定，裸调用 `defineGlobal(…)` 与 `sandbox.defineGlobal(…)` 同计 | 自检夹具 `leak: bare helper call inside a test without initFileSandbox` |
| 2 | 盲区②（CLEANUP_PATTERN 词匹配豁免整份文件）能否修 | **已修**：撤销判定改「cleanup 体内存在撤销**动作**」——对 holder 的 defineProperty/赋值/delete 或 `restoreGlobals()` | 自检夹具 `leak: cleanup body only mentions restore words, performs no restore` |
| 3 | 盲区③（别名写不可见）能否修 | **已修**：`collectAliases` 迭代至不动点收 `const g = globalThis` 类别名 | 自检夹具 `leak: alias write (const g = globalThis) without restore` |
| 4 | 新类：helper 安装的**时机**是否可判 | **可判且必须判**：sandbox 钩子只在模块作用域（或 `describe` 回调内）首次安装时注册，故「测试体内 `defineGlobal`」= 结构上永不撤销 | 新增 `isSuiteBuildingScope` + `initFileSandbox()` 顶层调用识别；23 份文件据此暴露 |
| 5 | 模块级单例绑定（第七轮规则 18）能否进门禁 | **已进**：`__*ForTests` 非空实参 = 安装，须在 cleanup 体内以 `undefined/null/void 0` 同名调用释放 | 自检夹具一对（未释放 / 已释放）；`settings-items.spec.ts` 修复后不再被报 |
| 6 | 硬化后是否产生**新的假阳性**（本轮自纠两处） | **是，两处，已修** | ① e2e 里 `page.evaluate` / `addInitScript` 回调运行在**页面**而非 worker，其 `globalThis` 写不是泄漏 → 加 `BROWSER_SIDE_CALLS` 排除，`bilibili-homepage-chunked` / `pt-dimmer-live-refresh` 由误报转净；② jsdom 解构的本地 `window` 遮蔽了同名全局 → `collectAliases` 增加 shadow 剥离，仅 1 份文件受影响 |
| 7 | 硬化后的真实规模 | **242 份测试文件 / 116 份安装测试态 / 45 份从不释放 / 177 处未释放安装** | 分组：18 份 `unrestored-globalThis-writes`、23 份缺顶层 `initFileSandbox()`、4 份本地 `defineGlobal` 副本 + 直写（`store-theme`/`sehuatang-constants`/`sehuatang-detail-loader`/`sehuatang-home-extract`） |
| 8 | 抽样核实门禁是否**说真话**（不信自身输出） | **4 份抽查全为真阳性** | `bulk-ops.spec.ts:40-41` 经别名写 `indexedDB`/`IDBKeyRange`，`finally` 只关连接不删键；`sehuatang-render.spec.ts:32-36` 经 `g` 写 7 键无释放；`store-theme.spec.ts:31` 自带本地 `defineGlobal` 并在模块作用域安装 11 键；`data-scheduler.spec.ts:46` 改 `setTimeout` 仅在部分分支复原 |
| 9 | 基线由 76 → 45 是否属「放宽门禁」 | **否，是计量口径修正，如实披露** | 45 份是既有真泄漏（旧词匹配豁免），76 份基线中 45 份早已在前几轮修好而未重锁；棘轮方向不变（只降不升），`isolation:check --self-test` 17 夹具双向断言全绿 |

### 本轮新增的复核规则

20. **门禁的「看不见」不等于「不存在」**：以门禁数字为完成度证据前，必须先量门禁本身的盲区（同一份 AST 换判据即从 0 变 83 例无人监管）。硬化优先于修复——否则修复工作按错误的分母收口，会再次宣布「清零」。
21. **区分 worker 侧与页面侧写入**：Playwright 的 `evaluate` / `addInitScript` 回调在页面上下文执行，其 `globalThis` 写不进 worker，不得计为跨文件泄漏；同名 `window` 若被本地解构遮蔽亦非全局。假阳性口径一旦进入基线，就会把「加豁免」当成「已修完」。


## 15. 第九轮回访（泄漏面清零 + 第五通道：import 期全局捕获，2026-09-27 01:25）

本轮对象：X29 三波清理的**结果核验**，以及一次真正的仓库级 16 步合并复跑。结论是——
清理本身到位，但**合并复跑抓出一个前八轮从未见过的通道，而且它是"桩释放做对了"才浮现的**。

| # | 复核问题 | 结论 | 证据与处置 |
|---|---|---|---|
| 1 | 45 份未释放文件是否真清零 | **是**：`isolation:check` 实测 242 扫描 / 116 安装态 / **0 份不释放 / 0 处未释放安装**，基线重锁 45 → 0 | `node scripts/check-test-globals.cjs` exit 0；`--self-test` 17 夹具全绿；基线 JSON `count=0,totalLeaks=0` |
| 2 | 16 步合并复跑是否全绿 | **否**：13 道静态门禁 + build + e2e(14) 全通过，**unit 2450 passed / 1 failed / 3 条非测试错误** | `/tmp/merged/test-unit.log` 尾部；红点 `tests/unit/umm-image.spec.ts:154` `TypeError: Cannot read properties of null (reading 'createElement')` |
| 3 | 红点是否本次改动引入 | **否，是既有耦合被本次正确性暴露**：单跑该文件 10 例全绿；两文件组合亦绿 | `npx playwright test tests/unit/umm-image.spec.ts` exit 0；与 `use-douban-section` 组合 14 passed |
| 4 | 机制定位 | **`@vue/runtime-dom` 模块级一次性绑定 `doc`**：一 worker 共享模块注册表，**首个 `import('vue')` 的文件替全 worker 决定该绑定**；此前某个不释放的 `document` 桩替它兜底，桩收口后绑定回到 `null` | 栈顶 `runtime-dom.cjs.js:34` 的 `doc.createElement`；`--workers=1` + `options-query-feedback`→`umm-image` 文件序**稳定复现**（1 failed / 15 passed） |
| 5 | 该通道能否用 globalThis 门禁度量 | **不能**：既非桩泄漏（写方已正确释放）、也非模块级绑定（值未留在 globalThis，而是被第三方模块**快照**走）→ 第五类通道 | 见规则 23 |
| 6 | 修法是否 per-file 补丁 | **否**：给单文件补 `document` 只治一次，任何新文件仍可能成为"首个 import 者"。改为 worker 级基线：`tests/unit/helpers/worker-dom-baseline.mjs` + `playwright.config.ts` 注入 `NODE_OPTIONS=--import=`（含 `fs.existsSync` 响亮前置校验） | 复现对由 1 failed → **16 passed**；全量 unit **2451 passed / exit 0**（基线前后各跑一次均绿） |
| 7 | 基线是否与各文件私有 `JSDOM` 冲突（Vue 建在基线 doc、容器在自家 doc） | **不冲突**：jsdom 容忍跨 document `appendChild`，实测挂载成功且基线 body 未被污染 | 独立 node 实验：基线 document 下 import vue，挂载进另一 JSDOM 的容器 → `<div class="x">hello</div>`，基线 body 仍为空 |
| 8 | ⑩（归因失败静默放行）是否真为 fail-open | **是，且现已闭**：探针强制 `specFileId()` 返回空 → 套件立刻 2 处 `cannot attribute` 红；正常全量跑 **0 次命中** ⇒ 现网无未归因安装 | 探针运行 exit 1；恢复后 `npm run test:unit` 2451 passed |
| 9 | ⑪（链式桩遮蔽）修法是否已落地且无害 | **已落地**：安装时越过他牌仍活的桩继承其 `prev`（真原值）。**全量跑中未观测到触发**（需 chunk 边界交错才成立）⇒ 如实标为**防御性修正**，不宣称修掉已复现缺陷 | 加入后 2451 仍全绿；触发计数实验因探针脚本自身语法崩（`\n` 转义）未得数，不以"未测"冒充"已证" |
| 10 | 5 例假覆盖（A 组 4 + C 组 1）是否变为可证伪 | **是**：7 处生产变异逐条使对应新断言必红 | M1 内容序替换→oracle 红；M1b 丢 key + 内容序→**新配对断言红**；M2 码元序→**新 collation 断言红**；M3 白名单回填凭据键→**新对称断言红**（另有 2 例既有测试同红）；M4 选取器忽略宽度→**新分段断言红**；M5 夹具变异器 no-op→**新增前置断言红**；M6 `[class~=…]`+无空格 `!important` 绕过四条文本检查→**新计算样式断言红** |
| 11 | 变异实验是否污染产物 | **否**：三份生产文件与两份 spec 逐次 `cp` 备份，`sha256sum -c` 全部 OK 后复跑 | `/tmp/before.sha`、`/tmp/bl.sha`、`/tmp/sbx.sha` |
| 12 | 复跑脚本自身是否可信 | **曾不可信，已纠正**：首轮脚本的汇总行被 shell 插值吞掉退出码（`exit=` 空），"driver exit=0" 也不代表各步为 0——**门禁的绿灯不能由驱动脚本的退出码代言** | 第二版逐 `printf` 记录 `exit=`，并让任一步失败即整体非零 |

### 本轮新增的复核规则

22. **"做对了"会让隐藏缺陷现形，因此收口后必须全量复跑而不是只跑受影响文件**：本轮 unit 的新红点与桩清理无因果关系，却因为桩不再互相兜底而浮现。判据仍是唯一的那条——合并复跑。
23. **区分三类共享态**：①留在 `globalThis` 的桩（门禁可测）；②生产模块的模块级绑定（门禁可测）；③第三方/生产模块 **import 期一次性快照**的全局（门禁不可测，且不受任何"释放"动作影响）。第③类只能在**任何 spec 求值之前**建立 worker 级基线来消除；若某文件把"首个 import 者"的位置让给一个无 DOM 的环境，全 worker 的后继文件都会拿到 null 绑定。
24. **自实现断言的三种形态**：期望值由被测代码写进被断言对象（DOM 写完读回）、字面量与自身重建的同一字面量比对、采集了真实量却 `void` 丢弃未断言。三者都**结构上不可能红**。唯一判据是反向验证：对被测面施加生产变异，断言必须变红；不做变异实验，就不得声称"覆盖"。

### X27 开波时补的两条工具事实（2026-09-27 02:25）

25. **`expect.poll` 包 `page.evaluate` 不是可靠的 in-page 轮询形态**：同一表达式（`!!document.getElementById('umm-douban-overlay')?.shadowRoot?.querySelector('style')`）用 `page.waitForFunction` 在 **186 ms** 即命中，而 `expect.poll(...).toBe(true)` **30 s 超时**判红。写错的代价是"生产代码看起来坏了"的假缺陷。in-page 条件一律 `waitForFunction`；另注意探针谓词若闭包引用 worker 侧变量（如日志数组），会在页面里每 tick 抛 `ReferenceError` 并被 poll 吞掉——本轮第一版探针正是如此，误判过一次。
26. **e2e 的期望值只能来自夹具字节 / 宿主 DOM，且宿主卡片形态不唯一**：首页同一份 `homepage.html` 里同时存在 `li[data-title]`、`.subject-card-item-title-text`、`img[alt]`、anchor `title=` 四种命名方式；只按一种形态读会产生**假阴性**（实测渲染标题「暗涌」被判"宿主不存在"）。收口为共享 reader `tests/e2e/fixtures/douban-host-subjects.ts`：以 `a[href*="/subject/"]` 为主键，按页面自己使用的属性顺序解析标题。

## 16. 第十轮回访（2026-09-29，仓库级合并复跑 + 交互广度首次按页型计量）

本轮对象：把 ADR-026 / CHANGELOG 记到 X71 的全部主张重新量一遍（磁盘为唯一权威），并给需求 8 的「真实浏览器全面交互」补一个可复现的分母。

| # | 复核问题 | 结论 | 证据（本轮实测） |
|---|---|---|---|
| 1 | 17 步合并复跑是否真绿 | **是（本轮亲跑，非引用上一轮）** | `type-check` 20s / arch·ds·scope·naming·size·doc·orphan·any·isolation·console·i18n:strict·lint·format:check 各 ≤2s / `build` 3.825s / `test:unit` **2590 passed（56.1s）** / `test:e2e` **125 passed（3.2m）**，逐步 `exit=0`（日志与逐步 exit 存 `.um.agents/tmp/sweep-0929/summary.txt`）。产物 mtime `09-29T13:41`：`background.js` 80,756 B、`content-scripts/douban-main.js` **877,476 B**、`content.js` 164,338 B |
| 2 | 「31/33 页型有 e2e」这个数字怎么来的 | **本轮首次按页型计量，且第一版探针给出了假结果** | 分母 = `detectPageType` 的 PageType 全集（33，含 `video`；页目录 32，`video` 经 `main.ts:131-132` 复用 trailer 挂载）。分子 = 各 e2e spec 里出现的 URL 经**生产分类器**解析出的页型集合。第一版探针把模板字面量 `https://${MUSIC}/albums/30080001` 当噪声丢弃 ⇒ 误报 `albums`/`artists-overview`/`genre`/`music-profile` **四点未覆盖**；补上 spec 内 `const` 主机名代入 + 8 条自检种子（6 条已知覆盖必为覆盖 + 扫描非空 + 幻影页型必不为覆盖）后为 **31/33，未覆盖 = `book-profile`、`video`**。探针留在 `.um.agents/tmp/e2e-matrix3.mjs`（含自检），可复跑 |
| 3 | 门禁口径是否仍与宣传一致 | **orphan/isolation/size 三口径复核为真，console 一处叙述失实** | `orphan:check` 实测 **203 covered / 39 uncovered**（基线 41，本轮 book-profile 覆盖波使 2 项可 prune：`pages/book-profile/data.ts` + `types.ts`，`--baseline` 待合并复跑后锁）；`isolation:check` **282 份扫描 / 126 份安装测试态 / 0 份不释放**（基线 0）；`size:check` ≤600 行基线 0；**`console:check` 实测仍为 482 份 / 150 处（基线 150）**——本轮主线一度把它说成「143 处（63 error/74 warn/3 log/3 info）」，该数字与分解**均无来源**，已按门禁输出纠正 |
| 4 | 上一轮「已完成」的叙述是否都落在磁盘上 | **否：五项被记为已落地的产物在磁盘上不存在** | 会话记录称 X73–X77 五波完成（sehuatang 编排单测、两份新 e2e、`sehuatang/app-stats.ts`/`app-list-render.ts` 拆分等）。`ls` 实测这些路径**全部不存在**，且 `git status` 中 `src/entrypoints/content/router.ts` 的 `RouteDisposer` 差异属**已提交的 X26-C**（`590b1fc` 之前的工作树内容），并非新增。本轮据此把「代理/会话叙述」的证据等级降到**低于**门禁输出与磁盘清单 |
| 5 | 页型 e2e 分母能否退化为空集 | **否，但缺一个常驻守卫**（本行结论于同日 §17 前被就地更正） | ~~`book-profile` 与 `video` 两点在 `tests/fixtures/douban/` 里**没有对应夹具**，因此「未覆盖」是夹具缺失而非测试遗漏~~——**该判断为假，被主线自己新加的守卫抓到**：`book-profile.html` 已由覆盖波建出（供 `tests/unit/book-profile-data.spec.ts` 使用），故 `book-profile` 的缺口是**缺 e2e**；只有 `video` 确无自有夹具（它复用 trailer 页挂载）。更正后即 `stable-list-keys` 同款教训：**「缺什么」的判断同样需要计量，凭印象写会直接导出错误的补救方向**。缺口登记 X79（两份 e2e 在途，由主线独立复验），常驻守卫为 `tests/unit/douban-e2e-page-coverage.spec.ts` |

### 本轮新增的复核规则

27. **任何「已完成」主张先过磁盘清单，再过叙述**：本轮五项被记为已落地的产物经 `ls`/`git status` 证明不存在，而同期门禁输出全部为真。判据顺序固定为：**本轮亲跑的命令输出 > 文件清单/mtime > 会话叙述**；叙述与前两者冲突时，冲突本身即是一条需要入档的缺陷（不是「数字写错」，而是「完成状态被冒充」）。
28. **计量类叙述里的每个数字都必须能被当场复跑**：主线引用「143 处（含分解）」这类数字时无法给出产生它的命令，实测为 150。凡进入面板/ADR/CHANGELOG 的数字，须与某条命令的字面输出成对出现，否则改写成「未计量」。

## 17. 第十轮续（2026-09-29 07:12）：性能面与 i18n 面的独立反查

取证主体换了：主线派**只读性能审查**与**只读接线审查**各一组，反查既往结论（含主线自己写下的前提）。结果：**四项新缺陷复现 + 两处既往表述被证伪**。

| # | 复核问题 | 结论 | 证据（读码 / 复跑） |
|---|---|---|---|
| 1 | 「宿主级批量写入都已分片」是否成立 | **不成立，且文档内部早已自相矛盾** | `grep -rl runChunked src/` 实测 **7 个文件**（`pt/dimmer/{index,mteam,nexusphp}` + `ui/{bilibili-listing,youtube-listing,doulist-dialog}` + 基元本体）；`handlers/bangumi-list.ts` 与 `scenario/sehuatang/card-render.ts` **不在其中**。§11 行 9 那句「已全部经 runChunked」是过度声明，而 `tests/e2e/x72-bangumi-write-budget.spec.ts` 文件头 `:5-10` 自己写明了「chunked callers are exactly seven files」——矛盾存在于权威文档与测试注释之间，**结论行从未回写** ⇒ 本行就地更正 |
| 2 | 仍未受保护的集中运算 | **三处复现 + 一处依测量维持原样** | ①`handlers/tmdb.ts`：`:18` 卡片选择器竟是 `div.relative`（TMDB SPA 上匹配几乎所有 Tailwind 容器），`:143` 整文档 `querySelectorAll`；`:120-127` 在**逐卡循环内**先 `getComputedStyle`（读）再写 `style.position`/`appendChild`——正是 bilibili/youtube 两波修掉的 forced-layout 交错；throttle 280 ms + `:166` 常驻 2 s 轮询 + `:163` body 级观察器，异步体**无重入闸** ⇒ 可重叠。②`pt/dimmer/index.ts:290-295`：`this.pendingClear = clearResolvedMarkersForRows(...)` **不 cancel 上一趟**（对照 `mteam.ts:217` / `doulist-dialog.ts:391` 均有 cancel），且 `:271-276` 先做同步整文档查询、再进 300 ms 去抖 ⇒ 事件风暴下 N 条并发分片链，**分片在最需要它的时刻失效**。③`handlers/mukaku/handler.ts:257` → `mukaku/refresh.ts:42-44`：每次事件同步整文档 `querySelectorAll().forEach` 清除，未分片未去抖。④`handlers/javdb.ts` 未分片，但 X69 实测 300 卡 33–46 ms（预算内）⇒ **维持不分片是测量结论，不是遗漏**。修复列 X80/X81 |
| 3 | 可变记录态是否仍被写进 `:key` | **是，4 处，已修并门禁化** | `pages/book-homepage/App.vue:107`、`pages/homepage/App.vue:91`、`pages/homepage/components/UmmMediaRow.vue:46`、`pages/music-homepage/App.vue:106` 均为 `` `${subjectId}-${status}-${rating}` `` ⇒ 每次活写**拆树重挂**（含 `loading=lazy` 封面重解码），而这条规则正是 X30/X31 自己判定的「用重挂假装刷新」。规则此前只写在 `components/umm-rec-section.ts:66-68` 的实现注释里，**没有任何机制覆盖 SFC**。修法同既有正确实现：键取 `subjectId`（缺失回退 `href`）。新增 `tests/unit/stable-list-keys.spec.ts`（3 例：正/负自检种子 + 扫描非空 + src 零违规；负种子特意含「注释里谈到该规则不得误报」，因为 `umm-rec-section.ts` 的说明文字会被朴素匹配击中）。**反向验证**：把 `music-homepage` 换回改前内容 ⇒ 守卫精确点名该文件 `exit=1`，`cp` 还原后 `diff` 一致 |
| 4 | 广播代价 | **复现** | `libraries/utils/event-bus.ts:69-74`：一次 broadcast = 1 条 runtime + `tabs.query({})`（**不过滤**）后逐 tab 一条 `tabs.sendMessage`；批量导入 M 条 ⇒ M × (1+T) 条消息。接收侧 PT 淡化有去抖、`useRecordCache` 走定向批量读，但**发送侧无并桶**，且 `watch-record.ts:33-39` 自身不去抖（现有调用方各自包了 settle 窗口）⇒ 新调用方天然会再次放大 |
| 5 | 计时/形状类 e2e 是否真在测量 | **一处共同前提错误** | 四份计时 e2e（`bilibili-homepage-chunked:123`、`pt-dimmer-live-refresh:167/283`、`x69:83`、`x72:98`）都在 `page.goto` **之前**调 `requireVisiblePage()`，于是被证明 `visible` 的是 `about:blank`，而 `overlay-probe.ts:363-370` 自己写明后台页会把 ~100 个投递批次塌成 5 个。一行修法：在 `readRafGaps` / `readWriteBatches` 内部再断言 `document.visibilityState === 'visible'`。另 `x72` 的 `GAP_BUDGET_MS=150` 对着它自己引用的 33–57 ms 带宽几乎不可能失败——是**打印测量**而非守卫 |
| 6 | 「覆盖层文案已 i18n 化」是否成立 | **两处不成立（接线面 + 文案面）** | ①`content/i18n/index.ts:13` `currentLocale` 默认 `'zh-CN'`，仅 `initI18n()`（`:41`）会纠正；Douban 入口链 `grep -rn initI18n src/scenario/douban src/entrypoints/douban-*.content` **零命中**，而 `shared/legacy-bridge.ts:23` 把同一个 `t` 供整层使用 ⇒ 英文/繁体用户在豆瓣看到简体；`startLocaleSync` 同样无人调用，语言切换不传播到已开 tab。`i18n:check:strict` 结构上看不见（缺的是**调用**不是**键**）。②文案面按「排除语言包 / 排除 `*-data.ts`·`*-extract.ts`（那是匹配宿主文本的 DOM 契约）/ 排除 `{{ }}` 内宿主派生文本」口径实测 **48 文件 / 342 行 authored 中文**（`user-profile/App.vue` 25、`detail/App.vue` 24、`ui/doulist-dialog.ts` 23、`UmmDynamicIsland.vue` 21、`book-profile/App.vue` 20…），探针 `.um.agents/tmp/authored-cjk2.cjs` 可复跑；另 `scenario/douban/early.ts` 的 `SUBTITLE` 表 31 条首帧硬编码 |

### 本轮新增的复核规则

29. **同一条规则要在每个物理面上各有一条机制**：X31 把「状态不得进 `:key`」写进了 `umm-rec-section.ts` 的实现与注释，SFC 侧四条同形写法却无人管。一条只在它被发现的那一层有实现的规则，等于在其他层**不存在**。跨形态（SFC 模板 / Vapor 渲染函数 / 命令式 DOM）的约定须每面各配断言，或写成同时覆盖两面的门禁——本轮 `stable-list-keys.spec.ts` 属后者。
30. **审查代理必须被允许反驳委托方的前提**：主线给性能代理的任务书里写错了两处事实（声称 bangumi 与 card-render 已分片），代理逐文件核对后判为「brief 的断言为假」。写进任务书的既往结论**不是证据**；引用它时必须标为「待复核」。
31. **测量断言的生效前提要与被测量同时求值**：`requireVisiblePage()` 放在导航前，等于用「页面还不存在时的可见性」为「页面存在时的计时」担保。凡依赖运行环境状态的判据，前提检查须与被测量落在同一求值点。

## 18. 第十轮再续（2026-09-29 07:20）：交互广度首次量化 + 「声明但未接线」四处复现

| # | 复核问题 | 结论 | 证据 |
|---|---|---|---|
| 1 | 需求 8「全面交互」按**挂点**计量是多少 | **52 / 96 驱动（54%）** | 判据：hook = 用户可触发的绑定（`@click/@keyup/@change/@input/@submit/@wheel`、Vapor `onClick:`、shadow `addEventListener('click'\|keydown\|wheel\|…)`），**不计**原生 `<a href>`（19 个页型因此记 0 挂点却被点击过）、不计基础设施监听器；**DRIVEN = e2e 里存在匹配该选择器/aria 的 locator 且点击后有结果断言**（URL 同一性 / DOM 计数 / 状态类 / DB 写）。共享层单列一行以免消费页重复计数。最大缺口：`game-detail` 的 `umm-interest-bar` **0/13**（同一组件在 `detail` 已由 X35 驱动）、挂载失败面板 **0/2 且覆盖全部 33 页型**（X22-B 的重试/关闭按钮从未在真实浏览器里点过）、`UmmStatBar` **0/2**（4 个 profile 页）、`UmmPaginator` 仅 1/7 消费页、legacy handler 与 options 多数为 `page.evaluate` 注入而非真点击 |
| 2 | 「覆盖层文案已 i18n 化」是**假完成**吗 | **是——X62 在豆瓣路径上用户可见收益为 0** | X62 迁移的 8 处字面量（`umm-interest-bar.ts`/`umm-rating.ts`/`personage`/`personage-creations`/`game-explore`）**全是 Douban 文件**，而 Douban 入口链从不调 `initI18n()`（§17 行 6）⇒ 那些 `t()` 一律解析回 `zh-CN`。绿灯的成因尤其值得入档：**`tests/unit/douban-mark-dialog-a11y.spec.ts` 自己调了 `initI18n()`**——测试初始化了生产从未初始化的状态，是规则 24「自实现断言」的镜像形态 |
| 3 | 同类「声明但未接线」还有几处 | **另复现 3 处，均经主线读码确认** | ①**legacy 主题**：`grep -c "startThemeAttrSync\|subscribeTheme" src/entrypoints/content.ts` = **0**，而 `styles/global.ts` 注入的 `html[data-umm-theme="dark"]` 翻转块**每个 legacy 站点都在用**，`startThemeAttrSync` 仅 `douban/main.ts:121`、`subscribeTheme` 仅 `sehuatang-early.content:62` ⇒ PT/IMDb/Bangumi/TMDB/JavDB/Mukaku 的暗色用户看到的 UMM 芯片与 glow 令牌仍是浅色。②**日志配置**：`configureLogging` 调用点只有 `background.ts:143/154` 与 `content.ts:144/154` ⇒ Douban/Sehuatang/bilibili/youtube 四路内容脚本里「调试日志/日志级别」两项设置形同不存在，客服无法收集诊断、级别过滤不生效。③**zh-HK 的集合不对称**：内容侧 4 语言（`content/i18n/locales/index.ts`）、SPA 侧 3 语言（`libraries/locales/index.ts` 无 `zh-HK`），而 `webdav-restore.ts:81` 用 `language: oneOf(SUPPORTED_LOCALES)` 做失败即丢弃校验 ⇒ 一份 zh-HK 备份恢复时语言设置被**静默丢弃**（不是报错） |
| 4 | 备份里的凭据面（悬置项，非本轮修） | 风险描述需升级 | 除「`neodbToken` 明文入备份」（`data.ts:47`，`IMPORT_SETTINGS_KEYS = new Set(EXPORT_SETTINGS_KEYS)` `:63`）外，真正的问题是**导入侧无门控**：恢复一份他人备份会静默改写用户的 NeoDB bearer token，此后其评分被推送到**攻击者掌控的 NeoDB 账号**。与 WebDAV 三凭据的 `includeWebDAVCredentials` opt-in（`data.ts:66`）形成不对称。**属用户数据/契约变更，仍需人工裁决**（面板已发，未获答复 ⇒ 不动） |

### 本轮新增的复核规则

32. **「测试绿」不覆盖「生产已接线」**：若某状态是生产初始化、测试也初始化，则测试证明的是逻辑而非装配。装配类缺陷（§17 行 6、§18 行 2）只能靠**逐入口枚举初始化调用**的守卫来捕获——`i18n:check:strict` 这类按键比对的门禁对其结构性失明。
33. **跨集合的对称性要显式声明并用断言固定**：4 个内容语言 vs 3 个 SPA 语言 vs 3 项恢复白名单，三处集合各自成立却互不一致，且不一致的方向是**静默丢弃用户设置**。凡同一概念存在多个枚举集合（语言、store 名、消息类型、页型），须有一条断言写出它们的关系（子集 / 相等 / 有意豁免）。

## 19. 第十轮再续（2026-09-29 09:45）：一次因果反转 + 一次「优化把功能删没」的回退

本轮的主线工作是「把回访发现落成修复」，结果是**两处对本仓库既有结论的因果更正**，以及合并复跑抓到的一条我自己引入的回归。

| # | 复核问题 | 结论 | 证据 |
|---|---|---|---|
| 1 | 把状态移出 `:key` 之后徽章为何不更新 | **「重挂假装刷新」在这些行里是唯一刷新机制，缺陷在卡片的 props 快照** | 改键后 `x27a-douban-homepage` / `book-home-live-refresh` 变红（`Received: 0`）。用改前备份 bisect：旧键+快照卡 ⇒ 绿；稳定键+快照卡 ⇒ 红；稳定键+`computed` ⇒ 绿；只把 `badgeStatus` 退回快照 ⇒ 恰好该例红。根因 `pages/homepage/components/UmmMediaCard.vue:20` 把 props 一次拷进普通对象再 `v-bind`，Vapor 下 prop 更新永不抵达 `UmmStatusBadge`。⇒ 修法必须是 computed；**先删键后补响应性会造成功能缺失**（与 §11 行 9 / 记忆「性能修法先查旧路径客观替谁兜底」同型，第三次命中） |
| 2 | 广播按可注入主机过滤能否省消息 | **不能走 `tabs.query({url})`；本清单无 `tabs` 权限时它返回空集** | 真实扩展实测：改成 url 过滤后合并复跑 **5 条 e2e 红**（豆瓣两页、PT 淡化 ×2、`/video/` 反向）。回退为 `query({})` + 仅 JS 侧跳过「确知无关」，读不到 url 一律投递；`event-bus-tab-scope.spec.ts` 把「绝不用 url 过滤」写成断言。真要 Chrome 侧过滤需加 `tabs` 权限 ⇒ **权限面变更，入悬置决策** |
| 3 | 释放契约是否覆盖「已排程但未执行」的写 | **否，新缺口一类** | `throttle` 尾调用定时器锁在闭包内，外部无从撤销 ⇒ `releasePageResources()` 只断观察器/加载器/订阅仍留待决写。探针：释放前排队的行/事件在释放后各发一次读取（2→3）并写卡（3→4）。基元改 `Cancellable<T>`；新增 `app-trailing-writers.ts` / `app-notify.ts`；摘掉 `releaseTrailingWriters()` ⇒ 新用例精确红 |
| 4 | 「一次性读取静默降级」反馈面在共享 worker 下能否测 | **不能靠查别人 DOM** | `FloatingToast` 把容器缓存在「第一个把 document 装成全局的文件」上，`toasts(dom)` 在单文件绿、合并跑红（0≠1）。改走 `__bindErrorNotifierForTests` 注入缝记 `(message, detail)` 计数，`afterEach` 解绑（第五类通道：模块级单例绑定必须成对释放）；同时删掉只为让 DOM 窥测可见而存在的 `beforeunload` 补丁 |
| 5 | 我自己引入的两处文档破坏 | **均已复原并入档** | ①首次插 CHANGELOG 时把 `## [5.17.2] - 2026-09-25` 标题一起吃掉，致该版两节悬空挂在 `[Unreleased]` 下；②向 ADR-026 状态表插行时删掉表头与 D1 行首单元格。两者同因：**用「替换锚点+其后若干行」做插入**。已改为「锚点 = 唯一整行，替换为该行 + 新行」，并逐行核验（表头/D1 在位、5.17.2 节对 HEAD 逐行无缺失） |

### 本轮新增的复核规则

34. **删掉一个「看起来像 bug 的机制」之前，先问它此刻客观替谁兜了底**：本轮状态进 `:key` 是重挂浪费，但同时也是徽章唯一的更新路径；先删键会让功能消失而不是变干净。判据与 §11 行 9、X31-B 的全表扫兜底完全同形——**性能/整洁类改动必须配一条「移除该机制后仍绿」的行为断言**。
35. **插入类编辑要用整行锚点，并回读被替换区间**：本轮两次文档破坏都不是逻辑错误而是编辑手法错误（锚点吞行）。落盘后必须用 `grep -c` 断言标题/表头/条目数仍在，条目类文件还要数一遍总数。

## 20. 第十一轮（2026-09-29 19:00）：X90/X91 交互波——两条「绿但无牙」的断言

本轮把最后两个零驱动挂点面（`video` 页型 4 处、导航岛搜索侧 4 处）补成 14 例真实浏览器交互，并新写了一批「先跑就绿」的用例。**绿不等于有牙**：四轮变异里两次当场证伪自己的断言，教训比覆盖数更值钱。

36. **UI 断言必须先排除「平台默认行为」造成的假绿**：删掉它声称覆盖的那一行后仍绿，说明断言测的是浏览器默认而非产品代码。本轮两例：①「归一后光标在末尾」——程序化赋值 `input.value` 本来就把光标留在末尾，`restoreCursor()` 删掉照样绿；②「搜索进行中二次回车不开第二个标签」——拦住第二次提交的是 `:disabled="isSearching"`（HTML 隐式表单提交要求默认按钮**可用**），`doSearch` 里的 `if (isSearching.value) return` 删掉照样绿。处置只有两种且都必须显式：换构造（改成让归一**缩短光标之前**的文本，于是删 `restoreCursor()` ⇒ `Expected: 5 / Received: 12`），或改口径（断言改名并写明它不覆盖哪一行）。**禁止**放宽阈值或留着注释假装覆盖。
37. **「不得多出第二个东西」类零断言不得过滤未完成态**：统计新标签时排除 `about:blank`，等于放过「`window.open` 已调用但导航尚未提交」——正是被删掉的那条守卫会产生的形态。判据：零断言按「全部新增 page」计数，正向断言才允许按 URL 已提交筛选。
38. **首轮合并复跑的红可能落在所有门禁之外**：本轮 `typecheck exit=2`（新加的 `beforeNavigate` 缝写成 `Promise<void>`，而 `context.route()` 返回 `Promise<Disposable>`），其余 17 步全绿——`build` 与两条测试 lane 都不做类型检查。同时再次实证「后台任务退出码会吞掉真实结论」：包装脚本最后一条 `cat` 的 0 一度冒充整轮成功。落盘要求不变：逐步记 `exit=`，结论只认 summary 表。
39. **作者自己的变异清单有系统性盲区，补齐波的测试须过一轮独立复审**：X90/X91 落盘时作者已自做 6 处变异并据此宣称「每条断言都有牙」；派独立只读评审复审**同一批文件**后，又抓出 2 条结构上必绿的断言（等待预算吃掉了被测时序；禁用态读晚了）、1 条永不成立的死断言（前一行已把 URL 钉死）、1 个零覆盖分支（全部用例走 detail 分支，而改动同样作用于列表分支），以及 1 个真实视觉缺陷（占位图标常驻后会被带 alpha 的缩略图透出，而成功例用的正是不透明图）。判据：复审的输入必须是**「断言 ↔ 它声称覆盖的那一行」配对清单**，不是变更摘要或 PR 描述——变更摘要只会引导复审者去看作者已经想到的地方。相关：规则 27–28（先计量再宣称）、§7（分波自测不算验证）。
40. **变异备份必须在改动之前取，还原必须按行核验**：X95 里 round-3 用来"还原"的 `AppearanceTab.vue` 备份，其实是在 round-2 变异**之后**才 `cp` 的，于是还原等于把变异恢复进产品代码——`diff 备份 文件` 依然显示"一致"，因为两者都带着变异。发现方式不是 diff，而是 grep「那一行是否还在」。判据：①备份在第一次改动前取；②还原后除 `diff` 外，还要按被变异的关键行做一次**正向存在性断言**（`grep -c` 期望 1）；③多轮变异之间复用同一备份文件前，先用 `git diff` 对账该文件是否应为零差异。
41. **配对循环里"未命中就跳过"会把多余项藏掉；断言"多入口同目标"前要先证宿主只有一条**：X94 的 movie-profile 例用 `if (!entry) continue` 配宿主行，末尾只要求 `matched > 0`——于是产品侧一个**凭空多出的可点 pill**（`h2` 无计数链接时 URL 退化成裸站点根，仍被 push 进统计项）正好从缝里穿过，测试全绿。X96 更糟：它断言两个「更多影视作品」按钮跳**同一地址**，而宿主明明有两条不同的 `creations?sortby=` 链接——把"两按钮共用一条提取值"这个真实缺陷**钉成了契约**。判据：①配对未命中必须红（`toBeTruthy()` 而非 `continue`）；②凡断言"A 与 B 相同"，先断言宿主/来源处 A 与 B 本可以不同（否则换一条更弱的实现也能过）；③"每个 X 都 Y"这类全称措辞，实现里不允许任何 X 被跳过。相关：规则 36（平台默认假绿）、规则 39（独立复审）。
42. **构建失败时不得读测试结果**：一次 perl 变异把 `@click` 当成 Perl 变量插值吃掉，模板解析失败 ⇒ `dist/` 被清空，21 个用例全红且原因都是「找不到已构建扩展」。这类红与产品无关，若被当成"变异生效"就是双重错误。判据：`build` 退出码非零时先修构建再重跑，测试结果一律作废（与规则 38 同源：结论只认逐步 `exit=` 台账）。

## 21. 第十二轮（2026-09-30 03:55）：X98/X99 面板波——两层防御与「UI 走不到的守卫」

色花堂两个 light-DOM 面板（手动添加 / 查看已看）第一次被真实点击，并补一份单元层补集。本轮的回访价值不在新增 14 例本身，而在**三次「绿得不成立」的当场暴露**：

| # | 复核问题 | 结论 | 证据 |
|---|---|---|---|
| 1 | 查询面板在色花堂页面上真的可用吗 | **否——修复前按钮点不动** | `check-viewed-panel.ts` 内联 `z-index:100`，色花堂 overlay 壳是 `2147483000` ⇒ 面板压在壳下。e2e 首次点击 `#umm-cv-check` 报 `<div id="umm-sht-overlay"> intercepts pointer events`。改 `2147483001`（与 `.umm-overlay` 弹层同档）后通过；**变异复验**：还原该值 ⇒ 恰好查询例红 |
| 2 | 菜单打开面板后焦点在哪 | **被菜单抢回触发器，键盘用户被困** | `sehuatang-menu.ts` 的 `cleanup()` 无条件 `anchor.focus()`，而菜单项动作刚 `input.focus()`。改为仅在焦点无处可去（`null`/`body`/触发器自身）时回交。**变异复验**：还原无条件回交 ⇒ 恰好「面板打开后输入框未获得焦点」红 |
| 3 | 「重复打开不得叠层」能否作为 e2e 断言 | **不能——面板是模态遮罩，第二次真实点击够不到触发器** | Playwright 直接拒绝（`#umm-manual-add-overlay intercepts pointer events`）。处置：e2e 改钉**模态性本身**（穿透 shadow 取触发器矩形 → light DOM `elementFromPoint` 必须命中本面板；shadow 内节点在 light DOM 命中测试里报为 host，故不是同义反复），守卫本身下沉到单元层（X99）。**变异复验**：`.umm-overlay` 的 `z-index` 降到 100 ⇒ **5 例全红**（面板按钮全部点不动） |
| 4 | 空输入守卫 `if (!val) return` 有测试认领吗 | **e2e 层没有——两层防御** | 删掉该行后 x98 **5 例全绿**：背景 `handleAdultAvAdd` 同样 `if (!id \|\| !source)` 拒空。补 `tests/unit/content-panel-guards.spec.ts`（9 例）把观测点换成 **`chrome.runtime.sendMessage` 的次数与载荷**，删守卫即红。**变异复验**：四处（空输入守卫 / `getElementById` 防叠层 / 查询空输入守卫 / `parseInt(ratingSelect.value)`）各自只让受影响的用例红 |
| 5 | 「未入库只出一行」的断言可靠吗 | **不可靠——异步渲染竞态** | `doCheck` 是 `async`（先 `getAll` 再写 DOM），点击返回后立刻 `count()` 会把**上一次**的三行当结论（首轮实测 `Expected: 1 / Received: 3`）。改成 `expect.poll` 观察到稳态，未加 sleep |

**合并复跑末态（18 步逐条 `exit=` 台账，非分波自测）**：type-check / arch / ds / scope / naming / size / doc / orphan / any / isolation / console / i18n / lint / format:check / build **全 0**；`test:unit` **2742 passed**（并行 1.3m）；串行复跑 `--workers=1 --retries=0` **2742 passed**（2.4m，零分配相关差异）；`test:e2e --workers=1 --retries=0` **192 passed**（5.7m）。

### 本轮新增的复核规则

43. **两层防御会让「e2e 全绿」误证「这一行有人认领」**：删掉面板的空输入守卫，5 条真实浏览器用例全绿——背景 handler 同样拒空 id，删任一层产品行为都不变。判据：某行删掉后所有产品级测试仍绿 ⇒ 先分辨「别处冗余兜底」还是「无人认领」；前者把断言**下沉到能观测该行的层**（单元层盯 RPC 调用次数与载荷，而不是界面结果），并在测试注释里写明 e2e 为何看不见它；后者当场补测试。相关：规则 36（平台默认假绿）、规则 41（跳过式配对）。
44. **模态遮罩之下的守卫不可能从 UI 触达，别把「点两次不出两份」写成 e2e**：写这类断言前先确认第二次操作在真实层可达（Playwright 会用 `intercepts pointer events` 拒绝）。不可达时的正确处置是**换判据而非放宽**：e2e 钉上位性质（遮罩的模态性：light DOM 命中测试必须落在遮罩上），守卫交给单元层的程序化重复调用。
45. **`mode:'serial'` 的 spec：首个失败会把其余用例标成 `did not run`，那不是绿**：变异轮必须**逐例 `-g` 单独跑**（`--max-failures` 绕不过 serial 语义），收尾核对「实际跑过的条数 == 文件里的条数」。本轮一条红曾让同文件其余 8 例整轮未执行，看起来像「只有一处受影响的干净变异」，其实是量具没跑完。

## 22. 第十三轮（2026-09-30 05:25）：X101/X102 —— 一次旧结论反转 + 复核再抓一条空转判据

本轮先回访 §18 的两项旧判定，再落导航岛的 i18n 提取与第一条「语言抵达 overlay」用例，并派独立复审核回打 X98–X100。

| # | 回访问题 | 结论 | 证据（本轮实测） |
|---|---|---|---|
| 1 | §18 行 2「X62 的 i18n 迁移在豆瓣路径上用户可见收益为 0」现在还成立吗 | **不成立——已反转** | `grep -n "await initI18n();" src/scenario/douban/main.ts` = 115 行命中（后续波次已接装配）。新增 `tests/e2e/x101-douban-overlay-locale.spec.ts` 直接量出结果：夹具浏览器 `navigator.language=en-US` 且存储无 `language` 键时，导航岛渲染英文；把存储设为 `zh-TW` 后渲染繁体。即 `t()` 的解析链在真实浏览器里是通的 |
| 2 | §18 行 3 的「另复现 3 处」今天各是什么状态 | **① ③已闭合；② 仍开着，且比记录更宽** | ①legacy 主题：`src/entrypoints/content.ts:188` 已有 `startThemeAttrSync({ background: false })`。③zh-HK 集合不对称：单一事实源 `src/libraries/locale-sets.ts`（`EXTENSION_LOCALES` 含 zh-HK），`webdav-restore.ts:63,87` 由它派生。②日志装配：`bootstrapLogging` 调用点实测为 `content.ts:137`、`bilibili.content:29`、`bilibili-homepage.content:36`、`youtube-homepage.content:42` —— **`douban-early/douban-main/sehuatang-early/sehuatang-main` 四个入口仍无**，故豆瓣/色花堂页面上「调试日志/日志级别」形同不存在（logger 默认跟随 `import.meta.env.DEV`，生产恒静音、取不到诊断）。已开工单（X103） |
| 3 | 导航岛还剩多少裸中文 | **0（12 串全部入词典）** | 提取前探针量出该文件 21 行含中文；本轮把 12 条用户可见串（导航五档标签、容器与提交按钮 aria-label、四条按频道派生 placeholder、`'搜索豆瓣' + label` 合成）改为 `douban.island.*` 键 × 4 份词典，zh-CN 值逐字保持原串（默认语言下可见文案零漂移）。`grep -n "[一-鿿]" UmmDynamicIsland.vue` 在非注释行上已为空 |
| 4 | 抽取会不会把既有断言变成"碰巧绿" | **会——当场抓到一处，改写后重新验牙** | `x91-island-search` 硬断 `placeholder='搜索游戏'`、`aria-label='搜索豆瓣游戏'`：抽取后渲染语言取决于运行环境，该字面量不再是契约（首轮即红）。处置不是放宽而是**换成 locale 无关判据**：占位文案与 aria 必须包含「island 自己活动频道按钮上读回的标签」。变异复验：把 placeholder 改成恒定电影档 ⇒ 恰好该例红（`两个频道共用同一条占位文案`） |
| 5 | X101 那组用例真的钉住了装配时序吗 | **没有——如实降级主张** | 把 `await initI18n()` 换成 `void initI18n()` 后四条用例**全绿**（挂载不在该 promise 落定前读语言）。故本组只证明「链路调用了 `initI18n()`」（把调用整体删除时 3 红 1 绿），不证明 `await`。头注已按实测写明它不覆盖什么 |
| 6 | X98–X100 的断言有没有"绿得不成立"的 | **四处，均已修** | 派独立只读复核（规则 39 的机制）抓出：①x100 入场例是空转零断言（无卡片时必绿，而失败文案自称能抓这种情形）且逐分区那次 `runVisibleEntrance` 无人认领；②x98 非法 JSON 例只数弹窗条数（`alert('boom')` 也绿）；③x98 空输入例标题写「不清空」而无对应断言，且结构上不可能认领面板守卫（背景 handler 先拒空 id ⇒ 清空执行不到）；④写趟探针可见性只在端点抽查。修法见 ADR-026 X102 行；①改为带正向前缀的双向判据后，单删 `runVisibleEntrance(section)` 恰好令该例红 |

**合并复跑末态（第 15 次全仓合并复跑，2026-09-30 05:41，18 步逐条 `exit=` 台账）**：type-check / arch / ds / scope / naming / size / doc / orphan / any / isolation / console / i18n / lint / format:check / build **全 0**；`test:unit` **2742 passed**（56.5s）；串行复跑 `--workers=1 --retries=0` **2742 passed**（2.1m，与并行同数——零分配相关差异）；`test:e2e --workers=1 --retries=0` **200 passed**（5.2m，含 X100 4 例 + X101 4 例，两份新 spec 各 4 行 `ok` 已在日志中逐条核对）。上一节表 5 的"待补"即以此为准。

### 本轮新增的复核规则

46. **全称判据与零断言必须自带"主体集合非空 + 两个方向都可达"的正向前缀**：`document.querySelectorAll('X:not(Y)').length === 0` 在"一个 X 都没生成"时必绿，而这常常正是它声称要防的失效形态；同理"所有 A 都与 B 相符"在 A 为空、或 A 全部落在同一侧时退化成套壳。判据：写这类断言时，同一用例里必须断 ①主体数量等于夹具声明数（本轮：`sections===12` 且 `cards===24`）②被判定的两个方向都真实可达（视口内有卡、视口外也有卡）。相关：规则 41（跳过式配对藏多余项）、X92 的"死断言"。
47. **装配类用例只能证明"调用存在"，不得顺手宣称证明了"调用时序"**：本轮把 `await initI18n()` 改成 `void initI18n()`（顺序缺陷的真实形态，§18 行 2 就是这类）后，四条真实浏览器用例全绿——因为挂载并不在那一 promise 落定前读取语言。判据：主张里只写变异能分辨的那部分，并把"分辨不了什么"显式写进头注；若确实需要证时序，得另造一个"读取发生在解析之前"的场景（延迟应答 + 前提断言），不能靠删除调用那种变异来冒充。

## 23. 第十四轮（2026-09-30 06:05）：X103 —— §18 行 3 ② 闭合，并把它变成有守卫的装配判据

§22 表 2 记下「日志装配仍缺四个入口」。本轮闭合它，并按规则 32 的要求把这类缺陷变成**逐入口枚举的守卫**，而不是靠下一次人肉回访。

| # | 动作 | 证据 |
|---|---|---|
| 1 | 既有守卫覆盖情况（**本轮最大的自纠**） | 本仓**早就有**这道守卫：`tests/unit/x26e-entry-init-parity.spec.ts`（451 行，含 6 条自检种子）的 `LOGGING_GAPS` 基线点名登记着这两条缺口，注释还写着「由并行 agent 持有」。我先用 `grep -rln entrypoints tests/unit | head -12` 找既有守卫——**列表被 `head` 截断，恰好把它切掉了**，于是新写了一份重复守卫 `logging-init-wiring.spec.ts`。抓住我的不是运气而是全仓合并复跑：x26e 的棘轮例判红「`src/entrypoints/douban-main.content/index.ts` 已能走到日志初始化，请把它从 LOGGING_GAPS 删掉」——基线棘轮按设计把"补好了却没同步基线/重复劳动"揪了出来（分波自测永远看不到，因为两份守卫各自都绿）。处置：删除重复守卫；x26e 的 `LOGGING_GAPS` 清空；并把两个主入口**加进它的点名清单**（该例改名「legacy、三个视频入口、豆瓣与色花堂主入口」——只清基线不点名，改天被删调用只会退化成"未登记缺口"，点名才是真锁）。合并复跑后 x26e + i18n 两份守卫 26/26 绿。 |
| 2 | 接线 | 两入口 `main()` 顶部 `await bootstrapLogging()`，位置先于任何路由判断（风控页/帖子页也要能取证），与 legacy 及三个视频入口同形。 |
| 3 | 顺带闭合第二条登记缺口 | `i18n-init-wiring.spec.ts` 的 `LIVE_SYNC_GAPS` 原登记 `sehuatang-main` 缺 `startLocaleSync()`；本轮补上并把该项**从基线删除**（棘轮语义：补好却不删基线同样判红，故这次删除是被迫且必要的）。 |
| 4 | 探测器重复：如实登记而非半迁移 | 本轮抽出 `tests/unit/helpers/entry-graph.ts`（入口枚举 / `@/`+相对路径解析 / 静态+动态 import 图 / 声明≠调用 / 成员访问不算裸调用 / 剥注释），并由 `i18n-init-wiring.spec.ts` 消费（515→443 行）。**x26e 仍带自己那份探测器**，本轮不做迁移：它的 `contentEntries` 用**剥注释后**的源码判 `defineContentScript`，而 helper 判原文——照搬会削弱那条入口识别；两边还各有 `calledInOwnFile` / `countLogCalls` 等专属判据。合并一份是独立一测（须连带把 x26e 的 6 条种子搬过去自证），登记为待办；当前实际重复数是 2 份（本轮之前是 2 份：i18n 与 x26e 各一份），没有因为我的误判变成 3 份。 |
| 5 | 真实浏览器证人（不只是静态可达性） | 新增 `tests/e2e/x103-sehuatang-live-locale.spec.ts` 2 例：色花堂列表页挂载后把存储语言改成 en-US，**重新打开** ☰ 菜单（菜单每次点击重建，是唯一能显示「挂载之后 t() 用了新语言」的界面）；另一例钉「不改语言时菜单保持初始语言」，否则"恒英文"也能过。 |
| 6 | 变异取证 | ①删 `startLocaleSync()` ⇒ 恰好在线同步例红（`Expected: "Menu" / Received: "菜单"`），对照例保持绿；②删 douban-main 的 `await bootstrapLogging()` ⇒ x26e 的"日志无未登记缺口"例与"事故本体点名"例**同时红**（清空的基线让缺口无处藏），其 6 条自检种子保持绿（红来自判据而非探测器坏）；③还原后 build 0、e2e 2/2、两份守卫 26/26。 |

**遗留（如实）**：`bootstrapLogging()` 只保证"读到设置"，不保证"首条日志之前就读到"——早期入口（`*-early`）的壳层诊断仍可能落在默认级别上；本轮没有为它加断言，因为那需要一个"在 storage 读完成之前先记日志"的可控场景，属独立一测（记入待办，不当已完成）。
| 7 | 我自己犯的流程错（值得入档） | 两次：①**用 `head` 截断证据列表**，把既有守卫切掉，导致重复实现；②在文档里先写了"探测器只留一份"的结论，实际只迁移了一份。两者的共同根是**先写结论、后补证据**。修法不是删字，而是把结论改成本表 1/4 的实测叙述，并把这条列成规则 48。 |
48. **新建守卫之前先按"主题"搜既有守卫，且证据列表一律不得截断**：本轮 `grep -rln entrypoints tests/unit | head -12` 把已经存在的 `x26e-entry-init-parity.spec.ts`（同一主题：内容入口初始化装配）切出了视野，于是重复写了一份守卫，还被自己在文档里写成"探测器只留一份"。判据：①找守卫用**主题词**（日志/主题/locale/装配/parity/wiring）而不是只搜被调用的符号名——守卫读的是图可达性，未必出现那个符号；②列举候选时不许 `head` 截断，宁可 `wc -l` 后再分页；③合并复跑是这类重复/基线漂移的唯一证人（分波自测里两份守卫各自都绿）；④文档结论必须在实测之后写，改结论时改正文而不是追加"后来发现"。

## 24. 第十五轮（2026-09-30 11:15）：X105 —— i18n 抽取的安全判据是「MATCH 不变」，不是「抽了多少」

X105 把豆瓣 overlay 的第二批裸中文接进词典（`status-labels` getter 化、标记条星级表、对话框按钮与标题、页脚版权行 + 六条链接、`useInterest` 的会话/缺 `ck` 错误）。这一波的**主要风险不是抽不完，而是抽错**：Douban 的宿主 HTML 本身是中文，任何「拿去和页面文本比对/选择」的字符串一旦进了词典，换语言就会静默破坏解析——而这类破坏在测试里通常表现为"某条用例找不到元素"，容易被当成夹具坏了。

| 判据 | 结果 | 说明 |
|---|---|---|
| authored CJK units（`src/scenario/douban`，HEAD→现在） | 286 → 174 | 探针为自建，4 条自检种子 + 一份正向对照串；before 用 `git archive HEAD` 出副本，不碰工作树 |
| RENDER（真 i18n 债） | 70 → 52 | 本波四文件清零 60 单位：status-labels 32 / interest-bar 13 / use-interest 8 / page-layout 7 |
| AMBIG（需人工判读） | 128 → 34 | 剩余 34 条待逐文件读（如 `media-formats.ts` 的介质名可能是宿主数据） |
| **MATCH（宿主匹配串，禁止抽取）** | **88 → 88** | **本轮真正的安全证据**：数量恒等 ⇒ 抽取没有触碰解析依赖 |

- **新增 13 条单元用例，两条"判据选型"值得留档**：①文案契约不能拿 `t()` 自己当期望（恒真）也不能复制字面量（会腐烂），正确形态是**按 key 从对应 locale 词典取期望值**——这样"键接错"（页脚 about 位上用了 jobs 键）才有证人；②语言切换必须打**两次挂载**（同一模块实例，不重新 import）才证伪"加载期快照"，`umm-page-layout` 那条还顺带证伪了"存在第二份 i18n 实例"（否则 en-US 用例根本不会红）。
- **`useInterest` 的错误文案此前零覆盖**（`grep err_session tests/` 无匹配）。这类"只在失败时出现"的串最容易长期无人测，而它的两条分支（`err_session_maybe` / `err_session`、`err_not_logged_in_refresh` / `err_no_csrf`）恰好是**互换后界面仍像正常**的那种。新用例把两条分支都跑一遍并额外断"两条分支文案必须不同"——同值即说明被接成了同一个键。
- **一次工具自伤被抓**：变异脚本用"反替换"还原，`to` 在文件里不唯一时会写坏源码（页脚 about→jobs 后文件出现两处 jobs，反替换把真 jobs 一起改了；空串 `to` 更让 `replace('', x)` 把内容插到文件首行）。两处都是 hash 比对当场报 `restored=false` 才发现——**损坏不是靠人眼发现的，是靠那道 hash 断言**。改法不是放宽判据，而是把"还原"重新定义为"写回本轮开始前读到的原文" + 收尾逐文件总查（8/8 变异被抓、4/4 文件逐字节一致）。
- e2e 侧按 §22 的教训同波改：`x35` 6 例改为 `data-umm-pick` 锚点 + 「选项文本 ↔ 条上回显」配对（并先断配对文本非空，防空转）；`book-home-live-refresh` 那个文件原本就写着"表移进 i18n 时同波改成 locale 派生"，本轮正是那一波，处置是**先钉 zh-CN 再断具体串**（保留它"能抓键接错"的能力）；`setStoredLanguage` 从 x101 局部助手提升进 harness。

## 25. 第十六轮（2026-09-30 11:25）：X106 —— 「调用了同步监听」被量成装饰性装配

X103 把 `startLocaleSync()` 接进豆瓣主入口，`main.ts` 注释据此宣称「Options 改语言不回填已开标签页」这一缺陷已修。**本轮复验：该说法不成立**。改存储语言后，已挂载 overlay 的 5 个导航标签恒旧（`Expected: not ["Movies","Music","Books","Games","Me"]`），而同一改动在重载后立刻生效——即监听器确实在跑，只是把值写进了一个**没人再读**的模块变量：`t()` 不是响应式来源，Vue 树没有依赖可失效。这是 §18「声明但未接线」的一个新变体：**接了线，但接到的地方不会动**。

- **修法先算代价**：最"正统"的做法是把 locale 换成 `shallowRef`。实测 `dist/chrome-mv3/content-scripts/douban-early.js` 与 `sehuatang-early.js` 零 vue 标记——两个 `document_start` 包是首帧路径，引入 vue 与之相悖（且仓库已有减包诉求在档）。故取"无框架的订阅接口 + 挂载层重挂载"：i18n 只加 `subscribeLocale()`/`applyLocale()`（仅值真的变化才广播），`main.ts` 订阅后重跑该页 `mountFn()`，复用 `mountUmmOverlay` 已有的 `releaseLiveMount` 重入通道（与"挂载失败点重试"同路），并加单飞守卫。
- **同波补一条"回填不留 residue"**：重挂载走同一条样式注入通道，不去重就每次多插一份等价 `<style>`。给页面样式打 `data-umm-page-css` 并在注入前摘旧节点，**同时把"回填后样式数量不变"写成用例**——否则这段去重就是无人认领的死代码（§21 的老毛病：写了防御但没有证人）。
- **探针选择纪律（本波最该复用的一条）**：观测面必须选**不会被重建**的那块。标记对话框每次打开都重建、色花堂 ☰ 菜单每次点击都重建——用它们测"在线回填"，零回填代码也能通过；X103 的色花堂例正是靠"重新打开菜单"才成立，那本身不构成在线回填的证据。
- **3 处变异逐例归因（每处一次重建）**：删 `subscribeLocale` 订阅 ⇒ `failed=2 / passed=1`（在线 + 样式红，重载对照绿）；`applyLocale` 不广播 ⇒ 同一形态；去掉样式去重 ⇒ `failed=1 / passed=2`（恰好样式例红）。三个判据各自只认自己那半条实现。

## 26. 新增规则（第十五、十六轮并档）

49. **改写源文件的脚本，"还原"必须是写回开始前读到的原文，不能是反替换**：变异/试验脚本常以「把 A 换成 B 跑一遍，再换回来」实现，但 ①B 在原文件里未必唯一（把 `about` 换成 `jobs` 后文件里就有两处 `jobs`，反替换连真那行一起改）；②B 为空串时 `String.replace('', x)` 是**在文件头插入**而不是删除。判据：脚本起手把原文留在内存里，收尾 `writeFileSync(original)` 并比对 hash；整轮结束再逐文件总查"与开始前逐字节一致"。本轮两处损坏都是被这道 hash 断言报出来的，不是被人眼发现的——因此**收尾总查本身也必须是断言而不是打印**。
50. **「装配存在」与「装配有效」是两件事，测试必须打在会被渲染的那一侧**：接了监听函数、初始化了变量，都不等于界面会更新——`t()` 读模块级 `let` 时，`startLocaleSync()` 换的值没有任何渲染方依赖它。要证"设置抵达界面"，必须 (a) 选一个**不会被重建**的观测面（每次打开都重建的对话框/菜单会伪装成在线生效），(b) 配一条**重载对照**（区分"存储链路不通"与"只是不回填"），(c) 用变异证明"只删监听"和"只断广播"都会红。同类：任何"我调用了 X 所以效果成立"的注释，都要能被一条把它删掉就红的用例背书。

## 27. 第十七轮（2026-09-30 本地 20:2x）：X107 —— 抽 40 单位入词典，并把「词典真的被渲染」做成双挂载见证

X105 遗留的 RENDER 52 里，本轮清掉 **40**：`pages/user-profile/App.vue` 17 / `pages/personage-creations` 10（App 4 + data 6）/ `pages/book-profile/App.vue` 7 / `pages/homepage/App.vue` 4 / `overlay/mount-failure.ts` 3，并把这五个文件的**模板文本**（探针口径外的 authored CJK）一并清零。`units 174→130、文件 34→29、RENDER 52→12、AMBIG 34→33`；**MATCH 88→85** —— 3 条徽标串（想看/在看/看过）原被 `===` 启发式误分类成 MATCH，随抽取消失，属分类噪声清除而非解析面触碰（本波未改任何宿主匹配串）。

| # | 复核问题 | 结论 | 证据（本轮实测） |
|---|---|---|---|
| 1 | 「RENDER 清零」有没有把宿主匹配串也抽走 | **没有** | 五文件非注释 CJK 清零（`grep -n [一-鿿]` 仅余注释与 2 条宿主匹配正则）；徽标/角色改为**键**形态——数据层不产终串，渲染层 `t()` 解析（否则 X106 的在线回填读到冻结值） |
| 2 | 「键在词典里」能否证明「界面用了它」 | **不能；新增双挂载见证** | `tests/e2e/x107-douban-chrome-locale.spec.ts` 4 例：每页 zh-CN / en-US 各挂一次，代表性结点 === 该语言词典值，且**先证两语言期望值不同**。9 处变异逐例归因（见 ADR X107 行）；mount 面板「重试」硬编码只让 en-US 挂载红、zh-CN 绿——双语言设计当场自证 |
| 3 | 给断言加「防环境漂移」的加固是否承重 | **一处不承重（自纠）** | 曾给 x94 加 `setStoredLanguage(zh-CN)`；删掉该行的变异**全绿**——movie-profile 统计条标签是**宿主派生**（`movie-profile-data.ts` 从宿主 DOM 读文本），加固属装饰性编辑。按规则 44 撤除并在原位留注释（写明为什么不需要），不与断言绑定假因果 |
| 4 | 两条钉中文文案的既有断言 | **改文案无关且更强** | x50 `toHaveText('影视')` → 身份/索引断言（活动页签 = nth(0)；同该文件给 sort 按钮的处置）；x41 `hasText:'前页'/'后页'` → `.umm-paginator-btn` 计数=1（首页只该有一个按钮）+ 宿主 next 游标比对。两处变异各自只命中各自的例 |
| 5 | 首轮合并复跑抓到的三处红 | **均修（两处非本波引入）** | ①`typecheck exit=2`：新 spec 的 `dict()` 未过 `noUncheckedIndexedAccess`（改 throw）；②`format:check exit=1`：4 个文件待格式化；③`console:check exit=1`：**152 vs 基线 149——三个文件各多 1 处**，基线只存每文件计数、**无法逐行归因到波次**；按门禁契约把 3 处错误路径诊断改走 `logger`（含 X106-leftover 的色花堂 remount 失败分支），152→149 回到基线内 |
| 6 | 最终仓库级合并复跑 | **19 步逐条 `exit=` 全 0** | 16 项静态/build 全 0；unit **2782 passed**（并行 1.1m / `--workers=1 --retries=0` 串行 2.1m）；e2e **221 passed**（6.5m，含本波 4 例，逐条 `ok` 已核）。较 §22 记录的 200 例 +21：本波 4 例已逐条核对，其余增量未逐条拆分 |

### 本轮新增的复核规则

51. **「为了稳」而加的 setup 也必须过一次「删掉它」的变异**：本轮给 x94 加语言钉的理由（"宿主是中文、浏览器是 en-US"）只对**词典派生**文案成立；movie-profile 的标签是**宿主派生**，删掉钉子的变异全绿——加固不承重即为装饰。判据：任何 pin（locale / 时区 / 冻结时钟）先跑一次「删掉它」；绿 → 撤除并在原位写明为什么不需要（留着会让后来者误以为断言依赖它）。反例对照：X104 的 `window.__ummNoNav` 哨兵（加了才有牙）说明**能分辨"什么都没发生"与"同址重载"的加固才是承重的**。
52. **对账/差分类结论必须来自全量数据——先确认工具输出有没有截断**：`console:check` 默认只打印前 40 条命中（`hits.slice(0, 40)`），拿它做"哪些文件多了"的减法会得到 12 文件/40 条的假分母（本轮实测：真值 64 文件/152 条）。判据：凡「基线 vs 现状」的差集判定，先读工具的打印逻辑确认无截断；无全量模式时，用**副本改打印上限、用完即删**（`scripts/tmp-*.cjs` 只活在两次调用之间），不要拿上游截断输出做减法，也不要用自写匹配脚本来替代全量扫描（AST 口径与正则口径会漂）。
53. **只存计数的基线棘轮，"新增项"不可逐行归因——报告必须显式声明**：`console-baseline.json` 只存每文件计数，于是"152−149=3 处新增"无法定位到具体行/波次（三个文件各 +1，与本机 09-30 15:04–15:06 那批改动的时间吻合，但不可证）。处置按门禁契约（回到基线内即可），报告如实写"不可逐行归因"，**不许**在文档里编造归属。
54. **探针口径会漏掉一整类负债：模板文本**：`cjk-inventory.cjs` 只数引号/反引号内的 CJK，`.vue` 模板里 `>暂无作品信息<` 这类标签间文本不在口径内（本轮五文件按"文件级非注释 CJK 清零"处理并单独声明）。若要给其余页面立债务台账，需要一个**模板文本口径**的探针；两口径不可混用、数字不可相加。

### 遗留（X108 候选，按登记顺序）

- **RENDER 12**：`photos/App.vue`（2；含下载控件 `title` 中文——其源码扫描断言在 `douban-mark-dialog-a11y.spec.ts`，动它须同波改）、`movie-profile/App.vue`（2）、`detail/App.vue`（2）、`game-detail/App.vue`（1）、`book-homepage/App.vue`（1）、`celebrities/App.vue`（1）、`doulist-detail/App.vue`（1）、`series/App.vue`（1）、`book-profile/data.ts`（1）
- **AMBIG 33** 待逐文件判读（`shared/media-formats.ts` 7 条介质名等，可能是宿主数据而非自产文案）
- **模板文本口径探针**（规则 54）
- 前波遗留：x26e 探测器合并（两份 → 一份，X103 登记）、`bootstrapLogging()` 首条日志时序断言（X103 登记）

## 28. 第十八轮（2026-09-30 本地 21:4x）：X108 —— RENDER 清零、模板文本首次计量、见证扩到 9 页

X107 登记的「RENDER 余 12」本轮清零，并把「数据层不产终串」这条红线补到三类此前漏网的形态（兜底值 / Heading 常量 / 归一标签表）。同时首次给**模板文本口径**立起探针（规则 54 收口），把剩余的模板文本负债变成可复跑的 65 单位清单。

| # | 复核问题 | 结论 | 证据（本轮实测） |
|---|---|---|---|
| 1 | RENDER 12 是否清零 | **是** | 引号口径 `units 130→86、文件 29→18、RENDER 12→0、AMBIG 15→8`；12 单位逐文件点名（photos 2 / detail 2 / movie-profile 2 / book-profile-data 1 / game-detail 1 / book-homepage 1 / celebrities 1 / doulist-detail 1 / series 1） |
| 2 | 「数据层产终串」还有哪些形态 | **三类，均已拆** | ①兜底值：`displayName` 的 `用户 ${userId}` → 数据层空串 + 渲染层 `douban.user_fallback`（unit 断言改空串，兜底产物由 x108 的 h1-stripped transform 用例作证）；②Heading 常量：`synopsisHeading`/`celebHeading` → `*Key`；③归一标签表：`FORMAT_LABELS`（值 '数字'）→ `FORMAT_LABEL_KEYS`，`FORMAT_COLORS` 同步改为按**宿主串**直查（否则颜色查表会依赖被本地化掉的显示名） |
| 3 | 计数格式化的 i18n 怎么落才不漂 | **中文逐字保留 + 非中文走 Intl** | 新 `shared/format-count.ts`：doulist-detail 的 k 档与 series 的千分位两套历史渲染在 zh 路径逐字保留（阈值统一属产品决策、待办），en 走 `Intl` compact（12.3K）；`tests/unit/format-count.spec.ts` 5 例（含边界 9999→'10.0k' 与 en「12.3K」）。**4 处句内计数带样式**（共 N 项/本页 N 项/共 N 本/N 册）拆 lead/tail 键，保住 `.umm-*-stat-value` 节点——若改成整句插值，数字的 600 字重会被静默吞掉 |
| 4 | 见证面是否够 | **9 例双挂载 + 2 处「现场配对」** | 新 `x108-douban-chrome-locale-2.spec.ts`：celebrities 的 title 用**该卡片自己的名字**拼期望值；doulists 的徽标文本与该卡片**自身的分类类名**配对（单纯集合包含会放过 category 互换——首版就是这样，被自己加强）；movie-profile 因该页另有宿主标签条，保留「集合包含」但前置两语言期望不同 |
| 5 | 「撤除的防御是否永远不承重」 | **否——x94 语言钉承重性反转** | X107 实测删语言钉全绿而撤除；X108 抽取后该页出现**词典标签条**（收藏的影人/我的影评），与中文宿主行的配对循环必须中文渲染 ⇒ 不钉则红。已钉回并在注释里写明两段历史与前提。判据见规则 55 |
| 6 | 首轮复跑的两处红 | **均修** | ①`orphan:check` 点名新模块 `format-count.ts` 无测试引用（补 spec 后 PASS：214 covered / 37 uncovered，基线holds）；②`format:check` 12 文件待格式化（全仓 Oxfmt 后绿） |
| 7 | 一次 e2e 假红与一次台账污染 | **根因=我并发跑了两条 lane（kill 的旧 sweep 子进程存活），共用 `test-results/` 与 e2e.log** | 症状：e2e 在 4m48s 提前 exit=1（无失败明细），同时另一条 e2e 仍在写同一份日志；summary 亦出现旧 run 的尾部行。处置：`taskkill` 清掉遗留 node（3 个）+ ms-playwright chromium，隔离后单跑取数；教训入档规则 56 |
| 8 | 末态台账（复审修复后） | **18 步 exit=0 + e2e 单 lane 231/231** | unit **2790/2790**（并行 + 串行 `--workers=1 --retries=0`；增量 +8：format-count 5、detail/series 词典配对 2、media-formats 消费端扫描 1）；e2e **231 passed**（9.1m，含 x108 10 例：9 页双挂载 + doulist-detail 整句例）；16 项静态/build 全 0。**两轮全量 e2e 曾各出现 1 例负载型 flake（互不相同：imdb teardown 超时 180s / x103 重挂载印章），经隔离复跑均绿（imdb 3/3、x103 `--repeat-each=2` 6/6），第三轮全量 231/231 零红**——flake 判据与两种见证已入项目记忆（`e2e-load-flakes.md`），硬化属独立任务 |

### 本轮新增的复核规则

55. **同一行代码的「承重性」会随依赖漂移——撤除/保留都要带前提与日期**：x94 的 `setStoredLanguage(zh-CN)` 在 X107 被实测证伪后撤除（当时标签是宿主派生、语言无关），X108 抽取上线词典标签条后同一行变成**承重**（不钉则配对循环红）。判据：撤除类结论写进注释时，必须写明「在什么前提下不承重」（例如「只要标签仍由宿主派生」），一旦该前提被后续波次改变，撤除即失效——波次回访清单里要有这类「条件性结论」的位置。
56. **取数（计数/计时/台账）前先确认没有另一条同仓 lane 在跑**：kill 顶层脚本不会自动带走 `npx playwright` 的子进程；两条 lane 共用 `test-results/` 与日志会互相污染，产出「无失败明细的 exit=1」这种**假红**。判据：重跑前 `Get-Process node`/`ps -W` 点名核对（只看启动时间晚于本会话的）；ledger 只认单条 lane 独占运行的日志；遇到无明细的红，先查进程与产物目录竞争，再怀疑代码。
57. **「数据层不产终串」要覆盖兜底值与查表值，不只覆盖「显示位置」**：displayName 的兜底、`*Heading` 常量、`FORMAT_LABELS` 归一表都不是「渲染那一刻的字面量」，但它们同样是**在提取/加载期就定死的用户可见串**——语言设置到不了它们。判据：`*-data.ts`/`*-extract.ts`/共享常量表里凡有展示用途的 CJK 一律发**键**（或返回空/原始数据让渲染层解析）；查表值被用作**另一个查表的键**时（格式归一 → 颜色类）要先把键域从显示名上解耦。

### 复审回打（独立只读评审，2026-09-30 本地 22:3x）

按规则 39 派独立只读评审复核 X107/X108 的「断言 ↔ 它声称覆盖的那一行」配对（输入为配对清单而非变更摘要）。评审逐例确认主断言设计成立（双挂载 + `dict()` 期望不是同义反复；movie-profile 的「集合包含」两侧可达；celebrities 的现场配对与 doulists 的「类名↔文本」配对不空转；x94 的语言钉承重结论成立），同时抓出 **3 处必修**并暴露 2 个工具口径问题：

| # | 发现 | 性质 | 处置（本轮已落） |
|---|---|---|---|
| 1 | **空串 i18n 值 + `t()` 的 `||` 兜底 = 键名泄漏**：4 处「句内计数」拆出的 lead 键在部分语言下有意为空，truthy 兜底把空串当缺键，最终返回**键名本身** ⇒ series「`douban.series.volume_count_lead12 册`」（四语言全中）、doulist-detail en「`douban.dl.total_lead35 items`」 | 本波引入的真缺陷（用户可见；原 8/10 用例全绿放过） | `t()` 改**存在性判据**（`hasOwnProperty` + `??`：空串是合法译文）；x108 新增 doulist-detail 例 + series 整句断言（`composedPattern`）；以「回退 `t()` 到 truthy」的变异复验——恰这两例红、其余 8 例绿 |
| 2 | **`FORMAT_COLORS` 键域切换后漏改一个消费端**：UmmSearchCard 用**本地化显示名**查色表（zh 下 `FORMAT_COLORS['数字'] === undefined` ⇒ 数字介质 chip 丢色；en 恰好命中 `'Digital'` 所以假绿） | 真缺陷（本波键域切换引入） | 组件改为 `FORMAT_COLORS[mediaFormat.hostFormat]`；`media-formats.spec.ts` 增「消费端必须以宿主串查色表」的源码扫描断言（与 a11y spec 的 photos 下载扫描同型） |
| 3 | **series 排序项文案仍是数据层终串**（`'按收藏人数排序'`/`'按出版时间先后排序'`），且被探针 `!=='` 同行启发式**误判为 MATCH**（`active: order !== 'time'` 同行） | 违反本波红线 57 + 探针口径缺陷 | 两键入词典（`douban.series.sort_collection` / `sort_time`）、`SeriesSortOption.labelKey`、渲染层 `t()`；series-data.spec 改断言 + 词典配对；x108 增排序项文本断言。**探针口径如实登记**为该工具已知残差（本波已把该文件被误判的两串真抽出，RENDER 仍为 0） |
| 4 | x56 的文案无关化丢掉 page-info 的**文案见证**（改法与强度本身正确，但无替代） | 见证缺口 | x108 photos 例补 `douban.photos.page_info` 的模板正则断言 |
| 5 | `expectBilingual` 未覆盖全部被断言键（8 键只靠「当前四语言恰好不同」兜底） | 守卫缺口 | x108 三例的键清单补全（含 `douban.dl.cat_*` 全族） |
| 6 | x104/x78/x90 的字面量期望在「回退硬编码」时仍会全绿 | 判据强度 | 三处期望改为 `locales['zh-CN'][key]` 词典取值（强度不变、去掉假绿通道） |
| 7 | `format-count.spec` 的 `withLocale` 复位在 try 之外；注释「逐字保持」对 series 侧不严谨（旧实现是无参 `toLocaleString()`） | 卫生 / 措辞 | 复位移入 `finally`；注释改为「zh 浏览器下等价」 |

### 由此新增的复核规则

58. **i18n 的「空串」是合法值，取词必须用存在性判据**：`dict[key] || fallback || key` 会把有意留空的译文一路跌成**键名**并直接渲染（`douban.series.volume_count_lead12 册`）。判据：`t()` 用 `hasOwnProperty` + `??`；断言侧对「句内三段式」（lead+计数+tail）必须断**整句**——只断数字节点会让泄漏全绿；新增空值键时同波给整句断言。
59. **查表键域切换（显示名 → 宿主串）必须 grep 全部消费端**：`FORMAT_COLORS` 的键域改了，一个消费端仍用**本地化显示名**查表 ⇒ zh 静默丢样式、en 恰好命中而全绿。判据：改共享查表的键域时 `grep -rn "表名\["` 逐一核对传入表达式；「每个键都有值」的单测要按**消费者实际传的键**遍历，不能只遍历源集合。
60. **探针的同行启发式误判要单独登记**：`cjk-inventory` 用「同行含 `!=='`」判宿主匹配，遇到 `active: order !== 'time'` 这类**同行展示串**会误判为 MATCH（本次差点让「RENDER 清零」带假阴性）。判据：探针分类只作**分诊**，被清除/保留的每一处都要人读确认；发现误判按文件登记残差，不改口径重算历史。

### 遗留（X109 候选，按登记顺序）

- **模板文本 65 单位 / 16 个 .vue**（`cjk-templates.cjs` 可复跑）：personage 12、game-explore 9、review-detail 5、search-Filter 5、book-review-detail 4、game-collect 4、music-profile 4、artists-overview 3、book-authors 3、genre 3、music-homepage 3、user-celebrities 3、book-collect 2、music-collect 2、user-media 2、albums 1
- **AMBIG 8**（`media-formats` 宿主格式词表 6 + `extra-extract` 宿主匹配 2）：判定保留，非债务
- `format-count` 的**阈值统一**（k 档 vs 千分位）属产品决策，待拍板
- 前波遗留（不变）：x26e 探测器合并（两份 → 一份）、`bootstrapLogging()` 首条日志时序断言

## 29. 第十九轮（2026-10-01 本地 00:0x）：X109 —— 模板文本口径清零，并把「宿主溯源型断言」的语言前提写明

X108 新立的模板文本口径（`cjk-templates.cjs`）首次计量出 65 单位 / 16 个 `.vue`，本轮全部抽入词典（42 新键 × 4 语言 + 复用既有键 10 处）。

| # | 复核问题 | 结论 | 证据（本轮实测） |
|---|---|---|---|
| 1 | 模板口径是否清零 | **65 → 0；16 文件 → 0** | 探针复跑 `0 units in 0 / 44 .vue`；16 文件逐文件 `grep [一-鿿]` 归零（非注释位置全清） |
| 2 | 「meta 行 token 全来自宿主」型契约在词典化后还成立吗 | **只在夹具语言（zh-CN）下成立** | x27b-book 的 `assertReviewDetailProvenance`：en 渲染 'Director' 而宿主侧栏是「导演:…」⇒ helper 内钉 zh-CN 并写明前提；同型处置见 x38（筛选页签）、x27b-music（版本计数） |
| 3 | 批量补丁的静态自检粒度 | **必须到文件级** | 补丁脚本「无 import 锚点即整文件跳过」把 UmmSearchFilter 整文件漏掉；靠「逐文件 CJK 残留」核对（15/16 为 0、该文件 5）抓出并手工补齐 |
| 4 | 正则断言的空白语义 | **`toHaveText(regex)` 匹配 raw textContent** | 「更多影视作品 43 → 」尾随模板换行空白 ⇒ 端点锚须 `\s*`（Playwright 只在**字符串**断言时归一化空白） |
| 5 | 变异取证 | **两轮各命中各页** | A：personage 标题硬编码 + search 页签换键 ⇒ 恰该两例红；B：game-explore 加载键错配（load_more→load_end）+ game-collect 分页丢参 ⇒ 恰该两例红；四文件还原后逐字节一致（diff + 正向存在性核对） |
| 6 | 末态台账 | **19 步逐条 exit=0** | unit **2790**（并行 + 串行双 lane）；e2e **235 passed**（7.7m，含本波 4 例，零 flake）；16 项静态/build 全 0 |

### 本轮新增的复核规则

61. **「每个 token 都来自宿主页」型契约有隐含语言前提——内容词典化后必须把它钉住**：这类断言（meta 行溯源、字段名对照）在夹具语言下成立；一旦标签入词典，非夹具语言渲染的是另一个词。判据：改这类断言覆盖的文案前先问「期望 token 是否依赖渲染语言」；依赖则钉夹具语言并写明前提，或拆成「值溯源 + 标签按词典」两段式。
62. **批量补丁脚本的自检必须覆盖「整文件被跳过」这一形态**：按文件维护替换表时，任何前置条件失败（如 import 锚点不存在）若只 `continue` 会静默留下整文件未改；收尾必须按**文件级**核对目标指标（本轮：逐文件 CJK 残留计数），并与替换表逐条对账。
63. **`toHaveText(regex)` 与字符串断言对空白处理不同**：正则匹配 raw `textContent`（Vue 模板换行会带出尾随空白），端点锚点用 `\s*`；字符串断言才做归一化。写「整句」正则判据时同波验证首尾。

### 遗留（X110 候选，按登记顺序）

- AMBIG 8（`media-formats` 宿主词表 6 + `extra-extract` 宿主匹配 2）：判定保留、非债务
- X103 两项：x26e 探测器合并（两份 → 一份）、`bootstrapLogging()` 首条日志时序断言
- e2e 负载型 flake 硬化（项目记忆 `e2e-load-flakes.md`：imdb teardown 超时 / x103 重挂载印章，隔离复跑均绿）
- `format-count` 阈值统一（k 档 vs 千分位）待产品拍板
- **口径棘轮候选**：两个 CJK 探针（`cjk-inventory.cjs` / `cjk-templates.cjs`）目前都在 `.um.agents/tmp` 临时目录；两口径已双双清零/收敛，建议把「不得新增」写成常驻门禁（否则下个波次即反弹——§6 信条）→ **已于 §30 闭合**

## 30. 第二十轮（2026-10-01 本地 00:0x）：X110 —— 口径棘轮门禁落地（§29 遗留第 5 条闭合）

| # | 复核问题 | 结论 | 证据（本轮实测） |
|---|---|---|---|
| 1 | 「临时探针」是否已门禁化 | **是：`npm run cjk:check`（第 16 道静态门禁）** | `scripts/check-cjk.cjs` + `scripts/cjk-baseline.json`；接线 `package.json` / CI `Static Gates` / `AGENTS.md` 门禁链（十五 → 十六道） |
| 2 | 两口径会不会被混用/相加 | **不会——分开计数、各自棘轮** | 基线 `quoted 84 / template 0`（18 文件）；`quoted` 含宿主匹配串这一**合法债务**（84 = MATCH 76 + AMBIG 8 判读保留量），`template` 为 `.vue` 标签间文本（剥注释与 `{{ }}`） |
| 3 | 判据与既有棘轮是否同族 | **是** | 新增/增长 → exit 1；计数下降而基线未重锁 → exit 1（提示 `--baseline`，只可缩）；与 size/orphan/console 同款「基线只缩 + 达标未删亦报错」 |
| 4 | 守卫自身是否经取证 | **8 种子自检 + 变异双向** | 种子：两口径各 3 条形态 + **2 条反向对照**（防判据一起瞎）；变异：往 `albums/App.vue` 塞中文 → 恰报「新文件带裸 CJK（1 quoted）」exit 1；还原逐字节一致后 exit 0 |
| 5 | 末态台账 | **20 步逐条 exit=0** | 16 项静态门禁（含新 `cjk`）+ build 全 0；unit **2790**（并行 + 串行双 lane）；e2e **235 passed**（7.3m，零 flake） |

### 由此新增的复核规则

64. **门禁化的第一步是「让判据只缩不涨」，第二步是给守卫本身装上反向对照**：`cjk:check` 的 8 条种子里有 2 条是**反向下限**（确有 CJK 的输入必须非零）——没有它们，两把量具同时「瞎掉」时棘轮会静默全绿（§6 信条 + 规则 51 的同一族）。

### 遗留（X111 候选，按登记顺序）

- AMBIG 8（宿主词表/宿主匹配判定保留）
- X103 两项：x26e 探测器合并（两份 → 一份）→ **已于 §31 核验为「早已落地、台账未回写」**；`bootstrapLogging()` 首条日志时序断言 → **已于 §31 用受控场景闭合**
- e2e 负载型 flake 硬化（项目记忆 `e2e-load-flakes.md`）
- `format-count` 阈值统一（k 档 vs 千分位）待产品拍板
- cjk 门禁的 **scope 扩展**（当前只守 `src/scenario/douban`；legacy 内容脚本与 SPA 侧同样混用中文，是否纳入属独立决策）

## 31. 第二十一轮（2026-10-01 本地 00:4x）：X111 —— X103 两项遗留全部闭合（一项实效核验 + 一项受控场景断言）

| # | 复核问题 | 结论 | 证据（本轮实测） |
|---|---|---|---|
| 1 | x26e 探测器合并（登记为待办）现在什么状态 | **早已落地，只有台账还写着待办** | `tests/unit/x26e-entry-init-parity.spec.ts` 由 451 → **129 行**：只保留真实仓判据 + `LOGGING_GAPS`/`THEME_GAPS` 棘轮 + 6 个点名入口；探测器与 6 条种子全部消费 `helpers/entry-graph.ts`（`registerEntryDetectorSelfSeeds()` 在文件尾注册）。两守卫（x26e + i18n-init-wiring）合并复跑 **28/28**。按规则 27 的磁盘清单法核出——**「待办」条目同样会过期** |
| 2 | `bootstrapLogging()` 的「首条日志时序」能否定点断言 | **能：用闸门 stub 造出「storage 读未完成」窗口** | x26f 原 stub 立即兑现、测不到窗口；本轮新增受控场景（`get` 挂在 promise 闸门上）：窗口内 `infoLog` 按**当时**配置执行且**不追发**（断言 early 行缺席、late 行在场）。产品侧变异（删掉 `configureLogging({ enabled, level })` 应用步骤）⇒ 恰该例红（`设置到达后日志仍未放行`）；还原逐字节一致后 11/11 绿 |
| 3 | 该遗留的「限界」是否写清 | **是** | 首条日志要按设置输出，早期入口必须 `await bootstrapLogging()`；当前实现**不缓冲**——若日后改为缓冲追发，第 2 条断言会红并强制同波更新判据（设计变更显式化） |
| 4 | 末态台账 | **unit 2791 + e2e 235/235 + 16 项静态门禁全 0** | unit **2791**（+1 时序例）；e2e 首轮 234/235（唯一红为 `bilibili-homepage-chunked` 计时预算例：blocked 1968ms vs budget 150ms——**负载型 flake 第三物种**，隔离单跑 6.9s 绿，已补入项目记忆 `e2e-load-flakes.md`），复跑 **235 passed**（6.1m，零红）；16 项静态门禁 + build 全 0 |

### 由此新增的复核规则

65. **「待办」条目与「已完成」主张一样要按磁盘回访**：规则 27 管的是「宣称完成先过磁盘清单」；本轮反向踩到——登记为待办的 x26e 探测器合并**早已被后续波次做掉**，台账却仍写「待办」，如果照着旧台账再合并一遍就是重复劳动（同族：X103 的「重复造守卫」）。判据：回到遗留清单前，先按磁盘核验每一项（文件行数、导入形态、守卫是否已在跑），把「已完成未登记」的条目先关掉再动手。

## 32. 第二十二轮（2026-10-01 本地 00:5x）：X112 —— e2e 负载型 flake 三处硬化（按记录的三个物种逐一处置）

背景：`e2e-load-flakes.md` 三种见证齐备（imdb teardown 超时 / x103 重挂载印章 / bilibili 帧预算）。本轮按「不改判别力、只隔离环境噪声」的原则逐一硬化：

| # | 物种 | 处置 | 依据 / 取证 |
|---|---|---|---|
| 1 | bilibili-homepage 帧间隙预算 150ms（负载实测 1968ms，13×） | `GAP_BUDGET_MS` 150 → **3000**，并把该腿的**角色**写进头注（存活性/总阻塞上界，非分片判别器） | spec 头注自证判别力≈0（分片 51–87ms 与一趟写 64–68ms 落在同一噪声带）；判别由**写入形状腿**承担（chunkSize 变异有牙）；探针探盲性仍由同一运行内的 `blockMainThread` **正对照**硬断言，未动 |
| 2 | x103 重挂载印章 15s 轮询超时 | 轮询预算 15s → **45s** | 重挂载要重跑整个 mountApp（含 initI18n 与全量重建），负载下 15s 做不完；超时是等待上界、非判别阈值，加长不改变「谁在画」的判据 |
| 3 | imdb teardown（`ctx.close()` 超 180s 触发用例超时） | harness teardown：`ctx.close()` 加 **30s 上限**，超时即 `warn` + 尽力强关 `ctx.browser()` 后继续；userDataDir 清理重试保留 | 「关浏览器」是环境动作而非被测行为；无上限时一次抖动会伪装成产品故障。强关只走回退分支，正常路径行为不变 |
| 4 | 末态台账 | **20 步逐条 exit=0** | unit **2791**（双 lane）；e2e **235 passed**（复跑零红，6.1m）；16 项静态门禁 + build 全 0 |

### 由此新增的复核规则

66. **「计时/等待预算」按角色分档：判别阈值不许放宽，等待上界必须按最坏环境定**：同类预算处置不同——帧间隙 150ms 名义是**判别阈值**，但实测判别力≈0、真实角色是**存活性上界**，故按「远高于负载抖动、远低于挂死」重设并写明角色；轮询 15s 与 teardown 超时纯属**等待上界**，直接按最坏环境加长；**有牙的判别（形状腿、正对照）一律不动**。判据：改 budget 前先问「它在判别什么」——答不出判别力的按存活性/等待上界处理，答得出的不许动数值。

## 33. 第二十三轮（2026-10-01 本地 01:1x）：X113 —— X109–X112 测试增量的独立复审响应（含一条真竞态根因闭合）

背景：按规则 39，X109–X112 的测试增量交独立只读复审（范围：x109 / x26f 时序例 / bilibili 预算放宽 / x103 印章轮询 / harness teardown / X108 遗留三单测）。复审沿用「断言 ↔ 产品行」配对表，抓出三类缝：**声称覆盖而无人认领**、**不可达分支当 alternation 备选**、**订阅注册晚于首挂载的竞态**。逐条处置（清单 1–9 全做；10–15 维持原判、登记不动作）：

| # | 复审发现 | 处置 | 取证（本轮实测） |
|---|---|---|---|
| 1 | personage 例测试名声称「未上映标题」，但 `douban.pg.upcoming` 在 tests 零引用（恰是本波改的行） | 补 `titles.toContain(dict(pg.upcoming))` + 进 `expectBilingual` | 变异 A：`App.vue:191` 换键 ⇒ 恰该例红（`影人页缺少「未上映作品」小节`，收到数组该位为「人物简介」）；还原逐字节一致后绿 |
| 2 | `.first()` 只认热门按钮，未上映区按钮（App.vue:204-206）文本无见证 | 两个按钮都断：`toHaveCount(2)` + `nth(0)`/`nth(1)` 各配 `optionalCountPattern` | 变异 B：`App.vue:205` 换键 ⇒ `nth(1)` 红（收到「人物简介 43 →」vs `/^更多影视作品(?: \d+)? →\s*$/`） |
| 3 | game-explore 加载按钮 alternation（loading ∨ load_more）让「卡在加载中」「两分支对调」整类变异全绿 | 去掉 alternation，直钉可达支 `templatePattern(load_more)`；loading 分支要见证须另造点击后的延迟桩场景（x49 的 `delayMs` 路由桩可复用） | 变异 C：`App.vue:245` 条件对调（稳态显「加载中…」）⇒ 恰该例红（`unexpected value "加载中…"`）；复审已反向验证原 alternation 下此变异全绿 |
| 4 | search 例 `expectBilingual` 键清单漏它实际断言的 `filter_movie`/`filter_tv`（X108 复审已修过一次的同型） | 两键补进清单 | 两语言值现确不同（前提恢复为被断言）；同波在 `search/App.vue:33` 宿主匹配串原位加「不得词典化」注释（与 `filter_tv` 同字面但角色不同：抽取后 en 下筛选恒空，而钉 zh 的用例看不见） |
| 5 | 头注「其余 12 文件 zh 字面量已被 x93/x27b-* 钉住」不成立——music-homepage 三键零引用 | 头注改写为「只受 cjk 棘轮约束（防硬编码、不防换键）+ 纯函数处的单测配对」，并点名反例 | `grep -rl "新碟榜" tests/` 为空；如实降级声明 |
| 6 | x103 两条：①「尾沿只重绘 info（按钮不同步）」与代码不符——挂载尾沿 `updateHeaderInfo` 用新 `t()` **同时**重绘 info 与复制按钮（`app-header-stats.ts:99-106`）；②`subscribeLocale` 注册晚于首挂载完成，语言写入落进窗口即被吞、45s 也救不了 | ①更正分工注释：文本腿≠重挂载证据，重挂载唯一见证是节点身份印章；②加**竞态闸**：等 `[UMM] watched check:` 日志（app.ts:502/533）——其后到注册只剩同步 + 微任务，`onChanged` 是渲染器新任务必然排在注册之后 | 三条用例过闸后 1.1s/1.1s/1.2s 全绿（门未拖慢正常路径） |
| 7 | harness 回退分支自身无预算、`?.` 命中 null 静默、rmSync 失败静默 | 回退 `browser.close()` 加 10s 上限；null 与 10s 超时各 warn；目录 5 次重试失败 warn；新增 `withTimeout` 助手（输掉的 race 定时器清理，不再每用例留一个 30s 定时器） | teardown 非被测行为、无产品侧变异可做；20 步门禁全绿 |
| 8 | bilibili 3000ms 对负载实测 1968ms 只有 1.5× 余量（「远高于负载抖动」名不副实） | 按看门狗方案收口：3000 → **10000ms**，注释写明「只拦挂死；负载型 1–2s 停顿有意不判红」；顺带修头注「~5×200」口径——标注为**被节流的读法**（本 spec 拒绝隐藏页，前台是 100 批 × 10） | 本轮运行实测 `100 个投递批次 / 每批 10 条 / max gap 45ms`，与前台口径一致 |
| 9 | x26f 闸门必要性措辞与事实有差（立即兑现的 stub 也有微任务级窗口）；缺正向前缀 | 理由改「把微任务窗口**加宽到宏任务级**」；`openGate()` 前加正向前缀 `probeLogger().info === false`；M2（去掉 `await Promise.all`）列入变异清单 | **M2 实跑**：`logging.ts` 改 fire-and-forget ⇒ 时序例恰红于 late 断言（`设置到达后日志仍未放行`）；还原 hash 一致 |

登记不动作（复审 10–15）：`optionalCountPattern` 允许计数缺失（计数是宿主数据，不在该见证声称内）；game-collect 两数字参数互换盲区（条款外弱判据；夹具重爬若使 `total ≥ 1000` 需同波核对千分位撞 `\d+`）；`GAP_BUDGET_MS` 量级本身、x103 45s 等待上界、harness 对后续 spec 无判据污染、X108 三单测新增断言形态正确——均维持原判。

### 由此新增的复核规则

67. **「订阅注册晚于首挂载」是测试必须显式跨越的竞态——固定超时救不了**：装配形态为 `await mount()` → `subscribe(...)` 时，驱动侧若在首挂载「已绘制、未注册」窗口里改输入，事件被吞且**永不重放**（再怎么等也不会回填）。测试必须等一个「注册之后才可能出现」的可观测信号（本轮：挂载尾沿已跑完的日志——其后到注册只剩同步代码 + 微任务，新的输入事件必然排在注册之后），或把「输入重发一次」写进测试。同族硬约束：**同一运行里两个表面文本同拍 ≠ 重挂载证据**——挂载尾沿会用当前 `t()` 同时重绘两个表面，重挂载的唯一见证是节点身份（盖在旧根上的印章必须消失）。
68. **alternation 的备选分支必须是「场景可达」的**：断言写成「分支 A ∨ 分支 B」且 B 在本场景永远不可达时，该断言对「卡死在 B」「A/B 对调」恒绿——不可达备选只稀释判别力。写判据前先问「屏幕上此刻可能出现哪一支」；只钉可达支，其余支另造能触发它的场景去见证。

### 末态台账

20 步逐条 `exit=0`——16 项静态门禁（含 cjk）+ build 全 0；unit **2791**（并行 43.0s / 串行 1.7m，双 lane）；e2e **235 passed**（6.0m，零 flake）。另：spec 头注的注释级交叉引用修订（`(review finding 1-5)` → 自包含表述）发生在 sweep 之后，x109 单文件复跑 **4/4** 补记（不触碰任何断言；format:check 同步复核绿）。

### 遗留（X114 候选，按登记顺序）

- AMBIG 8（`media-formats` 宿主词表 6 + `extra-extract` 宿主匹配 2）：判读保留、非债务
- `format-count` 阈值统一（k 档 vs 千分位）属产品决策，待拍板
- cjk 门禁 scope 扩展（当前只守 `src/scenario/douban`）：独立决策
- 项目记忆六项 parked decisions（overlay 组件库合并 / CSS 分包减包 / adult-av 索引迁移 / event-bus 死通道 / neodbToken 入备份 / tv:: 行迁移）——均待用户裁决
