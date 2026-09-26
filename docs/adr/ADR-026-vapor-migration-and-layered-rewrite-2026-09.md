# ADR-026 框架渲染模式迁移（Vapor Mode）与全项目分层重写

- 状态：accepted
- 日期：2026-09-25
- 决策者：用户（四轮裁决面板）+ umpp 会话
- 前置：ADR-008（技术栈演进）、ADR-017（WXT 工具边界）、ADR-018/019/020（设计系统与令牌）
- 分支：`dev-2026-09-25`（`main` 保持可发布，双轨）

## 背景

用户提出 14 项重构诉求（UI/组件统一、TS 覆盖、大数据性能与扩展挂死、交互反馈体系、动效颗粒度、Vite+/Vue 3.6 Vapor、按需加载、七层分层、禁大文件、Tailwind v4 与 CSS 按需、`umm` 前缀统一），并要求「全面重新重构整个项目」。

umpp P0 以 5 个正交只读 subagent 完成取证（架构分层 / UI-CSS / 性能数据 / 动效反馈 / 类型包体），结论落 `.um.agents/memory/umpp-codebase-audit-2026-09-25.local.md`。随后对诉求 #8 做隔离环境可行性验证（W0.1）。

## 决策

### D1：重写形态 = 全项目分层重写（用户裁决）

按七层（app/feature/store/scenario/provider/engine/libraries）重建骨架，`libraries → engine → provider → scenario → store → feature → app` 自底向上逐域迁移。明确承认这是用户显式裁决的大范围变更，**非** agent 自选（umpp 禁令 #1 的适用边界为用户未授权时）。

### D2：渲染模式 = 全量 Vapor（用户裁决）

- SPA（popup/options）与 Douban overlay 均迁移 Vapor。
- 根挂载 API 固定为 **`createVaporApp`**（`createApp` 不适用于 Vapor 根）。
- **必须** `app.use(vaporInteropPlugin)`——否则树内 VDOM 子组件静默不渲染且无报错。
- 内容脚本（legacy / Sehuatang，占产物 64.1%）为纯 vanilla TS，**不受影响**。

### D3：依赖采用 RC 栈 + peer overrides（用户裁决）

采用 `vue@3.6.0-rc.x` + `@vue/compiler-sfc@3.6.0-rc.x`。**peer overrides 是必需的，且影响 4 个包**——全部经实测复现 `ERESOLVE`：

| 包 | peer 范围 | 排除预发布的原因 |
|---|---|---|
| `@vitejs/plugin-vue@6.0.9` | `vue@^3.2.25` | `^3.2.25` → `>=3.2.25 <4.0.0-0` |
| `vue-router@5.3.1` | `vue@^3.5.34 \|\| ^4.0.0` | `^3.5.34` → `>=3.5.34 <4.0.0-0` |
| `pinia@4.0.3` | `vue@^3.5.11` | `^3.5.11` → `>=3.5.11 <4.0.0-0` |
| `vue-i18n@11.4.12` | `vue@^3.0.0` | `^3.0.0` → `>=3.0.0 <4.0.0-0` |

> semver 规则：预发布版本只能被「显式含同 major.minor.patch 预发布标识」的范围匹配，故上述全部范围均排除 `3.6.0-rc.x`。

**`@wxt-dev/module-vue@1.0.3` 的 dependency 即 `@vitejs/plugin-vue: ^5.2.3 || ^6.0.0`** ⇒ plugin-vue 必然入装，冲突不可避免，必须 `overrides`。
`vue-router` 的其余 peer（`vite` / `pinia` / `@pinia/colada` / `@vue/compiler-sfc`）经查 `peerDependenciesMeta` **全部 optional**，无需处理。

**兼容性利好**：`reka-ui@2.10.5` 的 peer 为 `vue >= 3.4.0`（无上界、不含预发布排除），**不触发冲突**。

### D4：发布策略 = 双轨（用户裁决）

`main` 冻结不动、保持可发布；重写在 `dev-2026-09-25` 进行。重写周期内可继续发 5.17.x 补丁。

### D5：行为契约全量冻结（用户裁决）

