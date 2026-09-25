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
| D1 分层重写 | 🟡 进行中 | W0 契约冻结 + W1 守卫已落地；逐域迁移未开始 |
| D2 全量 Vapor | ⬜ **未落地** | `grep createVaporApp\|vaporInteropPlugin\|VaporTransition` 在 `src/` 零命中；`vue` 仍为 `^3.5.43` |
| D3 RC + overrides | ⬜ **未落地** | `package.json` 无 `overrides`；`vue` 装 3.5.43 |
| D4 双轨发布 | ✅ 生效 | `main` 未触碰；工作仅在 `dev-2026-09-25` |
| D5 契约冻结 | ✅ 落地 | `tests/unit/contract-freeze.spec.ts`（20 用例）+ 变异测试验证 |
| D6 七层骨架 + 守卫 | 🟡 骨架迁移进行中（L1 libraries + L2 engine 完成） | 守卫已落地（`arch:check` exit 0，CI `Static Gates` 阻断）；L1 把 `utils`/`config.ts`/`shared{ui,styles,locales,plugins,identity,toast}` 迁入 `src/libraries/`（89 文件，门禁全绿）；L2 把 `features/{database,cache,data-scheduler,migration,settings}` 迁入 `src/engine/`（19 文件，门禁全绿）；L3 provider / L4 store / L5 feature / L6 scenario 待办 |
| D7 前缀统一 | ⬜ 未落地 | `--usl-*` / `--sht-*` 均在原处 |
| D8 Vite+ `vp check` | ⬜ 未落地 | 未引入 `vite-plus` |

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
   - **`<Transition>` 必须改为 `VaporTransition`**（`@vue/runtime-vapor` 导出的 vapor 版内置组件，前缀区分）。项目现有 `<Transition>` **7 处** / `<TransitionGroup>` 1 处 / `<Suspense>` 1 处 / `<Teleport>` 3 处（分布于 9 个文件，改动面可控）；`<KeepAlive>` 0 处。
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