动代码前先把下列契约 golden test 化：消息契约全集（33 项 MessageType + 三张映射表双向对齐）/ IDB schema v14（**fresh 12 store** + 各自 index 集合）/ 令牌语义（none=红、wish=紫罗兰）/ dimmer 双键语义（`data-avid` + `data-tid`，初始「只隐藏不 dim」、运行时「只 dim 不隐藏」）/ `BACKUP_STORES` 10 表清单。**这是 474 文件重写不丢行为的唯一保险。**

> 落地说明（2026-09-25）：`tests/unit/contract-freeze.spec.ts` 已覆盖前三项；
> 令牌语义与 dimmer 双键语义由既有 `global-styles-tokens.spec.ts` /
> `dimmer-row-refresh.spec.ts` / `sehuatang-*` 系列覆盖，本 ADR 不再重复冻结。
> 实现中**未**冻结 `keyPath`（实测 fresh v14 全部 store 均为外部键、无 keyPath）。

### D6：七层骨架 + 命名规范

修正现状缺口：`entrypoints/*` 横跨四层、`src/domain` 与 `src/types` 无对应层、`handlers/` 双处、`models.ts` 4 处、`config.ts` 33 处、`types.ts` 29 处、`extract*` 三种命名形态、camelCase 与 kebab-case 混用。新增依赖方向守卫脚本并对守卫本身做双向断言。

### D7：`umm` 前缀全量统一（用户裁决，含令牌族）

`--usl-*`（343 处）与 `--sht-*`（**实测 src 24 处**；早前记录的 331 处系 `sht-` 子串计数，含大量 `umm-sht-*` 类名，非令牌数）全量改 `--umm-*`；注入宿主页的裸选择器（`html`/`body`/`*`/`:focus-visible`/`::-webkit-scrollbar`）收进 `umm` 作用域；合并 5 种状态徽章类名；同步 `ds:check` 守卫与全部测试断言。

### D8：Vite+ 采纳范围

**仅采纳 `vp check`**（Oxfmt + Oxlint + type-check，填补项目「零 lint/format」空白）；**不接管构建**（WXT 拥有构建管线，`vp build` 不认 WXT 入口系统）。已知 `vite-plus@1.0.0-rc.0` 亦为 RC；Oxlint 尚不支持 Vue 模板 lint。

## 实施状态（2026-09-25，随进度更新）

| 决策 | 状态 | 证据 |
|---|---|---|
| D1 分层重写 | 🟡 进行中 | L1–L6 七层物理归位完成（`src/` 顶层收敛为七层骨架 + `domain`/`types`）；W2 God 文件拆分完成（>600 行文件 6 → **0**）；**Douban overlay 的逻辑重构未开始**（其渲染模式迁移已随 D2 完成） |
| D2 全量 Vapor | ✅ **落地（106 个 SFC）** | SPA 62（popup/options）+ Douban overlay 44（`scenario/douban/`）；两处根挂载均为 `createApp` + `vaporInteropPlugin`（SPA 在 `main.ts`，overlay 在唯一挂载点 `overlay/mount-app.ts`）；见「D2 落地修正」与第 6 条执行结果 |
| D3 RC + overrides | ✅ 落地 | `vue` / `@vue/compiler-sfc` = `3.6.0-rc.9` + 11 项 `overrides`；六道门禁全绿，`test:unit` 1212 + 11 已知基线（零新增） |
| D4 双轨发布 | ✅ 生效 | `main` 未触碰；工作仅在 `dev-2026-09-25` |
| D5 契约冻结 | ✅ 落地 | `tests/unit/contract-freeze.spec.ts`（20 用例）+ 变异测试验证 |
| D6 七层骨架 + 守卫 | ✅ 骨架迁移完成（L1–L6 全部归位） | 守卫已落地（`arch:check` exit 0，CI `Static Gates` 阻断）；L1 `libraries/`（89 文件）· L2 `engine/`（19）· L3 `provider/`（6）· L4 `store/`（3）· L5 `feature/`（9）· L6 `scenario/`（241）全部物理归位，六道门禁全绿（含 `git mv` 重命名识别）；`src/` 顶层收敛为七层骨架 + `domain`/`types` |
| D7 前缀统一 | 🟡 两步落地（3 项中 2 项） | ①overlay 令牌 `--usl-*`（49 名）/ `--sht-*`（5 名）→ `--umm-*` ✅；②注入宿主页的裸选择器收进 `umm` 作用域 ✅（见「D7 落地说明」）；③5 种状态徽章类名合并**未做** |
| D8 Vite+ `vp check` | 🟡 第一步落地（改用 oxlint 单点） | 引入 `oxlint` + `npm run lint`（`--deny-warnings` 零告警门禁，进 CI `Static Gates`），清零 38 条告警；**未采纳 `vite-plus` 本体**；Oxfmt 全仓格式化待办 |

## D2 落地修正（2026-09-26）

实现 D2 期间取得以下实测结论，其中两项**推翻本 ADR 原有表述**，一项新增为硬约束：

1. **根挂载 API 改为 `createApp` + `vaporInteropPlugin`（偏离 D2 原文的 `createVaporApp`）**
   - `vue-tsc@3.3.11`（registry 最新）**不为 `<template vapor>` SFC 生成 `VaporComponent` 类型**。`@vue/language-core@3.3.11` 中 `vapor` 属性仅参与模板指令 codegen（`getIsVapor` → `generateTemplate`），不改变组件导出类型，故 `createVaporApp(App)` 触发 TS2345（`DefineComponent` 不可赋给 `VaporComponent`）。
   - 实测两种根挂载**渲染产物一致**：popup 11,236 字符、options ≈121,900 字符，console error 与 pageerror 双零。取 `createApp` 方案即**零类型断言**；取 `createVaporApp` 需引入 1 处受控断言。用户裁决取前者。
   - 附带理由：vue-router 的 `RouterView` / `RouterLink` 本身是 VDOM 组件，SPA 的路由边界无论如何都要经过互操作，vapor 根并未消除该边界。

2. **`<Transition>` / `<TransitionGroup>` / `<KeepAlive>` / `<Teleport>` 无需手工改名**
   - `@vue/compiler-vapor` 的 `isTransitionTag` / `isTransitionGroupTag` / `isKeepAliveTag` / `isTeleportTag` 在 vapor 模式下把原生标签**自动**映射为 `VaporTransition` / `VaporTransitionGroup` / `VaporKeepAlive` / `VaporTeleport`（四者均由 `@vue/runtime-vapor` 导出）。本 ADR 风险节原列「`<Transition>` 必须改为 `VaporTransition`」**失效**，12 处内置组件用法零改动通过。
   - `<Suspense>` 无 vapor 版，仍经 `vaporInteropPlugin` 走 VDOM 路径（与原文一致）。

3. **互操作是双向的（修正 W0.1 结论）**
   - 实测：vapor 根 + VDOM 子 ✅；**VDOM 根 + vapor 子 ✅**；`createApp` 挂 vapor 根 ✅。W0.1 记录的「`createApp` 返回 undefined」仅对 **browser 构建**成立——bundler 入口 `vue.runtime.esm-bundler.js` 实际 `export * from '@vue/runtime-vapor'`，能力完备。
   - 推论：迁移不必严格自顶向下，可逐 SFC 翻转。

4. **新增硬约束：reka-ui 的转发助手在 vapor 组件内静默失效**
   - `useForwardProps` 读 `vm?.type.props` / `vm?.vnode.props`，`useForwardPropsEmits` → `useEmitAsProps` 读 `vm?.type.emits`，二者均经 **VDOM** 的 `getCurrentInstance()`；在 vapor 组件的 `setup()` 内该调用返回 `null`，于是**双双退化为空对象**——props 不达包装目标、`v-model` / `update:*` 不再回传。**有告警、无报错**，属静默功能回归。
   - 合成复现（`init → init` vs 对照 VDOM 包装 `init → clicked`）；真实扩展上表现为每页 2 条 `No emitted event found. Please check component: undefined`。
   - 处置：新增 `src/libraries/ui/forward-props.ts`（`forwardProps` / `forwardEmits`，从入参推导、不依赖实例），**13 个**包装 SFC（dialog ×4 / select ×6 / switch ×1 / tooltip ×2）迁移。`libraries/ui` 其余 34 个包装不使用该助手，无需改动。
   - 上述规则对 **Douban overlay 迁移（D2 剩余部分）同样适用**：任何使用 reka-ui 转发助手的 SFC 在 vapor 化前必须先替换。

5. **Douban overlay 迁移的前置评估（实测，2026-09-26）—— 风险显著低于 SPA**
   - 规模：`src/scenario/` 共 **44 个 SFC，0 个 vapor**；含 `createApp` 的 **35 个文件**（32 个页面 `config.ts` 各 2 处 + `douban/mount-factory.ts` + `overlay/mount-app.ts`）。
   - **第 4 条的转发约束在此不适用**：`src/scenario/` 中引用 `reka-ui` 或 `@/libraries/ui` 的文件数为 **0**，页面 UI 全部是自研 `components/Umm*`（`UmmPageLayout` / `UmmMediaCard` / `UmmPaginator` / `UmmImageWrapper` …）。
   - 迁移面其余项目近乎为零：内置组件用法 **1 处**（`pages/photos/App.vue` 的 `<Transition>`，编译器自动映射）；`defineModel` **1 处**（`pages/search/components/UmmSearchFilter.vue`，vapor 下已由 SPA 侧功能性实证）。
   - 结论：overlay 迁移工作量 ≈ 44 个模板加 `vapor` + 32 个挂载点换根；无第三方 VDOM 包装层、无转发助手改写。**唯一新增关注点是 Shadow DOM 容器内的挂载与 `<Teleport>` 目标解析**。

6. **overlay 迁移执行结果（2026-09-26 完成）—— 前后对照零差异**
   - 执行：44 个 SFC 加 `vapor`；`vaporInteropPlugin` 注册于**唯一挂载点** `scenario/douban/overlay/mount-app.ts`（全项目 `scenario/` 内 `.mount(` 仅此一处，故一处覆盖 32 个页面）。树内 `lucide-vue-next` 图标为 VDOM 组件，插件为必需项。
   - **Shadow DOM 挂载已实证可用**：探测中复刻 `mountUmmOverlay` 的建壳序列（创建 host → `attachShadow` → 注入 `<style>` → 追加 `.umm-mount` 容器 → mount），挂载 **真实** 组件 `UmmStatBar` / `UmmPaginator`，ShadowRoot 内正常渲染。
   - **等价比对**：迁移前后 DOM 结构（7 个 div）、渲染文本、全部 15 个探测用例结果、控制台输出**逐字一致**；`pageerror` 零。SPA 侧复验零变化。
   - **代价（如实记录）**：`douban-main.js` **786.05 → 880.05 kB（+94 kB / +12%）**——vapor 运行时与 VDOM 运行时**并存**，后者仍为 `lucide-vue-next` 图标与互操作边界所必需；产物总量 2.03 → **2.13 MB**。此项为体积成本，非功能缺陷；若后续需压缩，可行方向是替换 `lucide-vue-next` 图标为内联 SVG 以消除 VDOM 依赖，但属独立决策，本次不做。

## D7 落地说明（2026-09-26）

D7 拆为三项，本次完成第 2 项。

### 第 2 项 · 裸选择器收进 `umm` 作用域

**原「架构阻断」判定经复核不成立。** 早前结论为「legacy overlay 无单一 scoping root（元素各自 `appendChild` 到 `document.body`），裸选择器无法安全作用域」——该判断对**基于祖先的**作用域成立，但遗漏了「基于元素自身标识」这条路径。

实测证据（隔离夹具 + 计算样式，经真实 `injectGlobalStyles()` 注入）：

| 观测项 | 修复前 | 修复后 |
|---|---|---|
| 宿主页滚动容器 `scrollbar-width` | `thin` | **`auto`** |
| 宿主 `<html>` `scrollbar-width` | `thin` | **`auto`** |
| 宿主 `button` / `a` / `input` / 可滚动 `div` 焦点环 | 2px solid | **1px auto**（浏览器原生） |
| 扩展元素（`.umm-status`）滚动条 | `thin` | **`thin`**（保留） |
| 扩展控件（`.umm-pill-btn`）焦点环 | 2px solid | **2px solid**（保留） |
| composed 表裸选择器数 | 8 | **1**（仅 `html`，变量继承锚点） |

**作用域选择器 = `[class*="umm-"]`**，依据是注入元素类名的既有约定（普查：注入的交互与滚动元素全部为 `umm-` 前缀，非前缀者仅 `javdb-enhanced`（body 标记）、`ov-loading`、`show` 三个标记/状态类）。

**已知残差**：扩展给**宿主元素**打的标记类（`umm-dimmed` / `umm-viewed` / `umm-sht-dim-batch` / `umm-neodb-synced`）同样满足该选择器。这些元素本就被扩展有意改写外观，且均非可聚焦控件（列表行/卡片），故未再加 `:not()` 排除——`:not()` 链会使选择器脆弱且难读。

**`html { --umm-* }` 有意保留**：`THEME_VARS` / `THEME_VARS_DARK` / `GLOW_VARS` 在 `<html>` 上声明自定义属性，是注入 UI 继承令牌的唯一锚点（属机制，非视觉改写）。守卫脚本以显式豁免清单登记，清单扩大时有测试提醒复核。

### 新增门禁 `npm run scope:check`

`scripts/check-content-style-scope.cjs`，进 CI `Static Gates`（与 arch/ds/i18n/lint 并列）。判据 = 每条规则的**首个复合选择器**不得为 `*` / 裸伪类 / 裸伪元素 / 裸标签。守卫经双向验证：`--self-test` 识别 8/8 泄漏形态且零误报；真实变异两处（`*::-webkit-scrollbar` / 裸 `:focus-visible`）均 exit 1，还原后 exit 0。

### 第 3 项 · 5 种状态徽章类名合并 —— 未做，且须先做契约对照

`SEARCH_BADGE_STYLES` / `STATUS_CHIP_STYLES` / `LIST_STATUS_STYLES` / `REVIEWS_BADGE_STYLES` / `HOMEPAGE_BADGE_STYLES` 五块**同名不同构**（如 `.umm-status-chip > span/strong/small` 多层 vs `.umm-status` 单层），与 W2 的教训同型：**「同名」不等于「同行为」，合并前须逐份对照 DOM 契约、`data-status` 取值集与视觉回归基准**。属独立波次。

## 实测证据（W0.1，隔离环境，未触碰项目文件）

| 验证项 | 结果 | 证据 |
|---|---|---|
| 依赖安装 | ❌ 冲突必现 | `@vitejs/plugin-vue@6.0.9` peer `vue@^3.2.25` 排除预发布 → `ERESOLVE`（已复现）；`@wxt-dev/module-vue@1.0.3` 的 **dependency** 即 `@vitejs/plugin-vue: ^5.2.3 \|\| ^6.0.0`，不可绕过 |
| 打包链路 | ✅ 可用 | Vite 8.3.1 + plugin-vue 6.0.9 构建 vapor SFC 成功，618 modules，0 错误 |
| 类型检查 | ✅ 可用且有效 | 基线 `vue-tsc --noEmit` exit 0；注入普通 SFC 错误 → exit 2 + TS2322；注入 **`vapor` SFC** 错误 → exit 2 + TS2322（双向断言） |
| Vapor 根挂载 | ✅ | `createVaporApp(App).mount('#app')` 挂载成功；**`createApp` 返回 undefined**（运行时 `Cannot read properties of undefined (reading 'mount')`） |
| Vapor 响应式 | ✅ | 真 Chromium 实测点击 `0 → 1` |
| **Vapor ↔ VDOM interop** | ✅ **需 `vaporInteropPlugin`** | 不装插件：reka-ui 子组件**静默不渲染、0 报错**；装上后 `.probe-switch` 渲染成功 |
| **Teleport（Dialog）in vapor** | ✅ | 点击后 `.probe-dialog` 由 0 → 1，标题文本正确 |
| 运行时错误 | 0 | Playwright 控制台捕获空 |
| reka-ui 兼容性 | ✅ **无需替换组件库** | reka-ui 2.10.5（25 组件文件 / 49 条 import：Select×12、Dialog×6、Tooltip×4、Switch、Separator、Label、Button）在 vapor 树内可渲染 |

## 风险与回滚

1. **RC 依赖风险（高）**：`vue` 的 `latest` 仍为 3.5.43；`vite-plus` 为 1.0.0-rc.0。RC 可能引入行为变更与缺陷。
2. **Node/CJS 侧不自洽（中）**：`require('vue').defineVaporComponent === undefined`；`import('@vue/runtime-vapor')` 报 `TransitionPropsValidators` 互操作错误；`@vue/runtime-dom` 不导出该符号；`vue` 无 `./vapor` 子路径导出，仅 browser 变体含 vapor。**影响面**：任何在 Node 侧导入 Vue 运行时的工具（部分测试路径、脚本）。
3. **W0.4 补测结果（2026-09-25 完成，全部通过）**：

| 补测项 | 结果 | 证据（真 Chromium 运行时断言） |
|---|---|---|
| `vue-router` 5.3.1 在 `createVaporApp` 下 | ✅ | `app.use(router)` 成功、`router.isReady()` 解析；`RouterView` 初始渲染 vapor 路由组件（`.probe-home`）；`RouterLink` 导航后渲染 **VDOM** 路由组件（`.probe-about` = `about-vdom`）——vapor→vapor 与 vapor→VDOM 两条路径均通 |
| `pinia` 4.0.3 在 `createVaporApp` 下 | ✅ | 读取 `.probe-pinia` = `0`，点击 action 后 = `1` |
| `vue-i18n` 11.4.12 在 vapor 模板内 | ✅ | `t('hello')` 渲染为「你好世界」 |
| `VaporTransition`（vapor 专用内置组件） | ✅ | 条件节点 `1 → 0 → 1`（隐藏/恢复均生效） |
| `<Suspense>`（VDOM 宿主）经 interop 在 vapor 树内 | ✅ | 异步子组件解析完成，文本 = `suspense-resolved` |
| `reka-ui` 2.10.5 在 vapor 树内 | ✅ | `.probe-switch` 渲染成功 |
| WXT 接线（`@wxt-dev/module-vue` 1.0.3） | ✅ **无需改动** | 该模块实现仅 `plugins: [vue(vite)]`（`node_modules/@wxt-dev/module-vue/dist/index.mjs:3,12`）；默认选项下 per-SFC `vapor` 属性即生效，无需全局 vapor 开关 |
| 运行时错误 | 0 | Playwright 控制台与 pageerror 捕获均为空 |

4. **迁移要点（实测得出，重写时必须遵守）**：
   - ~~**`<Transition>` 必须改为 `VaporTransition`**~~ **【已被「D2 落地修正」第 2 条推翻】**：vapor 编译器自动把 `<Transition>` / `<TransitionGroup>` / `<KeepAlive>` / `<Teleport>` 映射为对应 Vapor 版本，无需手工改名。项目原有 12 处内置组件用法（`<Transition>` 7 / `<TransitionGroup>` 1 / `<Suspense>` 1 / `<Teleport>` 3，分布 9 文件）**零改动**通过；`<KeepAlive>` 0 处。
   - **`VaporKeepAlive` 存在**，但项目当前无 `<KeepAlive>` 用法。
   - **`<Suspense>` 与 `<Teleport>` 无 vapor 版导出**，需经 `vaporInteropPlugin` 走 VDOM 路径（已实测可用）。
   - **`vaporInteropPlugin` 为必需项**，遗漏将导致树内 VDOM 组件静默不渲染且零报错。
5. **回滚条件**：W0.4 补测已全部通过，原设「任一未验证项不通即回退」的触发条件**未成立**，D2（全量 Vapor）保持有效。若后续 W1-W6 出现 RC 阶段行为回归且无法规避 → 回退 D2 为「仅自研组件启用 vapor，组件库页面保持 VDOM」，并保留 Vite+ 的 `vp check` 采纳。
6. **回滚路径**：`main` 未被触碰，双轨天然提供回退点。

## Non-goal

- 全项目推倒重写（内容脚本 legacy 与 Sehuatang 域为纯 vanilla TS，无框架收益，按七层归位即可，不重写逻辑）。
- 替换 reka-ui 组件库（实测无需）。
- `vp build` 接管构建。
- 改动已定稿语义：none=红 / wish=紫罗兰、dimmer 初始与运行时语义、成人三表读侧语义。
