# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### 变更（内部重构）

- **架构分层守卫**：新增 `npm run arch:check`（`scripts/check-architecture.cjs`），强制七层依赖方向单向向下（app → feature → store → scenario → provider → engine → libraries），带 6 项检查（层映射完备 / 向上依赖 / libraries 纯度 / domain 纯度 / 内容脚本禁令 / 解析-策略分离契约）与 9 条非阻断警告；守卫自身经双向断言验证（合法通过 / 违规被拒）
- **分层违规修正**（首次运行守卫即清零 4 项历史违规）：`StatCard.vue` 归位 `shared/ui/stat-card/`；`extractImdbIdFromText` 下沉 `src/utils/imdb-id.ts`；备份 ZIP 版本常量提取到 `src/utils/dataset-version.ts` 且版本兼容校验改由 WebDAV 导入链路负责（解析与策略分离，行为等价）；Bangumi 列表页改经数据库门面访问
- **行为契约冻结**：新增 `tests/unit/contract-freeze.spec.ts`，以类型级断言锁定消息协议（33 项 `MessageType` + 三张映射表双向严格对齐）与番号三表分类器，并以完整快照锁定 IndexedDB v14 schema（fresh 12 store + 各自索引集合）
- **CI 静态门禁**：新增 `Static Gates` job（架构分层 / 设计令牌 / i18n 完整性），`Build` 依赖其通过——门禁失败即阻断构建
- **单体拆分（模块化）**：`content/styles/global.ts` 739 → 298 行（10 个组件样式块迁至 `badge-styles.ts` / `component-styles.ts`；主题变量表与 `ALL_STYLES` 组合顺序逐字不变，避免 CSS 层叠变化）；`content/i18n/locales.ts` 646 行 → `i18n/locales/` 聚合目录（一文件一语言 + 聚合入口，范式对齐既有 `src/shared/locales/`）；`sehuatang-controls.ts` 715 → 589 行（已看标记/淡化状态层抽出为 `sehuatang-controls-mark.ts`）；`mukaku/handler.ts` 的 142 行 `processVisibleCards` 分解为 `dom.collectVisibleCards`（纯函数）+ `apply.applyCardActions`（无状态）+ 2 个有状态私有方法。**>600 行文件由 6 个降至 3 个**
- **新增测试**：`tests/unit/mukaku-collect.spec.ts`（6 例）与 `tests/unit/mukaku-apply.spec.ts`（9 例）——覆盖此前嵌在 142 行方法内、**完全无测试**的卡片收集与结果应用规则
- **单一事实源**：内容脚本语言键改为引用 `STORAGE_KEYS.LANGUAGE`（原为 `'language'` 裸字面量副本，与设置层存在漂移风险）
- **i18n 门禁适配**：`scripts/check-i18n.js` 由「按 locale 块标记切分单文件」改为逐文件读取聚合目录（原脆弱解析逻辑退役）
- **overlay 编排拆分**：`content/sehuatang/app.ts` 678 → 617 行（卡片渲染原语 `buildCard`/`renderSkeleton`/`cardTrackKeys` → `card-render.ts`；跨页保存失败诊断 `reportSaveFailure`/`consumeSaveFailure` → `save-failure.ts`；`parseThreadList` 归入 `sehuatang-extract.ts`，与它委托的 `parseThreadRow` 同域）
- **新增测试**：`tests/unit/sehuatang-card-render.spec.ts`（10 例：`data-avid`/`data-tid` 双键契约 / HTML 转义 / http(s) 协议白名单 / 骨架替换 / 键过滤）与 `tests/unit/sehuatang-save-failure.spec.ts`（5 例：写入结构 / 后写覆盖 / 消费即清除 / 非法 JSON 容错）——覆盖原先不导出、无法单测的渲染原语与跨页诊断
- **libraries 层物理归位（D6 起点）**：`utils`/`config.ts`/`shared{ui,styles,locales,plugins,identity,toast}` 迁入 `src/libraries/`（89 文件），`@/` 别名与相对导入同步改写（含被搬文件指向未搬目标的相对路径按层深重算）；守卫 `LAYER_RULES` 重指 `libraries/*`；门禁脚本 `check-design-tokens`/`check-i18n` 字面路径同步；`architecture-guard.spec.ts` 夹具对齐新层规则。六道门禁全绿
- **engine 层物理归位（D6 第二批）**：`features/{database,cache,data-scheduler,migration,settings}` 迁入 `src/engine/`（19 文件，git mv 自动识别重命名），`@/features/<x>` → `@/engine/<x>` 别名改写（94 处，68 文件）；守卫加 `['engine','engine']` 层规则、`DB_INTERNAL_PATHS` 与 E2 消息同步 `features`→`engine`；`architecture-guard.spec.ts` 合成夹具对齐。六道门禁全绿（test:unit 1212 + 11 已知基线，零新增）
- **provider / store / feature / scenario 层物理归位（D6 第三批，L3–L6）**：`features/{webdav,neodb,adult-av,sehuatang-cache}` → `src/provider/`（6 文件）；`stores/` → `src/store/`（3）；`shared/` + `composables/` + `features/optimistic-lock` → `src/feature/`（9）；`content/` → `src/scenario/`（241）。`@/` 别名全量改写（L3 31 处 / L4 9 / L5 18 / L6 169）；守卫规则重指 `provider`/`store`/`feature`/`scenario` 并更新 `isContentScript` 判定；`check-design-tokens` 与 `visual-fixture-douban` 字面路径同步；`architecture-guard.spec.ts` 夹具对齐。新增通用幂等脚本 `scripts/migrate-layer.cjs`（替代 L1/L2 逐层副本）。`src/` 顶层收敛为七层骨架 + `domain`/`types`。六道门禁全绿（test:unit 1212 + 11 已知基线，零新增）
- **God 文件收尾（>600 行清零）**：`engine/database/models.ts` 672→590（抽 `schema.ts`：schema 常量 + 纯键助手）· `entrypoints/content/handlers/mukaku/handler.ts` 643→574（抽 `list-observer.ts`：懒加载观察器 + 防抖生命周期协作者）· `scenario/sehuatang/app.ts` 617→501（抽 `header.ts`：`buildHeader`，stats 回调以参数注入避免循环依赖）。新增 3 模块；`@engine/database/models` 经再导出保 37 消费方零改动。`>600 行文件` 3 → **0**。六道门禁全绿（test:unit 1212 + 11 已知基线，零新增）
- **`umm` 前缀统一 · 令牌族（D7 第一步）**：overlay 令牌 `--usl-*`（49 名）+ `--sht-*`（5 名）全量改名 `--umm-*`；其中 4 个与既有 SPA `--umm-*` 重名者（`border` / `text-primary` / `text-secondary` / `text-muted`）改 `--umm-overlay-*`，以保留 overlay/SPA 双层 fallback（`var(--overlay-x, var(--spa-x, literal))`）语义——**零视觉变更**。`scripts/check-design-tokens.cjs` 第 4 节对称断言与 3 个 spec 同步。六道门禁全绿（test:unit 1212 + 11 已知基线，零新增）
- **静态检查接入（D8 第一步）**：引入 `oxlint`（+ `oxfmt` 备用）devDependency、`.oxlintrc.json` 与 `npm run lint`（`--deny-warnings`）。配置尊重项目既有风格（`caughtErrors: none` 对应 `catch (e: unknown)`；`no-control-regex` 关闭——预览/清洗正则有意匹配控制字符）。**清零全部 38 条告警**（11 条自动修复 + 26 条死代码/冗余：6 处未用导入、2 个死函数、多处未用变量/参数、1 处不可达 `break`、7 处冗余 spread fallback、2 处 `indexOf`→`startsWith`/`endsWith`）。`lint` 纳入 CI `Static Gates`。六道门禁全绿（test:unit 1212 + 11 已知基线，零新增）。**Oxfmt 全仓格式化待后续**（避免 D2 重写前制造巨大 diff）。

- **Vapor 渲染模式落地 · SPA 作用域（D2 第一步 + D3）**：`vue` 升至 `3.6.0-rc.9`（连同 `@vue/compiler-sfc` 与 11 项 `overrides`）；popup / options 共 **62 个 SFC** 的根 `<template>` 加 `vapor` 属性。**根挂载保持 `createApp` 并注册 `vaporInteropPlugin`**——`vue-tsc@3.3.11`（registry 最新）不为 `<template vapor>` SFC 生成 `VaporComponent` 类型，`createVaporApp` 触发 TS2345；实测两种根挂载渲染产物一致，故取零类型断言方案
- **Vapor 安全转发（reka-ui 包装层）**：新增 `src/libraries/ui/forward-props.ts`。reka-ui 的 `useForwardProps` / `useForwardPropsEmits` 经 VDOM `getCurrentInstance()` 读取实例，而在 vapor 组件的 `setup()` 内该调用返回 `null`，两个助手**静默退化为空对象**：props 不达包装目标、`v-model` / `update:*` 不再回传（有告警，无报错）。**13 个包装 SFC**（dialog ×4 / select ×6 / switch ×1 / tooltip ×2）改用 Vapor 安全实现，转发契约逐项保留
- **ADR-026 迁移结论修正（两处）**：①`<Transition>` / `<TransitionGroup>` / `<KeepAlive>` / `<Teleport>` 在 vapor 模式下由编译器**自动**映射为对应 Vapor 版本，无需手工改名（`compiler-vapor` 的 `isTransitionTag` 等实证）；②互操作是**双向**的——VDOM 根内可渲染 vapor 子组件，`createApp` 挂 vapor 根亦可用，W0.1 记录的「`createApp` 返回 undefined」仅对旧 browser 构建成立
- **Node ESM 兼容**：`libraries/utils/context.ts` 的 `import.meta.env.DEV` 改为可选链访问——非 Vite 转换环境下 `import.meta.env` 为 `undefined`，裸访问 `.DEV` 会在模块求值期抛 `TypeError`（与 `logger.ts` 同范式）

- **Vapor 渲染模式落地 · Douban overlay 作用域（D2 完成）**：`src/scenario/douban/` 全部 **44 个 SFC** 的根 `<template>` 加 `vapor` 属性；互操作插件在**唯一挂载点** `overlay/mount-app.ts` 注册（`app.use(vaporInteropPlugin)`），一处覆盖全部 32 个页面挂载——树内 `lucide-vue-next` 图标是 VDOM 组件，缺插件会静默不渲染且零报错。至此 **D2 全量 Vapor 完成**：SPA 62 + overlay 44 = **106 个 SFC**
- **overlay 迁移验证（前后对照零差异）**：在隔离探测中挂载**真实**组件 `UmmStatBar` / `UmmPaginator` 到 ShadowRoot（复刻 `mountUmmOverlay` 的建壳序列：建壳 → 注样式 → `.umm-mount` 容器 → mount）。迁移前后 DOM 结构（7 个 div）、渲染文本（`128电影64音乐1234…9`）、全部 15 个探测用例结果、控制台输出**逐字一致**，`pageerror` 零。SPA 侧复验同样零变化（渲染尺寸 11282 / 121982 字符不变、零告警、Switch 双向持久化仍成立）
- **代价记录（如实）**：`douban-main.js` **786.05 → 880.05 kB（+94 kB / +12%）**——vapor 运行时与 VDOM 运行时并存，后者仍为 `lucide-vue-next` 图标与互操作边界所必需；产物总量 2.03 → **2.13 MB**。功能与门禁全部不变，此项为体积成本而非缺陷

- **样式作用域收窄（D7 第二步之一：裸选择器消除）**：legacy 内容样式注入**宿主页面**（非 Shadow DOM），原 `FOCUS_VISIBLE_STYLES` 与 `SCROLLBAR_STYLES` 使用裸选择器，实测已改写第三方站点——宿主页 `button` / `a` / `input` / 可滚动 `div` 全部被画上 2px 实线焦点环，宿主 `<html>` 与所有滚动容器的 `scrollbar-width` 计算值均为 `thin`。现一律以「元素自身的 `umm-` 类」为作用域（`[class*="umm-"]:focus-visible`、`[class*="umm-"]::-webkit-scrollbar*`）；实测宿主元素恢复正常（焦点环 1px auto、滚动条 auto），扩展 UI 行为逐项保留。**有意保留**：扩展给宿主元素打的标记类（`umm-dimmed` / `umm-viewed` / `umm-sht-*` / `umm-neodb-synced`）同样满足 `[class*="umm-"]`，但均非可聚焦控件且本就被扩展有意改写外观
- **新增静态门禁 `npm run scope:check`**（`scripts/check-content-style-scope.cjs`，接入 CI `Static Gates`，与 arch/ds/i18n/lint 并列）：扫描 legacy 样式模块，拒绝任何「首个复合选择器为 `*` / 裸伪类 / 裸伪元素 / 裸标签」的规则；内置 `--self-test` 双向自检（识别 8/8 泄漏形态、受约束形态零误报）、`--json` 供脚本消费，违规即 exit 1。仅 `THEME_VARS` / `THEME_VARS_DARK` / `GLOW_VARS` 三块豁免——`html` 上的 CSS 自定义属性是唯一继承锚点，属机制而**非**视觉改写（修复前的 composed 表共 8 个裸选择器，修复后仅剩这一项豁免）
- **新增测试**：`tests/unit/content-style-scope.spec.ts`（4 例）——不重复实现扫描逻辑，改为**驱动真实门禁脚本**，保证「本地测到的」与「CI 拦到的」是同一份实现。门禁自身经双向变异验证：`[class*="umm-"]::-webkit-scrollbar` → `*::-webkit-scrollbar` 与 `[class*="umm-"]:focus-visible` → `:focus-visible` 两处变异均 exit 1，还原后 exit 0

- **挂死与大数据根因收口**：IndexedDB v14→**v15**（adult 三表新增 `avId` 派生索引 + 存量回填；快照层加 `avId` 可选字段，读侧白名单剥离）；`umm-sehuatang-cache` v1→v2（新增 `cachedAt` 索引，LRU 驱逐改 `count()` + `openKeyCursor`，替代全表 `getAll()`）；DataScheduler interactive/bulk 分道；fetch 超时统一收口 `libraries/utils/fetch-timeout.ts`；契约冻结与迁移测试快照同步 v15
- **内容脚本批量与节流**：YouTube 列表改批量提取（`content/ui/youtube-listing.ts`），MutationObserver 回调统一节流，覆盖 bilibili/youtube homepage、mukaku、pt scanner、video-overlay 消费方
- **动效颗粒度**：`.theme-ready` 后代通配过渡收窄为 `:where(body, umm:bg-/border-/shadow- 工具类)`（零特异性，组件级 `umm:transition-*` 无需 `!important` 即可胜出，reka-ui trigger 补丁退役）；新增 `REDUCED_MOTION_STYLES` 全局兜底；`umm-mount-fade` 收敛纯 opacity；`transition: all` 清零；新增 `motion-discipline` 门禁
- **交互反馈与无障碍**：`UmmInterestBar` 对话框 a11y 完备（`role=dialog` / `aria-modal` / Escape / Tab 焦点陷阱 / 焦点回归）；`.umm-dl-btn` 补按钮语义；Douban focus-visible 覆盖 `[role="button"]`
- **徽章死代码清理**：`SEARCH_BADGE_STYLES` 死块（含 5 处引用）与 4 个死 i18n 键删除；5 种状态徽章契约对照裁决**「同名不同构、0 合并」**，「合并前须逐份对照 DOM 契约 / `data-status` 取值集 / 视觉基准」入档为前置规则
- **按需样式子集**：新增 `GlobalStyleBlock` 子集组合 API（`composeGlobalStyles(['dimmer'])`），2 个 handler 切换按场景注入；css-map 运行时分包实测收益 **0 B**（WXT lib 模式 IIFE 无运行时分包能力，两轮调研定论）；scenario 样式死声明清理
- **TS 严格度**：`noUncheckedIndexedAccess` 开启，全仓 301 处索引访问错误分域清零（entrypoints 66 / douban pages 109 / tests 61 / 其余 65）——无 `as any`、无 `@ts-ignore`、未弱化任何测试
- **文件命名统一 + 守卫（D6）**：kebab-case / PascalCase `.vue` / `<domain>-extract.ts` 全量统一（38 个 `git mv` + import 重写）；新增 `npm run naming:check`（`scripts/check-naming.cjs`，`--self-test` 双向夹具内置），进 CI `Static Gates`
- **统一格式化（D8）**：引入 **Oxfmt**（`.oxfmtrc.json`：semi / 单引号 / printWidth 100 / **LF**——工作树 CRLF 系 `core.autocrlf` 检出产物），631 文件全仓收口（含 `.vue` script 与 CSS 逐声明折行）；`format` / `format:check` 进门禁；ds:check 与 motion-discipline 等文本解析守卫改为格式宽容；移除零引用直接依赖 `@vue/devtools-api` 与废弃 `lucide-shim.d.ts`
- **门禁基线**：九门禁（type-check / arch / ds / scope / naming / i18n / lint / format / build）全绿；`test:unit` **1294 passed + 11 已知基线**（personage `.localref` fixture 缺失，与历次一致）
- **Douban overlay 逻辑重构（X7，关闭 ADR-026 D1 最后缺口）**：新增 `shared/composables/use-record-refresh.ts` 统一三套记录刷新链路（`record:updated` 订阅 + `isRecordUpdatedPayload` 单一源、组件内 `onUnmounted` 自动退订、可注入 `RecordRefreshDeps` 测试缝）；detail/game-detail 根除 `app._instance.proxy` 侵入 hack，**game-detail 3s 可见性轮询改 ADR-015 事件驱动**；`url-detector.inferMediaTypeFromUrl` 收敛媒体类型判定（`new URL()` 解析 host+首段路径，自由文本查询参数不能翻转判定）；`main.ts` 32 键 `PAGE_MOUNTS` 注册表 map 化并修 book-authors 错位；`__ummDismissDetailMask` 死链路与 `create-overlay` `exposeDismiss` 机制删除（X8）
- **波内真实缺陷修复（X8）**：`event-bus.initEventBus` 由「先置旗后注册」改为**注册成功后置旗**——测试环境下 `addListener` 抛错会留下「已初始化但零监听器」的毒化态（全量套件 flaky 的根因，双向毒化经串行复现取证）
- **SPA Toast 无障碍（X8）**：`ToastContainer.vue` 条目 `role=alert/status` + `aria-live=assertive/polite`（error 打断、其余礼貌，与 content 侧 toast 契约对齐）、`aria-atomic`、关闭钮 `type=button`+`aria-label`、装饰图标 `aria-hidden`；legacy 焦点环 `border-radius:4px` 抖动清理
- **umreview 修复波**：`inferMediaTypeFromUrl` 子串匹配误判修正（`?search_text=music.douban.com` 不再翻转媒体类型）+ `infer-media-type.spec.ts`（5 例）；`loadRecord` 拒绝路径补用例；ADR 计数失真修正
- **文件尺寸守卫（X9，需求 9 门禁化）**：新增 `npm run size:check`（`scripts/check-file-size.cjs`，src/tests 单文件 ≤600 行，**棘轮基线只降不升**、达标未删亦报错，`--self-test` 夹具），进 CI `Static Gates` 与 AGENTS.md 门禁链——回访证实 W2「>600 清零」曾因无门禁反弹至 8 项，本波拆分后**基线清零**
- **God 文件再拆（X9-A，8 项归零）**：`models.ts` 698→180（facade + connection / record-store / record-query / pt-id-cache / bulk-ops，读写分道）· `video-overlay.ts` 677→455+modal+recommendations · `OverviewTab.vue` 668→112+3 vapor 子面板 · `sehuatang-controls.ts` 635→206+extract+build · `mukaku/handler.ts` 631→548+queue/detail · `webdav.ts` 631→219+settings/restore/sync（顺带消除三副本重复的下载-解包-校验流水线）· `doulist-replace.ts` 623→111+dialog · `sehuatang-controls.spec.ts` 1040→5 文件（58 用例零删除）。全部为职责缝机械拆分，公共 API 经 barrel 再导出零改动
- **批量 DOM 写入分片（X9-B，卡顿防护）**：新增共享基元 `libraries/utils/dom-chunk.ts` `runChunked`（每帧一块、可注入 schedule、cancel-on-restart；修复其 cancel 后 promise 悬挂缺陷）接入 6 处一次性大批量写入——PT dimmer mteam/nexusphp/批量清除（20 行/帧）、YouTube/Bilibili 徽章注入（10 卡/帧 + **getComputedStyle 读写相位分离**消除逐卡强制布局）、doulist 对话框（击键 150ms 防抖 + 小列表 DocumentFragment 单挂载 / 大列表分块）；新增 3 个分片行为 spec（11 用例锁帧预算、去重与取消语义）
- **测试环境无关化（X9）**：personage-creations 的 11 个环境性失败根除——机器本地 `.localref` 真实参考页改为**仓库跟踪的合成夹具** `tests/fixtures/douban/personage-creations.html`（豆瓣同构 DOM，无真实用户数据），spec 断言零改动零删除。**`test:unit` 1335 passed / 0 failed——项目历史首次全绿**
- **十门禁基线**：type-check / arch / ds / scope / naming / **size** / i18n / lint / format / build 全绿
- **ADR-015 广播链路 P0 修复**：`libraries/utils/event-bus.ts` 的 `broadcast` 由单腿 `chrome.runtime.sendMessage` 改为**双腿**——runtime 腿送达扩展页面 + `chrome.tabs.sendMessage` 逐标签腿送达注入的内容脚本。MV3 中 Service Worker 的 runtime 消息**不会**投递给内容脚本，因此 douban overlay 徽章、PT 淡化、mukaku 的实时刷新此前**全程静默失效**（由 `tests/e2e/book-home-live-refresh` 首个红灯暴露，非单测）。修复后 e2e 4/5 → **5/5（9.5s）**，「任意入口写库 → 注入 UI 免重载响应」由死特性恢复为可用
- **广播回归收口**：`sendToTabs` 改经 `globalThis` 取 `chrome`——Node 侧单测直接 import background handler 时不存在 `chrome` 绑定，裸引用在 async 函数内抛 `ReferenceError` 并泄漏为 unhandled rejection，污染同一 Playwright worker 的后续 spec（合并跑曾 7 例红 + 12 例未跑）。`tests/unit/event-bus.spec.ts` 增至 **15 例**，新增「无 `chrome` 绑定的上下文既不抛也不泄漏拒绝」契约
- **提取层与基元覆盖波（X11/X12）**：新增约 90 个 spec 文件，覆盖此前零覆盖的 33 个提取模块与 24 个 engine/libraries/feature 基元；合并全量单测 **2292 passed / 0 failed**（207 个 unit spec）。波内另修 3 处真实生产缺陷：`artists-overview-extract` 选择器（`.title .title a` → `.title a`）、`doulist-detail-data` 的 `·` 分隔符剥离、`sehuatang/home-extract` 末帖取值
- **真实浏览器 e2e 扩展（X13）**：新增 `pt-dimmer-live-refresh.spec.ts`（200 行 NexusPHP 列表夹具：30 条预置已看记录精确暗化、外部 `DB_PUT` / `DB_DELETE` 经广播免重载重算、分片清除 200 个 resolved 标记 ~20/帧）与 `imdb-detail-roundtrip.spec.ts`（legacy IMDb 详情芯片 + 状态观测器回写 `imdb_records`）；长任务 PerformanceObserver 预算（≤200 ms）实测 **0 longtasks / max=0ms**，断言保留未放宽。e2e 5 → **9 例全绿（19.2s）**。登记 2 项缺陷：淡化不可逆（D1，本波修复）、扫描型站点单键事件无法重算缓存行（D2，待裁决）
- **格式化门禁边界修正（D8 收尾）**：`tests/fixtures/**/*.html` 是爬取 DOM 的字节忠实夹具，元素间空白参与文本节点断言，纳入 Oxfmt 会改变渲染文本；新增 `.oxfmtignore` 并在 `format` / `format:check` 以双 `--ignore-path`（同时保留 `.gitignore` 语义）排除，28 个夹具退出格式化范围，`format:check` 恢复 exit 0
- **十一门禁 + 全量测试基线**：type-check / arch / ds / scope / naming / size / doc / i18n / lint / format / build 全 exit 0，`test:unit` 2292 passed，`test:e2e` 9 passed
- **显式 `any` 分域清零（X14 收尾）**：`enhancers/pt/**`（debug 面 → `(...args: unknown[])`；`mteam` 私有 throttle 泛型约束收口）、`libraries/utils/logger.ts`（4 个日志函数 `any[]` → `unknown[]`）、`libraries/utils/index.ts`（`throttle`/`debounce` 约束 → `(...args: never[]) => void`，反变性等价、接受集不变）、`provider/neodb/mapping.ts`（外部边界 `Record<string, unknown>`）、`feature/ImportExportTab.vue`（导入载荷改 `ImportedBackup` 全可选 v2/v1 形状，旧文件 `rating: number | null` 由写路径归一化承接）、`tests/unit/domain/StoreRecord.spec.ts` 与 `import-credentials.spec.ts`（夹具直接类型化，替代 `as any`）。`any:check` 实测 700 文件 0 显式 any
- **PT 淡化「不可逆」缺陷修复（D1）**：此前只加暗不取消变暗。新增 `undimElement()`，并在既有分片轮次内实现**取消规则**：NexusPHP 直连 ID 通道（取到 ID 但未命中已看）与缓存命中通道、MTeam 行通道（携带 ≥1 直连 ID）均可取消变暗；**无 ID 的未知态不触发**（避免缓存行每轮事件闪烁）。e2e 原先钉住缺陷的断言翻化为正向断言，并加兄弟行保持暗化与 `SEED_WATCHED` 计数断言
- **Douban 提取层缺陷裁决（X16-A：3 复现修复 + 3 证伪）**：①`detail-extract.ts` 死代码（`pl.remove()` 后 `parentElement` 恒为 null，清洗逻辑从未执行）删除；②同文件 `fromUrl(...)!` 非空断言不成立（`/topic/` 实测返回 null）→ 返回类型如实改 `UrlIdentity | null`，零运行时变更；③`extra-extract.ts` 短评星级正则 `allstar(\d)0` 与页面族不一致，**半星 `allstar45` 被解析为 0**（短评整行无星）→ 改用页面族统一 `parseRating`，`allstar45`→4.5、整数星不变，模板 `s <= c.rating` 天然支持半星；④`photos-data.ts` 读取标题时 `commentA.remove()` **实际删除宿主画廊页的原生评论链接**（`.name a` 1→0）→ 改在 detached clone 上清洗，宿主页零改动、输出逐字一致。证伪三项：`tv::` 键不存在（`Identity.fromUrl` 对 `movie.douban.com/subject/N` 恒映射 `movie`，读写同键）；`query-utils.ts:102` 所指文件不存在且 `usePaginator` 不读 `hasMore`；trailer id 提取对真实列页 URL 正确且无消费方
- **store / engine 缺陷裁决（X16-B：5 复现修复 + 1 证伪）**：①`engine/cache/lru-cache.ts` 淘汰用 `if (oldestKey)` 真值判断，**空串键把 LRU 扫描永久钉住 → maxSize 不再是上限**（实测 size 涨到 3、淘汰 0 次）→ 改 `!== undefined`；②`store/theme.ts` 的 `auto` 模式在系统深浅切换时**不重应用**（`.light` 滞留）→ 加 `watch(isDark, …)`，显式 light/dark 不被覆盖；③同文件 `chrome.storage.local.set` 裸调用使配额失败逃逸为**未处理 rejection** → 补 `.catch`；④`store/confirm.ts` 无重入保护：双击使动作跑两次，且**先发起的请求会关掉后一个调用者的对话框并吞掉其答案** → generation 计数 + loading 重入闸；⑤`libraries/plugins/i18n.ts` 异步 setter 逃逸 try/catch → 补 `.catch`。证伪一项：`record-repository-adapter.ts` 白名单缺 `usav_ids`/`sehuatang_ids`/`pt_id_cache` **不可达**（唯一生产接线只接受 7 个记录 store，强行放行反而会把 id 行灌进 `StoreRecord.fromSnapshot` 造成损坏）
- **PT 淡化行 ID 记忆化（X18）**：扫描型站点（缓存通道）解析出的行 id 不在 DOM 上，单键 `record:updated` 事件因此无法重算该行——取消变暗只在整轮扫描时发生。新增 `enhancers/pt/dimmer/row-id-memo.ts`（`WeakMap<Element, {doubanId?, imdbId?}>`，行移除即随 GC 释放），事件通道可复用上一轮解析结果重算；`tests/unit/pt-row-id-memo.spec.ts`（10 例）并做**反向验证**（去掉记忆化后 7 失败 / 3 通过），证明断言真的钉住行为而非自我实现
- **单测全局桩结构性收口（X19）**：Playwright 一 worker 跑多份 spec，模块作用域的 `globalThis` 桩泄漏到下一份文件，组合运行只靠「文件→worker 分配运气」通过（CI `workers:1 + retries:2` 用全新 worker 重试，**绿色 CI 掩盖顺序依赖**）。新增 `tests/unit/helpers/global-sandbox.ts`：按**导入文件**归属安装层（`initFileSandbox()` 于模块顶层注册 per-file 钩子），`beforeEach` 自愈重挂（`fullyParallel` 下一文件的测试被切成多个 chunk，根 `afterAll` **每 chunk 触发一次**，朴素「导入时恢复一次」会抹掉其他文件仍活着的桩），`afterAll` 带身份校验只撤销本文件仍拥有的层。34 份 spec 转接线，390 例在正序/逆序/重分组/洗牌多轮组合运行下全绿
- **测试隔离棘轮门禁（需求 14）**：新增 `npm run isolation:check`（`scripts/check-test-globals.cjs`，AST 级判定而非文本 token）+ `test-globals-baseline.json` 棘轮基线（只降不升，`--baseline` 重生成，`--self-test` 双向自检）；接入 CI `Static Gates`。**当前实测口径**：扫描 224 份测试文件，90 份写入全局，基线 76 份泄漏；本轮已再清 66 份（门禁提示「may shrink」），基线待合并复跑后统一锁定
- **分片写入挂死收口（X21）**：`libraries/utils/dom-chunk.ts` 的 `runChunked` 改为**逐项 try/catch**——一次抛错的 `write` 若逃逸进 rAF 回调，`step` 不再重新武装、promise 永不 settle，所有await它的调用方（PT 淡化轮次、`runActiveProcess` 的 pendingClear）永久挂死；错误计入 `ChunkResult.failed/errors` 且不中断批次。`engine/cache/cache-manager.ts` 的失效键判定同步改 `!== undefined`，使空串键不再升级为**整命名空间清空**
- **SPA Toast 无障碍契约修正（X21）**：`ToastContainer.vue` 容器 `aria-atomic` 由 `true` 改 **false**——容器是 `v-for` 堆叠区，atomic=true 时每次追加都重读整叠，**旧 toast 会打断自己**；spec 改为双向断言（必须含 `aria-atomic="false"` 且必须不含 `"true"`），防止再次回退
- **Douban 记录键单源（X22-A）**：新增 `scenario/douban/shared/subject-keys.ts` 的 `doubanRecordType()`——`Identity.fromUrl` 对 `movie.douban.com/subject/N` 恒映射 `movie`，写侧若产出 `tv::` 键则详情页读侧（`movie::`）**永远读不到**，形成半可见孤儿行。`RatingTab.vue` / `LinkedTab.vue` 的写侧类型改由该函数决定；`tests/unit/douban-record-key-roundtrip.spec.ts`（31 例）同时钉住「tv 域保存可被详情页读到」与「历史 `tv::` 行仅列表读者可见」两种行为。**既有 `tv::` 用户数据迁移未执行**——属数据破坏面，待人工裁决
- **overlay 挂载失败不再留下全屏死墙（X22-B）**：`#umm-overlay-*` 是 `inset:0 + 100vw/100vh + 不透明背景`，且页面级样式带 `body{overflow:hidden}`，挂载抛错时旧代码只在墙内写「UMM · 加载失败」文本，用户既看不到原页面也关不掉。现失败路径按 LIFO 撤销宿主改动 → `removeOverlayShell()`（`create-overlay.ts`，元素 + 页面级锁滚动样式 + **首次被丢弃的 `startThemeSync` disposer**）→ 在 light DOM 弹 `role=alert` 卡片，提供**重试**（重建同参数壳并重挂）与**关闭**；`mount-factory.ts` 的 compose/import 阶段抛错走同一撤销。成功路径逐像素不变（spinner→app 换挂与 `.umm-mount` 类名断言原样通过）
- **宿主 URL 协议白名单（X22-B）**：新增 `libraries/utils/safe-url.ts` 单一收口——`safeHref`（**只放行 http(s)**，其余归零为 `#`）、`isDangerousUrl`（危险协议**黑名单**，避免 `Star: Trek` 这类正文被误伤；消费侧仍走严格白名单）、`sanitizePageData`（挂载边界处对宿主来源数据做防环深洗）、`openExternalUrl`（拒绝 `#`/危险值并保持 `window.open` 两参 arity）。生产侧 `extra-extract.ts` 与全部枚举到的 sink（媒体卡 / 图片 / `UmmStatBar` / `UmmDynamicIsland` / `UmmPageLinks` / 首页行与榜单 / 搜索卡 / 12 个页面 App / `detail-ui` / `use-paginator`）接线；trailer 详情页的 `beforeMount` 原会在挂载**可能失败之前**就 `remove()` 宿主播放器，改为 `video-silence.ts` 可回滚捕获（重试时 DOM 完好）
- **下载与备份恢复的协议/取值边界收口（X26-A）**：`background/handlers/download.ts` 此前把宿主 DOM 抓来的 `img[src]` 直接 `a.href = url; a.click()` 注入**宿主 MAIN world**，`javascript:`/`data:` 可在目标页面 principal 下执行 → 入口新增 `isSafeDownloadUrl()` 只放行 http(s)，非法协议不注入；`webdav-restore.ts` 的远端设置以 `as Partial<AppSettings>` 无校验直写存储（恶意/被攻陷的 WebDAV 可下发 `theme:{}`、`syncInterval:-1`）→ 改经 `filterValidSettings()` **失败即关闭**（无校验器的键一律丢弃）并记丢弃项。`neodbToken` 已随后续收口波退出默认备份集：导出/导入均需 `includeNeoDbToken` 显式 opt-in（默认剥离 + string 类型守卫，`import-credentials.spec` 钉住），WebDAV `__settings__` 备份集默认不含凭据
- **e2e 断言诚实化（X17-B）**：`bangumi-list-roundtrip.spec.ts` 原先断言 `getComputedStyle().backgroundColor`，而状态填充是 `--umm-fill-*` 的 `linear-gradient`（计算进 `background-image`），两侧都读透明黑 → 断言改 `backgroundImage` 匹配 `/linear-gradient/` 且 done≠none，**严格更强、未弱化任何一项**。同期定位到真实产品缺陷一类：一次性后台读取**静默降级后永久缓存**（`provider/adult-av/transport.ts` 吞错返回空集/全零，`scenario/sehuatang/app.ts` 把零值缓存且重试分支不可达），两条 e2e（sehuatang 列表统计、bilibili 分片暗化）据此仍为红，正在收口
- **legacy 路由生命周期契约（X26-C）**：`content/router.ts` 的路由切换此前**从不撤销上一个 handler 的副作用**，同一 tab 内 IMDb→TMDB→JavDB 依次派发会累积 MutationObserver 与 `setInterval`（观察者回读风暴 + 定时器永不清理）。新增 `RouteDisposer` 契约：handler 可返回拆卸函数，`dispatchRoute` 在跑下一个 handler **之前**执行它，并用 `dispatchSeq` 序号防止迟到的派发把新路由的 disposer 误撤销。`neodb-push.ts` 同期收口「按钮永久禁用」缺陷：`restoreBtns` 只在成功路径调用，`neodbToken` 缺失与响应为空两处早退直接漏出 → 改 try/finally，三条路径（成功 / 无 token / 无响应）由 `x26c-neodb-push-restore.spec.ts` 钉住
- **Sehuatang / adult-av 一次性读取的「失败≠空答案」收口（X26-D）**：详情页与列表页的背景读取消息失败时，旧实现把「读失败」当「零记录」缓存并据此渲染，用户看到「全部未看」的假象。新增 `scenario/sehuatang/background-reads.ts`（146 行，返回带 `ok` 的读结果，**失败绝不写缓存**）并接入三个编排入口（`app.ts` / `app-search.ts` / `app-home.ts`）；`provider/adult-av/transport.ts` 同期改为 `failedStats(error)` 返回 `{ok:false,…}` 而非零值，`bilibili-listing.ts` 的批量读在全部重试失败时**撤回占位徽章并把判定标记为未回答**（避免「未读」渲染成「未看」）。测试：`x26d-sehuatang-background-reads.spec.ts` / `x26d-adult-av-read-outcome.spec.ts` / `x26d-bilibili-bulk-read-failure.spec.ts`
- **内容脚本生命周期与延迟工作收口（X26-C2）**：`bilibili-homepage` / `youtube-homepage` / `bilibili.content` 三入口的「等挂载」观察者此前**不被跟踪**——路由离开后仍在 `document.body` 每次变更上跑 `querySelector`，并可在新路由上启动列表观察者。现以 `waitingObserver` / `domReadyListener` / `waitDeadline` 显式记账并成对释放，YouTube 的 feed 等待加上 20 s 上界且同路由轮询可重挂一次；延迟工作改由 `deferred` 集合记账（`later()` 注册、模式停止时 `clearDeferred()`），详情侧以 `detailGeneration` 序号守卫——**迟到的 DB 应答不得为已离开的视频装观察器**。共享的 `content/ui/video-overlay.ts` 新增 `pendingTimers` 名称化计时器表（同名替换即清旧、`cleanup()` 全清），推荐区观察器的回调计时不再脱管。**性能侧的可见行为变更（如实披露）**：`bilibili-listing.ts` 的批量标注改为「每帧 10 张卡（`LISTING_CHUNK_SIZE`）且读相（锚点解析 + `getComputedStyle`）整批先于写相」，以消除逐卡强制布局；这使 e2e `bilibili-homepage-chunked.spec.ts` 原先的 `samples[0]===0` 断言不再成立（实测首观测值稳定为 10，属采样器 5 ms 首拍与首帧的先后关系，非生产契约），已改钉三条可证伪契约：首值必须为部分值、步进单调不减、单步增幅 ≤ 语料一半（一次性全量写入必被捕获）
- **Options 解析链单源与保存竞态（X26-B）**：`RatingTab.vue` 与 `LinkedTab.vue` 各带一份 ~200 行、已经漂移的 URL/ID 解析器。抽出 `entrypoints/options/record-input-parser.ts`（纯函数、失败携带 `errorKey`，放 options 入口而非 `libraries/` 因 arch 规则 C 禁止 libraries 依赖 provider/scenario）。修复的 6 项实证缺陷：①**非法解析落库**——`if (!parsed)` 永不为假（`{valid:false}` 是 truthy 对象），垃圾输入会写 `{type}::<garbage>` 键并广播 `record:updated`，现两侧均按 `!parsed.valid` 拒绝并弹 toast；②YouTube 裸 ID 拼 URL 把尾部斜杠落进 `?v=` 值内；③`/watch\?v=` 硬编码使 `youtu.be/`、`/shorts/`、`/embed/` 结构性不可匹配（改 URL 解析）；④`input.includes('book')` 把 `?from=book-list` 的影片链接误判为书（改取匹配组里的子域）；⑤`status===1`（想看）在两处标签映射里显示成「评分」（改 `common.wish`）；⑥bilibili/youtube 校验失败复用 `validation.imdbFormat` 文案（补 `validation.bilibiliFormat`/`youtubeFormat` 三语）。性能：LinkedTab 的 N 次串行 `dbGet` 改按 store 聚合的 `dbGetBulk` + `Promise.all`。竞态：SettingsTab 单一定时器被两个 watcher 互抢且在卸载时丢弃（改按槽位计时 + `onUnmounted` 冲刷）；WebDAVTab 整对象重赋值 + `as string` 强转（改逐字段 `typeof` 校验）。**行为变更**：LinkedTab 裸数字 ID 不再无条件猜成豆瓣，改为尊重当前平台选择——与 `auto-detect.spec.ts` 已声明的「尊重所选平台」契约一致，且输入 watch 仍先跑 `autoDetectPlatform` 纠正平台
- **测试隔离的第二类通道：生产模块级绑定未释放**：`engine/settings/items.ts` 的测试专用注入 API `__bindSettingsAreaForTests` 由 `settings-items.spec.ts` 在 `beforeAll` 绑定，而其 `afterAll` 只恢复 `globalThis.chrome`——模块级 `testAreaOverride` 在同 worker 的后续文件里持续存活，导致 `store-theme.spec.ts` 的设置镜像写入落到别人的 area、断言拿到空数组（**单跑绿、合并复跑红**）。现补 `afterAll` 解绑并以 `beforeEach` 重申（抗 `fullyParallel` 的 chunk 边界拆卸）。同期把 `options-query-feedback.spec.ts` 的一处**整句日志文本 pin** 降级为契约形状 pin（`console.warn('[UMM] Sehuatang global stats read failed…', error)`：前缀 + 错误透传仍被断言，措辞不再被锁死）
- **仓库级合并复跑（首次全绿基线）**：`type-check` / `arch` / `ds` / `scope` / `naming` / `size` / `doc` / `orphan` / `any` / `isolation` / `i18n` / `lint` / `format:check` / `build` / `test:unit` / `test:e2e` 共 16 步一次性合并复跑全部 exit=0——**unit 2450 例、e2e 14 例全通过**，产物 `dist/chrome-mv3/`（`background.js` 81,205 B，最大出货文件 `douban-main.js` 878,663 B）。本轮此前在合并复跑中暴露的 3 项红点（格式化漂移、`store-theme` 隔离、chunked e2e 断言）均已定位到根因并修复，非以基线豁免方式抹平
- **isolation 门禁计量口径硬化（X23 ⑭⑮）**：泄漏数字此前一直建立在这道门禁上，而门禁自身有四处看不见真实泄漏——①裸 `defineGlobal(…)` 调用不计（判据挂在属性访问分支上），helper 文件整体处于无人监管状态；②`afterAll` 正文只要出现 `saved`/`cleanup` 等词即**整份文件豁免**；③`const g = globalThis` 类别名写入不计；④生产模块的测试注入 API（`__*ForTests`）造成的**模块级单例绑定**根本不在观测面内。现四项全部改为 AST 级判定：callee 名识别 helper 调用、撤销判定要求 cleanup 体内存在**撤销动作**（写回 / `delete` / `restoreGlobals()`）而非词汇、别名迭代收至不动点、`__*ForTests(非空)` 必须在清理体内以空值释放；并补「安装时机」判据——sandbox 钩子只在模块作用域或 `describe` 回调内首装时注册，故测试体内的 `defineGlobal` 结构上永不撤销。同期纠正门禁**自造的假阳性**两类：`page.evaluate` / `addInitScript` 回调运行在页面上下文（其 `globalThis` 写不进 worker，2 份 e2e 由误报转净）、jsdom 解构的本地 `window` 遮蔽同名全局（1 份受影响）。**硬化后实测**：242 份测试文件中 116 份安装测试态、**45 份从不释放、177 处未释放安装**（18 直写 + 23 缺顶层 `initFileSandbox()` + 4 份自带本地 `defineGlobal` 副本），抽样 4 份逐条读码确认为真阳性。基线 76 → 45 属**口径修正而非放宽**（旧口径既漏报真泄漏也滞留已修条目），棘轮仍只降不升；`--self-test` 夹具 7 → **17**（含两类假阳的「必不误报」断言）全绿，`isolation:check` exit 0
- **沙箱钩子注册面与本地副本收口（X29 ①②③）**：45 份未释放文件按三条成因分波清零——18 份裸写 `globalThis`（含 `const g = globalThis` 别名）改为本文件记账释放、23 份首装发生在测试体内（结构上拿不到 per-file 钩子）补模块顶层 `initFileSandbox()`、4 份自带本地 `defineGlobal` 副本改接共享沙箱。**基线 45 / 177 → 0 / 0**（242 份扫描 / 116 份安装测试态 / 0 处未释放），棘轮自此开始真正咬合：新增任何裸写都会红 CI
- **第五类泄漏通道：第三方模块在 import 期捕获全局**：桩释放干净之后，合并复跑反而新冒出 `umm-image` 1 例红 + 3 条「不属于任何测试」的错误（`Cannot read properties of null (reading 'createElement')`）。根因不在测试桩，而在 `@vue/runtime-dom` 模块级一次性绑定 `doc = typeof document !== 'undefined' ? document : null`——Playwright 一 worker 共享同一份模块注册表，**谁第一个 import `vue` 就替全 worker 定下这个捕获**；此前别的文件泄漏着 `document` 桩替它兜底，释放做正确后该绑定变回 null。单跑与两文件组合均绿，只有全量合并跑复现（`--workers=1` + 指定文件序可稳定复现）。修法是 worker 级 DOM 基线而非逐文件打补丁：新增 `tests/unit/helpers/worker-dom-baseline.mjs`，由 `playwright.config.ts` 经 `NODE_OPTIONS=--import=` 在任何 spec 模块求值前装好 `window/document/navigator/Node/Element/HTMLElement/SVGElement/DOMParser/XMLSerializer`；实测 jsdom 容忍跨 document `appendChild`，故基线与各文件私有 `JSDOM` 实例可共存（Vue 建在基线、容器在自家 document 仍挂载成功）。unit 2450 passed + 1 failed → **2451 passed / exit 0**
- **沙箱 helper 两处结构性补强（X23 ⑩⑪）**：⑩ 归因失败此前**静默放行**（解析不到 spec 文件时照写 `globalThis` 但不入册 ⇒ 永不释放且门禁无感），现改为抛错并给出可操作提示；以强制 `specFileId()` 返回空的探针验证该路径确实咬合（套件立刻 2 处红）。⑪ **链式桩遮蔽**：后装文件把前一文件的桩记成 `prev`，前文件 `afterAll` 身份失配后不再撤销 ⇒ 桩永久遗留；现安装时越过他牌仍活的桩去继承其 `prev`（真原值）。如实标注：⑪ 在全量跑中**未观测到触发**（需 chunk 边界交错才成立），属防御性修正而非已复现缺陷
- **测试诚实性：5 例假覆盖改可证伪 + 7 项变异反向验证**：①`hash-utils` 的「key 排序」测试拿字面量和它自己重建的字面量比对（永真）→ 拆成「key↔record 配对参与摘要」与「排序用 locale _collation_ 而非码元序」两条，并补一个不做序无关的正向对照；②`import-settings-whitelist` 的「对称性」测试只查 `EXPORT` 数组无重复，从未引用 `IMPORT_SETTINGS_KEYS` → 改双向逐元素相等；③`heatmap-range-responsive` 的分段测试把 node 侧算好的期望值**写进 DOM 再读回来**（自实现断言，`window.__apply` 定义了却从不调用）→ 改由页面自量 `clientWidth`、经 `exposeFunction` 调生产选取器，并加「三档宽度必须落在三个不同 tier」的非常数断言；④⑤`bilibili-listing-layout` 采集了 `coverPos` 却 `void` 丢弃（注释宣称的契约根本没断）→ 激活该断言，并把「注入 CSS 不得全局把封面设为 relative」从**字符串匹配升级为计算样式实证**（`[class~="…"]` + 无空格 `position:relative!important` 可绕过原有四条文本检查，绕过版现必红）；`personage-creations` 的分组测试依赖一个**缺锚点 ul 时静默 no-op** 的夹具变异器，且把 magic number 10 当契约 → 改为断言变异真的生效（3 个 group）、期望值取自 `#content li.creation`，顺带量出夹具实为 11 项 / 其中 1 项在 `#content` 之外被正确跳过。反向验证以 7 处生产变异（丢 key、换码元序、按内容排序、白名单回填凭据键、选取器忽略宽度、变异器 no-op、CSS 绕过文本检查）逐条确认新断言必红，全部产物以 sha256 校验字节级复原
- **仓库级合并复跑（第二次全绿基线，含驱动自纠）**：`type-check` / `arch` / `ds` / `scope` / `naming` / `size` / `doc` / `orphan` / `any` / `isolation` / `i18n` / `lint` / `format:check` / `build` / `test:unit` / `test:e2e` 共 16 步一次性合并复跑**逐步 exit=0**（wall 12s+1s×8+2s+1s+2s+4s+60s+32s）——**unit 2451 passed / e2e 14 passed**，`isolation:check` 实测 242 扫描 / 116 安装态 / **0 未释放**且基线已锁 0，产物 `dist/chrome-mv3/`（`background.js` 81,205 B，最大出货文件 `content-scripts/douban-main.js` 878,663 B，46 个 js chunk，全量 2,258 KB）。本轮同时纠正**验证驱动自身**的假绿：首版汇总脚本的 `echo` 被 shell 插值吞掉退出码（打印 `exit=` 空值）、且驱动脚本恒返回 0——「driver exit=0」绝不等于各步为 0，现改为逐步 `printf exit=` 记录并以 `fail` 聚合后 `exit $fail`。首次合并复跑正是靠这套逐日志核验（而非驱动退出码）抓到 `umm-image` 的第五通道红点，其根因与修法见上一条目
- **诊断出口棘轮门禁（X28 ①）**：`src` 内的裸 `console.*` 此前完全无门禁（oxlint 未启用 `no-console`），只能靠临时 grep 看见。新增 `scripts/check-console.cjs`（AST 判定：注释与字符串里的 `console.log` 不计；`window.console.error` 与 `globalThis.console.x` 计入；`.vue` 以 <script> 虚拟文档保行号）+ `console-baseline.json` 基线，`logger.ts` 作为唯一合法出口豁免。**实测 479 份文件 / 167 处直接调用**（旧 grep 粗口径报 169，差值即豁免与注释/字符串两类误计）。棘轮只降不升，`--self-test` 6 夹具（4 必捕 / 2 必不误报）全绿；已接线 `npm run console:check` + CI `Static Gates` 与 AGENTS.md 门禁链（现为 15 道）。**167 处本身尚未迁移**——下一子波按域收敛到 logger，其中「错误吞没」类必须按 X21/X26-D 的「失败≠空答案」补反馈，禁止静默换成 `logger.warn` 了事
- **真实浏览器 e2e 广度开波（X27 ①）**：新增 `tests/e2e/fixtures/douban-crawl-fixtures.ts`——把 `tests/fixtures/douban/` 的 **39 份字节忠实爬取夹具**作为**真域名 URL** 的响应体（URL 不变故 manifest `matches` 仍注入内容脚本，站点零触网），缺夹具即抛（回空体会让"空白页"伪装成通过），并回报 `served()` / `unmatched()`；配套 `douban-host-subjects.ts` 以 `a[href*="/subject/"]` 为主键解析**页面自报的 (title, id)**，使 e2e 的期望值与被测提取器无关。据此补齐 Douban **电影首页**与**搜索结果页**两类真实交互链（壳 + shadow `<style>` / 渲染标题必须能在宿主 DOM 找到出处 / 点击卡片开出的 tab URL 必须等于该标题自己的 `/subject/<id>/` / 外部 `DB_PUT` 免重载只翻那张卡的徽章），并把搜索页的筛选按钮活性迁移钉成断言。同期定位两处工具性事实并入审计规则 25–26：`expect.poll` 包 `page.evaluate` 会在 30 s 内误报「壳不存在」（同表达式 `waitForFunction` 186 ms 命中）；首页同一份夹具里并存 4 种卡片命名法，按单一形态读期望值会产出假阴性
- **Douban CSS 分包减包：假设证伪，决定不实现（X25）**：需求 8/11 的候选项「45 条静态 `?raw` 导入按页动态化，每页约 −200 KB」经**构建实验**推翻，不是靠注释里的一句话。事实：content script 由 WXT 打成 **IIFE 单体**（manifest `douban-main` 条目无 `type: module`，产物内 `import(` 计数 0、`chunks/` 引用 0），动态导入必被内联——实测在 `css-map.ts` 表内临时加一条 `await import('./styles/series.css?raw')` 重建后，`douban-main.js` **879,405 → 879,671 B（仅 +266 B 包装代码）**，`content-scripts/` 仍 10 个文件（无新 chunk）；探针以 `cmp` 逐字节还原并重建回 879,405 B。次优路线（CSS 拆独立文件 + 运行时 `getURL`/fetch）**不采纳**：ZIP 字节不变，却要付出 44 份样式进 `web_accessible_resources` 的暴露面 + 首帧样式注入转异步（与 document_start 建壳防 FOUC 相冲）。如实记录**已按需**的一面：`PAGE_CSS_PRESETS` 每页只组合基座 + 该页 chunk；样式总量 257,688 B / 44 文件，注释占比仅 10%（25,759 B），构建期剥注释不足以抵消 devtools 可读性。**附带修一处引用诚实性缺陷**：`css-map.ts` 的 NOTE 原写「见 ADR/审计 P-G 实测」，而全 `docs/` grep `P-G` **零命中**（悬空引用），现替换为本条可复现的实测描述，并把表中「44 个 ?raw 常量」修正为实际 45 条
- **搜索页免重载刷新缺口定位（X30，含一次已回退的失败修法）**：新 e2e 用例暴露——搜索页与另外 7 个页面（`albums` / `doulist-detail` / `game-explore` / `personage` / `personage-creations` / `series` / `search`）在 `config.ts:beforeMount` 里用 `loadRecordMap()` 做**一次性快照**且无 `record:updated` 订阅，他处写库后徽章到重载前不变（实测同一记录在电影首页能免重载翻徽章、搜索页 30 s 内始终 `umm-status--none`；写库本身成功，且**预置记录 mount 能正确渲染**）。第一次修法把读取搬进 `App.vue` 的 `useRecordCache`，反而**弄坏了 mount 期渲染**（预置记录也不出徽章），已 `git checkout HEAD` 回退并把 `config.ts` 恢复为工作树原状（保留 `inferMediaTypeFromUrl` 单源版），回退后 `douban-main.js` 878,654 B（基线 878,663 B）。缺陷以 `test.fixme` 形式钉在用例里（不是跳过掩盖：正向断言、根因、对照实验与失败修法都写进注释），修复列为 X30。本条同时记录一条方法论：**改生产链路前必须先有能分别证伪「渲染路径」与「刷新路径」的两个用例**，否则会像本次一样把 A 修坏去证明 B
- **快照页免重载刷新收口（X30 结案）**：上一条钉住的 7 个页面（`albums` / `doulist-detail` / `game-explore` / `personage` / `personage-creations` / `series` / `search`）全部由「`beforeMount` 一次性快照」改为「**config 批量读作 seed + `App.vue` 内 `useRecordCache` 活读**」：首帧仍同步出徽章（无闪空），事件到来后按前缀 + id 走定向 `DB_GET_BULK` 回读而非全表扫描。徽章一律**派生**（`computed` / 模板函数内 `records.value.get(…)`），不再写回提取对象——personage 与 personage-creations 此前把 `recordStatus`/`recordRating` 就地写进 `WorkItem`/`CreationItem`，Vapor 下取一次即冻结，这正是「删除方向」根本无法表达的缺陷成因；creations 页原先靠 `getCreationKey` 换 key 强制重挂来假装刷新，现改为派生后 DOM 抖动消失（与需求 5「避免一次性大批量修改」同向）。同期：`useRecordRefresh`（detail / game-detail 单记录页）补 `record:deleted` 订阅，删除上报 `null` 而不再滞留旧徽章；事件名联合 `RecordEvent` 与 subject-id 解析 `subjectIdFromUrl` 各收敛为单一源（`use-record-refresh.ts` / `shared/subject-keys.ts`，原先三处重复正则）；删掉两处死 `try/catch`（被调的 `loadRecordEntries` 已自行捕获并告警，外层永远捕不到东西）、4 个无人读取的类型字段。**反向验证**：两处生产变异（把活读改回 mount 快照）分别使新用例必红（`unexpected value "0"`），还原后 `cmp` 逐字节一致并重建。测试：`record-refresh.spec.ts` 10 → **14 例**（新增删除清徽章、删他键不受影响、无键删除全清、删除与重写竞态取存活记录、两事件均订阅且退订成对释放）、`record-cache.spec.ts` 补 `subjectIdFromUrl` describe、新增 `tests/e2e/x30-personage-live-refresh.spec.ts`（3 例：夹具自报配对源 / personage 写-删双向 / creations 写-删双向，全程断言 `page.url()` 未变以证明确实免重载）。**合并复跑（第三次全绿基线）**：15 道门禁 + `build` 逐步 exit=0、**unit 2463 passed / e2e 26 passed**、产物 `background.js` 81,205 B、`douban-main.js` 879,405 B。合并复跑同时抓到分波自测漏掉的**6 份文件格式化漂移**（`homepage` / `book-homepage` / `music-homepage` / `personage-creations` 四个 `App.vue` + 两份 unit spec），`npm run format:check` 由 exit 1 转 exit 0——再次印证「分波自测不算验证」

- **推荐位徽章活态收口 + game-detail 记录死路径（X31，X30「全量收口」口径的回访更正）**：X30 自称「全部快照页收口」，本轮重新枚举消费面后证伪——列表行 / **推荐位网格** / 详情页主体是三个独立消费点，前两条只做了第一条。实测缺陷：detail 与 game-detail 两页的 `recItems` 徽章在提取期就被烤进行对象（`recStatus`/`recRating` 字段），挂载后永不重算；`game-detail` 更严重——`config.ts` 从不回读已有记录，`App.vue` 的 `record` ref 挂载时恒为 `null`，而 `syncNeoDBOnLoad(identity, record.value)` 正是读它，于是「已看过的游戏」的伴生 NeoDB 对齐**永不触发**（死路径）。修法：新增 `src/scenario/douban/components/umm-rec-section.ts`（config 批量读降级为 seed，徽章在**渲染函数内**从 `records` 派生，`:key` 用稳定 `subjectId`——把状态放进键等于整卡重挂来伪装刷新），两页改走该组件；`game-detail/config.ts` 按 `{type}::{providerId}` 先读一次并交下 `record`/`initialStatus`/`initialRating`。测试：新增 `tests/unit/umm-rec-section.spec.ts`（**18 例**，含「同一 DOM 节点被改写而非重挂」的对象同一性断言、订阅失败必须冒泡、空可见集只清状态绝不退化为全表扫）与 `tests/e2e/x31-rec-badge-live.spec.ts`（2 例：推荐位 想看→已看→none 全程不重载且 `page.url()` 不变 / game-detail 预置记录后 NeoDB 侧真实发生一次回读），并把 `x27b` 里两份靠 `page.reload()` 兜底的对应用例改成免重载断言（reload 会让缺陷自我掩盖）。**反向验证**：三种生产变异各自转红——派生挪出渲染函数（3 failed）、状态进 `:key`（1 failed）、去掉空 ids 守卫（2 例零流量断言失败）。同期清理 `recStatus` 死字段与 4 份 spec 里残留的过期形状断言（Playwright 不类型检查 spec，此类残留只有合并复跑能抓到）
- **记录读取卫生：空/缺省 ids 不再全表扫 + 可见集增长定向重读（X31-B）**：7 个页面 config（`albums` / `game-explore` / `search` / `personage` / `personage-creations` / `series` 传 id 数组，`doulist-detail` 传全键）此前直调 `loadRecordMap(prefix, ids)`，而 core 的 `if (ids && ids.length > 0)` 判假即退化为 `dbGetAll` **全表扫描**——最痛的是搜索零结果页；`game-explore`/`search` 传的还可能是 `undefined`（`data?.items?.map(…)`），静默走同一退化路径。改走 `loadRecordMapForIds(prefix, ids | undefined)` 与新增的 `loadRecordMapForKeys(keys)`（空/缺省集合 → 空映射 + 零消息流量）。**关键耦合（本轮实测抓出，原计划没有）**：全表扫原先客观上替「挂载后才出现的行」（翻页 / 无限滚动 / SPA 软导航）兜了底，因为 `useRecordCache` 只在事件到达时重读、可见 id 集合自身增长不触发读取；只换守卫版会让那些行的徽章永久停在 `none`。故同波给 composable 加**随可见 id 集合走的重读**（watch 排序后的 id 串：同集合换序/换引用不触发；`load()` 内 dedup 保证一拍内多次追加只读一次；集合清空 → 清表且零读取），`book-homepage`/`homepage`/`music-homepage` 原先手工 `watch(visibleIds, () => load())` 改由 composable 统一承担。测试：新增 `tests/unit/rec-map-read-hygiene.spec.ts`（**12 例**，含 fall-through 正反例、逐页结构守卫、正则守卫自证种子、页面清单由目录枚举而非硬编码；落地时 8 例结构红 + 2 例行为绿即缺陷实锤）、`record-cache.spec.ts` +3 例（增长→一次定向读、仅换引用→零读、清空→清表且零读取，前两者落地前即红）。本轮之后 `src` 内 `loadRecordMap` 裸调用清零（仅存定义与文档）
- **overlay 卸载生命周期：同 id 重挂载不再叠加 app（X33）**：`mountUmmOverlay` 无销毁句柄也不卸载旧 app，同一 `overlayId` 二次挂载会留下**两个 `.umm-mount` 容器 + 两套 `useRecordCache` 订阅**（每次 `record:updated` 广播产生双份定向批量读）；可复现入口是 `finalize()` 在 `app.mount()` 之后抛出（config 的 `afterMount` 抛错）→ 失败面板的「重试」再次挂载。诚实边界：douban 入口无 popstate/pushState 再挂载触发（grep 零命中），一文档一次挂载，故「SPA 软导航泄漏」不是现行缺陷，而 25/32 页共用 `umm-douban-overlay` 决定了未来接入时的影响面。修法：模块级 `liveMounts: Map<overlayId, {app, container}>` + `releaseLiveMount()`，挂载前释放旧、`mount()` 后登记、失败路径释放（覆盖 `beforeMount` 抛错时仍持旧 app 的情形）。测试：`overlay-mount-failure.spec.ts` +2 例，落地前实报 `Expected length: 1 / Received length: 2`（两棵探针树同时在线）；反向验证——注释掉 catch 内 `releaseLiveMount` 后精确红在 `expect(shownUnmounted).toBe(true)`
- **单测挂载卫生与两处负载相关脆弱用例（X27-A 复核 + 测试基建）**：①新增 `tests/unit/helpers/release-mounted-apps.ts`（挂载注册表：`trackMounted` / `releaseMounted` / `liveMountCount`）并接线 4 份真正泄漏的 spec（`umm-status-badge` 17 次挂载、`umm-media-card`、`umm-page-layout`、`host-url-neutralization` 3 处）；新增 `tests/unit/mount-hygiene.spec.ts`（**4 例**结构守卫：由目录枚举挂载用例、模式正/负种子、扫描非空自证）。守卫第一版**不灵敏**被实测抓到——`releaseMounted` 只出现在 import 行也算通过；改为要求 `test.afterEach(releaseMounted)` 实际接线后，人为摘掉一处接线即精确转红。②`sehuatang-detail-loader.spec.ts` 的两处 `await settle(20)` 换成 `untilFetchInFlight()`（等可观测状态而非挂钟，且永不出现即抛错）：该用例在全量 16 worker 复跑下红（`fetchCalls` 0≠1）、单跑必绿，属负载敏感；变异验证（把 fetch 换成不 fetch）转 8 failed。③`data-scheduler-semantics.spec.ts` 的「队列满」用例原先塞 1000 个永不 settle 的任务且丢弃 promise，其 60 s 定时器在合并复跑中途开火，产出**挂在任何用例之外的 1 条 error**（`Task task_1_… timed out after 60000ms`）；改为 `finally` 里 `clear()` 拒掉排队项 + settle 队头任务，全量日志该错误归零，跑时 2.4 min → 1.5 min。④**审查报告诚实性结案**：上游 X27-A 审查报告的 5 条中 4 条为虚构定位（不存在的 `tests/e2e/collect.spec.ts` / `x27a-review.spec.ts`、`extension-harness.ts` 报称 509-536 行但文件仅 264 行、e2e 内 `test.skip`/`// test(`/`on('console')` 全零命中），另 1 条真实但文件名全错（真泄漏是上述 4 份，而首轮 grep 把 `createAppI18n` 与零挂载文件误计为泄漏）；X27-A 计量按实测更正为 **2 份 spec / 9 用例**

- **legacy 列表徽章活态与删除方向（X32 ①：bilibili / youtube 首页列表）**：douban 侧 X30/X31 收口后，回访按消费面重新枚举，legacy 注入侧是同一个缺陷族的第二面。实测两处：①**删除方向根本无法表达**——两站列表 pass 的写回循环是 `if (record) updates.push(...)`（无记录的行被跳过），且淡化只 `add`（bilibili 还在 shell/card 两处 class 上各加不清），所以「记录被删/状态降到阈值以下」即使重扫也翻不回来；②**没有任何事件接线**——列表 pass 由 host DOM 的 `MutationObserver` 驱动，弹窗/其它 tab/同步写入不改 DOM，因而事件永不到达这条链路（`bilibili-homepage.content` 与 `youtube-homepage.content` 连 `initEventBus()` 都没调）。修法：写入侧改为**对称裁决**（youtube `applyListingVerdict(card, record | null)`；bilibili 在 pass 内同时撤 shell 与 card 两种淡化），读取侧新增 `invalidateProcessedRows(root, eventKey)` 按事件键精准脏化（键缺省或 `'*'` = 批量写入形态 ⇒ 全脏；无关键 ⇒ 零脏化，绝不为一次外来写重扫整条 feed），入口侧订阅 `record:updated` + `record:deleted` 并随列表下线 `releaseRecordSub?.()` 释放。证据：`youtube-listing.spec.ts` +4 例（落地前 4 failed：`invalidateProcessedRows is not a function`）、`x26d-bilibili-bulk-read-failure.spec.ts` +4 例（含「重扫但无记录 ⇒ 撤淡化、徽章回未看」）、新增 `legacy-listing-bus.spec.ts`（4 例结构守卫：入口清单由目录枚举、必需项正/负种子、订阅释放接线）与 `tests/e2e/x32-legacy-listing-live-refresh.spec.ts`（真实浏览器 + 扩展上下文：一次 `DB_PUT` 只翻那一张卡、一次 `DB_DELETE` 翻回，文档 identity token 断言全程未重载）。**反向验证**：仅摘掉入口接线（保留模块能力）后重建，e2e 精确红在 `toHaveClass(/umm-viewed/)`——证明该用例钉的是通道而不是模块单测的复述。**X32 余量（未完成）**：`src/entrypoints/content/handlers/tmdb.ts` / `src/entrypoints/content/handlers/javdb.ts` / `src/entrypoints/content/ui/video-overlay.ts` 推荐位 / `src/entrypoints/content/handlers/create-detail-handler.ts` 仍是无事件的一次性读取；`settings:changed` 实测 0 生产者 + 0 消费者、`sync:completed` 3 生产者 + 0 消费者（死通道，删或补消费者需人工裁决）
- **legacy 详情页链外部写入刷新（X32 ②：imdb / tmdb / neodb / bangumi 四站合一）**：①之后按消费面重查，详情页此前**无任何单测**覆盖 `create-detail-handler.ts`（只有 e2e 覆盖首帧），且四条链共用同一工厂 ⇒ 单点收口即可覆盖四站。实测缺陷：库内记录被外部改（弹窗标记 / 另一 tab / NeoDB 同步）时**没有 host DOM 变化**，站点自身的状态观察器永远不触发，chip 只能等重载。新增 `src/libraries/utils/watch-record.ts`（框架无关的单键记录订阅，带 `deps` 注入缝——`event-bus` 的模块级 `initialized` 使全局 chrome 桩依赖 worker 用例顺序，与 `useRecordCache` 同一理由）；工厂侧把合并逻辑收敛为**单一 `mergeVerdict`**（首帧与刷新必须同源，两份 merge 会漂移成「下一次写入把 chip 翻回旧值」），事件到达 → 重扫页面 + 重读记录 + 重绘，并**返回路由 teardown** 交还 router（`RouteDisposer` 契约，X26-C 已有）：`imdb.ts` 组合状态观察器与记录订阅两个 disposer，`tmdb.ts` 与 router 里 neodb / bangumi / tmdb 三条路由改为 `return await handler(identity)`。证据：新增 `tests/unit/detail-handler-refresh.spec.ts`（**7 例**：首帧 merge 与「读取键 == 订阅键」、外部写入免重载刷新、删除回到 status 0、每次事件只重读一次、下线后不再重绘且**释放的正是那一条订阅**、**刷新在途时下线的晚到答案不重绘**、页面自报已看时评分取页面值 ⇒ 两条路径同源）+ `tests/unit/watch-record.spec.ts`（**7 例**：store/键过滤、两种批量形态、无键订阅、双事件与成对幂等退订、onChange 异常归调用方）+ `imdb-detail-roundtrip.spec.ts` 新增 1 例真实浏览器双向刷新（**RED 先行**：接线前该用例红）。本用例首版走**真实 event-bus**：单跑绿、**合并复跑红**——`event-bus` 的模块级 `initialized` 使一个 worker 内只有第一个装桩的文件能胜出，同一文件的用例被 `fullyParallel` 分到不同 worker 后行为随文件顺序漂移 ⇒ 给工厂补 `config.watchRecord` 注入缝，spec 改走进程内假总线（键/store 过滤另有 `watch-record.spec.ts` 承担）。**这正是「分波自测不算验证」的又一次实锤：绿过的用例在合并复跑里红了。** 反向验证三轮，其中一次抓到**变异自身无效**：首次「摘订阅」写成 `void watchRecord(...)` 仍会订阅 ⇒ 全绿是假绿，改为真正不调用后转红；再摘 `disposed = true` 时原有「下线后不再重绘」测不到（退订已让新回调压根不触发），据此**补了在途竞态用例**才让该守卫有了断言对象。X32 余量随之收缩为 2 处：`ui/video-overlay.ts` 推荐位与 `handlers/javdb.ts`（后者标记来源待确认，非同一读路径）
- **标记对话框的真实交互面收口（X35，由 X27-C 点击覆盖缺口引出）**：detail 页 `UmmInterestBar` 有 13 个点击/键盘挂点，此前 e2e 只走过「已看 → 4 星 → 保存」一条。新增 `tests/e2e/x35-detail-mark-interactions.spec.ts`（**6 例**，真实浏览器 + 后台 IndexedDB 回读，登录态由本地夹具承担）：想看 tab **不提供评分行**且 status=1、评论字数计数随输入变化并落库、标签 Enter 添加进已选列表 + ✕ 移除、保存过的标签重开仍是已选、三条关闭路径（取消 / 遮罩 / Escape）一律不写库且 Escape 后焦点归还标按钮、已看 4 星保存后条上 8/10 且重开回显。**抓到两个真缺陷**：①`handleInterestSave` 成功后只回写 status/rating，**不回写 comment 与 tags** ⇒ 保存后重开评论区是空的（用户读作「我写的评论没了」），现补 `currentComment` / `savedTags` 回写（`src/scenario/douban/shared/detail-ui.ts`）；②第一版把自定义标签断言成 `.umm-tag-chip--active`，实跑失败后核对源码发现已选标签另有 `.umm-tag-selected` + ✕ 呈现层 ⇒ **是断言写错而非产品缺陷**，按真实契约改写而不是放宽断言。反向验证：摘掉两行回写并重建，恰好这 2 例转红（其余 4 例绿），还原后 6 例全绿。顺带更正 e2e 侧一处口径：detail 页此前唯一的点击覆盖只证明「保存路径通」，未证明「不保存路径不写库」
- **相册画廊的真实交互面收口（X36，X27-C 第二波）**：photos 页 `App.vue` 有 13 个点击/键盘挂点，此前只被断言过「渲染出多少张卡」。新增 `tests/e2e/x36-photos-gallery-interactions.spec.ts`（**5 例**，全部真实浏览器 + 夹具宿主核对）：卡片点击打开画廊且图 src 就是那张卡自己的图（不是第 0 张）、**边界导航按钮是条件渲染**（首张 `toHaveCount(0)` 而非「存在但 disabled」——按错 DOM 契约写断言会永远测不到）、✕ 关闭后遮罩层不残留且可重开、卡片下载按钮被 `@click.stop` 挡住不打开画廊、滚轮放大出 `x` 角标并改 `transform` 且双击复位到 `matrix(1, 0, 0, 1, 0, 0)`。共享夹具侧把 4 份重复的 `openFixture` 收敛为 `installDoubanFixtureRoutes` 同模块导出的 `openDoubanFixturePage`（其余 spec 的本地副本待后续波次迁移）。**反向验证**：同时施加两个变异（去掉 `.stop`、`v-if` 改 `v-show`）后重建，恰好且只有这 2 例转红，还原后 5 例全绿——证明断言对这两条契约分别灵敏
- **搜索结果页筛选与分页交互（X38，X27-C 第三波）**：新增 `tests/e2e/x38-search-filter-pagination.spec.ts`（**3 例**）——全部/电影/剧集三个页签的可见集合必须是**划分**（两侧和 == 全部，且 tv 侧只含带 剧集 标记的卡、movie 侧一个都不含，标记数由同一份渲染结果反查而非信任提取器的分类）、下一页 href 必须带宿主分页步长 `start=N` 且导航后 overlay 仍可用、跳转框超界页 clamp 到末页（断言其 `start` 与「末页」链接一致）而空输入完全不导航。共享夹具侧把 `openFixture` 收敛为 `douban-crawl-fixtures.ts` 导出的 `openDoubanFixturePage`（4 份本地副本待迁，见 X37）。**本轮的诚实记录**：第一版把「两侧各至少一张」写成断言，跑出来 `Received: 0` —— 爬取夹具 `search.html` 里 **0 个 剧集 标记**，我此前那次「3 passed」其实是在空子集上自洽（vacuous）。处置分两步：先把局限显式写进用例（而不是放宽断言蒙过），再给夹具通道补一个**由爬取件派生**的变体能力 —— `DoubanFixtureRule.transform`（`douban-crawl-fixtures.ts`）+ `labelFirstSubjectsAsTv(html, n)`，只把内嵌 `__DATA__` 里前 n 个条目的 `"labels": []` 填成 `剧集`，**不新造任何 DOM 结构**（结构仍是被测提取器实际读的那份爬取件），且派生体绕过缓存、缺标记即抛错而不是静默降级。改用该规则后筛选用例的两侧非空断言真实成立（3 passed），变异验证（把 `filteredItems` 改成无视筛选）仍精确转红 1 例
- **确认框陈旧字段泄漏（X24 ②）**：`store/confirm.ts` 的 `show()` 只做 `Object.assign(state, config)`，**先前的对话框若带了 `warning` / `details` / `confirmText`，后续任何一次省略这些字段的确认都会把它们继承过去** ⇒ 用户会在一个根本没要求警告的操作上看到「此操作不可撤销」+ 上一份文件名 + 上一个按钮文案。修法：`show()` 先 `Object.assign(state, defaultState)` 再合并配置，并把 `warning: undefined` / `details: undefined` **显式写进 defaultState**（第一版只加了 reset 那一行，测试仍红——`Object.assign` 不复制源里不存在的键，这条陷阱已在代码注释里点明）。测试：`store-confirm.spec.ts` 里原先那条自陈「leaked by Object.assign merge」的用例翻正为真实契约（`toBeUndefined()` + `confirmText` 回默认），改名 `show() 先重置再合并…`；**先 RED 后 GREEN**（改前实报 `Received: "careful"`），改后 8 passed，文件头契约第 1 条同步改写。①（ToastContainer 动态 role 拆成两个常驻静态区）仍按原裁决保留：需真机读屏验证且涉及视觉栈重排，不在无验证条件下改 a11y 结构
- **legacy 推荐位：全表扫兜底移除 + 外部写入刷新（X40，X32 ③的读路径部分）**：`video-overlay-recommendations.ts`（bilibili / youtube 观看页推荐位共用）此前在两处与 douban 侧同族：①可见卡为空时**退化为 `dbGetAll` 全表扫**，注释写的是"免得徽章静默消失"——但没有卡可装饰时徽章本来就不该出现，那次全表扫是纯浪费，且宿主 feed 观察器会在推荐位水合前反复触发这条路径；现改为空键集合直接返回、零消息流量。②推荐位徽章只由 feed 的 `MutationObserver` 驱动，**外部写库（弹窗/另一 tab/同步）不改宿主 DOM ⇒ 永不重算**；现经 `watchRecord(storeName, undefined, …)` 订阅整库事件，复用已有的 `rec-refresh` trailing settle（300ms 窗口，与 feed 突发共用同一合并槽，所以一次同步风暴只会重读一次）。`createVideoOverlay` 的配置新增可选 `subscribeRecord` 注入缝 —— 理由与 X32 ②相同：`event-bus` 的模块级 `initialized` 按 worker 首个 initEventBus 者定死，走真实总线的单测会在合并复跑里随机红（本轮实测过一次，故先按真实总线写、改成注入）。测试：`x26c2-video-overlay-rec-timers.spec.ts` 由 4 例扩到 **7 例**（空卡集合零读取 / 外部写触发一次定向批量读 / destroy 释放订阅且不再排程），**先 RED**（三例落地前分别报 `DB_GET_ALL` 出现在 sent、handlers.size 0、released 0）后全绿；反向验证同时施加两个变异（恢复 dbGetAll 兜底 + 不arm订阅）恰好这 3 例转红、原 4 例仍绿。默认订阅路径（真实总线）不在单测覆盖，改由 X32 ② 的 IMDb e2e 与 `watch-record.spec.ts` 的过滤语义共同保证
- **影人页状态化交互（X41，X27-C 第四波）**：`tests/e2e/x41-personage-interactions.spec.ts`（**5 例**，真实浏览器）补上 personage / personage-creations 的 16 个挂点里从未被驱动的部分：简介 120 字阈值（未过阈值时按钮必须**不存在**，过了才可来回切换）、获奖收起态固定 5 条 + 展开条数与按钮文案同源（用 X39 的 `transform` 把爬取件补到 6+ 行以真的走一遍跨过阈值的分支，而不是用 if 跳过）、渲染出的每一条都必须来自宿主某一行（防「凭空造条目」）、类型页签保留 `sortby` 且**丢弃 `start` 游标**、后页 URL 的 `start` 必须等于宿主 `a.next` 自带的游标。反向验证：同时把收起条数 5 改成 3、删掉 `searchParams.delete('start')` ⇒ 恰好对应 2 例转红、其余 3 例绿。**顺带记下一条疑似提取层缺陷**（未修，另开任务）：宿主 `ul.awards` 有 3 行，overlay 只出 2 行 —— 缺工作链接（只有一个 `<a>`）的那行被 `personage-data.ts` 静默丢弃，而该奖项本身（人气奖）是合法可显示数据
- **裸 console 归口第二子波：只搬「能安全闭嘴的那一半」（X28 ②）**：`console:check` 基线 **167 → 150**（-17）。改动面：`src/engine/database/migrate.ts` 的 16 条迁移进度 `console.log` → `debugLog`，以及 `pt/dimmer/index.ts` 的私有 `debug()`（曾以 `[PT Dimmer Debug]` 直接打进用户控制台，也会污染测试输出）→ `debugLog`。**刻意没有做完剩下的 150 处**，理由记在这里以免被误读成偷懒：`logger` 的开关是 `enabled = import.meta.env.DEV`，并由设置里的 debug 项经 `configureLogging()` 决定，即**生产安装下 logger 默认全静默**；因此把 `console.warn('[DB] v13 migration partial/failed')`、`console.warn('[PT Dimmer] Process error')` 这类失败信号机械换成 `warnLog`，等于把「用户控制台里唯一的失败痕迹」换成一个需要用户先打开调试开关才看得见的通道 —— 正是 X21/X26-D 定的「失败≠空答案，禁止静默换成 logger.warn 了事」。要收口这 150 处，前置是一个**待裁决的设计决策**：给 `logger` 加一条不受 `enabled` 门控的 error 出口（或让 `level=error` 时无条件输出），否则「清零 console」与「生产可诊断性」只能二选一
- **导航岛与详情页合成跳转（X44，X27-C 第五波）**：`tests/e2e/x44-island-navigation.spec.ts`（**3 例**）覆盖 `UmmDynamicIsland` 的 5 个导航点击位在**两种模式**下的行为：默认 `newTab=true` 必须各开一个 tab 且 URL 精确等于对应频道（影人页上验），搜索页的 `newTab=false` 必须在当前 tab 跳转且**开新 tab 数恒为 0**（这两条是 `open()` 里的两个分支，任一支退化都会静默改变跳转方式）；第三例验详情页合成出来的 `/subject/<id>/celebrities`、`/trailer`、`/all_photos` 三个入口 —— 断言全部落在**本页 subject 作用域 + 纯 douban host + 无重复**（顺带钉住 `safeHref` 的作用）。定位一律走 class/index 而非可见文案，因此不受 content i18n 四种 locale 影响（这条约束是 X28 记录里「先让 e2e 期望值 locale 化，再动 UMM 自造文案」的前置）。**代价如实记录**：这 3 例把 e2e 总时长推高约 4 分钟（单例 1.2–2.7 min），慢在 popup 生命周期而非断言，已并入 #69 的套件时长复核项
- **可见集重读的放大上界（X34，回应 X31-B 自己留下的问题）**：X31-B 给 `useRecordCache` 加了「随可见 id 集合走的重读」，当时的证据只到「内容不变不重读」，**没有**回答「一帧内追加几百张卡会不会变成几百次批量读」——那正是本任务反复被咬的「UI 运算过于集中」类。现按确定性的读取次数上界补测（`record-cache.spec.ts` +3 例）：同一帧内 200 次数组变更 ⇒ **恰好一次**读取且带 201 个 id；分三页追加 ⇒ 恰好两次读取、每次带当页可见全集；20 次「换数组对象但内容相同」⇒ 一次都不读。**反向验证**：把 watcher 改成 `flush: 'sync'`（即每次变更立即同步读）后，恰好第一例转红（其余仍绿），还原后 36 passed —— 证明这条上界真有约束力，而不是依赖 Vue 调度器的顺带效果。同时结案一项旧疑点：先前那次「x27b-douban-book 单例 8.2 min」在随后三次全量复跑（91 例 2.9m / 96 例 2.6m / 99 例 3.1m）中**均未复现**，判定为当时与 build/门禁并行的机器争用，不是产品或测试缺陷
- **测试侧夹具入口收敛（X37）**：`tests/e2e` 里 **4 份**各自复制的 `openFixture`（`x27b-douban-book` / `-movie-game` / `-user` / `x31-rec-badge-live`，合计 38 个调用点）改为复用 `douban-crawl-fixtures.ts` 的 `openDoubanFixturePage`，并顺手把共享实现**加严**：以前只校验第一条规则的 `served()`，现在**每条规则都验**（`match` 打错一个字符就会让某台主机吃到空 catch-all，而测试看起来仍是绿的）；`shell` 等待改为可选参数（保留 book/user 两文件的 document_start `<style>` 前置，不改变时序语义）。各文件保留一行薄别名承载自己的本地默认值，避免 38 处调用点做无意义改名。**证据**：迁移后 4 份 spec 35 例全绿、type-check exit 0；共享守卫的灵敏性用一次真实变异验证（把 x44 的 `match` 改错 ⇒ 立刻报 `fixture "search" never answered the document`），还原后全树 grep 无变异残留
- **孤儿模块棘轮的口径修正（X45）**：`orphan:check` 此前把**纯 re-export 桶文件**（`index.ts` / `models.ts` / `legacy-bridge.ts` 一类只写 `export … from` 的文件）也算进「必须有单测引用」的分母 —— 于是唯一的过关方式是「让某份 spec 去 import 一个没有行为的桶」，那是**指标造假而不是覆盖**。现在按语句切分（`;` 边界，不再按行）识别纯桶并豁免：任何局部声明、箭头函数、`await`、`export default` 定义都会让文件留在计量内；`export { default as X } from` 仍算纯桶（shadcn 式再导出）。实测影响：**scope 264 → 241，uncovered 基线 63 → 45**（豁免 23 个文件，逐个查过确无逻辑：13 个 `libraries/ui/*/index.ts`、3 个 provider 门面、`engine/{cache,database}/index.ts`、`scenario/douban/overlay*`、`sehuatang-cache/models.ts`、`shared/legacy-bridge.ts`）。守卫自带 8 条种子 `--self-test`（正反双向，含「多行 export 列表」「注释不影响」「export const/function/default/箭头 均不豁免」「空文件不豁免」），已接 `npm run orphan:self-test` + CI Static Gates。**双向实测**：新建一个含函数的未覆盖模块 ⇒ 门禁立刻红并指名道姓；删掉 ⇒ PASS。过程中两次由种子揭出自己的错判：先按行判导致多行 `export {` 全被误判为非桶，后 `\bdefault\b` 把 shadcn 的 `default as` 误拒 —— 两个方向都被种子抓住，不是靠肉眼 review
- **Douban 挂载接线守卫（X46 第一子波）**：`main.ts` 的 `PAGE_MOUNTS` 表与 32 个页面目录之间**此前没有任何约束** —— X7-T2 修掉的 book-authors 错映射（键 `'book-authors'` 指向 book-homepage 的 mount）当时靠人眼发现，同类错位再发一次不会有任何东西变红。新增 `tests/unit/douban-page-wiring.spec.ts`（**5 例**）：`MountRegistry` 语义（未知类型必须 `undefined` 而不是静默不挂载；重复注册是替换不是排队）+ 逐目录两侧对齐校验（`'<dir>': mount<Camel>` 的标识符约定 **且** 该标识符的 import 源必须含 `/pages/<dir>/`，再加一条「表里没有目录之外的多余键」与「解析到 >30 条」防空转）。刻意用文本级结构而非 import 32 份 config：后者会把 WXT/Vue 入口机器拖进 node worker 而不增加任何信号。**反向验证**：把 `'book-authors'` 改回指向 `mountBookHomepage`（复现历史缺陷形状），守卫立刻给出两条指名道姓的失败（标识符不符 + 来源路径不符），从备份还原后 5 例复绿 —— 这次回滚改用 `cp` 备份 + 覆盖还原，不再依赖「反向 replace 的锚点还在」（那是本会话刚记进记忆的那类假回滚）
- **页面 config 的结构契约守卫（X46 ②）**：想给 `mount-factory.ts` 补失败路径单测时，实测发现它**在 node 侧根本无法 import**：`mount-factory → css-map`，而 css-map 有 45 条 `?raw` CSS 导入，node 加载器忽略 `?raw` 后缀、把 CSS 当 JS 解析 ⇒ `SyntaxError: tokens.static.css: Unexpected token`（试过的两条出路都不成立：把那条 `@/libraries/...?raw` 改成相对路径只解决别名不解决 `?raw`；给 Playwright 加自定义 loader 属为测试改基础设施）。⇒ **该层的行为只能由真实浏览器覆盖**（99 例 douban e2e 全部经工厂挂载），本轮改为钉住**工厂所依赖的结构契约**：新增 `tests/unit/douban-page-configs.spec.ts`（**5 例**，覆盖 32 个 config）—— cssPreset 必须能在 `PAGE_CSS_PRESETS` 解析（解析不到会被工厂 try/catch 吞掉、报成"组件 import 失败"这种误导性诊断）、且**必须与目录同名**（这条约定让人和门禁都能一眼审计）、`overlayId` 合 `umm-*` 约定（壳是 document_start 按 id 建的，打错就静默无挂载点）、根组件**必须懒加载**（改回静态 import 会把 32 页打进同一个内容脚本，正是 X25/X5 减掉的东西）、每个 config 都经 `definePageMount` 产出。**反向验证**：把 genre 的 preset 改成 `genrr` + 把 albums 改成静态 import ⇒ 恰好两条对应断言指名转红，备份还原后 5 例复绿。清理：过程中建的 `douban-mount-factory.spec.ts`（4 例行为用例因上述不可达原因无法运行）已删除 —— 是我本轮新建、未提交的产物，不属删既有测试
- **页型完备性 + 原生导航隐藏守卫（X47）**：新增 `tests/unit/douban-page-type-coverage.spec.ts`（**8 例**）。补的是两个**静默失败面**：①往 `url-detector.ts` 的 `PageType` 联合里加一个类型、但忘了在 `main.ts` 的 `PAGE_MOUNTS` 加挂载键 ⇒ `detectPageType()` 返回一个没人挂载的页型，页面看起来就是「插件没生效」，不报错也无日志；现在断言「每个 PageType 都有挂载入口」，并把**唯一合法例外**钉成结构而非白名单（`video → trailer` 别名要求源页型确实是 PageType 成员、自身没有挂载键、目标必须存在，且别名集合本身必须等于 `{video}` —— 加新例外必须同时改这条断言，不能靠 default 分支蒙过去）。②`hideNavForPage` 的分支决定藏哪几条原生导航，此前零测试：详情页按媒体类型三分支（电影 global+movie / 音乐 global+music / 图书只 global）、首页与搜索页**一律不藏**（原生条属于页面设计）、图书类藏 global+book、音乐专区类藏 global+music、影人页只藏 global，全部逐分支断言；外加 `hideNativeNav()` 无参不动节点、目标节点缺失时不抛错（宿主改版不能把 overlay 挂载链路带崩）。**反向验证**：往 PageType 联合加一个 `phantom-page` ⇒ 完备性断言指名转红，还原后 8 例复绿
- **选项页同步交互的真实浏览器覆盖（X48）**：`tests/e2e/x48-options-sync-interactions.spec.ts`（**5 例**）此前 SPA 侧只有一条「保存 Token 出 toast」的用例，WebDAV/导入导出的 9 个点击挂点从未被点过。现在钉住五条**守门语义**：①端点配置未保存前，云端覆盖/智能合并等按钮必须保持 disabled，保存后徽标从「未保存」翻成「配置已保存」且解禁；②`测试连接` 的三条前置校验（空 URL、非 https、字段不全）一律落到 `role=alert` 的 assertive 区而不是 polite 区，且**校验失败不得发出任何网络请求**（含「探测由 service worker 发起，页面侧看不到请求」这条反向断言）；③勾选「包含 WebDAV 凭证」后导出**必须先弹确认框**（ADR-016 决定 3：导出文件含明文密码），点取消则**一个下载都不产生**；④不勾选时直接导出会真的产出 `.json` 下载，导入按钮打开的是 `.json` 文件选择器；⑤点「确认」后必须**真的产出文件**，且文件里出现刚保存的那个一次性密码 —— 同时证明 ConfirmDialog 的确认分支不是空操作、开关确实被导出器遵守（读毕立刻删临时文件）。**反向验证**：两次独立变异各自只让对应那一条转红 —— 删掉 `exportData` 的确认门 ⇒ 第③条红（对话框不出现）；把导出器的 `includeWebDAVCredentials` 强制为 false ⇒ 第⑤条红（文件里没有密码）；还原重建后 5 例复绿。**范围如实限定**：`测试连接` 的成功分支**没有**断言 —— WebDAV 探测走 `WEBDAV_TEST` 消息由 SW 发出，Playwright 的页面级 route 拦不到 SW 请求，用假成功冒充只会得到一条假绿用例，故改为覆盖三条可观测的拒绝分支并在注释里写明原因
- **游戏发现页「加载更多」的真实浏览器覆盖（X49）**：`tests/e2e/x49-game-explore-load-more.spec.ts`（**4 例**，`/j/ilmen/game/search` 全程本地 stub，不触网）。这是 douban overlay 里**唯一的增量追加点位**，此前四个挂点（筛选组、评分排序、首发排序、加载更多）只测过前一条链路。钉住的契约：①追加条数与游标语义（`more` 归零后按钮必须换成「已加载全部」标记，而不是留下一个会发空请求的死按钮）；②**重入守卫**（慢响应期间同一任务内连点两次只发一次请求）；③追加进来的新卡片能拿到**已存在的记录徽章且不需要重载** —— 这正是 X31-B 那条「随可见 id 集合增长定向重读」在真实浏览器里的验收；④**一次追加 60 张卡的长任务不超过 200ms 预算**（探针在 addInitScript 之后 reload 才注册，且额外断言探针确实装上了，避免「观察器不存在 → 空列表 → 假通过」）。**反向验证**：把 `if (loading.value || !hasMore.value) return` 的 loading 半边删掉后重建 ⇒ 恰好重入那一例转红（发出 2 次请求），还原重建后 4 例复绿。**过程纠错记录**：重入这一例最初用两次 `.click()` 写，结果「失败」得毫无意义 —— Playwright 会等按钮从 `:disabled` 恢复后再点第二次，测的是 actionability 而不是组件守卫，改为 shadowRoot 内同步双次 `btn.click()` 才真正构成竞态
- **影人作品页筛选面（X50）**：`tests/e2e/x50-personage-creations-filters.spec.ts`（**4 例**）覆盖该页 7 个点击挂点中 X41 未触及的部分：类型页签（3）、排序按钮（3）、角色 chip、以及作品卡**海报与信息区两个入口**。契约是「换任一维度必须保留其它维度并丢弃 `start` 游标」——丢 `start` 是文档化行为，而**静默丢掉 type/sortby/role** 才是危险的那类：用户看到筛选生效了，列表却退回默认视图。作品卡的两个入口还必须打开**宿主为该标题列出的同一条目地址**（按标题-链接配对，唯一性先断言），不是覆盖层自己拼出来的串。**反向验证**：删掉 `url.searchParams.delete('start')` 后重建 ⇒ 三条筛选用例同时转红（各自报游标残留），恢复后复绿。**测到并修掉的一个 flake（本轮自己引入）**：第一版用 `extContext.waitForEvent('page')` 抓弹窗，单跑绿、连跑必红 —— 该 API 拿到的是**第一个** page 事件，可能是上一条用例尚未落地的弹窗；改为「注册监听 + 轮询出现已提交 URL 的新页面 + 断言它不是当前页」后连跑两次各 4 passed（6s）。教训并入 #69 那类「用例互相耦合」问题：**共享 persistent context 的多弹窗用例不能用 waitForEvent 语义**
- **共享分页逻辑的契约与信任边界（X51）**：`src/scenario/douban/shared/composables/use-paginator.ts` 是 doulists / music-collect / book-collect / game-collect / book-authors / user-media / user-celebrities **共用**的分页大脑，此前**零直接测试**，而它里面藏着一个信任边界：`onPageChange` 只在 `isSafeDoubanUrl(link.url)` 通过时才写 `window.location.href` —— 分页链接是**宿主 DOM 里的属性**，等于「页面内容可以决定 overlay 把人导航去哪」。新增 `tests/unit/use-paginator.spec.ts`（**8 例**）：同源校验的接受面（`https://movie.douban.com/…`、裸域 `douban.com/x/`）与拒绝面（外域、`douban.com.evil.test` 后缀伪装、`javascript:`、协议相对 `//douban.com/x`、`data:`）；页码派生的三条回落规则（无链接 → 1/1 因而分页器自动隐藏、当前页取 `current` 标签、非数字标签不产生 NaN 页码）；导航决策四条（命中同源链接才跳、链接被伪造为外域一律不动、无对应链接时回落相邻页 URL 且同样过校验、目标即当前页时不写）。**两处工程事实记录**：① jsdom 的 `window.location` **不可 redefine**，且会静默吞掉跨文档导航（实测 `Not implemented: navigation to another Document`）⇒ 用「合成 window + 可变 location 桩」观测模块选定的目标 URL，而不是假装断言成功；② 变异验证：把 `isSafeDoubanUrl` 放宽成 `/douban\.com/.test(url)` ⇒ 后缀伪装那一例立刻转红，还原后 8 例复绿。孤儿棘轮计数**没有**因它变化（`use-paginator.ts` 本来就经由页面 spec 的 import 图被算作 covered，此前 X46/X47 那两批才让基线 45→43 并把 page-registry / hide-nav 两条陈旧项 prune 掉）—— 这条测试的价值在于给共享逻辑与信任边界加上**直接**断言，而不是刷指标
- **把不可测的挂载编排抽出来，而不是宣布它测不了（X52）**：X51 记录过 `mount-factory.ts` 在 node 侧根本无法 import（`css-map` 的 45 条 `?raw` CSS 会被 node 当 JS 解析），于是**页面挂载的失败编排**（拆壳、重试重建壳、宿主数据净化时机）从来没有断言，只能靠 e2e 的 happy path 顺路经过。本轮按「先抽纯函数再交付」的做法把它救回来：新增 `src/scenario/douban/mount-plan.ts`，导出 `runPageMount(plan, deps)` —— 编排所需的一切都从参数注入（CSS 组合、组件加载、挂载调用、壳的读/建/拆、失败面板、诊断出口），因此可被 node 单测直接驱动；`mount-factory.definePageMount` 退化为 ~25 行的适配壳（把 `cssMap` / `mountUmmOverlay` / `console.warn` 接进去）。新增 `tests/unit/douban-mount-plan.spec.ts`（**7 例**）：成功路径只挂一次且不注册缺席钩子；**beforeMount 产物必须先净化再交给 createApp**（顺序数组断言）；afterMount 收到 app/容器/同一份 data；CSS 组合抛错（预设缺失）与组件 import 失败都走同一条「拆壳 + 重试面板 + 诊断」路径且不挂载；**重试必须先重建壳再重跑**；没有壳记录时不伪造 createShell 但仍尝试重跑。**反向验证**：同时施加两个变异（去掉 createShell、去掉 sanitize）⇒ 恰好对应 2 例转红，还原后 7 例复绿。诊断出口**仍保留裸 `console.warn`**：logger 受 debug 开关门控，把 bootstrap 失败塞进门控就等于抹掉生产环境唯一可见的痕迹（X28 立的规矩）；本次重构没有顺手扩大 console 基线
- **Sehuatang 头部构建器可测化收尾（X53）**：`src/scenario/sehuatang/header.ts`（god-file 拆分出来的 `buildHeader`）此前零测试。新增 `tests/unit/sht-header.spec.ts`（**4 例**）钉两类只有读代码看不出来、出事又静默的契约：①**子节点顺序是挂载契约** —— `app.ts` 用 `header.lastElementChild` 取 actions 簇、居中簇必须先是首页链再是 ☰ 菜单、统计区 `.umm-header-info` + `.umm-sht-stats` 必须在 actions 之前，任何一次"顺手重排"都会让挂载静默拿错节点；②**全部复制磁力的行为契约** —— 无卡片时直接返回（不懒加载、不写剪贴板、不刷统计）、缺磁力链接的卡片并发 `loader.loadNow` 补抓且进度写进按钮文案 `(0/2)`、复制内容按 CRLF 连接、**`.umm-card:not(.umm-viewed)` 过滤必须生效**（已看卡片不得被再次复制）、finally 分支必须刷新本页统计并清 `data-umm-copying`。**两处过程纠错（都记下来以免重犯）**：a) 第一版用 `btn.onclick.call(..., new window.MouseEvent())` 既通不过类型（onclick 参数是 PointerEvent）也不真实 —— 改回 `btn.click()` 真分发；b) 第一版没装 `requestAnimationFrame`，legacy toast 在 `.then` 里抛 `ReferenceError` 被链尾 `.catch` 吞掉，**套件全绿但复制成功反馈其实是坏的** —— 补上 rAF 后本模块自有的反馈（每个磁力点挂上 `.umm-sht-copied` 脉冲）才被真正断言。**第三条教训是合并复跑给的**：我额外断言了「页面出现 `.umm-toast`」，单跑绿、`npm run test:unit` 合并跑**红** —— `FloatingToast` 的容器缓存绑定在「第一个把 `document` 装成全局的 spec」上，跨模块查 DOM 在共享 worker 下不成立 ⇒ 删掉那条越界断言（toast 本身自有 spec 覆盖），只保留本模块拥有的脉冲断言，并在注释里写明为什么不去断言别人的 DOM。修完后合并跑两次各 2574 passed / exit 0。**反向验证**：把 `:not(.umm-viewed)` 删掉 ⇒ 已看排除那一例精确报出 `urn:btih:viewed` 混进复制体；还原后复绿
- **风控页进入按钮的委托契约（X54）**：色花堂风控门（年龄门）的整站重建里有一条不能碎的规则 —— 站点 `mainv2.js` 把 `.enter-btn` 的点击绑成「写 safeid cookie + 重载」，那是唯一过门途径，所以 overlay 重画的按钮**必须把点击交回原按钮**；只有原元素真的不在时才退化到站点声明的兜底 href，且退化路径要过 http(s) 白名单。为把这条契约写成测试，`app-risk.ts` 的 `buildEnterButton` 改为导出（注释写明为何导出）。新增 `tests/unit/sehuatang-risk-gate.spec.ts`（**5 例**）：index 决定主/次类名与站点文案原样透传；**原按钮存在时点击落到同一 index 的原锚点且绝不额外导航**；原按钮缺失才按 `toSafeAbsoluteUrl` 解析成绝对地址跳转；兜底被伪造成 `javascript:` 时不导航；兜底为空串时也不导航。定位沿用 X53 的教训：**只断言被测函数自己的输出与注入的 location 桩**（合成 window + 可变 location），不跨模块查别人的 DOM。合并跑单测 **2579 passed / exit 0**（新增 5 例与其余 2574 例同 worker 无耦合）。**反向验证**：把 `if (target) { target.click(); return; }` 改成永不委托 ⇒ 委托那一例立刻转红，还原后 5 例复绿
- **共享数字分页器的真实浏览器覆盖（X55）**：`UmmPaginator.vue` 被 5 个收集页（music-collect / book-collect / game-collect / book-authors / doulists）共用，它的三个点击位（前页、页码、后页）此前从未在真实浏览器里点过 —— 单测只覆盖了 `usePaginator` 的纯逻辑（X51）。新增 `tests/e2e/x55-collect-paginator.spec.ts`：先断言首屏 `aria-label="Previous page"` 处于 disabled、当前页按钮带 `--active`，再逐个点 `2` / `3` / 后页，**每次都断言落到的 URL 等于宿主分页器自己那条链接的绝对地址**（期望值来自爬取件 `.paginator a` 与 `.next a`，不是覆盖层拼串的镜像断言）。**反向验证**：同时施加两个变异（前页 `:disabled` 永假、`onPageChange` 的 label 匹配差一位）⇒ e2e 与该单测各自转红，还原后逐字核对两处原文已回到位（`:disabled="currentPage <= 1"`、`p.label === String(page)`）且 e2e + 12 例单测复绿。**过程记录**：为免凭猜写断言，先跑了一个临时 probe 用例打印 overlay 里 `.umm-paginator` 的真实 DOM（确认按钮顺序与 aria-label），据实写用例后**已删除该 probe 文件**，不留临时产物
- **相册页分页导航的真实浏览器覆盖（X56）**：photos 页的分页有 **2 个点击位、却渲染两份**（顶部 `.umm-photos-nav` + 底部 `.umm-photo-footer`），此前一处都没点过。新增 `tests/e2e/x56-photos-nav.spec.ts`（**2 例**）：①页码文案 `第 N / M 页` 必须两份同时等于宿主 `.thispage` + `data-total-page` 推出的值（把「两份必须一致」写成断言而不是巧合），点底部下一页/上一页必须落在宿主 pager 自己的 `span.next a` / `span.prev a` 绝对地址上；②用 X39 的 `transform` 造出「宿主没有 prev/next」的首尾页形态，断言 **4 个按钮全部进入 `--disabled`** 且点击后 URL 不变（`goToPage('')` 的 no-op 语义）。**过程记录**：第一版按「只有一份导航」写 locator，被 strict-mode 直接打回（`.umm-nav-btn` 命中 2 个）—— 那不是断言写错了，而是**我少看了一个真实结构**，于是改成把两份都纳入断言（count=4、两处文案数组相等），而不是用 `.first()` 把差异掩盖掉。**反向验证**：两个变异（底部容器改名、顶部某一侧丢掉 disabled 绑定）⇒ 两例各自转红；还原后逐字核对容器名与绑定已回到原样，重建后 2 例复绿
- **游戏发现页筛选与排序（X57）**：`tests/e2e/x57-game-explore-filters.spec.ts`（**4 例**）补掉该页剩余 3 个挂点（筛选片、两个排序按钮）。**证据口径先说清**：`game-explore-dom` 夹具自己开头就写着 *Synthetic … All data fabricated* —— 它不是真实保存页，所以本用例**不声称**「与豆瓣真实行为一致」，只钉组件自身的不变量：一次点击只动一个 facet、只加一个值，其它参数（`q`/`sort`）原样保留；再点同一片是撤销而非追加；「全部×」在同组内是互斥项（有值时不亮、清空后才亮）；排序按钮切换 `sort` 且保留已选 facet，active 恰好一个并跟随 URL。**两条自我纠错记录**：①第一版三例全用「整体 active 计数」，被真实行为打回（另一个 facet 的「全部」本来就亮）⇒ 改成**按组内**计数，而不是 `.first()` 掩盖；②第一轮变异验证**两个变异只有一个被抓到** —— 把 `isUnique` 短路后 URL 表现与正常分支**恰好相同**（空值被 `filter(Boolean)` 吃掉），说明我的断言并没有真正钉住互斥分支 ⇒ 补一条**可判别**用例（点「全部」必须把该 facet 清成空串而不是留下 `1,`），重跑两个变异后转红数从 1 变 2，还原后 4 例复绿。**另一条流程教训**：中途在链跑起来后新建 spec 会污染那一次运行（chain 里出现 `e2e=1`，红的正是我当时写了一半的 x57）⇒ 之后必须「文件定稿再开链」。
- **回访再计量拆穿一处旧「已完成」，并收口同族漏项（X58）**：对本会话/早前波次的完成声明做再计量时，`grep -rn "dbGetAll("` 实测出 **X31-B 的「空/缺省 ids 全表扫已收口（7 处 config）」是过度声明** —— 仍有 `handlers/bangumi-list.ts` 与 `handlers/tmdb.ts` 两处保留「键集合为空 ⇒ 全表扫」。逐处判性质后**只修该修的**：
  - `bangumi-list.ts`：前缀不认识时 keys 直接为 `[]`，而有 `li` 却解析不出 `item_数字` id 时同样为空；两种情形下**标记循环都取不到 providerId**，全表扫点不亮任何一行，却会随 DOM 变动批次反复发生 ⇒ 改成空集不读库（与 X31-B/X40 已收口的三处同族）。
  - `tmdb.ts`：**不动**。它只在首页第一次空扫描时被调用，结果会并入跨批次存活的 `recordMap`（是被消费的预热，不是丢弃），删掉反而会把「后续首批卡片要各读一遍」变复杂。把这段理由写进函数注释并附**失效条件**（一旦调用方改成每张卡调用一次，它就退化成同一缺陷），免得后来者当成漏改或盲目照抄。
  - 新增 `tests/unit/bangumi-list-scoping.spec.ts`（**3 例**）：无 id 列表项不读库、不认识的路径类型不读库、有 id 时仍是定向 `DB_GET_BULK` 且键为 `tv::<subjectId>`。**反向验证**：把全表扫兜底原样放回 ⇒ 前两例转红并点名 `DB_GET_ALL`，还原后 3 例复绿。**同时记一条工具性教训**：第一次变异脚本的锚点里带着旧缩进（`    keys.length…`），`includes` 直接失配、脚本抛错，而我的命令行把「3 passed」显示成了一次**假的成功验证** —— 变异脚本必须自己回读「改了几处」并打印（这次就加了 `occurrences now: 1/0` 自证），否则「红/绿」都可能被"其实什么都没改"骗过去
- **一处「测试不稳定」原来是真 i18n 缺陷（X59 + X60）**：`npx playwright test tests/unit` 合并跑约 **1/4 概率**红一条，红的是文案断言，看起来像 worker 顺序问题。逐层查下来是三个叠在一起的真问题，全部按证据处理：
  1. **产品侧硬编码中文**：`components/umm-rating.ts` 直接把 `.umm-rating-na` 写成 `'暂无评分'`，而 `common.rating_unknown` 在四份 locale 字典里**早就存在却没人用**（en-US: N/A、zh-TW/HK: 暫無評分）⇒ 英文/繁体用户的「暂无评分」永远是简体，且组件渲染文本与 `t()` 结果不一致，测试怎么改都会一半概率红。改为 `t('common.rating_unknown')`。
  2. **产品侧语言相关的去重判据**：`utils/dom.ts` 的 `createStatusChip` 用 `!label.includes('(本地)')` 判断「本地缓存提示是否重复」——只对 zh-CN 成立，en/zh-TW/zh-HK 下同一条提示会显示两遍（`📦 Watched (local)` + `From local cache`）。改成按「选了哪个文案键」判定（`doneWithLocalMarker`），与文案无关，并留注释说明旧写法为何错。
  3. **测试侧把文案钉死成中文**：4 个 spec（sehuatang-empty-state / sehuatang-render / umm-media-card / umm-rec-section）+ imdb-dynamic + douban-mark-dialog-a11y 共 10 余处断言直接写字面中文，而 content-i18n 的 `currentLocale` 是**模块级跨文件共享态**（第一个 `initI18n()` 的桩决定全 worker）⇒ 改为与产品同源 `t(key)` 断言。
  - 用字典值集合反查定位「哪些字面量真是 i18n 文案」：从 `zh-CN.ts` 抽出全部中文值，与 `tests/unit` 里的 `toBe|toContain|toEqual('…')` 字面量做交集（14 处命中），再区分「字典文案」与「宿主派生文案」（后者如 extract 类 spec 断言的中文是页面内容，**不该**改）。
  - **验证**：合并复跑连测 4 次全绿（此前 4 次里必红 1 次）；四条链式门禁 + 全量 e2e 见本波收尾复跑。X28 那条「硬编码中文」债务因此有了精确口径：**只改字典里已有的值，宿主内容保持原样**。
- **UMM 自造文案接入 content i18n（X62，#59 的 i18n 部分落地）**：先做**前置改造**（否则 e2e 会因 locale 变化假红）：x41 的 `(展开)/(收起)/(查看全部 N 项)` 与 x50 的 `按时间排序` 断言，改为**状态迁移 + 条目计数 + 类名/索引**断言（折叠标签必须含总数、展开后标签必须变、再点回来标签复原；active 类落在哪个索引）—— 语义强度不降，且不再依赖具体字面。然后给四份 content locale（zh-CN/zh-TW/zh-HK/en-US）各加 8 个键（`Custom Tag Placeholder`、`Write Comment Placeholder`、`Expand`、`Collapse`、`View All Awards`（带 `{{count}}`）、`Sort By Time/Collection/Rating`），并把 8 处硬编码接上 `t()`：`umm-interest-bar.ts` 两个 placeholder、`personage` 展开/收起/查看全部、`personage-creations` 三个排序标签、`game-explore` 的排序按钮。`i18n:check:strict` 保持 100% 齐平。**两处自己踩回来的坑**：①第一轮把 x41/x50 的断言直接换成「从字典取期望值」是错的方向 —— 改为断言迁移本身，避免测试与文案互锁；②X60 那次「字面中文 → t(key)」批量替换里，有 2 处**越界**：`buildEmptyState(doc, {title:'没有搜索结果'})` 的文案是**调用方传入的实参**，不是字典值，用 `t(key)` 当期望反而把"原样透传"这条契约绑到了 worker locale 上（en 下必红）—— 已改回断言实参本身，并在注释里写明判据：**字典值用 t()，入参用字面**。合并单测连跑两次 2582 passed / exit 0，受影响 e2e（x35/x41/x50）全绿
- **空转 i18n 键清理（X63）**：删掉 11 个**没有任何引用**的内容脚本 locale 键（四份 locale 各 11 行，共 44 行）：`neodb.pushing / neodb.sync_success / neodb.no_response / neodb.context_invalid / neodb.cross_link_saved` 与 `sync.douban_auto_music / sync.status_updated_music / sync.failed / sync.to_platform / sync.platform_status / sync.platform_link_updated` —— 逐条核过它们是早期改名留下的旧键（现行代码用的是 `neodb.push_success / neodb.sync_failed / neodb.comm_failed / neodb.saved_state` 等），不是"以后会用到"。删前脚本先**重算引用**（任一 key 在 locale 目录之外仍被引用就整体中止不写盘）。结果：无字面引用的键 **26 → 15，且剩余 15 个全部是 `status.*` —— 由 `statusLabelKey(type, suffix, base)` 动态拼接**，也就是说**真空转键现已归零**；`i18n:check:strict` 仍 100%，type-check 与合并单测（2582）全绿。**顺带排掉一个假阳性**：另一份统计口径「zh-TW/zh-HK 与 zh-CN 取值相同的键 = 17/18，判定为未转繁」经逐条核对是**错的** —— 这些值（✅ 已看 / ⭐ 想看 / ▶️ 在看 / ⏳ 未玩 / 豆瓣 / 配置缺失 / (收起) / 已完成 {{n}} / 全部 {{m}} 等）在简繁中**本来就同形**，所以"相同"不等于"漏翻"；把它写在这里是为了阻止下一次有人拿这个数去"修"。
- **「本地模拟」从假设变成守卫，并因此查出一个"失败当成功"的缺陷（X64）**：给 e2e 加了一条不变量 —— harness 在建 context 时**最先**注册一条 `**/*` 兜底路由（Playwright 对重叠路由是 LIFO，故各 spec 自己装的更具体路由照常生效），凡有 http(s) 请求落到兜底就记录并 abort，context 结束时**报错点名**这些 URL，测试不再可能悄悄依赖真实互联网。
  - **守卫自证**：第一次跑就咬到一条真实逃逸（`https://webdav.e2e.test/dav/`），来自我自己那条 X48 用例 —— 也就是说守卫确实会红，不是摆设。
  - **顺带纠正我此前写进注释的错误结论**：我曾判定"SW 发出的请求 page/context 路由拦不到，所以 WebDAV 探测的成功分支不可测"。逃逸记录证明**context 级路由看得见 service worker 的请求**（看不见的只是 `page.route`）⇒ 成功分支重新可测，改回断言 `207 → role=status`、`401 → role=alert`，两条反馈通道第一次都被真正覆盖。
  - **由此暴露的产品缺陷**：`WEBDAV_TEST` 后台返回 `{ success: true, ...result }` —— `success` 只表示"后台答复了"，探测结论在 `ok` 里；而 `WebDAVTab.testConnection` 只看 `result.success` ⇒ **认证失败（401/403）弹的是绿色成功提示，服务端的 message 被丢弃**。已改为 `success && ok` 才算成功，失败分支带上 `message`（正是本仓库反复强调的"失败不得伪装成成功"）。
  - 过程记录：把两个状态塞进同一条用例靠重复注册同 pattern 切换桩不可靠（第二个 handler 实测收不到请求），拆成两条各自用一次性桩；toast 断言改为看 live region 的**子节点**（空容器永远 invisible，会给出误导性的"hidden"）。
  - 验证：x48 6 例全绿（含成功/失败两条 toast 通道 + SW 探测确实命中桩的 `PROPFIND` 证据），type-check 0，build 0。
- **详情页剩余两个链接面（X65）**：`tests/e2e/x65-detail-links.spec.ts`（**2 例**）覆盖此前从未点过的海报与影人卡片 —— 断言方式是**与夹具 DOM 配对**而不是复读覆盖层自己的数据：海报点击必须落在宿主 `#mainpic a` 自己那条 href 上；影人卡片必须打开宿主为该姓名列出的 celebrity 链接集合之一。**一处我自己的前置条件写错**：最初要求「一个姓名只能有一条宿主链接」，实测同一个人在宿主页里出现 3 次（导演/编剧/… 各一处），于是判据改成「**href 去重集合**非空 + 打开结果属于该集合」—— 这不是产品歧义，是我的唯一性假设错了。**反向验证**：两个变异（海报改指 `?mut=1`、影人改指 `celebrity/99999999`）⇒ 两例各自转红；脚本自证「残留 0/0」，还原重建后 2 例复绿。**范围说明**：`detail-movie` 夹具本身是 Douban-shaped 合成页（其文件头自述），所以这两例钉的是「配对与点击接线」，不是站点真相；photos 侧栏 3 个挂点因夹具里没有对应宿主结构而**暂未覆盖** —— 给合成夹具补一段宿主形状只会变成自证，不当成进度。
- **JavDB 淡化改单向为双向（X67，收口 #67 最后一条功能余量）**：回访 #67 的「javdb 标记来源待确认」时定性清楚了一件事 —— 它不读 `douban_records`（走 `AdultAvStore.batchCheckExists`，日/美欧两张 avId 表，键 `source::avid`），所以"没有 DB 读点"是真的；**但** `run()` 只往元素上加 `.umm-viewed`、从不减，且整个 enhancer 没有任何记录事件订阅 ⇒ 在别的 tab / 选项页 / 批量导入里新增或删除记录后，这一页的淡化会一直停在旧状态直到重载。这与 X18/X32 收口掉的是同一类单向缺口，故按缺陷处理：
  - `syncViewedMarks()` 对所有已扫描（`data-umm-avid`）的元素**重算并 toggle**；**读失败不是答案** —— `batchCheckExists` 返回 `ok:false`（success 但没有可用数组）时一律不清除，避免"后台没答 ⇒ 全部变未看"这种反向假象（X21 立的规矩在这里落地）。
  - 同时订阅 `JAV_IDS_STORE_NAME` 与 `USAV_IDS_STORE_NAME`（一条 avid 落哪张表由 `classifyAvId` 决定，页面无法预判，只订一张就会漏）；两路共用同一个 250ms 节流窗口，事件风暴只重算一次；teardown 一并释放两条订阅 + observer（顺带把被误删的 X26-C 清理契约补回）。
  - 订阅走 `options.subscribeRecord` 注入缝：真实 event-bus 是 **worker 级共享态**，spec 直接骑它会随文件分派顺序时红时绿（记忆 5b 的同一族）。
  - 新增 `tests/unit/javdb-live-sync.spec.ts`（**4 例**）：首扫标记 + 记下 avid、外部删除后事件撤淡化（不必重载）、坏答案不清除、teardown 释放两条订阅。**变异逐个验证**：去掉 `ok` 守卫 ⇒ 只有"坏答案"例红；改回"只加不减" ⇒ 只有"外部删除撤淡化"例红；脚本自证还原（`markers now = 0`）后 4 passed。
  - **一次自我破坏与恢复（记下来防止重犯）**：为隔离变异我曾对**未提交**工作树执行 `git checkout <file>`，把该文件退回 HEAD，连带抹掉了本轮的 live-sync 与本会话早前未提交的 teardown 契约（128 行 vs 136 行）。已重新落地（重测 **185 行**——原记 188 行是 D8 全仓 Oxfmt 前的口径、type-check 0、合并单测 2586 passed、全量复跑见本波链），并确立纪律：**未提交树里绝不用 `git checkout/restore/clean` 做"撤销"**，撤销一律用 `cp` 备份或带自证输出的反向脚本。
- **JavDB 双向淡化拿到真实浏览器证据（X68）**：X67 的 4 例是 jsdom + 注入缝，**它证明不了事件真的能穿过 MV3 消息边界**。新增 `tests/e2e/x68-javdb-live-dim.spec.ts`（**1 例**，本地伺服 JavDB 列表页、`javdb.com` 零外网请求，X64 的 escape 守卫会兜住任何漏出）把整条链跑通：选项页 `sendMessage` → service worker 写 `jav_ids` → `broadcast` 逐 tab 下发 → 内容脚本 `syncViewedMarks` 重算 ⇒ 免重载先**出现**淡化、外部删除后**撤除**淡化，且邻居卡片全程不被牵连。两处按实测写：①`SSIS-001` 经 `classifyAvId` 归日系 ⇒ 写表与删除键（`javdb::SSIS-001`）由同一分类器决定，spec 不猜；②开页前先 `waitForBackgroundReady` —— 每条用例新建 profile，冷 SW 的 IDB open 会和首个内容脚本读点抢 8s 预算（host-mocks 既有注释）。**测试诚实性**：两张卡都先断言已记账 `data-umm-avid`，否则"未淡化"可能来自"根本没处理过这个元素"而不是"重算读回空集合"。**双向变异验证**：把 `syncViewedMarks` 改回"只加不减"⇒ 恰好「撤淡化」那条断言转红；把两张表的订阅摘掉 ⇒ 转红在「外部写入必须淡化」；两次还原均 `diff` 自证与备份**逐字节一致**、重建复跑 1 passed（e2e 现 33 spec / 123 用例）。
- **JavDB 写趟：把「要不要分片」变成测量问题（X69）**：DOM 写入审计把 `handlers/javdb.ts` 列为「未分片的一次性宿主写入」风险第一位。裁决前先测：新增 `tests/e2e/x69-javdb-write-budget.spec.ts`（**1 例**，本地伺服 **300 卡**列表页、预置 150 条已看 ⇒ 扫描写与淡化写两条腿都真的跑），用 `document_start` 装的 **rAF 帧间隙记录器** 量主线程被占住的时长 ⇒ **实测最大间隙 33 ms**（预算 150 ms；本波三次运行 33–46 ms，最新一次随 X70 代码复跑仍 33 ms）。该趟本身是增量的（`data-umm-processed` 让后续 observer 只碰新卡），**为一个 33 ms 的写趟引入分片只会多加一条帧调度依赖、换不到可测的收益 ⇒ 本波判定不分片**，改为把这个数字钉成永久守卫（未来的逐卡 await、O(N²) 重扫、读写交错触发强制布局都会被抓住）。测量值每次运行都由 spec 自己打印，注释里的数字不许冒充现状
- **查出一类静默失效的守卫：`longtask` 断言可以永远绿（X69 的夹具修复）**：既有 3 份 e2e（`bilibili-homepage-chunked` / `pt-dimmer-live-refresh` / `x49-game-explore-load-more`）用 `PerformanceObserver(longtask)` 做预算断言。本波拿它做对照实验：**故意阻塞主线程 220 ms**，第一次读到的条目数是 **0**，稍后再读只得到一个 **55 ms** 的条目 ⇒ 两重缺陷同时成立：①条目是任务后异步回调投递的，读得太早就什么都没有（断言在空数组上平凡通过）；②`longtask` 的 `duration` 不是阻塞时长（会被截断）。修复分三层：`readLongTasks` 先等 60 ms 冲回调、夹具头写清「只能当『有事发生』用，不能当量化预算」、并新增 `RAF_GAP_INIT_SCRIPT` / `readRafGaps` / `blockMainThread` 三件套（rAF 间隙正常采样 17 ms，能如实报出 33 ms 的写趟与 225–234 ms 的 300 ms 控制块）。X69 因此是**自证式**的：同一次运行里必须看见 300 ms的人为阻塞（下限 200 ms），否则报「探针失明」而不是「性能达标」
- **读失败不再是永久沉默：JavDB 有界重读（X70）**：X69 首跑偶发一条红 —— 300 卡扫描完了却 150 条淡化数不到。定性不是 flaky 而是产品缺口：`run()` 只看 `watched.has()`，**完全忽略 `watched.ok`**；初次 `batchCheckExists` 走 8 s 消息预算 + 重试，冷 SW / 机器争用下整批失败时按 X21 规则「读失败不是答案」不清标记 —— 而静态列表页后续既没有 DOM 变更也没有记录事件，于是这一页**永远不淡化**。修复在 `handlers/javdb.ts`：失败时改为**有界重读**（递增退避三段，拿到一次真实答案即预算归零，连续失败到上界后放弃、不追着后台打），重试定时器由 teardown 拥有并清除（页面注销后零读取）。`tests/unit/javdb-live-sync.spec.ts` 加 **4 例**（补上淡化 / 上界恰为三次且严格递增 / teardown 丢待决 / 成功后预算归零），假时钟按「最早待决定时器」触发 ⇒ 钉的是契约不是毫秒。**四向变异各自可感**：摘掉 `run()` 的重读 ⇒ 3 例红；退避改环形复用（无上界）⇒ 只「上界」红；teardown 不清定时器 ⇒ 只「teardown」红；成功不归零 ⇒ 只「预算归零」红；四次还原均 `diff` 自证逐字节一致。合并单测 **2590 passed**（基线 2586 + 4），九门禁 + format + build 全 rc=0，X68/X69 e2e 随新代码复跑 2 passed
- **把"分片在跑"从断言变成测量：写入批次探针与三条形状守卫（X71）**：`tests/e2e/fixtures/overlay-probe.ts` 新增 `WRITE_BATCH_INIT_SCRIPT` / `armWriteBatchProbe` / `readWriteBatches`（按 **MutationObserver 投递批次** 归桶：一次投递＝一个任务写的全部记录，支持 class 增、attribute 增、attribute 删三种口径），并接入三份既有 e2e：`pt-dimmer-live-refresh`（初次淡化写趟 + 批量清除写趟）、`bilibili-homepage-chunked`（1000 卡标记写趟）。实测：**分片构建 100 个投递批次×10 条（正好等于 `LISTING_CHUNK_SIZE`）／初次淡化 20+10 两批／清除 10 批×20**；把分片大小调成一趟写完语料后，三处各自变成 **1 批全量**。**三个变异逐个可感**（每个只红它该红的那条断言，还原后 `diff` 自证逐字节一致）：`NEXUSPHP_CHUNK_SIZE`→1000 ⇒ 只红「全部淡化落在同一个任务批次（30）」；`CLEAR_CHUNK_SIZE`→200 ⇒ 只红「只有 1 个清除批次（逐批 200）」且另一条用例仍绿；`LISTING_CHUNK_SIZE`→1000 ⇒ 只红 bilibili 的批次形状。预算全部由本轮实测反推，注释里写明推导（分片大小的 2× 加合帧余量、上限取语料一半），不留"抄来的数字"。
- **两次证伪：毫秒预算与 5ms 采样器都抓不到"分片被关掉"（X71，负结果记录）**：①**毫秒侧**：把 bilibili 的 chunkSize 调成一趟写完 1000 卡，最大帧间隙 64–68 ms，而分片构建是 51–87 ms —— 两套构建落在同一条噪声带里，预算只能兜"卡死级"阻塞，管不了分片与否，故 (g) 段与形状段**分工**（一个管阻塞上界、一个管写入摊开），并在 spec 头写清谁不承担什么。②**采样侧**：原先的"5ms 档位采样器"在本波同一份**未改代码**上红了 3 次（`waitForFunction` 60s 超时）—— 一次 200 卡的写趟实测只花 ~27 ms，5 ms tick 全程只有 4 个采样点，"看见中间档位"本来是运气。于是删掉两处采样器判据（bilibili (f)、PT 批量清除），换成上面不依赖时钟的批次判据；同时先试过"按 rAF 帧归桶"，也被实测否掉（后台/合帧页面会把 20 个 chunk 塞进同一帧 ⇒ 正确代码读成"一帧写完全部"），最终形态是**投递批次**而非帧序号。③**新前提**：`requireVisiblePage()` 把所有计时/形状类 e2e 的宿主页拉到前台并要求 `visibilityState === 'visible'`，否则直接抛错 —— 被降频的标签页会让形状判据静默失真（同一份分片代码：前台 100×10、后台 5×200），"看不见"必须报错而不是读绿。
- **X71 收尾测量（同一轮内复测，不继承上轮数字）**：bilibili 语料 200→**1000 卡**（形状判据需要"合帧平台期 ≪ 语料"才有牙），1000 卡标记写趟最大帧间隙 48–57 ms、PT 200 行 33–52 ms、x69 300 卡 34–45 ms、x49 追加 60 条 74–81 ms（预算 150 ms，各 spec 每次运行自行打印）；`longtask` 在 X71 复跑中仍报 0 条而写趟确实发生 ⇒ 该信号在预算断言里彻底退役（PT 保留为诊断行）。三处 e2e 的 rAF 间隙 + 正对照（同次运行必须看见 300 ms 人为阻塞，下限 200 ms）已全部就位。**认证**：14 项静态门禁 rc=0、合并全量单测 **2590 passed**、全量 e2e **124 passed / rc=0**，且三条形状判据在合并跑里各自复现 100×10、20/10、10×20 的批次形状（与单跑一致 ⇒ 判据不依赖分片调度顺序或机器档位）。
- **第十轮回访 + 页型 e2e 覆盖首次可复现计量（2026-09-29）**：本轮以磁盘为唯一权威重跑 **17 步合并复跑**（type-check / 13 道静态门禁 / build / unit / e2e）逐步 `exit=0`：**unit 2590 passed（56.1s）/ e2e 125 passed（3.2m）**，产物 mtime `09-29T13:41`、`douban-main.js` 877,476 B（日志与逐步 exit 存 `.um.agents/tmp/sweep-0929/`）。详见 `docs/audit/umpp-revisit-audit-2026-09-26.md` §16（含两条新复核规则 27–28：**「已完成」主张先过磁盘清单再过叙述**、**进入文档的每个数字必须能被当场复跑**）
- **页型 e2e 覆盖棘轮门禁化（X79）**：需求 8「真实浏览器全面交互」此前只有会话里的一个数，没有任何常驻守卫，退化只会静默发生。新增 `tests/unit/douban-e2e-page-coverage.spec.ts`（**5 例**）：分母 = `detectPageType` 的 PageType 全集（**33** = 32 个页目录 + 无目录的 `video` 别名），分子**不是手写清单**而是「把各 e2e spec 里出现的 URL（含 `${HOST}` 模板字面量按 spec 自身 `const` 代入）交给生产分类器解析出的页型集合」，因此跟踪的是真实导航而非注释。内置三条防空转种子（spec 数 ≥35 / URL 数 >50 / 6 个已知覆盖页型必须在集合内 + 幻影页型必不在），未覆盖集按**只可缩小**的棘轮钉为 `['book-profile', 'video']`。**实测 31/33**，并区分两类缺口：`book-profile` **有夹具**（缺口是测试）、`video` **无自有夹具**（缺口是夹具，`missingFixture` 断言等于 `['video']`）。**首版探针自曝一处假阴性**：模板字面量 URL 被当噪声丢弃 ⇒ 曾误报 `albums`/`artists-overview`/`genre`/`music-profile` 四点未覆盖，补 `const` 代入 + 自检种子后才得到 31/33——再次印证「形态守卫坏掉时是静默 PASS」
- **book-profile 提取层首份单测（X73）**：`src/scenario/douban/pages/book-profile/data.ts`（267 行 DOM 解析）此前**零测试引用**，是 `orphan-tests-baseline` 里唯一带真实解析逻辑的 src 缺口。新增 `tests/fixtures/douban/book-profile.html`（301 行，选择器逐条对齐 `data.ts` 的 DOM 契约）+ `tests/unit/book-profile-data.spec.ts`（**23 例**，`initFileSandbox()` 置于模块顶层）：uid 解析与查询参数截断、无 `/people/<uid>` 整页 `null`（挂载守卫）、侧栏各回退分支、豆列 `.rec` 计数、最近阅读日期跨条目继承与异形行跳过、书评 `allstar45`→4.5 半分。**12 处变异逐个反向验证**（标题优先级、`readTotal` 取值、网格选择器全局化、评分归零、文案键、导航类名、`a:not(.cover)`、subject 正则误收 `/doulist/` 等），每次 `cp` 备份 → 变异 → 复跑 → `cp` 还原 → `diff` 逐字节确认。**`orphan:check` 基线 41 → 39**（`--baseline` 已锁，只可缩小）
- **列表键含可变记录态 ⇒ 每次活写拆树重挂（X80，4 处复现并修）**：`grep ':key='` × `status|rating|record` 复现 `pages/book-homepage/App.vue:107`、`pages/homepage/App.vue:91`、`pages/homepage/components/UmmMediaRow.vue:46`、`pages/music-homepage/App.vue:106` 全是 `` `${subjectId}-${status}-${rating}` ``——每次 `record:updated` 都使该行**重建子树**（含 `loading="lazy"` 封面重新解码、焦点丢失、单帧成本集中），而这正是 X30/X31 自己判定为「用重挂假装刷新」的形态；规则此前只写在 `components/umm-rec-section.ts:66-68` 的实现注释里，**SFC 侧无任何机制覆盖**。修法与该既有正确实现同源：键取 `subjectId`（缺失回退 `href`）。守卫 `tests/unit/stable-list-keys.spec.ts`（3 例）扫 SFC 模板与 Vapor 渲染函数两种形态，**负种子含「注释里谈到该规则」一条**（朴素匹配会被 `umm-rec-section.ts` 的说明文字击中——首版即如此，被自己的种子抓到）。反向验证：把 `music-homepage` 换回改前内容 ⇒ 守卫精确点名该文件 `exit=1`，`cp` 还原后 `diff` 一致。配套 e2e：`tests/e2e/book-home-live-refresh.spec.ts` 新增**节点同一性**判据（写库前给行打 `data-umm-identity`，事件后断言该属性仍在且徽章已翻 ⇒ 打的是「原地 patch」而非「重挂」）；同处把 `toHaveText('想读')` 字面量 pin 改为**状态类 + 非空文案**（记为断言范围变更：i18n 接线修好后该文案随用户语言变化，字面量 pin 会随环境红——规则 19 的同一形态）
- **发现一处 Critical：Douban 覆盖层从不初始化语言**：`src/entrypoints/content/i18n/index.ts:13` 的 `currentLocale` 默认 `'zh-CN'`，只有 `initI18n()`（`:41`）会改为 `detectLocale()` 的结果，而 `grep -rn "initI18n" src/scenario/douban src/entrypoints/douban-*.content` **零命中**——但 `shared/legacy-bridge.ts:23` 正把同一个 `t` 供整个 Douban 覆盖层使用。后果：**英文/繁体用户在豆瓣页看到的是简体中文覆盖层**，且在选项页切换语言不会传播到已打开的豆瓣 tab（`startLocaleSync` 同样无人调用）。`i18n:check:strict` 看不见它，因为缺的是**调用**不是**键**。同期发现 `scenario/douban/early.ts` 的 `SUBTITLE` 表 31 条首帧加载文案全是硬编码简体（X60/X62 那两波只做了覆盖层正文）。修复与「入口路径必须初始化其所消费的单例态」的回归守卫同波推进



- **TMDB 列表：无界选择器 + 逐卡读写交错 + 无重入闸（X87 修复）**：`handlers/tmdb.ts` 的卡片选择器原为 `div.relative`（在 TMDB SPA 上匹配几乎所有 Tailwind 容器），每轮 `document.querySelectorAll` 后**在逐卡循环内**先 `getComputedStyle(posterLink)`（读，强制布局）再写 `style.position` 与 `appendChild`，且 throttle 的异步体**无重入闸**，同时受 body 级 MutationObserver 与常驻 2 s 轮询驱动。**修法**（`:32/:76-88`）改为枚举 `TMDB_POSTER_LINK_SELECTOR` 并以 `closest('div.relative')` 归组——键契约（`data-media-type` + 数字 `/movie|tv/<id>` href）本就全在海报链上，`div.relative` 只是「某祖先」，因此**不造类名、不用 `:has()`**；`:147` 读相（仅取 computed position）整批先于 `:156` 写相（缓存判定结果）；`:175-208` 单一 `activeBadgeRun` + `runChunked`（10 组/帧），`:249-253` teardown 置 `stopped` 并 cancel。**RED 先行**：`tests/unit/tmdb-listing-perf.spec.ts` 落地时对现网代码 **5 failed / 1 passed**（交错时间线 `r0:c1 s0:c1 i0:c1…`、单趟写完 24 卡、两批同时在途、文档级无界查询）。**四处变异逐个可感**（还原后 md5 一致、`diff` 干净）：读相挪回写环 ⇒ 交错例红；chunk=1000 ⇒ 形状例红；`runBadgePass` 不 cancel ⇒ 「两批同时在途 = 2」红；teardown 不 cancel ⇒ `x26c` 释放例红（`10 → 60`）
- **Mukaku 整文档清除改分片（X87 修复）**：`handlers/mukaku/refresh.ts:42-44` 此前每条记录事件同步 `querySelectorAll().forEach` 清除已处理标记，未分片也未过去抖（与 PT 那趟已分片的清除同形）。现走 `runChunked`，证据 `tests/unit/mukaku-chunked-clear.spec.ts`。至此 `grep -rl runChunked src/` 由 **7 → 9** 个消费文件（新增 `handlers/tmdb.ts`、`handlers/mukaku/refresh.ts`）
- **PT 淡化事件风暴：并发分片链闭口（X87 修复）**：`pt/dimmer/index.ts` 的 `clearResolvedMarkers()` 原先直接覆写 `this.pendingClear` **不 cancel 上一趟**，而 `:271-276` 每条 `record:updated` 先做一次同步整文档查询、再进 300 ms 去抖 ⇒ N 条事件 = N 条并发帧分片链，**分片在最需要它的批量写时刻失效**。现按 `mteam.ts:217` / `doulist-dialog.ts:391` 的既有惯例 cancel-before-reassign，并保持 `runActiveProcess` 的 await 语义（cancel 后仍 settle，不留悬挂 promise——X21 修过的正是这类悬挂）。证据 `tests/unit/pt-dimmer-event-storm.spec.ts`
- **广播的 tab 选取按可注入主机过滤（X84，需求 13 性能面）**：`libraries/utils/event-bus.ts` 的逐标签腿此前用 `tabs.query({})` **不过滤**，而每次写库都广播一条事件 ⇒ 批量导入 M 条 = M × (1 + 全部开着的 tab) 条 `sendMessage`，其中大量 tab 根本没有内容脚本可接收。现改为 `tabs.query({ url: <manifest host_permissions>, discarded: false })`，主机清单**不设第二份副本**而是运行时读 `chrome.runtime.getManifest()`（避免清单与代码漂移）；`getManifest` 不提供主机表、或 url 过滤查询抛错（例如主机权限被撤销）时**回退无过滤查询而非早退**——宁可多发几条，不可静默丢掉 ADR-015 的实时刷新腿。新增 `tests/unit/event-bus-tab-scope.spec.ts`（**6 例**：过滤参数形状 / 仅发给返回的 tab / 无主机表时回退 / 过滤抛错时两步查询且投递不丢 / 零 tab 零发送 / 无 id tab 跳过），含一条「探针自身必须能失败」的自检种子。**反向验证**：把过滤摘回 `query({})` ⇒ 恰好 2 例转红，`cp` 还原后 `diff` 逐字节一致，与既有 `event-bus.spec.ts` 合并复跑 **21 passed**
- **计时 e2e 的可见性前提改到测量时刻（X85）**：四份计时/形状 e2e 原先只在 `page.goto` **之前**调 `requireVisiblePage()`，等于用「页面还不存在时的可见性」为「页面存在时的计时」担保；而 `overlay-probe.ts` 自己就记录了后台页会把 ~100 个投递批次塌成 5 个。现由 `readRafGaps` / `readWriteBatches` 在**读取的那一刻**检查 `document.visibilityState`，非 visible 直接抛错点名「探针失明」，不再让形状判据在降频页面上给出假绿
- **book-profile 的记录面从零补齐（X86，需求 5/ADR-015）**：e2e 首跑把一个**整页级的功能缺失**钉成了红灯——`pages/book-profile/config.ts` 的 `beforeMount` 从不调用 `loadRecordMap*`，`App.vue` 既不渲染 `.umm-status--*` 徽章也不订阅任何事件（实测 `grep -c "record" config.ts` = 0、`grep -c "umm-status|records|useRecordCache" App.vue` = 0）。后果：用户在 `book.douban.com/people/<uid>/` 的「读过/想读」书架上**完全看不到自己的藏书状态**，外部 `DB_PUT book::<id>` 成功并广播，但覆盖层零反应。这类缺陷此前逃过的原因：ADR-015 §7 收口的是 7 个**列表页**、§7.1 收口的是 detail/game 的**推荐位**，`*-profile` 书架网格从未进入那次枚举——再次印证「『全量』类断言必须重新枚举消费面」。修法沿用既有形态：config 用 `loadRecordMapForIds('book', ids)` 有界批量读作 seed，`App.vue` 经 `useRecordCache('book', visibleSubjectIds, recordMap)` 活读并**派生**徽章（不写回提取对象、不把状态放进 `:key`）。e2e 由「断言徽章不存在」改写为**严格更强**的「每行都有徽章且无一行是已看 ⇒ 外部写后该行成为已看且 `page.url()` 不变」（断言范围变更，非放宽）。**验证**：`x78-book-profile-overlay.spec.ts` + `x78-video-trailer-alias.spec.ts` 合并跑 **9 passed**
- **`/video/` → trailer 别名取得真实浏览器证据（X86）**：`video` 是无目录的 PageType，靠 `main.ts:131-132` 与 `early.ts` 的 trailer 型集合两处重定向。新增 `tests/e2e/x78-video-trailer-alias.spec.ts`（4 例）钉住：同一份字节在 `/video/` 标为「视频评论」而在 `/trailer/` 标为「预告片」（证明标签来自 URL 而非夹具镜像）、播放列表卡片与宿主 `#video-list` 逐对配对、播放列表清空时提取器抛错走失败面板（只有 trailer 提取器**真的在 `/video/` 上跑过**才可达）
- **页型 e2e 覆盖棘轮清零 ⇒ 33/33**：`tests/unit/douban-e2e-page-coverage.spec.ts` 的基线由 `['book-profile','video']` 收缩为 `[]`。收缩过程由棘轮自己驱动——改代码后它先报「baseline is larger than reality — delete these entries: book-profile, video」，删除后 5 例复绿。自此**任何页型失去真实浏览器覆盖都会红 CI**
- **覆盖层卡片的 props 快照 ⇒ 「键里放状态」曾是徽章唯一的更新手段（X88，本波因果反转）**：把 4 处 `:key` 改成稳定身份键后，`x27a-douban-homepage` 与 `book-home-live-refresh` 立刻变红——外部写库后徽章不再出现。**用改前备份逐文件 bisect + 重建复跑**证明问题不在键，而在 `pages/homepage/components/UmmMediaCard.vue:20`：它把 props 一次性拷进普通对象 `cardProps`，`v-bind="cardProps"` 因此永远看到首帧快照。也就是这些行的徽章之所以会更新，**全靠状态进键造成的重挂**——X30/X31 判定的「用重挂假装刷新」在这里不只是浪费，它是**唯一**的刷新机制，直接删键就会删出真缺陷。修法：`cardProps` 改 `computed(() => ({…}))`。**四向验证**：①旧复合键 + 快照卡 ⇒ 绿（旧行为）；②稳定键 + 快照卡 ⇒ 红（`Received: 0`，缺陷现形）；③稳定键 + computed ⇒ 绿；④只把 `badgeStatus` 退回快照 ⇒ 恰好该例红，`cp` 还原后 `diff` 逐字节一致。受影响面合并复跑 **24 例全绿**（douban 首页 / 搜索 / 书乐页 e2e）。**同类待查（只登记不宣称）**：`components/UmmDynamicIsland.vue`、`pages/detail/App.vue`、`pages/game-detail/App.vue` 命中「对象字面量捕 props」的形状，尚未逐个判定是否同为快照
- **释放必须撤销待决的节流尾调用（X89）**：`libraries/utils/index.ts` 的 `throttle` 把尾调用定时器锁在闭包里，**外部无从撤销**，任何带 teardown 契约的链路都可能「页面已释放仍落笔」。现返回 `Cancellable<T>`（可调用 + `cancel()`，对既有调用方向后兼容）。实测缺陷（`scenario/sehuatang/app.ts`）：`releasePageResources()` 只断观察器/加载器/订阅，释放前 250 ms 内追加的行、释放前 300 ms 内的事件仍会在释放之后各发一次已看读取并把卡写进已摘除的网格（探针：读 2→3、卡 3→4）。新增 `app-trailing-writers.ts`（per-run 登记 / 模块级常驻 / 释放时逐个 cancel 后重置）与 `app-notify.ts`（「后台不可达」每页一次闸门 + 测试注入缝，先例 `__bindRecordEventSinkForTests`）；`sehuatang-app-orchestration.spec.ts` 补一条「释放前排的队不得在释放后读取/写卡」。**反向验证**：摘掉 `releaseTrailingWriters()` ⇒ 恰该例红（`释放后不得再有已看读取`），`cp` 还原后 `diff` 干净
- **广播的 tab 过滤不能改走 `tabs.query({url})`（X84 回退，测量结论）**：该形状在真实扩展里**返回空列表**——清单只有 `activeTab` 而无 `tabs` 权限时 Chrome 不允许按 url 匹配，于是逐标签腿静默为空；合并复跑一次抓到 **5 条 e2e 红**（豆瓣两页徽章不翻、PT 淡化不更新 ×2、`/video/` 反向、书首页身份探针）。现回到 `query({})`，**仅**在 JS 侧跳过「确知无关」的 tab（主机不在注入表 / `discarded`），**读不到 url 的一律投递**；`event-bus-tab-scope.spec.ts` 把「绝不能用 url 过滤」写成断言并配有牙的自检种子。真要 Chrome 侧过滤需给清单加 `tabs` 权限——**权限面变更，留待人工裁决**
- **e2e 里把缺陷态当前提的控制组（X89 附带自纠）**：`x82-overlay-failure-panel` 三条「控制组：墙仍在」断言把缺陷写成了前提，跨 bundle 拆墙修好后必然红。处置不是放宽：控制组换成**历史证据**（`shellStates()` 必须出现过 `wall`，证明确实建过墙），结果断言改为「墙与 `body{overflow:hidden}` 均已消失」，并补 `#content` 与视口相交的**几何**判据（原按单点 `elementFromPoint` 断言宿主可达，会因失败卡片正当占据该点而假失败）
- **仓库级合并复跑（第四次全绿基线，CI 同构）**：18 步一次性合并复跑逐步 `exit=0`——`type-check` / arch / ds / scope / naming / size / doc / orphan / any / isolation / console / i18n:strict / lint / format / build + **unit 2733 passed**（默认并行 58s 与 `--workers=1 --retries=0` 串行 2.4m **两 lane 皆绿**）+ **e2e 143 passed**（`--workers=1 --retries=0`，4.0m）。产物 mtime `09-29T17:58`：`background.js` 81,462 B、`content-scripts/douban-main.js` **885,626 B**、`dist/chrome-mv3` 全量 2,220,138 B。两条棘轮当场缩小并锁定：`orphan:check` **39 → 37** 未覆盖（209 covered / 246 in scope）、`console:check` **150 → 149**（64 文件）。串行 lane 是本轮新加的判据：`retries=0` 下复现才算可重复（CI 配 `retries:2` 会用全新 worker 掩盖顺序依赖，本轮正是它在上一版跑出「5 条 e2e 红」而并行 lane 全绿）
- 本波新增 4 条守卫的可证伪性均实测：`stable-list-keys`（还原改前文件 ⇒ 指名转红）、`douban-e2e-page-coverage`（缩基线前报「stale ⇒ delete these entries」）、`event-bus-tab-scope`（改回 url 过滤 / 撤主机表 ⇒ 对应例红）、`options-query-feedback` 的 Sehuatang 结构守卫（把 stats 告警改掉 ⇒ 恰 1 例红，5 绿）；最后一条同时被**修好口径**：它原先只读 `app.ts`，一次纯粹的 god-file 拆分就会把它误判成「保证被删」，现按目录枚举 `app.ts + app-*.ts` 作为入口模块集合读取（拆分不再能解除断言）
- **主线自纠两处文档破坏（如实入档）**：①本文件首次插入时误把 `## [5.17.2] - 2026-09-25` 版号标题一起替换掉，使 5.17.2 的「新增功能 / 修复与优化」两节悬空挂在 `[Unreleased]` 下——已复原；②`ADR-026` 状态表插入新行时误删表头与 D1 行的行首单元格（`| 决策 | 状态 | 证据 |` + `| D1 分层重写 |`），已按原文重建并逐行核验（表行 63 条、表头与 D1 行均在）。两条同属一类教训：**用「替换锚点尾部若干行」的方式插入内容会吃掉锚点本身**，插入类编辑必须回读被替换区间并断言其仍在（本轮之后改为「锚点 = 完整唯一行，替换为该行 + 新行」）

- **`video` 页型交互零覆盖结案，顺带查出一个空白封面缺陷（X90）**：交互矩阵探针重测显示 `pages/trailer/App.vue` 的 **3 个 `@click` + 1 个 `@error`** 挂点在 `video` 页型上被驱动 **0 次**（此前所有 e2e 只证明 overlay 渲染了，没证明按钮会做事）。新增 `tests/e2e/x90-trailer-interactions.spec.ts` 5 例：卡片点击开**宿主为该行列出的**链接（夹具刻意保留一条相对 href 与一条绝对 href，否则提取器的补前缀分支根本不被测）、详情两按钮跳注入的 `.aside .links a` 且文案取宿主链接文字（并验证 `^> ` 只剥一次），配 **REVERSE 例**：宿主没有 `.aside .links` 时两按钮**必须不跳转** ⇒ 目标是「读来的」而非硬编码。**测试先写、当场见红**：`.umm-trailer-cover-fallback` 计数 `Expected: 2 / Received: 0`——占位图标写成了 `v-else`，于是「缩略图 URL 存在但加载失败」时它压根不在 DOM 里，`@error` 处理器把图片 `display:none` 后去点亮 `nextElementSibling`，而那是**时长角标**；结果正是占位图标唯一要治的场景失效（CDN 404 ⇒ 空白封面）。修法：占位图标常驻 + `.umm-trailer-img` 改 `position:absolute; inset:0` 盖其上。**两半各自变异取证**：还原 `v-else` ⇒ 失败例与成功例同时红；仅删 CSS 两行 ⇒ 只有成功例红且诊断文案直指 `position:absolute`，失败例保持绿 ⇒ 两条断言分别钉死两处改动，无冗余覆盖。**harness 事实（本波踩过）**：夹具安装器注册的 `*://*.doubanio.com/**` 兜底桩在**后**，按 Playwright 路由 LIFO 会赢过先注册的自定义路由；要替一张图返回真实 PNG，必须在 `installDoubanFixtureRoutes` 之后、`goto` 之前挂（`open()` 为此加 `beforeNavigate` 缝）。**口径披露**：本探针分母 68（只数 `pages/<type>/**` 内挂点），X83 的 96 另含 `components/` 共享组件挂点，二者不可混用，X83 行的 52/96 不被本行取代；X83 其余缺口（`UmmStatBar`、`UmmPaginator` 消费页、legacy handler 真点击等）仍在途。同期纠正 `x82-overlay-failure-panel` 一条**标题与断言相反**的文档腐化（标题仍称「回滚没发生、墙与滚动锁留存」，而该例自 X83 波起断言的已是两者均解除）。**合并复跑（18 步，CI 同构）**：13 项静态门禁 + build + **unit 2733 passed**（并行 1.0m 与 `--workers=1 --retries=0` 串行 2.3m 两 lane 皆绿）+ **e2e 串行 148 passed**（4.6m；143 → 148 恰为本波 5 例）。**首轮复跑并非全绿，且红在门禁之外**：`typecheck exit=2`，根因是新加的 `beforeNavigate` 缝把返回类型写成 `Promise<void>`，而 `browserContext.route()` 实际返回 `Promise<Disposable>`；当时其余 17 步全绿（`build` 与两条测试 lane 都不做类型检查），所以这一红**只有仓库级合并复跑抓得到**——同时第二次实证「后台任务退出码会吞掉真实结论」：包装脚本最后一条 `cat` 的 exit 0 一度冒充整轮成功，真结论只在逐步记录 `exit=` 的 summary 里

- **导航岛搜索侧补测，两条「绿但无牙」的断言当场被自己的变异证伪（X91）**：`components/UmmDynamicIsland.vue` 的 `@submit` / `@input` / `@compositionstart` / `@compositionend` 四处挂点此前 **0 驱动**（X44 只驱动了 5 个导航 `@click`），且**只能在真实浏览器里测**——`tests/unit/umm-page-layout.spec.ts` 自己把岛换成 props 桩并在头注里声明「NOT the island's own rendering … the vapor-mode island needs the production pipeline to hydrate」，而 `search-normalizer.spec.ts` 只测纯函数，中间那段接线无人认领。新增 `tests/e2e/x91-island-search.spec.ts` 9 例：两条归一路径按**时序**分开钉（空格折叠即时、完整归一 ~400ms 防抖 ⇒「t<200ms 已折叠但点号仍在」+「随后点号消失」）、IME 组合期挂起归一且结束后补做（同一输入两种时序）、`newTab` 两分支（频道页开新标签 / 游戏页同标签跳转并保留原 `location.search`）、`catMap.game='3114'` 因提前 return **不可达**（断言 URL 永不为 `search.douban.com/…/subject_search`）、三个频道号按豆瓣站点真值硬编码进测试（改表即红）。**四轮变异里两次证伪自己**：①「归一后光标在末尾」在删掉 `restoreCursor()` 后仍绿——程序化赋值 `input.value` 本来就把光标留在末尾，属**平台默认行为冒充产品代码**；重做为「归一缩短光标之前的文本」（在光标前插点号）后，删 `restoreCursor()` ⇒ 红 `Expected: 5 / Received: 12`，还原 ⇒ 绿。②「搜索中二次回车不开第二标签」在删掉 `doSearch` 的 `if (isSearching.value) return` 后仍绿——真正拦住提交的是 `:disabled="isSearching"`（HTML 隐式表单提交要求默认按钮**可用**）；处置是**改口径而非放宽**：断言改名并写明它不覆盖那行守卫。另修一处同源弱点：统计新标签时过滤 `about:blank` 会漏掉「`window.open` 已调用但导航未提交」，零断言改为按全部新增 page 计数。四轮变异（composing 挂起 / restoreCursor / 防抖延时 / catMap 表）各自只让受影响用例变红。**新增复核规则 36–38**（平台默认假绿、零断言不得过滤未完成态、首轮红可能落在所有门禁之外）

- **独立评审回打上一波，又抓出两条无牙断言、一条死断言、一个零覆盖分支和一个真实视觉缺陷（X92）**：X90/X91 落盘时作者已自做 6 处变异并宣称「每条断言都有牙」；派**只读评审**复审同一批测试文件后再抓出五件——①x91 空查询例的 `toHaveValue('')` 与 `toBeEnabled()` 必绿（1.5s popup 预算已吃光 400ms 防抖与 800ms loading 窗口，读的是「什么都没发生之后」的状态）；②x91 游戏例的 `not.toContain('search.douban.com')` 永不成立（前两行已把 hostname 与 pathname 钉死）；③x90 时长角标 `toBeVisible()` 看不见缺陷（绝对定位的角标被写成 `display:flex` 前后都可见）；④**所有用例都从 detail 分支进入**，而 `position:absolute` 同样作用于列表分支 `.umm-trailer-grid`，该分支零覆盖；⑤占位图标常驻后**会被带 alpha 的缩略图透出**，而成功例用的恰是不透明 1×1 PNG，结构上不可能发现。处置：①改为回车后立刻读禁用态，值断言重述为归一器自身契约并注释明写它不证明提交守卫；②删死断言，注释说明主张由哪两行承载；③角标改断「不得带内联 style」（直指处理器写下的那一行），并标注它是诊断性判据、检测性判据仍是占位图标可见性；④新增列表分支例（含「detail 根不得存在」反向钉）；⑤产品侧补 `@load` 退场占位图标（`loading="lazy"` 保证监听器先于 load 挂上，无 detached-img 竞态），测试侧换成**全透明** 1×1 PNG（按 PNG 规范自行生成 + 解码回验 filter 0 与 RGBA(0,0,0,0)），并用**延迟 2.5s 应答的路由**造出真实加载窗口，窗口内钉「两元素同框铺满 + 中心命中测试落在 img」、完成后钉「占位图标退场」，窗口本身配 `naturalWidth === 0` 前提断言（没造出来先红前提，不假绿）。**变异复验 4 轮单点归因**：还原 `v-else` ⇒ 失败例与列表例同时红；只删 CSS ⇒ 成功例在加载窗口那步红（`图片 未铺满封面`）；只删 `@load` ⇒ 同一例在加载完成后那步红；删 `if (!normalized) return` ⇒ 空查询例红 `Expected: 0 / Received: 2`。全部还原后 x90 6 例 + x91 9 例 + 相邻两份 spec **32 例全绿**，三份源文件与变异前备份 `diff` 逐字节一致，`grep -rn MUTATION src/` 零命中。**新增复核规则 39**：复审的输入必须是「断言 ↔ 它声称覆盖的那一行」配对清单，不是变更摘要——摘要只会把复审者引到作者已经想到的地方

- **共享分页器 7 个消费页全部走通，站外导航门首次被喂毒（X93）**：`usePaginator` + `UmmPaginator` 服务 7 个 Douban 页面，此前只有 music-collect 被点过一次，而且那次只断言过 `prev` **禁用**——真正往回跳的分支和 `totalPages > 7` 的省略号窗口从未在任何浏览器里执行。新增 `tests/e2e/x93-paginator-consumers.spec.ts` 10 例：5 个消费页按宿主自己的 `.paginator` 校验激活页码/两侧边界/数字跳转目标；book-collect 逐个页码各跳各的 URL；**改写夹具造「第 2/3 页」**以驱动 prev 与 next 两条相邻分支（真实 crawl 全在第 1 页，这两条天然测不到）；**改写造 9 页窗口**驱动省略号并断言窗口比锚点数窄；**把一条分页链接换成站外地址**喂 `isSafeDoubanUrl`——站外那条必须不跳、站内那条必须仍跳（双向都有牙：门放宽则前者红，门过紧则后者红）。game-collect 按事实断言「窗口只有一页 ⇒ 分页器整体不渲染」并钉住宿主那条自相矛盾的 next 锚点（夹具噪声，非产品缺陷）；`doulists-movie` 夹具头注自陈 "No .paginator" ⇒ 记为**不可驱动**，不伪造分页器凑数。**首轮三条前提红，修的是 oracle 不是阈值**：我按「数字锚点」计数，而生产解析器把 `.thispage` 也计入 `pageLinks` ⇒ 把 oracle 与解析器对齐（span 计入 labels、锚点单列），三条前提随即成立；若当时下调阈值，这页就白测了。另在头注钉住一处口径分歧：`totalPages` 取**窗口最后一个标签**而非 `data-total-page`（user-media 窗口末 3 vs 属性 101），断言一律按窗口推导，免得后人拿属性值当"预期"来改测试。四轮变异逐轮归因：门恒真 ⇒ 只有喂毒例红（harness 逃逸检测另独立报了 `https://evil.example/?start=25`）；省略号阈值 7→20 ⇒ 只有省略号例红；`prev` 恒可用 ⇒ 恰好 5 个消费页例红其余 5 绿；页码查表改取 current ⇒ 6 红 4 绿，其中两页保持绿属**真实不可分辨**（其窗口最后一页恰为相邻下一页，两条路径同 URL），信号由多锚点页承载。还原后 X93 10 例 + X55 1 例全绿，两份变异源文件与备份 `diff` 逐字节一致

- **统计条四个 profile 页补测，逼出「合成 URL 类断言必须查单射性」这条判据（X94）**：`UmmStatBar` 在 X83 记为 **0/2**——四个消费页从未点过任何统计项。新增 `tests/e2e/x94-statbar-interactions.spec.ts` 5 例，按 URL 来源分档给判据而非套同一个 oracle：movie-profile 的项 URL 直接读自宿主 `#db-movie-mine h2 .pl a` ⇒ 逐条比对宿主绝对 href 与计数；book/user-profile 的 URL 由代码合成（userId 模板 / 字面量）、宿主无可比锚点 ⇒ 钉「恰好一个标签 + 仍在豆瓣域 + `/people/` 段等于宿主作者 + **各项目标互不相同**」；music-profile 提取器对每项写 `url: ''` 且夹具 `.number-item` 确实不含锚点 ⇒ 正确行为是**不激活**（断言 `--clickable` 缺席、`tabindex="-1"`、点击不开标签），并先钉「宿主 number-item 链接数 = 0」作前提，未来 crawl 一旦带上链接本例即红，不会继续放过一条"看着可点其实死掉"的条。**牙是变异逼出来的**：把 `openExternalUrl(item.url)` 钉成常数 `https://movie.douban.com/` 后，「豆瓣域 + userId 归属」两档判据**全绿**（常数既在域内又不含 `/people/`），补上单射性断言才把 book/user 两例拉红。另两处如实交代：`handleClick` 的 `if (item.url)` 守卫在 music 例上**不可观测**（`openExternalUrl('')` 本就静默返回），该例的牙在 tabindex/class；`hostUserId` 首轮把回退值传成裸 userId 段而提取按 `/people/<id>` 匹配 ⇒ 恒空串，user-profile 以「宿主 profile 没报出 userId」红，改传完整 URL 并注释说明原因。**三轮变异逐轮归因**：删 `@keydown.enter` ⇒ 恰好 Enter 例红其余 4 绿；钉常数 ⇒ 前 4 例红、music 绿；`tabindex` 恒 0 ⇒ 恰好 music 例红。还原后 X94 + user/book profile 共 **25 例全绿**，`UmmStatBar.vue` 与备份 `diff` 逐字节一致

- **options SPA 页签改为真点击，并修掉一个「只有图标、没有可访问名」的按钮（X95）**：X83 记「options 多为 `page.evaluate` 注入而非真点击」，唯一点击密集的 X48 只覆盖 sync。新增 `tests/e2e/x95-options-tabs-interactions.spec.ts` 8 例：主题三态各自既改 `documentElement` 的 `.dark/.light` 又落 `chrome.storage`，`Auto` 用 `emulateMedia` 双向验跟随系统；语言切换以主题卡片标题为锚点，断言跨语系文案真的重渲染（zh↔en 词典零共享串，"没重渲染"无处可藏）且 `language` 键落盘；评分表单三道守卫（空输入 / 未选星 / 无法解析）各自只出对应 toast 且不写库，成功路径**换一条路径读回**（保存 → 表单清空 → 同一 URL 再查询 → 库里回 `8/10`），所以「toast 说保存了」不作为证据。产品侧修复：概览页刷新按钮此前**只有图标无 `aria-label`**（对读屏不可见，也无法按 role/name 定位——修复前这个定位器根本写不出来），补 `aria-label` 与 `common.refresh` 键（en/zh-CN/zh-TW 三份同步，`i18n:check` 通过）。三条实测教训：①主题 store 默认值即 `'auto'`，不先离开该状态就断言「Auto 已落盘」会冤枉正确代码（首轮真红），改成先切 Light 再切 Auto；②本地空库上加载禁用窗口只有毫秒级，点击后轮询从未抓到（首轮真红），改成点击前在同一 evaluate 内挂 `MutationObserver` 观察 `disabled` 属性，既确定可测又被变异证明有牙；③`setLocale` 里 `locale.value = value` 不被单独钉住——删掉它界面仍重渲染，因为 `persistLocale` 写存储后由语言同步 watcher 兜住（X82 接的线），故本例钉的是用户可见契约。**四轮变异逐轮归因**：写库键加后缀 ⇒ 恰好读回例红（证明 toast 与真实落库可分离）；删 `:disabled` ⇒ 恰好概览例红；删主题落盘行 ⇒ 恰好两个主题例红；删 `!parsed.valid` ⇒ 恰好守卫三例红。**自纠一处取证缺陷**：round-3 的 AppearanceTab 备份是在 round-2 变异之后才 `cp`，"还原"等于把变异恢复回去——靠 grep「那一行是否还在」发现，改用 Edit 补回并与 `git diff` 对账（新增规则 40：变异备份必须在改动前取，还原后按行核验，不能只 diff 备份）

- **personage 的 7 个次级链接全部补测，每条链接用「自身 href + 宿主确实有这条 URL」双重判据（X96）**：X41 只驱动了该页两个 expand 键，`pages/personage/App.vue` 其余 **7 个 `openUrl(...)` 绑定**（图片缩略图、奖项名、奖项作品、未上映作品、合作人物、两个「更多影视作品」按钮）从未被点过。新增 `tests/e2e/x96-personage-links.spec.ts` 5 例，每条链接同时钉两件事：①弹窗目标 === 元素自己的 `href`（处理器与渲染出的链接不得漂移）；②该 `href` 必须落在**宿主页面真实存在的 URL 集合**里（overlay 不得凭空造地址）。另加一条只有真浏览器能证的页面级契约：这些元素是 `<a href>` + `@click.prevent`，点击**不得**把 overlay 自己导航走。oracle 修正一处：宿主图片条的目标不在 `href`/`src`，而在 `li.picture` 的**内联 `background-image`**（提取器正是从那里读），首轮因此红一例——补采 `[style]` 内的 `url(...)` 使 oracle 与提取器口径一致，改的是 oracle 而非断言强度。**三轮变异逐轮归因**：`openUrl` 恒跳常数 ⇒ 前 4 例红、反向例绿；只去掉奖项名的 `.prevent` ⇒ 恰好该例红且诊断直指「把本页导航走了」；合作人物 `:href` 换成宿主没有的地址 ⇒ 恰好"不得凭空造目标"那条红。反向例的 transform 自带落盘自检（未命中即 throw），杜绝"改了个不存在的字符串"式假绿。还原后 X96 5 例 + x41 5 例 + x30 3 例 **13 例全绿**，`App.vue` 与变异前备份一致、变异串 grep 零命中

- **独立复核回打 X93–X96，查出两个真实产品缺陷并纠正一条被钉死的错误契约（X97）**：派只读复审核对「断言 ↔ 它声称覆盖的那一行」配对，五件待办里两件是产品问题。①**personage 两个「更多影视作品」按钮共用一条链接**：提取器只从 `#work-collections-sortby-time` 取 `moreWorksUrl`，`App.vue` 却把它同时绑到热门作品区与未上映区，而夹具明确有两条不同的 `creations?sortby=` 锚点 ⇒ 点热门区的"更多"会把用户送到按时间排序的列表；更糟的是 X96 断言了"两按钮跳同一地址"，**把缺陷钉成了契约**。修复为按区段各取一条（新增 `morePopularUrl/Count`），测试改为「各跳所属区段自己的链接」，并先断言宿主确有两条不同链接作前提。②**movie-profile 凭空长出可点的 "二刷 0" pill**：`h2` 没有 `.pl a` 时 `linkHref=''`，`fullUrl` 退化成裸站点根 `https://movie.douban.com` 仍被 push ⇒ 一个计数 0 的 pill 点了跳豆瓣首页；修复为仅在有计数链接时产出统计项。③**纠正自己写过的口径**：X93 头注称钉住了「`totalPages` 取窗口末标签而非 `data-total-page`」，实测改读属性后 X93 全绿（自然夹具都在第 1 页，两来源不改变 next 可用性）——补一个真正可分辨的用例（第 3 页 / 窗口末 3 / 属性 101 ⇒ 后页必须禁用），并把 game-collect 那条注释降级为"本例不分辨两来源"。④**X94 的"每个统计项"是假全称**：`if (!entry) continue` + `matched > 0` 恰好让缺陷②穿缝而过，改为未匹配即红。⑤**X93 喂毒例的负控不可靠**：`evil.example` 不在夹具路由域名内，"没跳成"可能只是 DNS 没回来，改为给该域打桩（跟进必即时提交）+ `expect.poll` 观察三秒。**三处变异同时做、逐例归因**：还原①⇒ 恰好按钮例红；还原②⇒ 恰好 movie-profile 例红（`统计项 "二刷" 在宿主没有对应的计数行`）；`totalPages` 改读属性 ⇒ 分辨例红且 user-celebrities 连带红（属性=1 会让分页器整体消失，是正确推论），其余 17 例绿。**新增规则 41–42**（配对循环不得跳过未命中项、"多入口同目标"须先证来源可不同；构建失败时测试结果一律作废——本轮 perl 变异把 `@click` 当变量插值吃掉导致 `dist/` 被清空、21 例全红的原因全是「找不到扩展」）。还原后 X93 11 + X94 5 + X96 5 共 **21 例全绿**，三份被改源文件与修复态备份 `diff` 一致
- **色花堂两个面板首次被真实点击，查出「查询按钮点不动」与「菜单偷焦点」两处缺陷（X98）**：`content/ui/manual-add-panel.ts` 与 `check-viewed-panel.ts` 此前只有纯函数层（`adult-av-models` 的规范化）有人，真实浏览器里一次都没点过。新增 `tests/e2e/x98-sehuatang-panels.spec.ts`（**5 例**）：三条关闭路径各自真的移除面板、打开即聚焦输入框（Enter 快捷的前提）、写库**按规范化后的键读回**（期望键现场由 `manual::` + `normalizeAvId` 推导，不是抄常量）、空输入静默无操作、非法 JSON 只弹提示且保留输入、查询面板「入库三行含 `8 / 10` / 未入库仅一行状态」。**缺陷①**查询面板内联 `z-index:100` 而色花堂 overlay 壳是 `2147483000` ⇒ 面板整个压在壳下，`#umm-cv-check` 被 `#umm-sht-overlay` 指针拦截——**查询按钮在色花堂页面就是点不动**，改为 `2147483001` 与 `.umm-overlay` 弹层同档；**缺陷②**菜单 `cleanup()` 无条件把焦点交回 ☰ 触发器，而菜单项动作刚把焦点交给面板输入框 ⇒ 键盘用户被扔出自己刚打开的东西，改为仅在焦点无处可去（`null`/`body`/触发器自身）时回交。**一条断言被自己的变异证伪并改口径**：原写「重复打开不得叠层」，实测面板是铺满视口的模态遮罩、第二次真实点击够不到触发器（Playwright 直接报 `intercepts pointer events`），故该守卫只有程序化调用能进（下沉到 X99），e2e 改钉**模态性本身**（用穿透 shadow 取到的触发器矩形在 light DOM 做 `elementFromPoint`，必须命中本面板）。四处变异逐轮单点归因：还原①⇒ 恰好查询例红；还原②⇒ 恰好关闭路径例红（`面板打开后输入框未获得焦点`）；删 `overlay.onclick` ⇒ 恰好遮罩那步红（`Expected: 0 / Received: 1`）；`.umm-overlay` 降到 `z-index:100` ⇒ **5 例全红**（面板按钮全部点不动）。另修一处**自测竞态**：查询是 `async doCheck`（先 `getAll` 再渲染），点击后立刻数行数会把上一次的三行当结论，改 `expect.poll` 观察到稳态而非加 sleep。同期收尾上一波遗留：`x27b-douban-music` 的联结键空串竞态（补显式等待 + 非空前提）、把 `liveRecordRoundTrip` 抽到 `tests/e2e/fixtures/douban-live-record.ts` 以过 600 行尺寸闸（610 → 582）
- **把 e2e 结构上看不见的守卫下沉到单元层：面板的「发消息边界」（X99）**：变异取证时实测**删掉面板的空输入守卫后 x98 全绿**——背景侧 `handleAdultAvAdd` 同样有 `if (!id || !source)` 拒空，两层防御删任一层产品行为都不变，这是「e2e 绿灯」与「该行有人认领」之间的裂缝。新增 `tests/unit/content-panel-guards.spec.ts`（**9 例**，jsdom + 只暴露 `runtime.id`/callback 形态 `sendMessage` 的 chrome stub），把观测点从产品结果换成 **`chrome.runtime.sendMessage` 的调用次数与载荷**：空输入 0 条消息且输入原样留着、合法输入恰好一条 `ADULT_AV_ADD`（`{source:'manual', id:原值, rating:所选}`）、成功后清空输入、方括号走 `ADULT_AV_BATCH_ADD` 且每条 id 都在载荷里、非法 JSON 零消息 + `alert` 文案等于 `t('Invalid JSON')` + 输入不被吞、重复调用只留一层、关闭/遮罩移除而面板内部点击不关、查询空输入**不去拉全量**（`ADULT_AV_GET_ALL` 零次）、命中三行与未命中一行的两分支 oracle。四处变异各自只让受影响的那一例红。**并档一条测得的机制**：`mode:'serial'` 的 spec 在首个失败后把其余标成 `did not run`（那不是绿），所以变异轮必须逐例 `-g` 单独跑
- **色花堂首页分区改按帧落位，并补一个 shadow 作用域的写趟探针（X100）**：首页是**导航层**，分区数由站点版式决定（列出全部分区与各自子版块，可达数百容器、上千节点），而 `scenario/sehuatang/app-home.ts` 原先一次 `for` 把全部 section 建完再整块 `mountContent` ⇒ 解析与样式/布局压进同一帧；X9-B 的 `runChunked` 接了 6 处写趟，首页是漏网的一处。改为**首个分区保持同步**（结构性失败仍由既有 `catch → dismiss` 还原被隐藏的 `#ct`），其余每帧「构建 + 插入」（`insertBefore(section, pillAnchor)` 保证灵动岛仍垫最后），入场助手按分区调用以免每帧重扫整个 shell。**为什么不裁掉分区**：裁的是宿主首页本就列出的导航入口，属功能退化；分片把成本摊平而行为零损失。**探针**：MutationObserver 不跨 shadow 边界，既有写趟探针观察 `document`，看不见挂进 `#umm-sht-overlay` 阴影根的分区——新增 `armShadowWriteBatchProbe`（先在 document 等 host 出现，因 init 脚本与 `document_start` 内容脚本互相抢跑；再挂到只读得到的 open `shadowRoot`，批次仍发布到同一个 `__ummWriteBatches`，读侧复用 `readWriteBatches`）；失败姿态要求「探针没接上」与「产品没写」都得红，故用例先断正向总量。新增 `tests/e2e/x100-sehuatang-index-chunked.spec.ts`（**4 例**，各占独立页面，以便一轮变异同时验多处而互不遮蔽）：完备+顺序、按帧到达（投递条数 ≥2 且单趟不带走大半语料）、岛仍在壳的最后一个子节点、首分区可见卡片都拿到入场类。**五处变异逐轮归因**：`chunkSize:1→200` ⇒ 恰好分片例红（`Expected: >= 2 / Received: 1`）；插入换成 `appendChild` ⇒ 恰好岛例红（`Received: ""`）；删两处入场调用 ⇒ 恰好入场例红（`Expected: 0 / Received: 2`）；取消分片（一趟写完 11 个）⇒ 分片例红；`.slice(1)` 加 `.reverse()` ⇒ 恰好顺序例红、其余绿。**由第④条逼出的口径纠正**：原以为「首个分区随壳 mount、探针看不到后代 ⇒ 总量 `N-1`」本身就是判据，实测**一趟全量写同样得到 11**（壳已在根内，之后的 append 都记账），故总量只证明探针活着，真正有牙的是投递条数与单趟上界——头注按实测改写，防止后来者拿总量当分片证据。**顺带两条如实记录**：新加的 `console.warn` 触发 `console:check` 棘轮 exit=1（基线只能缩），而 `logger` 的 warn 在生产构建里被 `enabled` 门控；曾考虑「分片失败就 dismiss」，但 13 个 `runChunked` 调用点无一读 `result.failed`，且这里的 `write` 只做「按数据建节点 + 插进已挂载的壳」，抛错即编程错误、其后果（分区缺席）本身可见且顺序/完备断言当场红——**删掉这一不可达分支**并留注释。毫秒预算不在本波射程：12 分区的写趟只有几十毫秒，落在 X71 实测的「计时判据分辨不了分片与否」噪声带内
- **导航岛最后 12 串裸中文入词典，并第一次用真实浏览器证明「语言设置抵达豆瓣 overlay」（X101）**：`components/UmmDynamicIsland.vue` 是豆瓣 overlay 里最后一处成规模裸中文（导航五档标签 + 容器/提交按钮 aria-label + 四条按频道派生的 placeholder + `'搜索豆瓣' + label` 合成）；提取为 12 个 `douban.island.*` 键 × 四份内容词典（zh-CN 值逐字不变，默认语言下可见文案零漂移）。**§18 行 2 的旧结论本轮重新计量并反转**：豆瓣链早已 `await initI18n()`（`scenario/douban/main.ts:115`），夹具浏览器 `navigator.language=en-US` 且存储无 `language` 键 ⇒ overlay 实渲染英文，`t()` 的解析链在真实浏览器里是通的。新增 `tests/e2e/x101-douban-overlay-locale.spec.ts`（**4 例**）：**zh-TW 是唯一可判别语言**（模块默认 zh-CN、浏览器默认 en-US，两个方向都能被"没初始化"冒充，繁体只能经存储抵达）；另钉「整块一起换语言（残留裸串=混语导航）」与「`{{label}}` 真被替换」；第四例刻意 locale 无关（电影页与游戏页占位文案必须互不相同、且各自包含从 island 自己活动按钮读回的频道名）。**两处自我高估被变异当场纠正**：把 `await initI18n()` 换成 `void initI18n()` 后四条**全绿**（挂载在那一 promise 落定前不读语言）⇒ 该组用例的主张如实降级为「证明链路调用了 initI18n」，不宣称证明时序；`x91-island-search` 原先硬断 `placeholder='搜索游戏'`，抽取后渲染语言随环境 ⇒ 改为 locale 无关的等价判据，并用「占位文案恒定电影档」的变异复验其牙（恰好该例红）。四处变异逐例归因：删 initI18n 调用 ⇒ 3 红 1 绿；标签残留简体裸串 ⇒ 两例「整块换语言」红；去插值参数 ⇒ 插值例红；placeholder 不按频道 ⇒ 派生例红。用例在 `afterEach` 删 `language` 键（跨标签持久态，留着会污染同上下文其他 spec）
- **独立复核回打 X98–X100：一条空转零断言、一条无牙负控、一处标题越权、探针可见性口径（X102）**：按规则 39 派只读复审核对「断言 ↔ 它声称覆盖的那一行」配对，抓出四处并已修：①x100 入场例 `querySelectorAll('.umm-card:not(.umm-sht-enter)').length === 0` 是**空转零断言**（卡片没建出来时必绿，而失败文案自称能抓这一情形），且只查首分区 ⇒ 逐分区那次 `runVisibleEntrance(section)` 无人认领；改成带前提的双向判据（先钉 12 分区 / 24 卡片，再要求「拿到 enter 类 ⟺ 矩形与视口相交」，并钉视口内外两侧都非空），变异复验：只删那一行 ⇒ 恰好该例红 ⇒ **X100 头注里"该调用不可观测"的说法被推翻**；②x98 非法 JSON 例只数弹窗条数 ⇒ 换成 `alert('boom')` 仍绿，改断文本（locale 无关子串 `JSON`）；③x98 空输入例标题写「不清空」而无对应断言，且复核确认它结构上不可能认领面板守卫（无守卫时背景先拒空 id、`sendMsg` 抛错，清空执行不到）⇒ 标题降到实测范围，指向 X99 那份盯消息次数的单元用例；④写趟探针可见性只在端点检查 ⇒ `max(counts)<=6` 在页台中途被遮挡时可能在正确代码上红，改为每一趟记 `visibilityState`、读侧发现非 visible 趟即抛错（老的属性版探针不记该字段，行为不变）。**并档复核规则 46/47**：全称/零断言必须自带"主体集合非空"与"两侧都可达"的正向前缀；装配类用例只证「调用存在」，不得宣称证了「调用时序」
- **装配类缺陷守卫：接上豆瓣/色花堂主入口的日志装配与色花堂语言在线同步，并当场抓住"我重复实现了既有守卫"（X103）**：§18 记录的「`configureLogging` 只有部分上下文调用」后续只补到三个视频入口，**豆瓣与色花堂两条主入口仍缺**——logger 默认跟随 `import.meta.env.DEV`，这两个最重的 overlay 体系在生产里恒静音，用户拨「调试日志/日志级别」对本页无效、客服也取不到该页诊断；这类"消费了却从不装配"的缺陷对按键门禁（`i18n:check`/`console:check`）结构性不可见。两入口 `main()` 顶部补 `await bootstrapLogging()`（先于任何路由判断，风控页/帖子页同样要能取证）。**流程自纠（本轮价值最大的一条）**：既有守卫 `tests/unit/x26e-entry-init-parity.spec.ts`（451 行 + 6 条自检种子）**早已实现同一判据**，其 `LOGGING_GAPS` 正点名登记着这两条缺口；我用 `grep -rln entrypoints tests/unit | head -12` 找既有守卫时**被 `head` 截断恰好把它切掉**，于是重复写了一份 `logging-init-wiring.spec.ts`，还把"探测器只留一份"当结论写进文档。真凭据来自**全仓合并复跑**：接线后 x26e 的棘轮例判红「已能走到日志初始化，请把它从 `LOGGING_GAPS` 删掉」——分波自测里两份守卫各自都绿，永远看不见这类冲突。处置：删掉重复守卫、`LOGGING_GAPS` 清空，并把两个主入口**加进 x26e 的点名清单**（该例改名「legacy、三个视频入口、豆瓣与色花堂主入口」：只清基线不点名，日后删调用只会退化成"未登记缺口"）。**同时闭合第二条登记缺口**：`i18n-init-wiring` 的 `LIVE_SYNC_GAPS` 一直登记 `sehuatang-main` 不调 `startLocaleSync()`（三个编排入口各自 `await initI18n()`，却没人注册 `onChanged` ⇒ Options 改语言不回填已开标签页）；补上调用并把该项从基线**删除**（棘轮本就要求"补好却不删基线也判红"）。为它配真实浏览器证人 `tests/e2e/x103-sehuatang-live-locale.spec.ts`（**2 例**）：挂载后改存储语言 → **重新打开 ☰ 菜单**（菜单每次点击重建，是唯一能显示"挂载之后 `t()` 用了新语言"的界面），另一例钉"不改语言时菜单保持初始语言"，否则"恒英文"的错误实现也能过。**探测器重复如实登记**：新抽的 `tests/unit/helpers/entry-graph.ts` 目前只被 locale 守卫消费（515→443 行），x26e 仍带自己那份——它的 `contentEntries` 用剥注释后的源码识别 `defineContentScript`、另有 `calledInOwnFile`/`countLogCalls` 等专属判据，照搬迁移会削弱入口识别，合并须连带搬 6 条种子自证，登记为独立一测而非半迁。抽取确实修掉一个真洞：`callSite` 原读原文，**注释里写一句 `initI18n()` 就能冒充调用点**，helper 版统一先剥注释并配种子。**变异/还原台账**：删 `startLocaleSync()` ⇒ 恰好在线同步例红（`Expected: "Menu" / Received: "菜单"`）且对照例绿；删 douban-main 的 `await bootstrapLogging()` ⇒ x26e 两条判据同时红而 6 条种子全绿（红来自判据而非探测器坏）；还原后 build 0、e2e 2/2、两份守卫 26/26。**如实遗留**：`bootstrapLogging()` 保证读到设置，不保证首条日志之前读到；`*-early` 壳层诊断仍可能落在默认级别——没为它编断言，登记待办。**并档复核规则 48**：新建守卫前必须按主题词搜既有守卫且证据列表不得 `head` 截断；文档结论只能在实测之后写
- **交互广度第九批：genre / search 分页器与 photos 页签·侧栏·画廊下载全部驱动（X104）**：清掉台账里最后几处具名未点挂点——`genre/App.vue` 的两个 `.umm-page-btn`（全仓 e2e 对该类名零命中）、`search/App.vue` 分页器的首页/上一页/末页/数字页（X38 只点过下一页与跳转框）、`photos/App.vue` 主级页签 `:187` / 次级页签 `:197` / 侧栏 `:272` / 画廊下载 `:294`。新增 `tests/e2e/x104-genre-search-pager.spec.ts`（4 例）+ `x104-photos-tabs-links.spec.ts`（7 例），判据全部现场读宿主 DOM（`.paginator .prev/.next a`、`#photos_filter` 主级 `li:not(.up) a` 与 `ul.sub li a`、`.aside .links a, .aside .mb30 a`），search 的跳转目标用夹具 `__DATA__` 的 `count/start` 做算术推出而非抄组件模板串。**三条自己写坏的判据被实测纠正**：①按"点了末页就算已在末页"累加推算目标 ⇒ 错（路由恒以同一 body 应答，`start` 恒 40 ⇒ 恒第 3 页），换成"同一文档推出四条互异目标"反而成了更强的单射检查；②查询词的百分号编码手写错了 ⇒ 改用 `encodeURIComponent` 并加前提断言被服务 body 的 `__DATA__.text`；③"点当前页签不跳"只有 URL 判据是**无牙的**：删掉 `goToPage` 的 `if (url)` 守卫后 `page.url()` 仍相同（赋空串只重载本文档），补 `window.__ummNoNav` 哨兵区分"没发生"与"同址重载"后该变异立刻红。**顺带修一处越权标题**：`x36` 的「卡片上的下载按钮…触发下载」其实只断言画廊没被打开，下载从未作证 ⇒ 标题改为它所证明的事，下载证人移入 X104：真 `download` 事件 + 扩展名取自图片自身 + 两张照片必须得到两个不同文件名（把 `filename` 钉成常量恰好令该例红）。**侧栏的页型真相**：`sidebarLinks` 只在 `/all_photos` 分支被填（单类型页恒空，两侧由 `photos-data.spec.ts` 钉住），故新增按既有提取契约合成的 `tests/fixtures/douban/photos-all.html`（文件头声明无真实爬取件、形态取自单测契约），正向例打在汇总页；另加反向例钉"单类型页宿主确有 aside 链接却渲染零侧栏按钮"，把分支差异写成契约。**七处变异逐轮归因**（前页处理器换成 nextUrl、`:disabled` 恒假、末页换成下一页、当前页码补 href+处理器、次级页签处理器清空、删 `if (url)` 守卫、文件名钉常量）各自只让对应用例红；全部还原后 X104 11 例 + `x36` 5 例 + `x38` 3 例 + `x56` 2 例绿，十个静态门禁 exit=0
- **豆瓣 overlay 裸中文第二批：状态文案表改为渲染时解析，标记条/对话框/页脚/错误文案全部入词典（X105）**：`shared/status-labels.ts` 原先是**模块加载期就定死**的中文字面量表，语言设置永远到不了它；现改为 getter → `t()`，同时把 `umm-interest-bar.ts`（星级标签表、对话框标题与保存/取消/添加）、`umm-page-layout.ts`（页脚版权行 + 六条 Douban 链接）、`use-interest.ts`（两处 403 与两处缺 `ck` 的会话错误）一并接进词典，四个页签按钮加 `data-umm-pick` 稳定锚点。内容侧 `zh-CN` 键数 131→209（本波 +40），四份词典 `i18n:check` 100% 完整。**计量用自建探针**（4 条自检种子 + 正向对照），before 取 `git archive HEAD` 副本：`src/scenario/douban` authored CJK units 286→174、RENDER 70→52、AMBIG 128→34，而 **MATCH 88→88 不变**——这条恒等是关键安全证据：抽取没碰到「拿去和宿主 HTML 比对/选择」的串（那会静默破坏解析）。测试侧新增 13 条单元用例，含按 locale 循环的「键↔DOM 位置配对」与 `x105-use-interest-errors.spec.ts`（9 条，此前错误文案零覆盖；内联 `error.value` 与 toast 两个出口都断，toast 用静态方法拦截以免引入离体定时器）；三处 e2e 由「钉某句中文」升级为配对或显式钉语言（`setStoredLanguage` 提升进 harness 共用）。8 处变异全被抓（退回字面量、getter 退化成加载期快照、星级下标 off-by-one、去掉锚点、页脚键互换、会话键互换、toast 复用错键、错误内联硬编码）。**过程自纠**：变异脚本原本靠「反替换」还原，而替换目标在文件里不唯一时会写坏源码（一次把页脚真 jobs 行改掉、一次因空串 `to` 把内容插到文件首行）——两处都被 hash 比对判为未还原，改法是把「还原」定义为写回本轮开始前的原文并加收尾总查。
- **回访检测：豆瓣 overlay 的「改语言不回填已开标签页」其实没被修好，本轮量出来并修（X106）**：`scenario/douban/main.ts` 的注释把这条缺陷写成「已由 `startLocaleSync()` 解决」，但 `t()` 读的是模块级变量，已挂载的 Vue 树对它**没有响应式依赖**——新增 `tests/e2e/x106-douban-live-locale.spec.ts` 一测：挂载后改 `chrome.storage.local.language`，导航岛 5 个标签恒旧（重载对照例绿，证明存储链路本身通、缺的只是回填）。修法不走「让 i18n 引 vue」：实测 `douban-early.js` / `sehuatang-early.js` 两个 `document_start` 包里**零 vue 标记**，引入 vue 等于给最敏感的首帧路径加体重。改为在 content i18n 里加一个无框架依赖的 `subscribeLocale()`（仅语言**真的变化**时广播），挂载层订阅后重跑该页的 `mountFn()`——复用 `mountUmmOverlay` 既有的重入通道（先 unmount + 摘容器，再挂新树，与挂载失败后的「重试」同路），加单飞守卫防连点。顺带修掉这条通道上的重复注入：页面 `<style>` 打上 `data-umm-page-css` 并在注入前摘旧节点，否则每次回填多插一份等价样式。**探针选择纪律**：观测面必须选**不会被重建**的那块——标记对话框与色花堂 ☰ 菜单每次打开都重新构建，零回填代码也能「看起来通过」（X103 的色花堂在线例正是靠重新打开菜单才成立）。3 处变异逐例归因：删订阅 ⇒ 2 红 1 绿（在线 + 样式红、重载对照绿）、`applyLocale` 不广播 ⇒ 同形、去掉样式去重 ⇒ 恰好样式例红。如实遗留：色花堂侧仍只做到「重建时为新语言」，legacy 管线未逐站点复验。

- **豆瓣 overlay 裸中文第三批 + 「词典真的被渲染」双挂载见证（X107）**：`src/scenario/douban` 的 RENDER 由 **52 → 12**（本波清 40 单位；`units 174→130`、文件 `34→29`、MATCH 88→85——其中 3 条徽标串原被 `===` 启发式误分类为 MATCH，随抽取消失，未触碰任何宿主匹配串）。五文件非注释 CJK 清零：`pages/user-profile/App.vue`（17：统计条五档标题 + 12 标签 + 豆列/评论/广播/关注四段 chrome）、`pages/personage-creations/{App.vue,personage-creations-data.ts}`（10：页签 / 角色 chip / 徽标 / 计数 / 分页；**徽标与角色由返回字面量改为返回 i18n 键**，渲染层 `t()` 解析——数据层不得产终串，否则 X106 的在线换语言回填会读到冻结值）、`pages/book-profile/App.vue`（7：时间线动作 / 看板标题 / 全部·更多 / 人推荐）、`pages/homepage/App.vue`（4：四个区块标题）、`overlay/mount-failure.ts`（3：失败面板标签 / 重试 / 关闭 aria）。**59 个新键 × 4 词典**，zh-CN 值逐字保持原渲染（默认语言零漂移）。**新增双挂载见证** `tests/e2e/x107-douban-chrome-locale.spec.ts`（4 例）：每页 zh-CN / en-US 各挂一次，代表性结点 === 该语言词典值，且先证两语言期望值不同（硬编码与同值假翻译都过不了）；「重试」硬编码的变异**只在 en-US 挂载红、zh-CN 绿**，设计当场自证。**9 处变异逐例归因**（用户页标题硬编码 / 书影看板键错配 / 创建页 count 丢参 / x50 活动页签常数 / x41 前页恒渲染 / mount 硬编码 / 角色键错配 / 首页标题硬编码 / 用户页标签换键），各自只命中各自的例。**一次自纠**：给 x94 加的语言钉在「删掉它」的变异下**全绿**——movie-profile 统计条标签是宿主派生（`movie-profile-data.ts` 从宿主 DOM 读文本），加固不承重，按规则 44 撤除并留注释说明为什么不需要。**两条钉中文的既有断言改文案无关且更强**：x50 `toHaveText('影视')` → 身份/索引断言；x41 `hasText:'前页'/'后页'` → `.umm-paginator-btn` 计数=1 + 宿主 next 游标比对。**首轮合并复跑抓到三处红（两处非本波引入）并全修**：typecheck（新 spec 的 `dict()` 未过 `noUncheckedIndexedAccess`）、format:check（4 文件）、console:check（152 vs 基线 149，三个文件各 +1、基线只存计数**无法逐行归因**）——第三处按门禁契约把 3 处错误路径诊断改走 `logger`（含 X106-leftover 的色花堂 remount 失败分支），152→149 回到基线内。**末态仓库级合并复跑（19 步逐条 `exit=` 台账）**：16 项静态/build 全 0；unit **2782 passed**（并行 1.1m / `--workers=1 --retries=0` 串行 2.1m）；e2e 串行 **221 passed**（6.5m，含本波 4 例）。**如实遗留**：RENDER 余 12（photos / movie-profile / detail / game-detail / book-homepage / celebrities / doulist-detail / series / book-profile-data，X108 射程）；AMBIG 33 待逐文件判读；模板文本类 CJK 尚无计量口径（探针只数引号内；本波按「文件级非注释 CJK 清零」处理）。

- **豆瓣 overlay 裸中文第三批（收官）：RENDER 12 → 0，模板文本口径探针落地，双挂载见证扩到 9 页（X108）**：`src/scenario/douban` 引号口径 `units 130→86、文件 29→18、RENDER 12→**0**`、`AMBIG 15→8`（余量=宿主词表 `media-formats` 与宿主匹配串，逐条判读后如实保留）；本波清 12 个 RENDER 单位（photos 2 / detail 2 / movie-profile 2 / book-profile-data 1 / game-detail 1 / book-homepage 1 / celebrities 1 / doulist-detail 1 / series 1）并顺带抽出相邻模板文本：`*Heading` 类改为**数据层发键**（`synopsisHeadingKey`/`celebHeadingKey`，渲染层 `t()` 解析）、`FORMAT_LABELS` → `FORMAT_LABEL_KEYS`（宿主格式串→键；`FORMAT_COLORS` 改按宿主串直查，去掉中文归一标签这个中间层）、用户主页/书影主页的 displayName 兜底改「数据层返回空串 + 渲染层 `douban.user_fallback`」；新增 **107 键 × 4 词典**（对称由 i18n:check 强制）。**新共享模块**：`shared/format-count.ts`（评分人数紧凑格式化；中文路径**逐字保留** doulist-detail 的 k 档与 series 的千分位两套历史渲染，非中文走 `Intl` compact——不再输出「万」）+ i18n 新增只读 `getLocale()`；配 `tests/unit/format-count.spec.ts` 5 例（含 en「12.3K」与 zh 边界「10.0k」）。**逐字零漂移的落法**：4 处「句内计数带样式」拆 lead/tail 键以保住 `.umm-*-stat-value` 强调节点；count 类断言用「词典模板 → `\d+`」正则，不抄数字。**新见证 spec** `tests/e2e/x108-douban-chrome-locale-2.spec.ts` 9 例双挂载（photos / detail / trailer / celebrities（title 与卡片自己的名字现场配对）/ movie-profile（标签集合包含，因该页另有宿主标签条）/ doulists（徽标文本须与其自身分类类名配对）/ book-reviews / series / user-profile **h1 缺失兜底**（transform 只摘昵称 h1，其余字节照爬取样））。**同波修 5 处钉中文断言**：x56 分页（改文案无关：两份导航同文且按序含宿主 current/total，按钮按位次）、x78-trailer（钉 zh-CN 保「URL 决定标签」契约）、x94（**语言钉承重性反转**：X107 实测为装饰性撤除，本波因词典标签条须与中文宿主行配对而钉回，注释写明两段历史）、x38/x104 搜索分页（钉 zh-CN）。**4 处变异各命中唯一目标**：photos 下载 title 硬编码 / doulists 分类键错配 / 兜底回退写死中文 / x94 删语言钉——其余用例全绿。**新工具（规则 54 收口）**：`cjk-templates.cjs` 模板文本口径探针（4 条自检种子），实测剩余 **65 单位 / 16 个 .vue**（personage 12、game-explore 9、review-detail 5…）——两口径分开报告、不相加。**门禁波折 2 处**：orphan 棘轮点名新模块 `format-count.ts` 无测试引用（补 spec 后 PASS：214 covered / 37 未覆盖），format:check 12 文件待格式化（全仓 Oxfmt 后绿）。**末态仓库级合并复跑（含复审修复）**：16 项静态/build 全 0；unit **2790 passed**（并行 + `--workers=1 --retries=0` 串行；增量 = format-count 5 + detail/series 词典配对 2 + media-formats 消费端扫描 1）；e2e 单 lane **231 passed**（9.1m，含本波 10 例与 x90 钉 zh-CN 的修复例）。**两轮全量 e2e 曾各出现 1 例负载型 flake（互不相同：imdb teardown 超时 180s、x103 重挂载印章断言），隔离复跑均绿（3/3、6/6）后第三轮 231/231 零红**——判据与见证已入项目记忆，硬化属独立任务。**如实遗留**：模板文本 65 单位（X109 靶面）、AMBIG 8（宿主词表判定保留）、X103 两项待办（x26e 探测器合并 / bootstrapLogging 首条日志时序）。

- **独立复审回打 X107/X108：抓出 3 处必修（含 1 处本波引入的用户可见缺陷）并全修（X108 复审）**：按规则 39 派只读评审复核「断言 ↔ 覆盖行」配对，先确认主断言设计成立（双挂载/现场配对不空转、x94 语言钉承重结论成立），再抓出：①**空串 i18n 值经 `t()` 的 truthy 兜底跌成键名**——4 处「句内计数」拆出的 lead 键在部分语言下有意为空，实际渲染出「`douban.series.volume_count_lead12 册`」（zh 与 en 各有两页中招），修复为**存在性判据**（`hasOwnProperty` + `??`，空串是合法译文）并补**整句**断言（新增 doulist-detail 例 + series 整句），以「回退 t()」的变异复验恰两例红；②**`FORMAT_COLORS` 键域切换漏改一个消费端**——UmmSearchCard 仍用本地化显示名查色表（zh 下数字介质 chip 丢色、en 假绿），改按宿主串查并加源码扫描断言；③**series 排序项文案仍是数据层终串**（且被探针 `!=='` 同行启发式误判为 MATCH）——两键入词典（`douban.series.sort_collection`/`sort_time`）+ `labelKey` 化 + 词典配对。另补 4 项见证：photos page-info 模板断言、`expectBilingual` 全键覆盖（含 `dl.cat_*` 全族）、x104/x78/x90 的字面量改词典取值、`format-count.spec` 复位移入 finally。新增规则 58–60（空串是合法值须存在性判据 / 查表键域切换要 grep 全部消费端 / 探针同行启发式误判按文件登记）。

- **豆瓣 overlay 模板文本清零：模板口径 65 单位 → 0，16 个 .vue 全部入词典（X109）**：`cjk-templates.cjs`（X108 新立的口径）实测 **65 单位 / 16 文件 → 0 / 0**；本波抽 42 键 × 4 词典（`douban.pg.*` personage 9 / `ge.*` game-explore 6 / `rd.*` review-detail 3 / `rev.useless|pages` 2 / `search.filter_*|result_suffix` 4 / `gc.*` game-collect 3 / `mup.*` music-profile 2 / `ao.*` artists-overview 3 / `count.people` 1 / `genre.*` 3 / `mh.*` music-homepage 3 / `bc|mc|um|albums` 计数 4），zh-CN 值逐字保持；复用既有键 10 处（`empty.content`×6、`detail.awards`、`series.sort`、`rating_people`、`search.results`、`rev.read`、`useful`、`mp.all_count|followers`、`bp.authors`、`mp.celebrities`）。**同波同型修复 3 处测试断言**：x38 筛选页签与 x27b-music 版本计数钉 zh-CN（标签/计数已词典化）；x27b-book 的 `assertReviewDetailProvenance` 增语言钉——它的契约是「meta 行每个 token 都来自宿主侧栏」，标签入词典后**只有 zh-CN 下该契约成立**（en 下渲染 'Director' 而宿主是「导演:…」）。**见证**：新 `tests/e2e/x109-douban-chrome-locale-3.spec.ts` 4 例双挂载（personage 标题集合+可选计数按钮 / game-explore 标题·排序·加载按钮两分支 / search 筛选条三页签+结果后缀 / game-collect 计数与分页整句）。**变异两轮、各命中各页**：A 轮 personage 标题硬编码 + search 页签换键 ⇒ 恰该两例红；B 轮 game-explore 加载键错配（load_more→load_end）+ game-collect 分页丢参 ⇒ 恰该两例红；四文件还原后逐字节一致。**门禁/工具过程中的两条记录**：①批量补丁脚本的「import 锚点不存在则整文件跳过」把 UmmSearchFilter 整文件漏掉（其 `<script setup>` 无 import 语句）——靠**逐文件 CJK 残留核对**（15/16 为 0、该文件 5）抓到并手工补齐，静态自检必须核对到文件级；②`toHaveText(正则)` 匹配 raw textContent（含模板换行空白），端点锚点须带 `\s*`（Playwright 只在字符串断言时归一化空白）。**末态合并复跑**：19 步逐条 `exit=0`；unit **2790 passed**（并行/串行双绿，本波无新增单测——抽取面由 e2e 见证承担）；e2e **235 passed**（7.7m，含本波 4 例，零 flake）。**如实遗留**：AMBIG 8（宿主词表判定保留）、X103 两项（x26e 探测器合并 / bootstrapLogging 时序）、e2e 负载型 flake 硬化、`format-count` 阈值统一待产品拍板。

- **裸中文棘轮门禁 `npm run cjk:check`：把两把临时探针做成常驻守卫（X110）**：X107–X109 把豆瓣 overlay 的自造中文清零（引号口径 RENDER 0、模板文本口径 0/44 文件），但两把量具此前只在 `.um.agents/tmp` 临时活着——按审计 §6 信条「凡靠人工遵守的约定都必须门禁化，否则一个波次即反弹」落地为 `scripts/check-cjk.cjs`：**按文件记录 `quoted`（引号/反引号内 authored CJK，含宿主匹配串这一合法债务）与 `template`（`.vue` 标签间文本，剥注释与 `{{ }}` 插值）两个口径、分开计数绝不相加**（审计规则 54），基线 `scripts/cjk-baseline.json`（当前 `quoted 84 / template 0`，18 文件；84 = MATCH 76 + AMBIG 8，后者为宿主词表/宿主匹配的判读保留量）；判据与 size/orphan 同族——**新增/增长即 exit 1，计数下降而基线未重锁也 exit 1**（提示 `--baseline`，棘轮只缩）；内置 **8 条种子自检**（两口径各 3 条形态 + 2 条反向对照，防「判据一起瞎」）。**门禁经变异双向验证**：往 `albums/App.vue` 塞一条中文 → 恰报「新文件带裸 CJK（1 quoted）」exit 1；还原逐字节一致后 exit 0。接线：`package.json` + CI `Static Gates` + `AGENTS.md` 门禁链（十五 → **十六**道）。同期把整轮复跑脚本扩为 20 步；**末态 20 步逐条 exit=0**（unit 2790 双 lane；e2e 235 passed，零 flake）。

- **X103 两项遗留全部闭合：x26e 探测器合并（实效核验）+ bootstrapLogging 首条日志时序（受控场景断言）（X111）**：①**核验**：x26e 的合并早已落地——`tests/unit/x26e-entry-init-parity.spec.ts` 由 451 → **129 行**，只留真实仓判据/棘轮/6 个点名入口，探测器与 6 条种子全部消费 `helpers/entry-graph.ts`（`registerEntryDetectorSelfSeeds()` 注册），两守卫合并复跑 28/28；台账此前未回写，本轮按规则 27 的磁盘清单法更正（新增规则 65：**「待办」条目同样会过期**）。②**新断言**：x26f 原 stub 立即兑现、测不到 bootstrap 的异步窗口；新增**闸门 stub**（`storage.get` 挂在 promise 闸门上）定点钉住时序契约——窗口内日志按当时配置执行且**不追发**（early 行缺席 + late 行在场两条断言），限界写清（早期入口要按设置输出首条诊断必须 `await`；当前实现不缓冲，改设计必须同波改判据）。**产品侧变异**（删掉 `configureLogging({ enabled, level })` 应用步骤）⇒ 恰该例红；还原逐字节一致后 x26f 11/11。**末态 20 步逐条 exit=0**：unit **2791**（+1）；e2e 235 passed（首轮 234/235 的唯一红为 bilibili-homepage 计时预算例——负载型 flake 第三物种已入项目记忆，隔离单跑绿、复跑零红）；16 项静态门禁 + build 全 0。

- **e2e 负载型 flake 三处硬化：按记录的三个物种逐一处置，判别力零改动（X112）**：①`bilibili-homepage-chunked` 帧间隙预算 150 → **3000ms**，并把该腿角色写进头注——它是**存活性/总阻塞上界**而非分片判别器（spec 自证分片与一趟写在同一声噪带），判别由**写入形状腿**承担（变异有牙），探针探盲性仍由同运行内 `blockMainThread` **正对照**硬断言；②x103 重挂载印章的轮询预算 15 → **45s**（重挂载要重跑整个 mountApp，超时是等待上界非判别阈值）；③harness teardown 给 `ctx.close()` 加 **30s 上限**，超时即 warn + 尽力强关 `ctx.browser()` 后继续（原来一次负载抖动会以「Tearing down exceeded the test timeout」伪装成产品故障）。**末态 20 步逐条 exit=0**：unit 2791；e2e **235 passed**（复跑零红）；16 项静态门禁 + build 全 0。新增规则 66：计时/等待预算按角色分档——判别阈值不许放宽、等待上界按最坏环境定、有牙判别一律不动。
- **X109–X112 测试增量的独立复审响应：三处断言补牙 + 一条真竞态根因闭合（X113）**：按规则 39 派独立只读复审（「断言 ↔ 产品行」配对表），抓出三类缝并逐条处置——①**空头支票**：personage 例声称的「未上映标题」（`douban.pg.upcoming` 零引用）补断言 + `expectBilingual`，第二个人按钮（`.umm-personage-btn` nth(1)）补见证，两处各以换键变异命中；②**alternation 备选不可达**：game-explore 加载按钮的 `loading ∨ load_more` 判据对「卡在加载中」「两分支对调」全绿 ⇒ 直钉可达支 `load_more`（分支对调变异实测命中）；③**订阅注册竞态**：x103 语言同步测试存在「首挂载完成后才 `subscribeLocale`」窗口——写入被吞后 45s 也救不了，改为等 `[UMM] watched check:` 挂载尾沿日志（其后到注册只剩同步+微任务）；同波更正「尾沿只重绘 info」的错误注释（挂载尾沿同时重绘 info 与复制按钮，重挂载唯一见证是节点身份印章）；④bilibili 帧预算 3000 → **10000ms** 显式看门狗（负载实测 1968ms，1.5× 余量不叫余量；「~5×200」口径标注为被节流读法）；⑤harness 回退关浏览器加 10s 上限 + 三处静默失败改 warn + `withTimeout` 清 race 定时器；⑥x26f 补正向前缀（`openGate` 前断言窗口仍关）与 M2 变异（去掉 `await` ⇒ 时序例恰红）。**变异取证**：upcoming 换键 / 第二按钮换键 / 分支对调 / M2 四路各命中恰该例，产品文件还原逐字节一致。**末态**：20 步 `exit=0`；unit **2791**（双 lane）；e2e **235 passed**（6.0m，零 flake）；spec 头注注释级修订后 x109 复跑 4/4。新增规则 67（订阅注册竞态 + 节点身份是重挂载唯一见证）、68（alternation 备选必须可达）。
- **umreview 合并审查 + 收尾修复波（X114）**：五组并行只读审查覆盖全部 456 个变更文件（分组证据矩阵 + 全深度双向溯源 + 安全审计），终态「16 门禁全绿 + unit 2791/0 + build 0 + x103 e2e 3/3、零 Critical」；收尾修复经面板裁决执行——①诊断出口统一：sehuatang 编排/头部统计 17 处裸 `console.*` → `infoLog`/`warnLog`/`errorLog`（前缀与级别一一对应），x103 竞态闸前置写入 `debugEnabled: true`（与 Options 开关同键，测真实门控链路），`options-query-feedback` 守卫断言同步跟踪 logger 路由；②本波新增中文注释约 100 行英文化（19 文件，WHY 语义与宿主字面量引用保留）；③仓库根 8 个 gitignored 日志产物清理。重审闭环两轮（format 行宽收敛 + 守卫断言对齐）后终态零修改。

## [5.18.0] - 2026-10-01

### 变更（内部重构）

- **D6/D7/D8 收官**：七层骨架与 provider 三件套（transport/mapping/index）落地并由 `arch:check` 强制；God 文件拆分清零（`size:check` 棘轮）；`umm` 前缀统一与注入样式作用域收口（`scope:check`）；Oxfmt 全仓统一格式化（`format:check`）
- **门禁体系 6 → 16 道**：新增 orphan/any/isolation/console/cjk/size/doc 七道守卫（棘轮基线只降不升），全量接 CI Static Gates
- **Vapor 渲染模式全量**：SPA 62 + Douban overlay 44 = 106 SFC；移除 `lucide-vue-next` 依赖（图标内联）

### 修复与优化

- **实时刷新广播双腿修复**：MV3 下 Service Worker 的 runtime 消息不投递内容脚本，「任意入口写库 → 注入 UI 免重载响应」恢复可用
- **失败路径强化**：读失败不清淡化标记（重试梯子）、overlay 挂载失败可重试、confirm 双击竞态、LRU 空串键、WebDAV 401 不再误报成功、无效记录键不再写库
- **安全收口**：下载协议白名单（封 `javascript:` 注入）、WebDAV 恢复逐键 fail-closed、宿主 URL 白名单 `safe-url`、NeoDB Token 退出默认备份（导出/导入双向 opt-in）
- **性能**：IndexedDB v15 adult 三表 `avId` 索引回填（消除全表扫描）、PT 淡化分帧与行记忆化、批量 DOM 写入分片
- **i18n**：Douban overlay 数据层发键、zh-HK 降级修复、early 壳副标题入词典
- **测试**：unit 2791 passed / 0 failed（历史首次全绿）；真实浏览器 e2e 体系建立

## [5.17.2] - 2026-09-25

### 新增功能

- **WebDAV 凭证可选恢复**：导出/导入共用「包含 / 恢复 WebDAV 凭证」开关；导出写入明文凭证（确认后），导入在确认后恢复 URL/用户名/密码。默认关闭，恶意备份仍无法注入凭证

### 修复与优化

- **导入设置即时生效**：导入不再绕过 SettingsCache，主题/Token 等设置无需重启 SW
- **NeoDB 请求超时**：单次 30s 中止，挂死主机不再拖住后台
- **调度隔离**：导出/统计/全量读取/WebDAV/导入走独立 bulk 队列，不再阻塞日常读写
- **数据写入不可变**：put/batchPut 不再改写调用方对象
- **PT dimmer**：单条记录变更只重扫相关行
- **豆瓣相关图升尺寸**：剧照/预告缩略图统一走 `upgradeDoubanImageSrc`

### 变更（内部重构）

- 依赖安全升级（adm-zip 0.6.1 等）；type-check 覆盖 tests/scripts

## [5.17.1] - 2026-09-23

### 新增功能

- **活跃度热力图智能天数挡位**：按热力图容器宽度在挂载时自动选择 90/150/365 天（无横滚可容最大挡，阈值约 264/408/888px），窄窗避免强制横滚、宽窗用满全年；手动切换优先，窗口缩放不重算

### 修复与优化

- **活跃度热力图内边界**：网格增加左右/下部 8px 内边距（border-box），单元格不再贴卡片内容边缘
- **活跃度 tooltip 小屏裁切**：居中气泡按视口夹紧（先量宽再显示），左右缘单元格的日期/次数不再被切掉

## [5.17.0] - 2026-09-20

### 新增功能

- **B站 listing dimmer 多页适配**：`bilibili-homepage` 覆盖 `space.bilibili.com` 个人空间（主页 / 合集列表 / 合集详情 / 投稿视频）与 `search.bilibili.com`；卡片识别优先 `data-bsb-bvid`（空间页），搜索页 href 兜底（含协议相对 `//www.bilibili.com/video/BV…`）；查询改为批量 `DB_GET_BULK`（`movie::` decision-3 键）；SPA 路由观察（pushState/replaceState/popstate + 轮询）；`wxt.config.ts` host_permissions 增加 space 域
- **dimmer 样式手术式收窄**：注入 CSS 只作用 `.bili-video-card.umm-viewed` 与 JS 打点的 `.umm-bili-dim-shell`，**禁止**全局 cover `position:relative` 与 `:has` 外壳规则——实测会把搜索页 absolute thumbnail 打成 relative，造成卡片白块/布局错位；徽章仅在 computed `static` 的 anchor 上设 relative；外壳 dim 与卡片 dim **互斥**（shell XOR card，避免 opacity 嵌套相乘）

### 测试

- 新增 `bilibili-listing` 纯函数契约与 `bilibili-listing-layout` Chromium 布局用例（几何 / absolute thumb 回归 / 互斥 dim）

## [5.16.1] - 2026-09-19

### 修复与优化

- **豆瓣 CDN 图片尺寸 xl→x**：大量豆瓣 CDN 图片不再支持 `xl` 尺寸，详情页海报/推荐封面与剧照图库升图目标改为 `x`；升图逻辑收敛为 `content/douban/shared/image-size.ts` 的 `DOUBAN_IMAGE_SIZE` 单一常量，后期只需改一行

## [5.16.0] - 2026-09-11

### 新增功能

- **色花堂搜索词回填**：搜索页灵动岛内的搜索组件此前是空输入框——现从结果页 URL 提取当前关键词并**预填**（**`kw` 优先**（.localref 夹具 `saved from url` 核实结果页实态：`…&searchsubmit=yes&kw=自行打包`），`srchtxt` 兜底（站点搜索表单/高级筛选链接与本扩展 `buildSearchUrl` 生成形态）；`URLSearchParams` 自动解码百分号编码；两者皆缺时退化到页面「结果:」h2 关键词）；新增纯函数 `extractSearchKeyword`（url.ts，5 例单测：kw 解码 / srchtxt 兜底 / 双参 kw 优先 / 空白→'' / 非法 URL→''）；`buildSearchBox` 增 `value` 预填参数、`buildFloatbar` 透传 `searchValue`（空结果分支同享）
- **色花堂灵动岛内部布局微调**：岛内控件统一**胶囊圆角**（操作按钮/搜索输入/页码/跳转框 → `999px`，与胶囊形岛体外形收敛）；岛体与岛内间距收紧（岛 `padding` 8→6px、`gap` 8→6px，岛内分页组 `gap` 4px）；**隐藏舱可访问性修复**——非当前舱除 `opacity:0` 外增加 `visibility:hidden`（延迟到淡出结束才生效，不打断摩天轮动画）并同步 `aria-hidden`，**键盘 Tab 与读屏不再进入不可见舱**（此前仅 `pointer-events:none`，隐藏控件仍可聚焦）；舞台 `min-width: clamp(172px,26vw,240px)` + 居中，两舱宽度差收敛、轮替时岛宽跳变变小；岛内 `:focus-visible` 焦点环（悬浮岛上的默认 outline 易被裁切）
- **色花堂 header top center 簇 + 灵动岛摩天轮轮替**：`.umm-sht-row--context` 改**三列网格**（`1fr auto 1fr`，真正的水平居中，非 space-between 等距近似），新增 `.umm-sht-center` 中列承载 **🏠 首页 + ☰ 菜单**（列表页从 actions 组拆出；搜索/首页动作全部上移 → `row--nav` 整行移除、header 收为单行，仅列表页保留 nav 行给 返回/发新帖/复制磁力）；**灵动岛摩天轮轮替**——搜索舱（恒上舱）与分页舱（恒下舱）入 `.umm-sht-island-stage`，`data-umm-slot`（active / hidden-up / hidden-down）唯一决定位置：**有分页时策略性优先展示分页舱**（分页是浏览主路径），`⇅` 轮替控件（`sht.island_switch` 四语言）一键切换，切换时一舱滚出、另一舱滚入（transform + opacity 方向性过渡，单次赋值即完成、无 double-rAF 时序依赖；reduced-motion 降级）；仅一方在场（首页/空结果搜索页/单页论坛）不建舞台与控件，`show()` no-op；`buildFloatbar` 返回 `FloatbarHandle{pill, mode, show}`（调用点同步为 `island.pill`）
- **色花堂 header 右上角统计区 + 双 box 分装**：`.umm-header-info`（本页状态）与 `.umm-sht-stats`（全局三段）统一收进 `.umm-sht-stat-area`（`margin-left:auto` 整组推至 header 右上角，窄屏随行整组换行），两者共用 box 面样式（边框 + raised 底 + 8px 圆角 + caption 字号，右上一目了然）；**本页状态统计与日系/欧美/帖子统计正式分成两个 box div**（列表 = 本页已看\|本页隐藏 + 全局三段；搜索 = 本页已看 + 全局三段；首页 = 仅全局三段——导航层无本页概念）；左侧上下文文本（搜索页计数 + 过滤注记 / 首页站点统计）改用 `.umm-sht-context`，动作组回归 `row--nav` 右对齐（列表/搜索/首页三页 header 同构）；列表页 mount 优先整组取 `.umm-sht-stat-area`（无则回退单 box，夹具兼容）；i18n 键原地重构：`Header Info` → `sht.page_box`、`sht.page_stats` → `sht.page_watched`（零死键）
- **色花堂非论坛页 header 两行重构 + 统计信息补齐**：搜索/首页 header 从「信息一行 + 动作组孤行」的松散结构改为与列表页同节奏的两行分区——上行 `row--context`（信息左 ｜ 动作右，space-between），下行统计行；**搜索页补统计行**（`sht.page_stats`：本页已看 N｜日系｜欧美｜帖子——本页已看读 DOM 类状态，初检 dim 与点击 dim 后即时刷新（`initSearchClickDimmer` 加 onDim 回调），全局三段走 `ADULT_AV_STATS` 单次拉取、失败降级空态；搜索页无隐藏特性故无「本页隐藏」段）；**首页补全局统计行**（`sht.global_stats`：日系｜欧美｜帖子——导航层无本页概念，用户裁决不含本页段），站点统计保持上行；两键 ×4 语言
- **色花堂 header 紧凑化 + 灵动岛自适应打磨**：header 双行纵向留白与区域间距收紧（`--sht-pad-y` 0.9vw 档 / `--sht-gap` 1vw 档，上下行与组件间隙同源变量，消除区域观感差异），控件高度全面统一 28px（选项卡胶囊 / 操作按钮 / 搜索输入 / 分页页码 / 跳转输入，消除行内基线错位）；新增「首页」按钮（`buildHomeLink`，🏠 图标零文字，href=forum.php）接入列表/搜索页 header（首页本身不加，自链无意义）；灵动岛瘦身——返回/发新帖移出岛体（header 操作组已持有，重复入岛只会撑宽岛体、窄屏溢出），岛组成收敛为搜索+分页；岛内搜索框 focus 动效自适应（静息收窄 clamp(96px,12vw,160px)，focus 平滑展开 clamp(140px,26vw,240px)，blur 收回）；窄屏（≤640px）防溢出——岛内分页计数器与跳转输入隐藏，页码 + ‹ › 上下页图标保留（导航能力不降级，overflow-x 仅作最后兜底）；上下页图标按钮补 aria-label（读屏可达）
- **色花堂灵动岛全面布局重构（全站浮动 UI 统一）**：新增 `buildFloatbar` 统一岛合成器（搜索框 → 分页 → 动作固定组合序，全空 → null 不渲染空岛），列表/首页/搜索三页全部挂岛——列表页岛 = 搜索+分页+返回/发新帖；搜索页岛 = 搜索+分页（空结果分支退化为仅搜索，仍可改关键词重搜）；首页岛 = 仅搜索（导航层）；**搜索框全面撤出 header**（岛是全站唯一搜索入口，治三页 header 搜索框与内嵌分页的组件堆砌）；`.umm-sht-shell--list` 语义升级为 `--island`（底部遮挡补偿 padding 作用任何挂岛页面），岛内搜索框宽度收窄子规则（搜索+分页+动作同排 96vw 预算内不溢出），旧 `.umm-sht-search-pager` 内嵌分页容器废除；**端到端渲染测试落地**（`sehuatang-render.spec.ts`：jsdom 全局注入 + shadow overlay 内真实运行编排入口）覆盖岛组成随场景合成、header 无搜索框、噪音分区过滤、空态两分支、DOM 守卫 dismiss、`--island` 挂钩全链路；顺带修复过滤注记永不渲染的缺陷（`buildHeader` 调用未传 `filteredCount`）
- **色花堂搜索页三态打磨（分区过滤 / 全空反馈 / 点击 dim）**：搜索结果按「所在分区」过滤无关分区——`forum-143`「求片问答悬赏区」等噪音条目不再渲染（清单 `SEARCH_NOISE_FORUM_IDS` 以 extract-search 为单一事实源，.localref 夹具逐条核实：forum-95「综合讨论区」等正常分区保留；扩展点即清单追加）；header 注记已过滤条数（过滤透明化，防「已过滤」被误读为「站点没结果」）；过滤后 0 条或站点空结果 → 复用列表页空态插图，文案区分两种情形（「没有搜索结果」/「结果均来自无关分区」，四语言），`buildEmptyState` 加自定义文案参数（列表页默认行为不变）；守卫放宽为「#threadlist 与结果 meta 双双缺失才 dismiss」（空结果页确切 DOM 无夹具，宽容托管）；**点击 dimmer**：点击卡片标题链接立即落 `.umm-viewed`（同 tick、新标签页打开前生效），**不落库**——写入仍由目标帖子页静默记录负责（与列表页 dimCardsVisually 契约一致），搜索页无磁力无复制落库路径，不受列表页 `shouldDimOnNavigate` 资格收窄约束，点击即 dim；**搜索框补齐**：搜索结果页原生无 `#scbar`（夹具实证，全站唯一没有搜索入口的页面），header 工具行重建搜索框（搜索最前置，与首页同款；action 缺原生表单时回退 Discuz 通用形态）
- **色花堂搜索组件重建**：overlay 取代原生 `#scbar` 后搜索入口一度缺失，现于导航行（选项卡与操作组之间）重建搜索框——回车或 🔍 按钮发起跳转；GET 契约按站点结果页链接形态推导（`search.php?mod=forum&srchtxt=<encoded>&searchsubmit=yes`），action 优先读原生 `#scbar_form`（缺失时回退 Discuz 通用形态），关键词空白静默 no-op，仅放行 http(s) 目标；首页 overlay 操作组同款接入；四语言 placeholder/按钮文案

- **色花堂列表页「全部已看过」空态**：hide ON 且本页条目全部被隐藏时（初始不渲染的整页已看，或运行时切换后渲染卡全为已看），网格区域呈现 eye-off 大插图 + 双行提示（「全部已看过 / 如需显示，请在菜单中关闭隐藏已阅」，四语言）；空态挂撤随 `updateHeaderInfo` 刷新——初始挂载 / AJAX 分页 / 菜单切换与运行时标记三处状态变更的汇合点，新未看卡到达或切回 hide OFF 即自动撤销；隐藏语义三态严格区分（初始隐藏=不渲染、运行时隐藏=`display:none`、运行时标记=只 dim 不隐藏不计入），空版块（grid 空且无隐藏事实）不误报；视觉全量 `--usl-*` 令牌（明暗双主题自适应 + reduced-motion 守卫），`role="status"` 供读屏播报
- **色花堂风控页（年龄门）识别与重建**：任意路径可返回的风控文档（`.localref/风控校验.html` 形态：`div.domain` 大字标题 + 双语 `a.enter-btn` 进入按钮 + 警告块）不再以原生白底样式裸奔——主入口以 DOM 双标记检测（`div.domain` + `a.enter-btn[href]` 双 AND；URL 判型对它失效，故优先级最高，帖子页静默记录也让位），重建为主题化 overlay 面板（域名大字 / 主+次进入按钮 / 警告块，`--usl-*` 令牌明暗双主题）；**进入按钮点击委托回原 DOM 按钮**——站点 JS 把 `.enter-btn` click 绑定为「写 safeid cookie + 重载当前页」，是通过风控的唯一途径，绝不复刻 cookie 逻辑（原元素缺失才退化 href 导航）；命中早期入口 matches 的路径直接接壳（与列表/搜索/首页同款零 FOUC），其余路径经共享 `createOverlay` 自建；主入口 matches 扩为 4 域全路径通配（判型内化到 main，非托管页零副作用）
- **色花堂首页 overlay 重建**：首页（`/`、`/index.php`、`/forum.php` 无 `mod`）从原生 Discuz 分区表格改为现代 card grid——按「分区标题 + 子版块卡片」结构组织，站点全部分区（分区名从 DOM 动态提取，以站点实际分区为准）的所有子版块以同款 `umm-card` 视觉呈现；卡片显示今日新增徽标（`forum_new.gif` 二态判定）、主题/帖数、最后发表（外链版块透传「链接到外部地址」原文）；导航层纯读，不触已看库
- **色花堂搜索页 overlay 重建**：搜索结果（`search.php?mod=forum`）从原生 `<li class="pbw">` 列表改为现代 card grid——每条卡片呈现标题、回复/查看数（支持「N万」计数）、站点摘要位原文（隐藏提示或内容预览透传）、时间/作者；底部分页复用列表页 `buildPager` 组件（搜索页 `.pg` 结构与列表页同源，跳转模板由站点原 DOM 提供）；按需求**自动隐藏「所在版块」字段**（「求片问答悬赏区」「资源出售区」等与记录管理无关的分区噪音不再干扰阅读）
- **色花堂搜索页 dimmer 跨页打通**：搜索结果条目无磁力/详情子请求，dimmer 是唯一反馈；走 avId + TID 双键命中（与列表页 `collectThreadTrackKeys` 同款、字段语义对齐）——列表页写入的记录，搜索结果中能立即看到淡化（单向：搜索页只读不落库）

### 修复与优化

- **版本源漂移修复（发布前阻断项）**：`wxt.config.ts` 的 `const VERSION` 常量此前停留在 5.15.1，与 `package.json` 的 5.16.0 不一致——构建产物 `manifest.json` 的 `version` 字段会写成 5.15.1，与 Release 标签错位（Chrome 扩展更新判定依赖 manifest version，属发布前必须清除的阻断项）。根因是 `scripts/package.js` 的同步逻辑匹配 `version: '<ver>'`（更早期 manifest 对象属性写法），而 `wxt.config.ts` 早已改写成 `const VERSION = '<ver>'` → 匹配失败后走 `console.warn(...skipping sync)` 分支**静默跳过**，因此 5.15.1 那次 bump 也实际未同步成功。修复：`wxt.config.ts` 与 `package-lock.json` 两处版本字段对齐 5.16.0；`scripts/package.js` 匹配模式改为 `const VERSION = '<ver>'` 并补充注释说明失配历史，恢复官方 `npm run package:*` 升级链可用（四处版本源：package.json / wxt.config.ts / package-lock.json 两个字段）
- **umreview 审查整改（无阻断项）**：清理两条死 CSS（`.umm-sht-search-actions` / `.umm-sht-home-actions`——搜索/首页 header 改 top center 簇后已无生产者，src/tests 全库零引用）；移除 `buildFloatbar` 的 `actions` 死参数（岛内动作移除后无调用方，签名与文档同步收敛为「舞台 → 轮替控件」）；`extractSearchKeyword` 空值语义修正（`kw=` 视为缺省并回退 `srchtxt`——`||` 而非 `??`，补回归用例）；`withDimBatch` 增 rAF 可用性兜底（非视觉宿主退化为宏任务；不抽取 rAF 函数引用调用，规避 Illegal invocation）；controls / app-search 头文档同步 top center 簇与岛组成实态
- **色花堂 dimmer 提速**：① **批量上色免过渡**——新增 `withDimBatch(grid, apply)`（controls.ts，可测）：批量落 `.umm-viewed` 时给网格挂 `.umm-sht-dim-batch`（CSS `transition: none`）、下一帧 rAF 撤销，几十张卡同帧落类不再各播「0.18s opacity + 0.22s 图片 filter」的长尾动画（**首屏 dim 观感慢的主因**），单卡（点击/复制）动效不受影响；② **过渡表统一**——原 `.umm-card.umm-viewed { transition: opacity 0.3s ease; }` 用 transition 短写**整条覆盖**基类过渡表（顺带杀死悬停位移/阴影动效，且明暗态切换时过渡表突变）；改为 opacity 并入基类过渡表并提速到 180ms，`.umm-viewed` 只保留 `opacity: 0.5`；③ **已看态图片 filter 过渡缩短** 0.5s → 0.22s（`blur(14px)`/grayscale 的 filter 插值是 dim 动画最贵的一段；揭示动效仍走 0.5s 基类）；④ 搜索页初检 dim 循环：已看集**一次性大写归一化**（免逐卡两侧 `toUpperCase` 分配）+ 跳过已 dim 卡（点击标记）；列表页 `applyWatchedClasses` 键判定内联（免逐卡临时数组）；⑤ 统计刷新节流 250ms → **120ms**（点击 dim 后「本页已看」数字跟手）
- **色花堂灵动岛切换定位/边距修复**：① 岛 `overflow-x: auto` 会把 `overflow-y` 隐式提升为 `auto`（CSS Overflow 规范：一轴非 visible/clip 时另一轴的 visible 计算为 auto）→ 岛被变成**双向滚动容器**，摩天轮上下滚动的两舱被裁切并触发滚动条（「切换后上下边距出问题」的根因）；改 **`overflow-x: clip`**（clip 不触发另一轴提升）——纵向溢出不裁切，横向裁切仅作兜底、不引入滚动条；② 隐藏舱原以 `left:0; top:0` 锚定——绝对定位子项不受 `align-items/justify-content` 影响（贴左上角），且 `position: relative ↔ absolute` 不可动画 → 切换瞬间几何跳变（「定位不准确」的根因）；改 **`inset: 0` 铺满同一舱位 + 内部 flex 居中**，几何与激活舱完全一致、无跳位；③ 恢复岛水平内边距 `clamp(10px, 1.5vw, 14px)`（上一轮收紧过度导致舱内容贴边）
- **色花堂 dimmer 误触发修复**：仅 TID 且带磁力的卡片，点击标题跳转对应 tid 时不再直接进入 dim 待定态——`shouldDimOnNavigate` 现以「磁力在场一律不适用」为先（复制磁力才是自然落库路径）；适用面收窄为 ①仅 TID 且无磁力 ②有番号且详情已结束仍无磁力，回归测试锚定 TID+磁力 → 不触发（含详情已结束/未结束两变体）
- **色花堂 header 布局健壮化**：双行 header 全面换行友好化——行容器 `flex-wrap: wrap` + `min-width: 0`（长面包屑/长统计信息不再撑破）；`umm-header-info` 去 nowrap 并加字重 500（统计文本过细不再易读性受损）；多分区选项卡由纵向堆叠改为**单行横向滚动条**（`overflow-x: auto` + 细滚动条，分区再多也不抬高 sticky header 高度）；首页操作组同步允许换行，消除组件重叠与间距缺失
- **色花堂 overlay dark 色系调优（Radix 基准）**：dark 主题下高饱和蓝引发视觉刺痛，全量降饱和——`--usl-fill-primary` `#3a55ec`→`#3e63dd`（indigo-9，白字对比 5.21:1）；`--usl-accent` `#7e9bf9`→`#9ba8f0`（indigo-11 低饱和文本强调）；次级/弱化文本分别提亮至 `#a9b4c6`（raised 面上 ≈7.3:1，治「文本过细过亮」的读感模糊）与 `#8b98ad`（≈5.2:1，恢复真实层级差）；明色主题不动，令牌与豆瓣 overlay 共享全局单源

- **底栏「灵动岛」遮挡修补**：列表页 `.umm-sht-shell--list` 加上 `padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px))`，网格最后一行卡片不再被底部分页悬浮栏压住（72 px = 浮岛高度 + 上下安全间距；safe-area-inset 兼容 iOS 底部手势区）；首页/搜索页无浮岛，不多留白
- **搜索页 tidKey 链路修复（umreview round 4）**：标题链接改取 `anchor.href` 属性（浏览器自动绝对化）——相对 URL 不再断链 `extractThreadTidFromUrl` 的 `new URL`，TID 双键与卡片锚点恢复；搜索结果字段语义与列表页 `SehuatangThread` 对齐（`tid` = `TID-<tid>` 键），`collectThreadTrackKeys` 直接消费，avId 条目不再丢失 TID 兜底键
- **首页构建健壮化（umreview round 4）**：图标态由提取层一次解出（`iconSrc`/`hasNew`），编排层零 DOM 重扫（消除选择器字符串拼接与 O(n) 全文档重扫）；构建过程 try/catch，异常时 `dismiss()` 还原原页；子版块链接/图标先相对解析再过 http(s) 白名单（相对 URL 不再静默失效）；`forum.php?gid=N`（分类聚合页）排除出首页判型；早期入口背景涂刷仅限 overlay 页（thread/`mod=user` 等非托管页视觉不再被改变）；入场级联抽共享 `runVisibleEntrance`（列表/首页/搜索三处复用）

## [5.15.1] - 2026-09-10

### 变更（内部重构）

- **环境统一到 Node 24 LTS**：新增 `.nvmrc` / `.node-version`（内容 `24`），`package.json` `engines` 收紧为 `>=24 <25` / `npm >=11`；CI（`ci.yml` / `release.yml`）改用 `actions/setup-node` 的 `node-version-file: '.nvmrc'`（版本单一事实源）；官方 actions 升到最新大版本（`checkout@v7` / `setup-node@v7` / `action-gh-release@v3`），消除 Node 20 弃用告警
- **依赖全面升级**：范围内依赖更新至最新（`vite` 8.2.2 / `vue` 3.5.42 / `vue-i18n` 11.4.10 / `vue-router` 5.3.1 / `vue-tsc` 3.3.11 / `@playwright/test` 1.63.0 / `reka-ui` 2.10.4 / `dompurify` 3.4.15 / `tsx` 4.23.13 / `sharp` 0.35.4 / `@types/chrome` 0.2.9）；`@types/node` 由 26.x 对齐到 **24.13.4**，与运行时 Node 24 一致（Node 24 引入的类型此前无法校验）
- **新语法 / 新 API 跟进**（运行时基线 = Chrome 119）：`tsconfig.target` ES2022 → **ES2024**；`handleAdultAvBatchAdd` 的手写 Map 累加分组改 **`Map.groupBy`**（派生与分组分离，`normalizeAvId` 只算一次）；`detail-loader` 与 PT `Semaphore` 的 deferred 改 **`Promise.withResolvers`**；3 处模板 ref 改用 Vue 3.5 **`useTemplateRef`**
- 暂缓项（已评估，非疏漏）：**TypeScript 7.0.2 不兼容** —— TS 7 为原生编译器，包 `exports` 不再暴露 `typescript/lib/tsc`，`vue-tsc` 直接报 `ERR_PACKAGE_PATH_NOT_EXPORTED`，故保持 `^6.0.3`；**`adm-zip` 上游无修复版本**（GHSA-vwc7-r8mq-g2x9，`latest` 0.6.0 即在受影响区间，npm 建议的「修复」是降级到 0.5.8），该包仅作 devDependency 用于 3 个本地脚本
- 文档：README / README.en 的环境要求更新为 Node 24 LTS + Chrome >= 119（原文 Chrome >= 88 已过时）；AGENTS.md 新增「环境」段（Node 24 强制原因、TS 7 暂缓、Chrome 119 运行时基线边界）
- 配置一致性：`wxt.config.ts` 的 Vite `build.target` 由 `es2022` 对齐到 **`es2024`**，与 `tsconfig.target` 恢复单一事实源（此前两者语义分裂；运行时 API `Map.groupBy` / `Promise.withResolvers` 不受 target 影响，实质边界由 `minimum_chrome_version` 决定）

## [5.15.0] - 2026-09-10

### 新增功能

- **色花堂 Shadow DOM overlay 重建（ADR-024）**：列表页改由 document_start 建壳 + document_idle 接管的双入口托管（`sehuatang-early.content` / `sehuatang-main.content`），独立于 legacy 注入管线；详情数据（封面/磁力）走独立 IndexedDB 缓存库 `umm-sehuatang-cache`（TTL 7 天 / LRU 500，可重建故不随备份），IntersectionObserver 懒加载 + 同 URL 归并 + 并发 4 / 8s 超时；首屏骨架卡 → 已看检查到达后单帧换真卡
- **色花堂列表体验重建**：面包屑/主题分类选项卡/返回/发新帖重建为双行头部，底部「灵动岛」窗口化分页悬浮栏（窗口化页码 + 跳转 + 计数器）；封面模糊遮罩悬停防抖揭示、卡片入场级联、复制反馈动效（均遵循系统减弱动态效果设置）
- **色花堂已看体系**：整页一次批量已看检查（消除逐卡消息）；磁力点击/一键复制统一标记路径（单次批量落库 + 失败逐条兜底 + 读回自检）；FC2 混排番号兼容提取（修复历史已看标记丢失），无番号帖子以 TID 键兜底获得完整已看/隐藏能力；「隐藏已看」开关跨页持久化；保存失败跨页诊断提示
- **色花堂帖子页静默记录**：访问帖子详情页自动记录已看——标题可提取番号 → 落番号表；提取失败 → TID 兜底落 `sehuatang_ids`；不建 overlay、不注入 UI
- **色花堂列表「点击跳转即淡化」**：仅提取到 TID、或详情子请求已结束但仍无磁力的条目（无「复制磁力」这条自然落库路径），点击标题/封面即**同步**加 dimmer——只做页面状态变更不落库，数据变更交给目的地帖子页的既有静默记录逻辑，避免冗余写入；会话内视觉标记对 `record:updated` 的全量重算免疫（否则会被其他卡片落库触发的重算抹掉），但 `record:deleted` 会让其失效（显式删除必须生效）
- **分离已看统计**：色花堂 overlay 头部以「日系已看 / 欧美已看 / 帖子已看」三段替代单一历史总阅（新消息 `ADULT_AV_STATS` 按表计数）
- **成人记录三表拆分（ADR-025）**：`jav_ids`（日系番号）/ `usav_ids`（美欧厂牌 `Studio.YY.MM.DD` 形态）/ `sehuatang_ids`（帖子浏览记录，`TID-<tid>` 键）物理分表，写入侧由分类器单点判定，三表互不冲突；主库 schema v14 仅建两张新表（存量混合键不搬迁，读侧三表合并永久兼容）
- **美/欧厂牌番号识别（us-av-id）**：`Studio.YY.MM.DD` 点分日期形态（含厂牌内部分段 `Blacked.Raw`）纳入提取，月/日合法校验（校验末两段）；日系优先、美系兜底、均无回退 TID
- **首帧主题背景预载**：document_start 早期脚本在首帧前涂刷主题表面背景并全程保鲜（含系统配色切换），消除主题跳变闪烁

### 修复与优化

- **成人记录历史/统计过滤**：TID 兜底键不再混入番号历史总阅与统计视图
- **dev 监视器崩溃根治**：agent 记忆目录写入触发 Vite EBUSY 崩溃，改经 WXT watchOptions 正确忽略（vite.server.watch 会被 WXT 覆盖）

### 变更（内部重构）

- **双键兜底已看判定**：列表卡片同时持有番号键与 TID 键，任一命中即 dimmer/隐藏——同一帖子「列表标题有番号、帖子页标题无番号」时兜底链不再失效
- 三表纳入备份/导出白名单（`BACKUP_STORES` 扩至 10 表），`sehuatang_ids` 为用户数据必须随备份
- 色花堂 overlay 样式收编为编译期 TS 常量（`src/content/sehuatang/styles.ts`），usl 变量表经 `uslVarsForHost()` 重宿主到 `:host`；legacy 侧的 `handlers/sehuatang.ts` 整体退役（原页面行结构不再被替换）
- 新增 Layer 3 overlay 令牌体系（COLOR_OVERLAY_* 常量 + --usl-* 双主题变量链），legacy UI 组件样式统一接入令牌链
- 豆瓣主题解析（resolveTheme/subscribeTheme）共享化，供非豆瓣入口复用
- **构建脚本收敛**：删除与 `dev:build` 重复的 `build:dev`，保留唯一的无热更新 Dev 编译入口 `npm run dev:build`（→ `dist/chrome-mv3-dev`，静态 manifest 注册 content scripts、无 dev 服务器依赖）；同步修正 README / README.en / .gitignore / wxt.config / fix-paths 中对已删脚本的引用
- **i18n**：新增 `Copy Magnet` 键（四语言，磁力按钮 tooltip 走 `t()`）；首帧 loading 副标题与浏览器语言解析补齐 `zh-Hant`（macOS/iOS 无地区后缀的繁体）——此前会误落到简体
- **缓存写入防御**：`SEHUATANG_CACHE_PUT` 增加批量上限（200 条，超限拒绝而非静默截断）、tid 长度上限与字段长度上限（8192，超长降级为 null）；内容侧对服务端拒绝响应记 `console.warn`，不再静默丢弃

### 测试

- 新增 6 个 spec（首轮）：sehuatang 控件/动效/提取/分页、成人记录 DB 层（fake-indexeddb 端到端）、全局样式令牌门禁
- 新增/扩展（overlay + 三表）：`adult-av-stats`（三段按表计数 + TID 残留过滤）、`adult-av-handlers`（CHECK 三表 L1/L2 + baseId 回退 + GET_ALL 两表合并与 TID 过滤）、`adult-av-batch`（分类分组三表写入）、`sehuatang-url`（帖子页判型 / TID 提取）、`sehuatang-extract`（双键 partition / resolveThreadWatchKey / collectThreadTrackKeys / shouldDimOnNavigate / 美系月日取舍锚点）、`sehuatang-cache`（TTL / LRU / 幂等）、`sehuatang-cache-handler`（写入校验上限与字段归一化）、`sehuatang-styles`（全段零 hex/函数式色彩/命名色通用守卫 + rgba 豁免登记）、`backup-stores`（10 表白名单）、`db-migration`（v13→v14 建表不搬迁）

## [5.14.3] - 2026-08-31

### 修复与优化

- **IMDb 状态误判**：未观看页面的 CTA 文案（"Mark as watched"）不再被当作已看；未评分不再因片名含数字被误读为评分；修复由此产生的误写已看记录
- **IMDb 状态 chip 布局**：chip 改插到标题元信息行之后，不再打断标题区排版
- **IMDb 动态状态同步**：观看按钮 / 用户评分水合或用户操作变化时自动重扫并同步 chip 与本地记录，消除「已看(本地)」残存

### 测试

- 新增 `imdb-scan.spec.ts` 9 用例与 `imdb-dynamic.spec.ts` 8 用例：离线快照等价夹具、CTA 排除、locale 无关评分门控、动态观察三通道与无关变更过滤

## [5.14.2] - 2026-08-31

### 新增功能

- **豆瓣搜索年份 chip**：从搜索标题尾部提取消除歧义的年份（半/全角括号，1800–2100 范围校验，缺字段防御），在封面正下方居中渲染为独立 chip 并采用等宽数字——长标题两行省略时年份不再被截断；meta 元数据行字号降至 xs 档

### 测试

- 新增 `title-year.spec.ts` 11 用例：半/全角括号、括号内空格、标题中段年份保留、非年份括号、越界年份、缺 title 防御等

## [5.14.1] - 2026-08-30

### 修复与优化

- **想看徽章与未看红色混淆（四轮定稿）**：CIEDE2000 色差实测一切暖色填充（amber/gold 全系）与红 none 只有 ΔE 30-41「相似多于相异」，暖色无解；想看徽章改为紫罗兰（浅色 violet-600→700 渐变 / 暗色纯 violet-700），与红拉开至 ΔE 42-43，白字对比 5.70/7.10:1 全达 AA
- **跨平台同步引擎收敛**：豆瓣保存委托统一引擎，不再覆盖 IMDb/TMDB 既有评分、已看目标跳过；修复仅新增跨站链接时豆瓣主记录不落库导致的双向链接不对称
- **TMDB 剧集外链错误**：想看记录指向 TMDB 的链接此前恒为 /movie/ 路径，剧集现正确生成 /tv/ 路径（与存储键类型段一致）
- **GET_ALL_RECORDS 响应契约补全**：消息契约补回 type/provider/providerId 字段，消除客户端硬断言

### 变更（内部重构 · 无用户可见行为变化）

- **消息响应契约类型化**：新增 ResponseMessageMap/SuccessDataMap 并接入客户端解析；MediaTypeId 四处内联联合收归 domain 单源
- **孤立代码与包体清理**：Utils 收窄至两方法（删除 13 个零引用导出）、删除 3 个废弃脚本与 3 个零引用 UI 组件、图标源图迁出 publicDir（包体 −29%）
- **设计令牌纪律**：金色文字三档统一 gold-text 令牌；删除死 token；ds:check 守卫硬化（整体剥注释 + 暗色徽章白字断言 + 渐变顶档对比锁定）

### 测试

- 新增 3 个回归/特征用例：仅链接变化时主记录落库、TMDB tv/movie 路径分流、豆瓣侧委托路径 rating 保留与 watched 跳过

### 文档

- 新增 typed 架构调研稿（含复核附注与执行偏差记录）；AGENTS.md 消息流同步为四处契约；README 移除已删脚本条目

## [5.14.0] - 2026-08-26

### 新增功能

- **三层设计令牌系统（ADR-018/019/020）**：Tier-1 原始色板（`tokens.static.css` 单一事实源）+ Tier-2 语义别名层（SPA `style.css` / 豆瓣 Shadow DOM `design-tokens.css` / legacy 注入 `global.ts`），`npm run ds:check` 强制 Tier-2 零裸色值（hex/rgb/hsl）+ 33 组 WCAG 对比断言（新增静态令牌解析与 `tokens.ts` spot-check）
- **暗色主题 macOS Vibrancy 风格（ADR-021）**：三级灰阶面板（#1c1c1e → #2c2c2e → #3a3a3c）、Apple 系统蓝文字级高亮（无实底填充）、白色透明度文字三档（95/72/58%）、island 毛玻璃、暗色去渐变去辉光
- **语义间距/字号流式统一（ADR-022 勘误版）**：`search` / `genre` / `artists-overview` / `game-explore` 四页接入 `breakpoints` 断点层，全站 32 页共享同一 clamp 流式 + 14 档断点尺度（320→5120px）
- **图标按钮组件**：新增 `shared/ui/icon-button` 可复用原语（含变体/尺寸/loading 态）
- **年度统计**：按年聚合各平台记录数（相对峰值年百分比 + 跨年空档补零），配套单元测试

### 修复与优化

- **豆瓣详情页标记弹窗无法显示**：`.umm-mount` 入场动画残留 transform（fill-mode both）使 fixed 弹层以滚动容器为包含块、`top:50%` 落到内容深处——keyframe 改纯 opacity 淡入，弹窗恢复视口精确居中
- **豆瓣重构页 header 盖住弹窗**：`.umm-layout-content` 的 `z-index:0` 创建 stacking context 把内部弹层锁死在 header（z:50）之下——移除 cap 后弹层正确浮于 header 之上；同步修正首页三页 `.umm-top-panel` 层级（z:300→0）避免滚动时覆盖 sticky header
- **NeoDB 等站点 toast 黑字**：宿主页面 `p`/`strong` 元素规则会直接给 toast 内部文字着色（继承链被截断）——内部文字显式 `color:inherit`；同步 toast 字色接入主题墨色 token（`--usl-ink-on-fill`）、字体族改为 `inherit` 跟随页面
- **暗色主题生效策略修正**：新增 `@custom-variant dark (&:where(.dark, .dark *))`，`umm:dark:*` 工具类由默认的 `prefers-color-scheme` 媒体查询改为 `.dark` 类驱动（与主题 store `root.classList` 切换一致）
- 移除 7 个孤立 `_END_DARK` 常量与死 `--umm-accent-page` token；修正 DESIGN_GUIDE 若干漂移（33 组断言、Dark 列、损坏列表等）

### 测试

- 新增 `yearly-statistics.spec`（7 用例：上一日开始/跨年空档补零/同年累积/峰值百分比/非法时间戳跳过/空数据）
- 新增视觉探针工具链：`probe:spa` / `probe:douban`（Playwright 截图 + 计算样式断言）与豆瓣渲染 fixture 生成器

### 文档

- 新增 5 份 ADR：ADR-018（三层设计令牌）、ADR-019（M3 色彩角色）、ADR-020（on-color 对比对）、ADR-021（macOS Vibrancy 暗色）、ADR-022（语义间距统一，含初版勘误与 `git grep -E` 教训）

## [5.13.2] - 2026-08-22

### 变更（内部重构 · 无用户可见行为变化）

- **设置存储迁移至类型化 item 层（ADR-017）**：新增 `features/settings/items.ts`——15 项设置各自成为带 fallback 与版本化迁移钩子的类型化 item，物理键不变（存量数据零迁移）、默认值单源化、单次批量读取取代 `storage.local.get(null)` 全库扫描；写入保持单调用原子语义；settingsCache 公共 API 不变
- **消息协议契约单源化**：`MessageType`/`MessagePayloadMap`/`ToastType` 抽至 `types/messages.ts` 并引入 `RuntimeMessageEnvelope` 类型化信封，background switch 与发送端共用；`WEBDAV_TEST` 契约补全为 handler 实际支持的双方言超集（声明修正）
- **统计聚合纯函数化**：跨 store 统计与记录扁平化抽取至 `domain/record/statistics.ts`，以特征测试锁定（含平台维计数与 video 归一化契约）
- **孤立代码清理**：删除 4 个零引用转发 barrel（migration/neodb/webdav/stores 的 index.ts）、未接线的 `deleteDataset` 与零引用 `BannerItem`；`GET_MIGRATION_STATUS` 响应接线 `MigrationStatus` 契约类型

### 测试

- 新增 `settings-items.spec`（8 用例：legacy 键兼容往返、undefined 跳过、无 `$` 元数据污染、门面 API 保持、onChanged 合并+杂键排除）与 `statistics-characterization.spec`（7 用例）；修复两个测试文件的全局 chrome 泄漏（补 afterEach 恢复）

## [5.13.1] - 2026-08-21

### 修复与优化

- **PT 淡化器适配 HHClub 新版主题**：HHClub 弃用经典 `<table>` 布局改用 Tailwind div 行（`.torrent-table-sub-info`），旧行选择器匹配 0 行导致列表页淡化整体失效；行选择器改为双主题组合选择器（保留 table 分支兼容经典主题）；新主题行内无豆瓣/IMDb 链接或 data 属性，ID 匹配继续走详情页后台扫描（已启用）

### 测试

- 新增 `pt-sites-hhanclub.spec`（8 用例）：参考列表页 URL 命中精确配置、isListPage/isDetailPage 边界、双主题行选择 jsdom 实测、skipRowSelector 不误伤 div 行、详情链接提取归一化与 userdetails 跳过；RED→GREEN 回归证据（旧选择器下 2 failed / 6 passed）

## [5.13.0] - 2026-08-20

### 新增功能

- **WebDAV 备份纳入设置项（ADR-016）**：`__settings__` 虚拟 dataset 随备份上传（12 项非敏感设置：11 项偏好 + neodbToken），下载/恢复时经 `IMPORT_SETTINGS_KEYS` 白名单过滤（排除 WebDAV 凭证，防恶意服务器注入），换机后设置不再丢失；sync 路径保守跳过 settings（无主键不做双向合并）；向后兼容（旧客户端读新 meta 自动跳过，新客户端读旧 meta 不恢复 settings）
- **本地导出可选包含 WebDAV 凭证（ADR-016）**：`EXPORT_DATA` 支持 `{ includeWebDAVCredentials }` payload，选项页导出按钮旁新增开关（默认关），勾选时明文密码警告确认对话框；导入侧仍拒绝凭证键（安全门禁单向：可导出不可导入）
- **chrome.storage.session L1.5 三层缓存（ADR-014）**：新增 `features/cache/session-cache.ts`——SW wake 后 settings 快照（~400B）与 watched ids 集合（~280KB）从 session 秒恢复，跳过 `storage.local.get(null)` 全量扫描与 IndexedDB status 索引扫描；写入时同步失效 session；旧版 Chrome（无 session API）优雅降级为 no-op
- **Dev 编译模式（`npm run build:dev`）**：与生产 build 并存——扩展显示名自动追加 `(DEV)` 标记、version 自动附加时间戳第 4 段（`5.12.0.HHMM`，同一天内自动递增）、`version_name` 字段携带完整时间戳（`5.12.0-dev.YYYYMMDD.HHMM`）；产物输出到独立目录 `dist-dev/chrome-mv3-dev`，不干扰生产 build；`npm run dev` serve 模式也带 `(DEV)` 标记

### 修复与优化

- **detail 页跨平台同步链批量化（ADR-015）**：`onCrossPlatformSave` 单次保存 dbGet 消息往返 8→4（3 路并行替代串行），douban key 写入 2→1（写合并），移除末尾 reload；`syncToNeoDB` 改为接收 `NeoDBSyncCtx`（调用方预读记录传入），函数内部 dbGet 3→0；所有更新改为不可变对象构造（值对象范式）
- **detail 页已看记录跨平台 ID 关联修复**：`syncNeoDBOnLoad` 分离本地 `neodb_records` 记录创建与 NeoDB API 推送——禁用 `autoSyncNeoDB` 时本地记录仍正确创建/更新（仅 API 推送受门控）；App.vue linkedIds reconciliation 移除 `if (platform === 'neodb') continue` 跳过，新发现的 NeoDB 链接自动创建本地记录（URL 经 `UrlResolverBuilder.buildNeoDBUrl()` 构造，处理 music→album 与 TV 前缀）；`syncNeoDBOnLoad` 的本地记录恢复路径（已有 NeoDB ID 但缺本地记录时）也能触发 NeoDB 按钮注入
- **detail 页轮询改事件驱动（ADR-015）**：移除 3s `intervalWhenVisible(loadRecord)` 轮询，改订阅 `EVENT_BUS record:updated`（含 `key: '*'` bulk 事件，导入/WebDAV 恢复后页面自动刷新）；空闲时零消息往返
- **jszip → fflate 迁移**：`zip-utils.ts` 压缩库替换（fflate 零依赖 ~8KB vs jszip ~100KB + pako polyfill 链，移除 14 个传递依赖），异步非阻塞（原生 CompressionStream），压缩炸弹防御（50MiB/10 万条上限）保持不变
- **dompurify range 提升**：`^3.4.12` → `^3.4.13`（修复 3.4.4 引入的 selectedcontent XSS 绕过，npm audit 盲区，防 lockfile 回退）
- **9 项 patch/minor 依赖 range 提升**：pinia 4.0.3 / reka-ui 2.10.3 / vue 3.5.41 / vue-tsc 3.3.10 / vite 8.2.1 / wxt 0.21.4 / tsx 4.23.12 / @types/chrome 0.2.6 / @types/node 26.2.0；@types/jsdom 28→30（major 对齐 jsdom 30）
- **youtube/bilibili 内容脚本 timer 清理**：SPA 轮询 `setInterval` 配对 `pagehide`（`{ once: true }`）清理，消除 bfcache 孤儿 timer（与 useHomepageObserver/mteam/video-progress-tracker 清理纪律对齐）
- **bangumi handler catch 收窄**：最后一处 untyped catch 改为 `catch (error: unknown)`（全仓库 untyped catch 归零）

### 测试

- 新增 `cross-platform-save-bulk.spec`（4 用例）：ADR-015 行为锁定——单读单写契约、链接未变零多余往返、`#info` 新链接并行读+跨平台写、GET_SETTINGS 门控恰 1 次
- 新增 `session-cache.spec` / `settings-session-snapshot.spec`（session 层 round-trip / 前缀删除 / 降级 / 异常吞噬）
- 新增 `zip-utils-boundaries.spec`（空数据集 / 超 50MiB 拒绝 / 非 ZIP 拒绝 / 缺 data.json / 超记录数 / UTF-8 中文 emoji 保真 / 大记录）
- 新增 `webdav-settings-backup.spec`（collectBackupSettings 白名单排除凭证 / 12 键完整 / hash 确定性）

### 文档

- 新增 5 份 ADR：ADR-012（chrome.offscreen 评估：部分推荐）、ADR-013（chrome.sidePanel 评估：共存模式部分推荐）、ADR-014（storage.session 三层缓存）、ADR-015（detail 页 dbGet 批量化）、ADR-016（备份+WebDAV settings 脱节修复）——均 Proposed 状态待评审
- AGENTS.md 同步：版本号 5.12.0、Douban 页面数 32、平台列表补 Bangumi

## [5.12.0] - 2026-08-15

### 新增功能

- **豆瓣影人作品页深度适配**：新增 `personage-creations` 页面类型（`/personage/{id}/creations`），UMM overlay 统一渲染全部作品——卡片式列表（海报/标题/年份/角色/导演/主演/10 分制评分），记录状态徽标（想看/在看/看过），排序切换（时间/标记/评价），类型标签（影视/图书/音乐）与分页导航
- **角色筛选持久设计**：演员/出镜/配音筛选按钮为固有常量（不依赖原生 `#role_filter` 下拉——该下拉在不同排序/角色变体下渲染不一致甚至缺失），激活状态由 URL `role` 参数驱动，选项 URL 保留当前排序/类型参数
- **解析鲁棒性**：作品列表用全局 `.creation` 选择器兼容平坦/分组两种布局并去重；标题从 h1 提取、缺失时以 `document.title` 兜底；评分由 `allstar` 星级类换算 10 分制（`allstar35`→7.0），未评分不显示

### 修复与优化

- **豆瓣影人页 URL 判型边界修正**：`isPersonagePage` 收紧为仅匹配 `/personage/{id}`（含可选尾部斜杠），`/personage/{id}/creations` 子页路由至新页面类型，不再误判为普通影人页

### 测试

- 新增 `personage-creations-extract.spec`（15 用例）：5 个 URL 变体（time/vote 排序 × 全部/演员/出镜/配音）+ 原生 `#role_filter` 完全缺失的持久设计回归锚点 + 分组布局 + title 兜底 + 评分换算 + 记录状态徽标映射（1=想看/2=看过/3=在看）+ 非 creations 页面判空；`url-detector.spec` 补 4 个 creations 变体用例；全量 702 单元测试通过

## [5.11.5] - 2026-08-15

### 修复与优化

- **PT 站已看集合超时级联修复**：`getWatchedIds` 改用 `openKeyCursor`（纯主键游标，不再逐条反序列化整条记录），大库下毫秒级返回，消除 `DB_GET_WATCHED_IDS` 8 秒超时级联与 PT 淡化失效
- **DB_GET_WATCHED_IDS 故障隔离**：多 store 并行拉取，单个 store 失败不再丢弃其他 store 结果；DB API 对瞬时连接错误（SW 唤醒竞态、消息端口关闭）自动短退避重试；watched 查询内容侧预算提至 20 秒
- **PT Dimmer 初始扫描重试**：失败后 2s/4s 退避重试 3 次，静态页面不再永久失效；SPA 导航中途取消过期重试，避免双观察者泄漏
- **调度器超时诊断**：超时任务迟到结算的真实错误以 `task:late-settled` 信息性事件上报（不污染监控指标），超时消息附带 store 名
- **长任务超时修正**：导出/统计/全量拉取由 8 秒默认超时改为 60 秒（对齐导入与 WebDAV），不再中途误杀全库扫描
- **未捕获拒绝消除**：event-bus 广播与豆瓣照片页下载改为回调式 sendMessage，不再产生 "Could not establish connection" 未捕获错误
- **构建噪音消除**：禁用扩展页面的 modulepreload 标签，清除控制台 cross-world 预加载警告

### 测试

- 新增 `data-scheduler-timeout.spec`（3 用例：超时消息契约/真实错误上报与指标不双计/迟到成功缓存自愈）与 `database-api-retry.spec`（4 用例：重试成功/耗尽拒绝/语义错误不重试/context 失效不重试）；全量 683 单元测试通过

## [5.11.4] - 2026-08-10

### 修复与优化

- **豆瓣用户收藏页分页修复**：`parseDoubanPaginator` 改用 `a.href`（浏览器解析绝对 URL）替代 `a.getAttribute('href')`（原始相对值）。`usePaginator` 的 `isSafeDoubanUrl` 同源守卫因相对 `?start=N` URL 静默阻止导航，导致所有使用 `usePaginator` 的页面（user-media/user-celebrities/doulists/book-collect/music-collect/game-collect/book-authors）分页点击无反应

### 测试

- **分页器解析契约更新**：`parse-douban-paginator.spec.ts`/`parse-douban-paginator-detail.spec.ts`/`douban-extract-families.spec.ts` 期望值从相对 URL 改为绝对 URL，锁定 `a.href` 行为

## [5.11.3] - 2026-08-10

### 修复与优化

- **豆瓣 profile 页面 statbar 样式修复**：清理提交 708b658 误删了 user-profile/book-profile/movie-profile CSS 中的非 scoped statbar 样式（Vue scoped CSS 因 cssInjectionMode:manual 不注入 Shadow DOM），导致 statbar 完全无样式。新建共享 statbar.css 安全兜底文件，注入 4 个 profile 页面
- **Statbar 视觉重新设计**：卡片式→胶囊式（inline-flex, border-radius: 999px），更紧凑圆润，匹配页面 doulist 胶囊设计语言
- **双主题适配修复**：`--umm-accent`/`--umm-accent-soft` 未定义变量→统一改为 `--umm-brand-accent`/`--umm-brand-accent-soft`（design-tokens 中 light: `#4f6ef7`/`#e0e7ff`，dark: `#6e8aff`/`#312e81`），light/dark 均正确切换

## [5.11.2] - 2026-08-08

### 文档与描述修正

- **README 支持站点描述修正（中/英）**：Mukaku 更正为 BT 站点（原误标为成人辅助扫描）——独立 BT 站点行、移出成人分类、功能表 PT/BT 淡化合并描述；PT 站点列表补全全部 17 站（原以「等」省略）；英文版影视行补 bilibili.com/youtube.com 漏项
- **简洁英文注释补充（12 处/9 文件）**：Identity YouTube fromUrl 已知限制（canonicalizeUrl 剥离 query 致 v= 分支不可达）与 personage→movie 映射；url-detector 判型顺序契约（子页须先于 detail）；PT dimmer movie:: 前缀剥离/slice(7)/类型无关缓存匹配/query-param 兜底；sehuatang AVID_REGEX 语法；db.ts ALLOWED_DB_STORES 安全边界；webdav 孤儿 JSDoc 归位；RecordService recordVersion 乐观锁语义

### 清理

- **.gitignore 补全**：pnpm-lock.yaml/yarn.lock/bun.lock(b) 锁文件、*.code-workspace、.history/（目录级优先）；验证 0 未忽略未跟踪文件
- **测试产物清洁**：test-results 遗留报告清除（724K，可再生产物）
- **过时测试审计**：48 个既有 spec 逐项验证 import 与符号——全部有效，无过时测试

### 安全

- **npm audit 修复 2 项 → 0 vulnerabilities**：dompurify 3.4.12→3.4.13（IN_PLACE hook 移除致脱离子树可执行，GHSA-55q2-fjhq-7xh7）；nanoid 3.3.16→3.3.18（自定义生成器 size=0 无限循环，GHSA-2v37-7h3g-55p8，postcss 传递依赖）
- **全库五轴代码审查**（正确性/可读性/架构/安全/性能）：27 条发现分级——2 Critical（download.ts 下载 URL 无 origin 校验、mukaku 故障冷却表超限全量清除）待决策修复；13 Important / 12 Suggestion 已记录

### 测试

- 新增 **url-detector.spec（45 用例）**：33 页面类型判型 + 子页优先顺序契约 + mediaType 推断（此前 0 覆盖）
- 新增 **adult-av-models.spec（14 用例）**：normalizeAvId/extractBaseId 键规范化（javdb/sehuatang/background 三处复用，此前仅 1 条间接断言）
- 新增 **data-scheduler-semantics.spec（5 用例）**：缓存命中短路/执行后写缓存/invalidateCache 强制重跑/HIGH 优先/队列满拒绝
- 全量 **676 单元测试通过**（+64）

## [5.11.1] - 2026-08-08

### 修复与优化

- **挂载链重复读取消除**：豆瓣详情页 onMounted 同 key `DB_GET` 4 次→1 次（auto-save / linkedIds 对账 / NeoDB 注入共用单次读取 + 写后同步内存值），省 2 次消息往返
- **i18n 状态文案统一**：legacy 内容脚本 '✅ 已玩' → '玩过'（与 shared/status-labels.ts Decision-1 对齐），zh-CN/HK/TW 6 处
- **v13 迁移写路径防护**：jav_ids 拷贝与 video 键规范化的 `put/delete` 补 onerror+preventDefault（与读路径对称）；键迁移先写新键成功再删旧键，写失败保留旧键防数据丢失
- **DB_QUERY/DB_COUNT 死链路删除**：消息类型/switch/handler/客户端包装/MediaDatabase.query() 整链无发送方，全部移除
- **create-overlay 空哨兵修复**：`null as unknown as HTMLElement` 守卫删除（document_start 保证 documentElement 存在）
- **doulist-tabs 笔误修复**：CSS 定义 `.umm-doulist-tabs`（单 s）与模板 `.umm-doulists-tabs`（多 s）不一致导致容器样式永不生效——统一为多 s 命名，tabs 容器样式恢复
- **繁体块简体字修复**：zh-HK/zh-TW locale 块的 game 状态文案 '玩过' → '玩過'（繁体），简体块保留；i18n 完整性检查通过
- **调试日志清理**：doulist-api.ts 移除 3 处 API 响应原文 console.log（含豆列名称个人数据）；仅保留失败路径 warn 日志
- **迁移死 store 守卫**：migrate v8 块加 `oldVersion >= 6 && oldVersion < 8`——全新安装不再创建 legacy sehuatang_avids 死 store（对齐 L8 sync_logs 决策）

### 架构重构

- **models.ts 拆分（921L→638L）**：v6→v13 全部迁移逻辑抽至 `features/database/migrate.ts`（283L），`migrateSchema(db, oldVersion, request, deps)` 经依赖注入破 import 环；init() 缩为薄壳；db-migration 特征测试锁定
- **collect 家族提取收敛**：book/music/user-media 三页消费者迁移到既有 `extractCollectPageShell`（-376 行内联重复），user-media 的 `|` 过滤在调用处保留
- **statusLabelKey 单一权威**：`utils/dom.ts` 与 `bangumi-list-extract.ts` 同构闭包合并为共享纯函数
- **video-overlay 拆分（861L→574L）**：样式模板 → video-overlay-styles.ts（128L）、进度追踪 → video-progress-tracker.ts（175L）
- **doulist-replace 拆分（702L→455L）**：API 客户端 → doulist-api.ts、主题令牌 → doulist-theme.ts
- **mukaku 去重**：watched-id 刷新逻辑（epoch 守卫 + 30s TTL）抽 `refreshWatchedIdSets()`，消除详情页/列表页逐字重复
- **RecordService 活规则直接测试**：删除死影子 `decideNeoDBTargetSync`/`mergeTargetLinkedIds`（340L 特征测试锁死实现），新增 record-service-sync.spec（11 用例）直接锁定 create/update/keep-rating/skip 规则
- **分页解析富契约**：`parseDoubanPaginatorDetail`（currentPage/totalPages/data-total-page + 排序 + thispage 插入）在薄版之上扩展，doulist-detail/series/game-collect 三处手写解析迁移（-125 行）；薄版 5 消费者契约零破坏
- **UmmPageLinks 链接型分页组件**：book-reviews/user-reviews（逐字节重复对）+ doulist-detail/series 四页模板替换（-30 行）；外层 v-if 差异保留各页
- **collectTitleLabel 共享纯函数**：user-media/book/music/game-collect 四页 titleLabel computed 收敛（game 页 `'do'` key 参数化，-32 行）
- **CSS 死选择器删除（-654 行）**：userbar 四副本（doulists/user-reviews/user-celebrities/user-media，190L）、statbar 三副本（book-profile 逐字节副本 + user-profile 旧手写 + movie-profile 冲突版，187L）、paginator 死别名 28L、detail/homepage/artists-overview/following 等 15 处；`umm-rec-title` 等 3 处审计误报经核实保留
- **review-detail 合并（-160 行）**：book-review-detail.css 174L→14L（仅 accent 覆盖），preset 复用 review-detail chunk（shared→page 注入顺序核实）
- **设计令牌收敛（-77 行）**：22 个 design-tokens 死变量 + 5 个 :host 死变量删除（z-index 存活变量实测保留）；`--umm-brand-accent` 单一来源（7 文件 accent 收口 + game-explore 10 兜底）

### 清理

- 删除 19 个全库 0 引用死符号（database/api ×7、neodb/api ×9 含连锁 getWorkDetail、overlay theme ×2、extractBannerItems、storeNameForPlatform）+ 死类型 + getRequest 助手
- shared/theme-sync.ts 整文件（0 导入者 compat 壳）删除
- .gitignore 去重（289→180 行）+ `.localref/` 忽略恢复 + `.playwright/` 补齐；test-results 产物清洁

### 安全

- 变更面安全审计（STRIDE/信任边界/XSS/注入/SSRF）：**0 EXPLOITABLE**；migrate 三路径（0→13/7→13/8→13）推演无数据丢失；npm audit 2 项（dompurify moderate/nanoid high）均不可达

### 测试

- 新增 Identity.spec（30 用例）：400L 跨平台 URL 解析器首个特征锁定（fromUrl 全平台/canonicalizeUrl/buildCanonicalUrl/storeKey/equals）；**锁定 YouTube fromUrl 已知限制**（canonicalizeUrl 剥 query 破坏 ?v= 参数）；发现 `Identity.isLinkedTo` 生产 0 调用者（死方法候选）
- 新增 parse-douban-paginator-detail.spec（7 用例）、collect-title-label.spec（7 用例）、status-label-key.spec（10 用例）
- 全量 612 单元测试通过

## [5.11.0] - 2026-08-07

### 新增功能

- **mukaku 缓存策略重构（失败永不缓存 + 实时判定）**：探测失败（网络错误/超时/非 200/响应不可用）一律不写内存、IDB、会话冷却，卡片 30s 失败冷却后自动重试；映射缓存（mvId → douban/imdb id）仅在成功获取且 ≥1 个有效 id 时持久化（shouldPersistProbe 门控），确认无关联仅存页面会话冷却（导航即失效）；dimmer 判定改为「映射 → 实时查询本地 douban/imdb 已看记录」，移除 mvId 级已看/未看判定缓存（历史键启动时自动清理）——用户标记/取消记录后 ~1s 内淡入淡出
- **mukaku 搜索页淡化支持**：站点搜索卡片为无链接 div（mvId 仅存在于 Vue 组件状态），新增 getVideoList 列表 API 按图片文件名匹配整页关联映射（一次请求免逐卡探测）；卡片提取增强支持 `to` 属性与后代链接（首页/分类页 `<a to>` 形态）

### 修复与优化

- **watchedIdCache 写回竞态修复**：epoch 代数守卫——记录事件失效缓存后，进行中的扫描不再复活旧缓存（列表页 + 详情页双处），新记录即时反映
- **DB 读取失败不再污染 30s 缓存**：降级空集继续扫描，但不写入缓存，下次扫描自动重查
- **探测失败重试语义（GOAL 1）**：失败卡片清除 processed 标记 + 30s per-card 冷却，可重新收集探测（此前失败卡片被标记永久跳过）
- **列表 API 失败冷却 per-key**（搜索词 A 失败不阻塞 B）；图片匹配 key 归一化（忽略 query/hash 后缀）；列表映射重复写守卫
- **日志分级规范**：debug 链路细节 / info 低频关键事件 / warn 可恢复失败 / error 异常降级

### 安全加固

- **解析层防御**：`IMDB_number`/`doub_id` 空串与纯空白 → null（杜绝 `'tt'` 伪映射持久化 7 天）；getVideoList 数组 2000 条上限；每扫描卡片 500 上限；会话冷却集合 2000 上限（敌意 API 响应 / 页面注入防护，安全审计 S1-S3）
- **失败路径审计确认**：所有探测失败路径（网络/超时/非 200/invalid payload）不触碰任何缓存（Code Review R1-R4 修复落地）

### 测试

- 新增 mukaku-api / mukaku-dom 测试文件：真实响应结构契约（错误信封→invalid、payload 不作数据源、空串→null、falsy 防御、列表解析、2000 条 cap、图片匹配 key 归一化）；全量 560 单元测试通过

## [5.10.0] - 2026-08-05

### 新增功能

- **PT 站点淡化实时化**：M-Team / NexusPHP 列表页订阅 record:updated/deleted 事件（300ms 防抖），标记记录后 ~1s 内淡化/恢复淡化，不再依赖 DOM 突变或等待 30s 缓存过期；事件后清除 resolved 标记重新评估
- **mukaku 站点淡化实时化 + 路由切换修复**：订阅事件总线（仅 douban/imdb 记录变化触发）；SPA 路由切换时 resetForPage 断开 observer、清空缓存，杜绝前页 data-umm-mukaku-processed / umm-dimmed 残留的"视觉停滞"；isProcessing 丢弃语义改为合并串行 runner；修复 MutationObserver 每次导航泄漏
- **豆瓣首页/音乐/读书/豆列详情徽章实时刷新**：useRecordCache 订阅 record:updated，其他标签页标记后徽章即时更新

### 修复与优化

- **数据链路实时性**：IMPORT_DATA / WebDAV 下载同步 / adult-av 批量写入 / 跨平台 linked 写入后立即失效 scheduler L1 缓存并广播（key:'*' bulk 语义），消除 5-10s TTL 窗口内的陈旧读取（含缓存 null 误判）
- **状态门控修正**：getWatchedIds 仅返回 status=2（已看），doing(3)/wishlist(1) 不再触发淡化（isWatchedStatus 谓词，符合 #2110）
- **getWatchedIds 性能**：全表游标扫描改为 status 索引双游标（numeric 2 + legacy 'done'），O(N)→O(watched)；characterization 测试锁定新旧输出等价
- **mukaku 批量性能**：每卡串行 DB 探测改为单次 dbGetBulk 预填；watched ID 双消息改为单消息双 store；批量已看集 Set 化（includes→has）；每卡 ttl_cache 读改写改为周期末 2 次落库（每周期消息数 N×3 → 6）
- **mukaku 探测并发修复**：卡片循环不再逐卡 await 网络探测（曾使 RequestQueue maxConcurrent=10 形同虚设、实际并发仅 1），改为两阶段——先并行发起全部 needs-probe 请求、再统一处理结果；探测失败静默跳过不标记未看（防瞬时错误抑制淡化）；新增 RequestQueue 并发契约测试
- **PT 淡化性能**：ptcache-bulk 缓存 key 抖动修复（排序 URL 页面级 memo）；scanner 去除 bulk miss 后的冗余单查
- **整表扫描消除**：tmdb / bangumi / bilibili·youtube 推荐位 / 豆瓣首页等改为可见 ID 定向 dbGetBulk（保留空集回退）
- **adult-av 批量写入**：N+1（每项 get+put）改为单 batchGet + 单 batchPut

### 测试

- 新增 8 个测试文件 +87 用例：cache-invalidation / watched-status / pt-dimmer-refresh / mukaku-refresh / mukaku-processing / mukaku-resolve / mukaku-cache / pt-dimmer-cache-memo / nexusphp-rowmap / adult-av-batch / get-watched-ids-characterization（含 5000 记录规模等价性验证）；全量 515 单元测试通过

## [5.9.0] - 2026-08-05

### 新增功能

- **Bangumi 平台接入评分/关联管理**（options）：平台下拉新增 Bangumi；bgm.tv / bangumi.tv / chii.in subject URL 自动检测（autoDetectPlatform）+ 解析/查询/保存；纯数字 ID 规范键统一为 `tv::<id>`（与 Identity.fromUrl / 内容脚本一致，防同 subject 双键）；status=3（在看）标签 + 颜色映射

### 修复与优化

- **豆瓣搜索实时规范化恢复 + 防抖强化**：输入停顿 400ms 后应用完整规范化（"Mean.Streets.1973.CC" → "Mean Streets 1973"），新增 `normalizeSearchQueryLive`（完整规范化 + **尾部单空格保护**，不重蹈 f80913b 覆辙）；UmmDynamicIsland 防抖接线 + 光标恢复（nextTick + selectionStart）+ 搜索触发 flush 防抖（无竞态）+ 卸载清理
- **video-overlay 纯函数单一来源**：双副本 6 纯函数 + 3 组状态常量收敛到 video-overlay-pure.ts（import 别名 + re-export 保持导出面）；删除无引用死文件 video-overlay-styles.ts / video-overlay-tracker.ts
- **normalizeStoreRecordKey 去重**：webdav.ts 本地函数 + data.ts 内联三元收敛到 models.ts 单一导出
- **LD 格式 chip 颜色缺口**：media-formats 契约测试（新增 7 用例）抓到 FORMAT_COLORS 缺 LD 键 + media-chips.css 缺亮/暗色 .umm-chip-ld
- **UmmStatusBadge 双 union 冗余**：删除本地 UmmBadgeType，统一共享 MediaType

### 安全加固

- **CWE-532 凭据泄漏**：WebDAV 超时错误消息剥离 URL 内嵌 user:pass@（stripUrlCredentials）
- **CWE-409 压缩炸弹**：unpackageDataset 增加 50MiB blob + 100k 记录硬上限
- **CWE-915 注入属性保留 + 数组放行**：normalizeStoreRecord 边界硬化（非对象/数组拒绝 INVALID_RECORD、8 字段白名单剥离未知键、status/rating 越界回退中性值、linkedIds 非对象丢弃）

### 测试

- 新增 3 个测试文件 +32 用例：auto-detect（Bangumi URL 检测 + 全平台回归）/ media-formats（格式契约）/ normalize-record（导入边界安全契约）；全量 415 单元测试通过

### 文档

- ADR-009 补记：Decision-1（game done 统一 '玩过'）、collect 页标签统一（读过→已读 等）、FAMILY 1/2 提取函数保留决策（T14 测试锁定）

## [5.8.0] - 2026-08-04

### 新增平台

- **Bangumi 平台支持**（ADR-010）：详情页 umm-status 注入（复用 createDetailPageHandler + resolveIdentity 钩子）、列表页已看标记、Platform.KNOWN / Identity.fromUrl / STORE_NAMES.BANGUMI / DB_VERSION 12 全链路注册，零新增消息类型

### 架构优化（全面优化执行，ADR-009 后续）

- **DB v13 迁移**：bilibili/youtube store key 统一为 `movie::`（normalizeVideoKey，`video::`/裸键自动迁移）+ v8→v9 jav_ids 数据补拷贝（existing wins 防御）
- **DB_GET_BULK 批量读取消息**：三处契约同步，detail 推荐区从全库扫描 ~1MB → 仅 ~10 key 定向读取（~99% 消息体缩减）；mukaku 改 dbGetWatchedIds
- **batchPut 单事务多 key 版本化写入**：WebDAV 下载/同步/导入从逐条事务 → 每 store 1 事务；导入/同步任务 60s 超时（原 8s 误杀大库）
- **video-overlay 共享模块**（bilibili 837→167L / youtube 875→321L）：VideoProgressTracker/主题/模态/推荐位装饰参数化共享，写读改走类型化 Store 消息层
- **Douban 共享模块**：parse-douban-paginator / status-labels（game done 统一 '玩过'）/ detail-ui / record-cache-core / douban-extract（extractUserProfileInfo）/ media-formats
- **neodb sync 委托 RecordService**：128 行内联双实现收敛（fork (b) + status>0 门控防降级）
- **CSS 共享波**：5 页 paginator 变体并入共享文件 + accent token；修复 css-map.ts 缺失 paginator preset
- **死代码清理第二轮**（净删 ~1,900 行）：~40 符号 + types/messages.ts + shared barrel + skeleton-loader 组件 + dormant BILIBILI_* 消息链路
- **平台 SSOT 补齐**：storePlatformMap / Statistics / usePlatformMeta 补 bangumi + mukaku

### 备份与版本管理（ADR-011）

- **BACKUP_STORES 白名单**：jav_ids（javdb/sehuatang 成人记录）纳入 WebDAV 三路径备份（原仅 ZIP 导出包含）
- **数据集版本语义**：CURRENT_DATASET_VERSION + validateDatasetVersion（too old/too new 校验），ZIP 打包写真实版本
- **导入/恢复自动迁移**：handleImportData + WebDAV 下载/同步对每条记录跑 normalizeStoreRecord 逐级迁移 + normalizeVideoKey 键归一化

### Bug Fixes

- **P0：v13 迁移在 onupgradeneeded 内裸调 db.transaction() 抛 InvalidStateError**（W3C 规范）→ 升级事务 AbortError → DB 打不开 → 全面数据加载失败；改用 request.transaction（升级事务本体）+ 全部请求 onerror 补 preventDefault + try/catch 防砖库（fake-indexeddb 实证）
- **bilibili 首页/搜索徽章全灭**：bilibili-homepage 仍读 `video::` 键 → 改 storeKey()
- **DB_GET_BULK 缓存写后不失效**（5s 陈旧状态）：invalidateStoreCaches 补 `bulk:` 前缀精确失效
- **batchGet 读路径缺 normalizeStoreRecord**（与 get/getAll 对齐）
- **loadRecord 2s 兜底竞态**：晚到 DB 响应触发重绘，不再卡 '未看'；catch 补日志
- **neodb.read_text 键缺失**（en-US/zh-CN）：书籍页 done 检测失效 → 补全 4 语言块
- **waitForElement 超时整页静默失败**：工厂内 try/catch 优雅跳过注入
- **T12 门控收紧**：neodb 无本地记录时恢复 stub/关联目标创建，done-target skip 保留

### 统计

- popup 移除 bangumi 独立平台计数卡；bangumi 记录按类型（movie/tv/music/book/game）划分统计，与 douban 同机制

### Testing

- 新增 11 个测试文件：db-migration（fake-indexeddb）/ bulk-invalidation / backup-stores / dataset-version / video-overlay / parse-douban-paginator / migration-keys / status-labels / neodb-sync / detail-ui / record-cache / data-scheduler / pt-mteam（375+ 单元测试）

## [5.6.0] - 2026-08-02

### Architecture & Maintainability

- **死代码清理（净删 ~3,300 行）**：删除无调用者的 `MediaDatabase.syncPageRecord` / `getRecordVersion`、`RecordService` 死方法（bulkUpdateStatus/deduplicate/merge/getWatchedKeysAcrossStores）、死模块 memoizer/memory-manager/OptimisticLock/TtlCacheStore、不可达 legacy Douban handler 链（content.ts 已 excludeMatches 全部 Douban 域）、无发送方的 SEHUATANG_* 消息类型
- **跨平台 sync 收敛为单一实现**：`RecordService.syncRecord` 经 `IRecordRepository`（收窄为 findByKey/save）→ `mediaDB.put`（自带缓存失效）
- **去重合并**：`parseRating` ×6 副本 → `shared/douban-extract.ts`；collect 家族 7 页分页四件套 → `shared/composables/usePaginator.ts`；`errorMessage()` ×5 副本 → `utils/error-message.ts`；16 个页面 config retry 循环 → `shared/retry.ts` withRetry
- **新增共享模块**：retry.ts / usePaginator.ts / douban-extract.ts / cross-platform-links.ts（extractCrossPlatformLinks 自 legacy 迁移）

### TypeScript

- **Provider 类型派生自 `Platform.KNOWN`**（消除 config/domain 双平台清单漂移）；`STATUS` 字符串派生自 domain `Status.legacyString`；`MediaTypeId` 字面量联合
- **消息层全链路类型化**：`send<K extends MessageType>` 泛型、handler payload 类型化、`RuntimeMessage.type: MessageType` + payload 非可选 → 26 处 `message.payload!` 归零
- **77 处 untyped catch → `catch (e: unknown)`**，复用 errorMessage() 收窄

### Performance

- **PT 站 dimmer N+1 消除**（nexusphp.ts）：逐行 `ptIdCacheGet` → 单次 `ptIdCacheGetBulk`，并跳过 `data-umm-resolved` 行避免 MutationObserver 全表重扫
- **`handlePtIdCacheGetBulk` 单事务批量**：新增 `MediaDatabase.getCacheEntries()`，O(n) 串行事务 → O(1)
- **useHomepageObserver 容器引用清理**（DOM 已移除节点不再保留）

### Security

- **修复 3 个页面开放重定向防护缺失**（user-media / user-celebrities / doulists 的 onPageChange 缺少 `isSafeDoubanUrl` 同源校验，其余 collect 页均有）

### Modern Syntax

- 22 处内联 `new Promise(r => setTimeout(...))` → `sleep()`；12 处星标字符串循环 → `'★'.repeat()`（Math.max 保护负边界）；3 处拷贝排序 → `toSorted()`；`??=` / `== null` / `dateKey()` 共享工具

### Bug Fixes

- **豆瓣搜索输入框空格处理** (`src/content/douban/components/UmmDynamicIsland.vue`):
  - 输入时允许 1 个末尾空格（2+ 空格折叠为 1），左右空格去除延后到触发搜索时执行（`doSearch` → `normalizeSearchQuery` 已含 trim）
  - 新增 `collapseInputSpaces()`；移除每次击键的完整归一化回写与 `isNormalizing` 重入标志
- **PT 资源名特殊标记适配** (`src/utils/search-normalizer.ts`):
  - 新增 CC / Criterion Collection / RESTORED / THEATRICAL / DUBBED 前置标记剥离：`Mean.Streets.1973.CC.2160p.UHD.BluRay.x265.10bit.DV.FLAC.1.0-ADE` → `Mean Streets 1973`
  - 强标记截断列表新增 UHD / DV / HDR / HDR10 / IMAX 与音频标志（DTS/FLAC/DDP/AAC/AC3/Atmos/TrueHD）
  - 修复 `WEB-DL` 截断死正则（连字符预处理转空格后永不匹配，改为 `WEB.DL` 通配符适配空格形式）
  - strip 列表增加 CJK 负向前瞻守卫：`CC字幕` / `DC动画电影宇宙` 等中文短语不再被误剥离
  - UNCUT / DC 刻意排除：与真实标题碰撞（Uncut Gems、AC/DC、DC League of Super-Pets）

### Tests

- 新增 32 个测试（search-normalizer 本文件 64 个全过）：特殊标记剥离、真实标题碰撞回归、CJK 守卫、空格输入行为、幂等性
- 新增 `tests/unit/optimization-shared.spec.ts` 14 个测试：parseRating / isSafeDoubanUrl 守卫 / withRetry 重试时序 / dateKey 格式化
- 全量单元测试 164 个通过，`vue-tsc --noEmit` 零错误，`npm run build` 通过，`npm audit` 0 漏洞

## [5.5.0] - 2026-08-01

### Features

- **豆瓣评分 5分制 → 10分制 全链路适配** (`src/content/douban/shared/rating-scale.ts`):
  - 新增 `rating10ToDoubanStars`（10制→5星，UI 回填）/ `doubanStarsToRating10`（5星→10制，DB 写入）/ `shouldWriteRecord`（auto-save 守卫）
  - `Rating.fromStars()` 领域工厂: 5星制 ×2 转换为 0-10 制，校验 1-5/0.5 步进
  - 修复豆瓣详情页已看记录评分未正确存储与后续不更新的 bug（initialRating 反向转换 + auto-save 守卫放开 + 页面未评分不覆盖已有评分）
  - `src/utils/search-normalizer.ts` 复用评分转换（`doubanStarsToRating10` 委托领域层，消除重复）
- **搜索组件 IMDb 链接识别与提取** (`src/content/douban/shared/imdb-extract.ts`):
  - 从搜索结果 abstract/abstract_2/url 或顶层 imdb 字段提取 tt-xxx ID
  - 支持完整 URL / `IMDb: ttxxx` 标签（半角/全角冒号）/ 裸 tt-id
  - 搜索卡片显示 IMDb 徽章链接（点击跳转 imdb.com）

### Bug Fixes

- **PT 文件名 V2 版本标记剥离** (`src/utils/search-normalizer.ts`): `Wrinkles.2011.V2.1080p...` → `Wrinkles 2011`
  - 新增 `V\d+` 独立 token 剥离 + `-` 预处理转空格（修复 `2Audio-ADE` 残留）
  - CJK 连字符标题回归保护（`X-战警` → `X 战警`）
- **IMDb 链接搜索输入规范化**: `https://www.imdb.com/title/tt22084616/` → `tt22084616`
  - 在字符替换前提取 tt-id，避免 URL 被拆成垃圾 token
- **game-detail 页 HTML 消毒**: 对齐 detail 页，`extractMetaRows`/`extractSynopsis` 增加 DOMPurify.sanitize

### Security

- **IMPORT_DATA 设置白名单收紧** (`src/entrypoints/background/handlers/data.ts`):
  - import 白名单改为 `IMPORT_SETTINGS_KEYS = EXPORT_SETTINGS_KEYS`，排除 webdavUrl/webdavUsername/webdavPassword 凭据键
  - 修复恶意备份可重定向 WebDAV 同步导致数据外泄的漏洞（安全审计 #4a）
- **WebDAV 远程数据校验** (`src/entrypoints/background/handlers/webdav.ts`):
  - download/sync 双路径增加 `RECORD_STORES` 校验 + record 结构校验
  - 修复恶意 WebDAV 端点可向任意 store 写入的漏洞（安全审计 #4b）
- **经 5 成员安全审计团队验证**: 3 猎人 + 2 PoC 工程师，双轮独立验证，0 可利用漏洞

### Refactors

- **Vue 组件 defineModel 化**: Input / SegmentedControl / OptionPicker / UmmSearchFilter
- **TypeScript erasableSyntaxOnly 兼容**: 11 处 parameter properties 改写为显式字段声明（TS7 前置）
- **类型收紧**: catch-unknown 收窄、SendResponse `any`→`unknown`、`Record<string, any>`→`unknown`
- **UmmSearchCard 嵌套 `<a>` 修复**: IMDb 徽章重构为独立链接 + CSS 定位

### Build / Dependencies

- **Vite 8.2.0**（Rolldown 默认打包器）: `build.rollupOptions` → `build.rolldownOptions`
- **WXT 0.21.3**（ModuleRunner 重写）: 破坏性变更审计通过，无 url: imports 等阻塞项
- **Vue 3.5.40 / vue-router 5.2.0 / vue-i18n 11.4.8 / @vueuse 14.4.0** 等 18 依赖升级
- **TypeScript 6.0.3 保持**（官方稳妥路线，TS7 因 vue-tsc 不兼容暂缓）: tsconfig 启用 `erasableSyntaxOnly` + lib ES2024
- **修复 scripts/package.js + data-export.js 读取不存在 manifest.json 的打包崩溃**（改为读 wxt.config.ts/package.json）

### Tests

- 新增 16 个测试: 评分制式适配（8）、IMDb 提取（10）、import 白名单安全回归（3）、V2/IMDb URL/CJK 回归（5）
- 全量单元测试 125 个通过，`vue-tsc --noEmit` 零错误，`npm run build` 通过，`npm audit` 0 漏洞

## [5.4.1] - 2026-07-31

### Bug Fixes

- **豆瓣搜索规范化修复** (`src/utils/search-normalizer.ts`):
  - 季/集标记保留实际季数: `S03E1` / `S03.E01` / `S3E1` → `Season 3`（此前硬编码为 `Season 1`）
  - 新增强信号 release 标记截断（分辨率/来源/编码 token）: 无年份的 PT 文件名 `A.Knight.of.the.Seven.Kingdoms.S01.1080p.WEB-DL.DDP5.1.x265.10bit-Yumi@FRDS` → `A Knight of the Seven Kingdoms Season 1`
  - 移除年份截断（`slice` 到年份末尾会误删年份后的标题词），函数保持幂等，搜索页回填查询不再二次变换
  - **CJK 搜索词保护**: 截断点后含 CJK 字符时不截断（`4K修复版` / `大话西游 4K修复版` 等中文搜索词不再被清空）
  - 弱信号列表扩展: TRUHD/DUAL/MULTi/HYBRID（无分辨率标记伴随的音频/语言标志）
  - 回溯正则改 lazy 量化符（`\s+?`/`\s*?`），消除 O(n) 二次回溯

### Tests

- 新增 `tests/unit/search-normalizer.spec.ts`: 28 个用例（季标记/ release 截断/ CJK 保护/ 垃圾 token/ 幂等性）
- 验证: `vue-tsc --noEmit` 零错误，`npm run build` 通过，全量单元测试 86 个通过

## [5.4.0] - 2026-07-22

### Features

- **豆瓣音乐收藏页深度适配**: 新增 `music.douban.com/mine?status=*` / `music.douban.com/people/{uid}/collect|wish|do` 页面完整注入
  - 新页面类型 `music-collect` → `url-detector.ts` / `early.ts` / `hide-nav.ts` / `main.ts` / `css-composer.ts` / `css-map.ts`
  - Vue 覆盖层: 用户信息栏（头像/昵称/导航链接）、排序切换（时间/评价/标题）、专辑网格卡片（1:1 封面比例）、评分展示（豆瓣音乐 1-3 星 → 10 分制映射）、分页器
  - DOM 数据提取: 支持 `mine?status=*`（无 userId 路径）和 `people/{uid}/collect` 两种 URL 格式
  - 导航隐藏: 全局导航栏 + 音乐导航栏

- **豆瓣音乐个人主页深度适配**: 新增 `music.douban.com/people/{uid}/` 页面完整注入
  - 新页面类型 `music-profile` → `url-detector.ts` / `early.ts` / `hide-nav.ts` / `main.ts` / `css-composer.ts` / `css-map.ts`
  - Vue 覆盖层: Hero 头像区域、统计栏（听过/添加条目数）、最近听过专辑网格、喜欢的艺术家标签列表、音乐豆列列表
  - DOM 数据提取: 从 `.music-user-profile` 提取头像/用户名，`#db-music-mine` 提取专辑，`#musicians` 提取艺术家，`.aside .mod.doulist` 提取豆列

### Code Quality

- **代码审查修复**: 5 轴审查（正确性/可读性/架构/安全/性能），修复 1 个 Important + 4 个 Suggestion：
  - `music-profile-data.ts`: 空 `href` 守卫（专辑/艺术家/豆列条目）
  - `music-collect/App.vue`: `toRatingScore()` 公式修正（n=3 → "10.0"）
  - `music-profile/App.vue`: 参数重命名避免 shadowing

### Security

- **0 项安全漏洞**: 安全审计确认——所有 DOM 提取使用 `textContent`，URL 经 `startsWith('http')` 守卫 + `/subject/\d+/` 正则过滤后使用，无 innerHTML 渲染/无 eval/无硬编码密钥
- `npm audit`: 3 项已知漏洞（adm-zip/esbuild/shell-quote），均为 dev 依赖，无可用的修复版本，不影响生产

### Chores

- `.localref/` Windows Zone.Identifier 工件清理
- `test-results/` 过期 Playwright 报告清理（545KB）
- 测试验证: `vue-tsc --noEmit` 零错误, `npm run build` 通过
- Code review: 1 Important + 4 Suggestion 全部修复
- Assisted-by: DeepSeek V4 via OpenCode

- **豆瓣丛书系列页面深度适配**: 新增 `book.douban.com/series/{id}` 页面完整注入
  - 新页面类型 `series` → `url-detector.ts` / `early.ts` / `main.ts` / `css-composer.ts` / `css-map.ts`
  - Vue 覆盖层: 丛书标题/出版社/册数/简介、排序切换（收藏数/出版时间）、书籍列表含封面高清图（/s/→/l/）、评分展示、记录状态徽章（已读/想读/在读）、分页器
  - 书籍记录状态从 IndexedDB 异步加载（`loadRecordMap('book')`），每本书自动显示阅读状态
  - 排序按钮动态识别 `?order=time` URL 参数，无需依赖 DOM 文本解析
  - 跨页总数估算：有分页器时使用 `totalPages × itemsPerPage`

### Code Quality

- **Oracle 代码审查**: 5 轴审查（正确性/可读性/架构/安全/性能），修复 3 个 Critical 问题：
  - `totalCount` 从 `items.length`（仅当前页）改为分页器估算
  - `volumes` 提取从全页 `body.textContent` 扫描改为 `.clear-both` 精准定位
  - 简介提取从 `div[style*="margin-bottom:25px"]` 脆弱选择器改为 `h2:contains("简介")` 兄弟元素
- **注释精简**: App.vue 冗长 JSDoc 移除，data.ts 保留必要英文注释
- **formatCount 统一**: 移除不一致的 `k` 单位，统一使用中文 `万` + `toLocaleString`

### Security

- **0 项安全漏洞**: 安全审计确认——所有 DOM 提取使用 `textContent`（无 innerHTML），URL 经 `startsWith('http')` 守卫 + `/subject/\d+/` 正则过滤后使用，无 eval/innerHTML/Function 动态执行，无硬编码密钥，无 SSRF 向量

### Chores

- Version bump 5.3.0 → 5.4.0
- `.gitignore` 扩展: +82 行防御性条目（IDE/Fleet/Docker/DevContainer/Sass/Rollup/Sentry/Storybook/Cypress/Playwright 等）
- 测试环境清洁: 无残留测试进程，无过期测试产物，Playwright 浏览器二进制已忽略
- 测试验证: `vue-tsc --noEmit` 零错误, `npm run build` 通过
- Code review: 3 Critical + 2 Important + 1 Important + 4 Suggestion 全部修复，Oracle 安全审计通过
- Assisted-by: DeepSeek V4 via OpenCode

## [5.3.0] - 2026-07-22

### ⚠️ Dependency Upgrades

- **pinia** 3.0.4 → **4.0.2** (major): Added `@vue/devtools-api ^8.1.5` as explicit
  dependency (previously bundled). API-compatible — no breaking changes for consumers.
- **adm-zip** 0.5.18 → **0.6.0** (major): Security fix (CVE-2026-39244 — ZIP bomb
  memory exhaustion). Removed `@types/adm-zip` (types now bundled).
- **vue** 3.5.38 → 3.5.40, **vue-router** 5.1.0 → 5.2.0, **vite** 8.1.4 → 8.1.5,
  **@vitejs/plugin-vue** 6.0.7 → 6.0.8, **tailwindcss** 4.3.2 → 4.3.3,
  **@tailwindcss/vite** 4.3.2 → 4.3.3, **vue-i18n** 11.4.6 → 11.4.7, **tsx** 4.23.0 → 4.23.1

### Performance

- **Page Visibility API**: New `intervalWhenVisible()` utility pauses polling
  when the tab is hidden. Applied to 5 key timers: router SPA poll (1s),
  detail/game-detail record refresh (3s each), TMDB card scan (2s), YouTube
  URL watch (3s). Eliminates unnecessary CPU work in background tabs.
- **background.ts switch splitting**: Extracted 400-line `handleMessage()` switch
  into 3 dedicated handler modules (`db.ts`, `bilibili.ts`, `download.ts`).
  Reduces background.ts by ~246 lines, improves single-responsibility.
- **Router log cleanup**: 11 `console.log` calls migrated to runtime-gated
  `infoLog`/`errorLog` — silently disabled in production builds.
- **Dead code removal**: Deleted `useBadge.ts`, `IIdentityRepository.ts`,
  `IdentityFactory.ts`.
- **Throttle/debounce consolidation**: Unified 3 duplicate `throttle` and 5 inline
  `debounce` implementations into shared `@/utils` exports.

### Fixes

- **SEHUATANG_ADD**: Wrapped in DataScheduler to respect rate limits and retry
  policy (was bypassing the queue).
- **BILIBILI_SAVE**: Added `broadcast('record:updated')` so content scripts
  receive real-time updates when a Bilibili record changes.
- **visibility.ts `paused` not checked**: `intervalWhenVisible.tick()` now
  consults the `paused` flag — programmatic `pause()`/`resume()` actually works.

### Maintenance

- Updated `.gitignore` with script runtime artifacts and snapshot diff patterns.
- Removed unused `@types/adm-zip` dependency.
- Added TypeScript 7 compatibility assessment: blocked by vue-tsc
  `require.resolve('typescript/lib/tsc')` — pending upstream Volar update.

## [5.2.3] - 2026-07-22

### Fixes

- **Douban detail page data sync**: Auto-save records to IndexedDB when the
  Douban API confirms a watched/wishlist status but the legacy DOM-based scan
  fails (missing `form[action="remove"]` for no-rating entries) — closes a gap
  where API-detected statuses never entered the local DB
- **Cross-platform linkedIds reconciliation**: On every page load, extract
  IMDb/TMDB IDs from the current DOM and merge any new ones into the stored
  record. Automatically creates the corresponding platform store entries
  (`imdb_records`, `tmdb_records`) for newly detected associations
- **NeoDB "Open" button**: `neoDBInjector` now loads the actual DB record
  instead of using a stale closure variable or `null` — the "Open in NeoDB"
  button reliably appears when `linkedIds.neodb` exists
- **Rating dialog 403 guard**: `fetchInterest()` no longer unconditionally
  clears initial status/rating on 403/302/301 responses — preserves valid
  values loaded from IndexedDB or DOM detection

### Performance

- **DB_GET_ALL cache invalidation**: Added `all:{store}` cache invalidation
  to `DB_PUT`, `DB_DELETE`, and `DB_SYNC_PAGE_RECORD` handlers — content
  scripts using `Store.dbGetAll()` no longer receive stale data for up to
  5 seconds after a write

### Security

- No new vulnerabilities introduced; all changes operate within the existing
  content script ↔ Service Worker message-passing boundary
- Inputs are DOM-extracted content-script data serialized through structured
  clone — no injection surface

### Chores

- Version bump 5.2.2 → 5.2.3
- `.gitignore` expanded: runtime/daemon artifacts (`nohup.out`, `*.pid`),
  Playwright browser binaries, Yarn Berry state, macOS resource forks
- Code review: 5-axis audit — correctness, security, readability, architecture,
  performance (all passed)
- Security audit: 0 new findings — all changes are read/write within existing
  `chrome.runtime.sendMessage` patterns
- Test verification: `vue-tsc --noEmit` zero errors, `npm run build` passes
- Assisted-by: DeepSeek V4 via OpenCode

## [5.2.2] - 2026-07-21

### Fixes

- **Douban detail page text selection**: Removed `:host { user-select: none }` from shared page-layout and 5 per-page CSS files — the overlay's title, aka/alias meta chips, music track list, synopsis, comments, and all other text content are now selectable. Interactive UI elements (status badges, interest bar, search chips, gallery overlay) keep their own `user-select: none` rules and remain non-selectable

### Chores

- Version bump 5.2.1 → 5.2.2
- `.gitignore` fix: removed `tests/` directory-level ignore — the 5 test source files are tracked by git (test artifacts continue to be ignored via `test-results/` and `playwright-report/`)
- Build verification: `npm run build` + `npm run type-check` passed
- Security audit: 11 vulnerabilities reviewed — all transitive from `wxt` → `web-ext-run` (dev toolchain only, none exploitable in production)
- Code review: passed — CSS-only changes, zero I/O or data exposure risk
- Test verification: 58 unit tests all pass
- Cleared stale `test-results/` artifacts

## [5.2.1] - 2026-07-19

### Fixes

- **Douban detail pages**: Restored doulist dialog functionality — the "添加到片单" button now opens the dialog correctly on overlay-based detail pages
- **Theme consistency**: Fixed doulist dialog panel theme mismatch — the dialog now correctly follows the extension's dark/light theme setting

### Chores

- Version bump 5.2.0 → 5.2.1
- Code review: passed — minimal changes, no regression
- Security audit: passed — no I/O touch, no data exposure, no execution risks
- `.gitignore` audit: comprehensive coverage confirmed
- Removed stale `test:integration` script (target directory does not exist)
- Cleaned up stale test artifacts

## [5.2.0] - 2026-07-19

### Architecture

- **Domain layer wiring**: Created `RecordRepositoryAdapter` implementing `IRecordRepository`, wired `RecordService` into background handler chain — domain DDD layer is now connected to runtime for the first time
- **DataScheduler routing**: All 14 handler paths (export/import, statistics, WebDAV, adult-av, Sehuatang) now route through `DataScheduler` for rate limiting, retry, and monitoring
- **IndexedDB transaction fixes**: `put()` atomicity — read version and write in single transaction; `syncPageRecord()` two-phase read (separate transactions) → write (single `readwrite` transaction) — eliminates race condition
- **Event broadcasting**: Added `broadcast()` calls to data, WebDAV, and adult-av handlers — content scripts now receive `record:updated` and `sync:completed` events from all data paths
- **Cache fixes**: `TtlCacheStore.clear()` implemented, `DbAdapter` interface extended with `clear()` method
- **RecordService fixes**: `deduplicate()` now properly groups records by shared `linkedIds` instead of being a no-op stub

### NeoDB

- **Book detail page support**: Added `neodb.social/book/` URL parsing, content script matches, router dispatch, and i18n `read_text` keys — NeoDB books now have status chips and cross-platform sync
- **Auto-sync restoration**: Refactored `onCrossPlatformSave()` into 3 explicit cases (no link, link + status changed, link + status unchanged) with rating protection. Added `syncNeoDBOnLoad()` companion check — when auto-sync is enabled, existing watched records on Douban pages are automatically verified and linked on page load
- **NeoDB push button refresh**: `syncNeoDBOnLoad()` now calls `injectNeoDBPushButtons()` after creating a new NeoDB link — the "Open in NeoDB" button appears immediately

### CSS Consolidation

- **7 shared CSS patterns**: Extracted scrollbar (`base.css`), media format chips (`media-chips.css`), title bar left stripe (`titlebar.css`), empty state (`empty-state.css`), NeoDB button colors (`design-tokens.css` variables), paginator (`paginator.css`), user bar (`userbar.css`) — eliminating ~600 lines of duplication across 35 files
- **Dark theme token alignment**: Fixed `--umm-color-surface-secondary`, `--umm-color-text-secondary`, `--umm-color-border` values in `design-tokens.css` to match `style.css` (hue 230→240)

### Code Quality

- **Mukaku refactor**: Decomposed 776-line `mukaku.ts` into 7 focused modules (`config.ts`, `toast.ts`, `dom.ts`, `cache.ts`, `api.ts`, `handler.ts`, `index.ts`) — `(Store as any)` casts consolidated from 4 call sites to 2 typed wrappers in `cache.ts`
- **Barrel cleanup**: Removed 4 re-export indirection layers from `src/shared/`; deleted dead `src/features/identity/` module; moved `src/shared/types/toast.ts` → `src/shared/toast.ts`
- **Naming fixes**: `GameDetailData.ts` → `game-detail-data.ts`; `StoreRecord` interface renamed to `StoreRecordSnapshot` (with backward-compatible type alias)
- **Dead code removal**: Deleted `makeRecordKey()` (unused), `IRecordRepository.syncRecord()` (unimplemented), `features/identity/` (empty shim), `enhancers/douban-search-bar.ts` (confirmed dead)
- **Platform expansion**: `Platform.KNOWN` extended from 4 to 9 platforms (added bilibili, youtube, javdb, mukaku, sehuatang); `displayName` fixed for special cases (IMDb, TMDB, NeoDB, JavDB, Bilibili)

### Injection Architecture

- **Eliminated 3x Douban injection**: Migrated `injectGlobalStyles()` and `SHOW_TOAST` handler into `mountDoubanMain()`; added `excludeMatches` to `content.ts` for 9 Douban URL patterns — legacy `content.ts` now only runs on non-Douban sites (IMDb, NeoDB, PT, TMDB, etc.)
- **Legacy bridge**: Created `src/content/douban/shared/legacy-bridge.ts` — stable import target for 5 dependencies from the legacy system, enabling the new Douban overlay to function without the legacy `content.ts`

### MCP / Tooling

- **Updated `MediaType.require()` error message**: Added `game` to the list of valid types
- **Updated `.gitignore`**: Added `docs/plans/`, `docs/superpowers/specs/`; fixed `.agents/` directory slash

### Testing

- **58 unit tests**: Added Playwright-based tests for all domain value objects — `Status` (14), `Rating` (12), `Platform` (10), `StoreRecord` (12), `MediaType` (10)

### Security

- `npm audit` reviewed: 11 vulnerabilities (1 low, 2 moderate, 5 high, 3 critical) — all transitive from `wxt` → `web-ext-run` (Firefox extension tooling), none exploitable in production
- No secrets in codebase
- All external data flows through `safeSendMessage` with typed message passing

## [5.1.0] - 2026-07-18

### Features

- **YouTube 全链路集成**: 新增 YouTube 平台全线管理
  - 详情页 WXT 内容脚本 (`youtube-homepage.content`)，浮动按钮 + 状态弹窗 + 播放进度自动标记
  - 深浅主题适配：MutationObserver 监听 `html[dark]` + `prefers-color-scheme`
  - SPA 导航适应：popstate/pushState/replaceState 拦截 + 3s 轮询兜底，自动跟随视频切换
  - 首页/搜索/频道列表页视频卡片注入 UMM 状态徽章 + 暗淡效果
  - 详情页推荐列表/UMM 状态徽章注入（覆盖新格式 `yt-lockup-view-model`）
  - 播放列表面板适配 (`ytd-playlist-panel-video-renderer`)
  - URL 自动识别：`youtube.com/watch?v=` 和短链接 `youtu.be/`
  - Popup Dashboard 新增 YouTube 统计卡片，Options 全线管理页面集成
  - 新增 `youtube_records` store（DB_VERSION=10→11），`Identity.fromUrl()` 支持 `/watch?v=VIDEO_ID`
- **Bilibili 首页瀑布流注入**: 新增 `bilibili-homepage.content` 入口点，首页和搜索结果页视频卡片注入 UMM 状态标签（未看/想看/已看/在看），已看自动淡化，评分展示，动态加载
- **Bilibili 视频进度自动标记**: VideoProgressTracker 根据视频时长动态计算阈值（55%-70%），播放到达阈值自动标记为"已看"
- **Bilibili 投币检测自动标记**: 检测到投币按钮显示"已用完"时自动标记为"已看"(rating=7)
- **Bilibili 推荐列表状态注入**: 详情页推荐视频卡片注入 `data-umm-rec-badge` 状态标签
- **Bilibili 合集列表页适配**: 支持 `/list/{seriesId}?bvid=BVxxx` 合集/系列页面，BVID 从 URL query params 提取
- **TMDB 内容脚本集成**: 新增 TMDB (themoviedb.org) 支持
  - 首页视频卡片注入 `.umm-homepage-badge` 状态徽章
  - 详情页注入 `.umm-status-chip` 状态标签
- **豆瓣登录过期检测**: useInterest 新增 `isDoubanLoggedIn()` 检测 DedeUserID cookie，403 时弹出 FloatingToast 提示重新登录

### Performance

- **Mukaku 链路优化**: 手术级性能与内存优化
  - 添加 handler 级 `watchedIdCache`（30s TTL），消除重复 `dbGetAll` 调用（减少 ~90%）
  - `probeCache` 添加 LRU 上限（500 条），消除内存泄漏
  - 批量读取 watched/unwatched 集合，替代逐卡片 2N 次 IndexedDB roundtrip
  - IntersectionObserver 替代全 document MutationObserver，降低 CPU 占用
  - Toast 更新改用 `requestAnimationFrame`，简化节流机制

### Fixes

- **Bilibili 详情页保存**: 增加 `saveRecord` 回调检查，确保保存操作可追踪错误
- **Bilibili 平台分布**: `handleGetAllRecords` 统一 Bilibili 记录 type 为 `video`，Options OverviewTab 添加类型安全网归一化
- **Options 总览缺 B站统计**: StatsGrid 三数组同步追加 `bilibili` 条目
- **YouTube/Bilibili 暗淡卡片悬停恢复**: 移除 `pointer-events: none`，改用 CSS `:hover` 规则
- **热力图色阶**: 改用 `log2` 对数压缩替代 `sqrt`，避免大 maxDaily 时低值坍缩到 level 1

### Changed

- **wxt.config.ts**: 添加 `*://www.bilibili.com/*`、`*://search.bilibili.com/*`、YouTube、TMDB 到 `host_permissions` 和内容脚本 matches

### Chores

- Code review 通过：YouTube/Bilibili/TMDB 内容脚本，安全审计通过
- 安全审计：无 innerHTML/document.write/eval，无 as any/@ts-ignore，无硬编码密钥
- `.gitignore` 复核通过：目录级模式全覆盖
- 测试产物清洁：无过期测试产物或残留进程
- type-check + build 通过
- 添加简洁英文注释

## [5.0.0] - 2026-07-14

### Features

- **Bilibili 集成**: 全新 WXT 内容脚本入口点 (`bilibili.content`)，在 Bilibili 视频详情页注入悬浮按钮 + 评分弹窗
  - 状态跟踪：未看 / 想看 / 在看 / 已看 循环切换
  - 评分输入：0-10 分，仅"已看"状态可评
  - 深浅主题适配：MutationObserver 监听 `html[data-theme]` + `prefers-color-scheme`
  - SPA 导航适应：pushState/replaceState 拦截 + 3s 轮询兜底，自动跟随视频切换
  - 风格统一：`data-umm-bili-*` 属性前缀，hover/active 动效，状态色光阴影
- **Bilibili 平台支持**: 全线管理页面集成 B站
  - Options 评分管理：URL 自动识别 + BV 号验证（`BV[a-zA-Z0-9]+`）
  - Options 关联管理：URL/BV ID 自动检测 + 跨平台关联
  - Popup 统计看板：B站 计数卡片
  - 后台统计聚合：GET_STATISTICS / GET_ALL_RECORDS 含 bilibili 数据
- **新增 Domain 类型**: `video`（视频），用于 Bilibili 等纯视频平台
- **自动检测平台切换**: 输入 bilibili URL 或 BV 号自动切换到 B站 平台

### Architecture

- **Bilibili 链路重构**: 死代码清理 + WXT 规范化
  - 删除 `icons/bilibili-float.js`（旧版 raw JS，放在 icons/ 目录）
  - 删除 `src/entrypoints/content/handlers/bilibili.ts`（无引用的死代码）
  - 移除 wxt.config.ts 手动 content_scripts，WXT 自动发现 entrypoint
  - 数据 KEY 格式统一：`video::BVID` 替代裸 `BVID`
- **样式模板化**: 提取 `s*()` 函数模板（sBtnFloat, sBadge, sCard 等 10+ 模板）
- **主题观察器**: `startThemeWatch()` + `applyModalTheme()` 实时响应主题变化

### i18n

- 新增 `platform.bilibili` 键（zh-CN/zh-TW: B站, en: Bilibili）
- 新增 `stats.bilibili` 键（Bilibili 统计标签）
- 新增 `stats.video` 键（视频类型标签）
- 总 keys: 180 (3 locales, 100% 覆盖)

### Chores

- Version bump 4.13.3 → 5.0.0
- npm audit 审计：9 项漏洞（全部在构建工具链，非运行时依赖）
- Gitignore 审计：已全覆盖
- 测试目录审计：tests/ 7 个单元测试文件，无过期产物

## [4.13.3] - 2026-07-12

### Architecture

- **Identity 系统合并**: `shared/identity.ts` 消除 URL 解析重复逻辑，委托给 `domain/identity/Identity.ts`，代码缩减 71%（-272 行）
- **CSS token 对齐**: `design-tokens.css` 颜色值与 `style.css` 同步（light/dark 双模式），间距从 px 统一为 rem
- **死代码清理**: 删除 `enhancers/douban-search-bar.ts`（无引用）
- **导入路径规范化**: 8 个文件从 `@/features/identity` 迁移至 `@/shared/identity`
- **脚本修复**: `add-umm-prefix.js` 硬编码绝对路径改为动态路径

### Documentation

- **README.md 重写**: 更新至 4.13.2 架构，Mermaid 架构图，完整项目结构
- **README.en.md 重写**: 英文版同步更新
- **AGENTS.md 重写**: 全面架构文档，包含所有入口点、域层、CSS 三系统、消息类型等

### Chores

- Version bump 4.13.2 → 4.13.3
- 架构审计报告 6 份写入 `docs/audit/`

## [4.13.2] - 2026-07-12

### Fixed

- **Mukaku 已看判断误将"想看"(status=1)视为"已看"**: `getIdSet()` 使用 `record.status >= 1` 筛选，将 wishlist 记录错误归入已看集合，导致非已看视频在 Mukaku 页面被标记为已看并置灰
  - `mukaku.ts`: `getIdSet()` 过滤条件 `>= 1` → `>= 2`，对齐 DB 层 `getWatchedIds()` 定义

### Chores

- Version bump 4.13.1 → 4.13.2
- 清理迁移残留的空目录 (`entrypoints/`)
- `.gitignore` 补充遗漏的临时目录模式

## [4.13.1] - 2026-07-12

### Fixed

- **NeoDB 同步后本地记录未保存**: 手动/自动 NeoDB 推送成功后，当 `linkedIds.neodb` 未变化或 status 与已有记录一致时，douban record 的 `Store.dbPut` 被条件跳过，导致 `updatedAt` 从不刷新、记录状态停滞
  - `sync-neodb.ts`: 推送后无条件保存 douban record + 刷新 `updatedAt`；neodb record 的 `updatedAt` 始终刷新
  - `douban-neodb.ts`: 移除 `linkedIds.neodb` 变化判断，推送后始终保存 douban record
  - `neodb-push.ts`: 推送后刷新 douban record 的 `updatedAt` 和 neodb record 的 status/rating/updatedAt
  - `useCrossPlatformSync.ts`: 推送后刷新 douban record 的 `updatedAt`

## [4.13.0] - 2026-07-11

### Added
- **豆瓣游戏探索页深度适配**: 新增 `www.douban.com/game/explore` 页面完整注入
  - 页面类型 `game-explore` → `url-detector.ts` / `early.ts` / `main.ts` / `css-composer.ts` / `css-map.ts`
  - 数据提取: `GlobalData` JS 对象解析（支持 key-by-key 赋值格式） + DOM 回退（items/filters/sorter）
  - 筛选栏: 类型/平台两组 chip 按钮，选中态根据当前 URL 参数动态映射，点击 toggle 选中/取消
  - 排序: 评分/按时间排序，`currentSort` 直接读 URL `?sort=` 参数
  - 游戏卡片: 单列列表，封面+标题+内联状态徽章（玩过/想玩/在玩）+类型/platform chips+评分+短评
  - 加载更多: `GET /j/ilmen/game/search?more=N` 游标分页，总结果数精确显示
  - 灵动岛: 新增"游戏"导航入口，游戏搜索使用 `?q=` 参数同站导航（保留当前 filter/sort）
- **豆瓣游戏详情页标记状态增强**: `scanDoubanPageStatus()` / `GameDetailData.ts` 使用精确匹配 `我玩过`/`我想玩`/`我最近在玩` 而非子串
- **游戏页搜索框预填**: 从 URL `?q=` 直接读取初始搜索关键词

### Added
- **豆瓣游戏详情页深度适配**: 新增 `www.douban.com/game/{id}` 页面完整注入，沿用电影详情页风格
  - Vue 覆盖层: 封面海报、评分卡片(分布条)、元数据(类型/平台/开发商等)、简介、媒体画廊(视频+图片16:9)、推荐网格(含UmmMediaCard+DB状态) 和 热门短评(含游戏平台标签)
  - 列表转芯片: 类型/开发商/发行商等多值字段自动分割为 `umm-meta-chip`
  - 收藏状态: 玩过/想玩/在玩 通过 UmmInterestBar 按钮状态显示，短评支持从 DOM 回退提取
- **添加到豆列**: `DOULIST_CAT_MAP`/`LABEL_MAP` 新增 `game` 类型，Vue 模板添加 `.umm-dl-trigger` 按钮
- **全链路数据同步**: `router.ts` + `content.ts` 添加游戏URL匹配，`fullInit()` 覆盖游戏页；`scanDoubanPageStatus()` 扩展 `.collection-section` DOM 扫描；`extractCommentFromPage()` 增加游戏页 `.collection-comment` 提取
- **身份标识/组件体系**: `Identity.fromUrl()` 解析 `www.douban.com/game/{id}`；`UmmStatusBadge` 新增 `game` 类型({已玩,想玩,未玩,在玩})；`UmmDynamicIsland`/`UmmMediaCard`/`UmmPageLayout`/`UmmStatusBadgeWrapper` props 支持 `'game'`

### Fixed
- **游戏详情页子路径误匹配**: 视频/图片/评论等 `/game/{id}/XXXX` 子页面不再触发详情注入 — `isGameDetailPage()`/路由匹配/content.ts 全面加 `\/?$` 结尾约束
- **NeoDB/cross-platform 异步链路**: `App.vue onMounted` 调用 `fetchInterest()` 后注入 NeoDB 按钮；`onCrossPlatformSave` 完整执行跨平台同步+NeoDB推送
- **NeoDB 自动同步评分保护**: 已有本地 NeoDB 记录且 status 相同时，`syncNeoDBRecord()` 将 `pageRating` 设为 0 使 API 跳过评分更新（`markItem` 中 `rating_grade` 仅在 `rating > 0` 时发送），保护用户手动设置的精确评分（NeoDB 支持 0.5 分跨度）
- **NeoDB 自动同步重复记录防护**: `syncNeoDBRecord()` 中 `linkedIds.neodb` 新增 guard（仅不同时写入），`neodbKey` 优先使用已有 `linkedIds.neodb` 防止 API 返回不同 UUID 时创建重复记录
- **NeoDB 手动推送本地记录未同步**: `performNeoDBPush()` 更新已有 NeoDB 记录时补全 `status`/`rating`/`updatedAt` 同步（之前仅更新 `linkedIds`）
- **NeoDB 自动同步本地记录未同步**: `syncNeoDBRecord()` 更新已有 NeoDB 记录时补全 status 变化时的 `status`/`rating`/`updatedAt` 同步（之前仅更新 `linkedIds`）

### Chore
- codereview 通过：Shadow DOM 隔离、`credentials: include` API 调用、textContent/innerHTML 只读提取
- 安全审计通过：纯 DOM 提取 + Vue 模板插值，无 XSS/注入风险；Content Script Shadow DOM 隔离避免样式污染
- `.gitignore` 补充 AI 辅助目录、MCP 配置等 11 条模式
- 清理 `test-results/` 运行产物
- type-check + build 通过
- 63 项单元测试全部通过
- 新增 `performNeoDBPush` 写入后立即读回验证日志

### Added
- **豆瓣读书书评主页适配**: 新增 `book.douban.com/people/{uid}/reviews` 页面类型 `book-reviews`，覆盖用户书评列表的封面、标题、评分、内容预览、阅读统计、分页
- **豆瓣读书书评详情页适配**: 新增 `book.douban.com/review/{id}/` 页面类型 `book-review-detail`，覆盖书评正文、作者栏、评分、侧边栏书籍信息(作者/出版/页数)、阅读统计
- **豆瓣读书收藏页适配**: 新增 `book.douban.com/people/{uid}/{collect|wish|do}` 页面类型 `book-collect`，覆盖读过/想读/在读三种状态的书籍网格、排序、分页
- **豆瓣读书收藏作者页适配**: 新增 `book.douban.com/people/{uid}/authors` 页面类型 `book-authors`，覆盖作者头像、身份、作品网格
- `isBookUserReviewsPage()` / `isBookReviewDetailPage()` / `isBookCollectPage()` / `isBookAuthorsPage()` URL 检测 + PageType 联合类型
- `pages/book-reviews/`, `pages/book-review-detail/`, `pages/book-collect/`, `pages/book-authors/` 四个模块
- `styles/book-reviews.css`, `book-review-detail.css`, `book-collect.css`, `book-authors.css` Shadow DOM 样式
- 共享 CSS 安全网: `userbar.css` (UmmUserBar 样式 Shadow DOM 副本), `paginator.css` (UmmPaginator 样式 Shadow DOM 副本)

### Fixed
- **Shadow DOM scoped CSS 失效**: Vue 3 scoped CSS 在 `cssInjectionMode:manual` 下不会被注入 Shadow DOM；创建共享 `userbar.css`/`paginator.css` ?raw 导入作为安全网，覆盖所有使用 UmmUserBar/UmmPaginator 的 7 个页面类型
- **书评列表标题提取错误**: `querySelector('.nlst h3 a[href*="/review/"]')` 会匹配展开箭头链接，改为 `.nlst h3 > a` 直接子元素选择器
- **设置页 body 样式被覆盖**: `overlay.css` 的 `html { background }` 通过模块级静态导入对所有 book.douban.com 页面生效；添加 `excludeMatches: ['*://*.douban.com/settings/*']` 从 manifest 级排除
- **分页导航安全加固**: `book-collect`/`book-authors` 的 `onPageChange()` 增加 `isSafeDoubanUrl()` 域名校验，防止 open redirect

### Chore
- codereview 通过：无 Critical 问题，5 个 Warning 已记录
- 安全审计通过：全部 textContent 提取，v-html 仅限星号转换，CSP 合规
- .gitignore 复核通过：127 行覆盖完整，无遗漏
- type-check + build 通过
- 22 个新增文件添加简洁英文注释
- `isBookUserProfile()` URL 检测 / `PageType` 联合类型 / `detectPageType()` 入口
- `pages/book-profile/` 模块 (types/data/config/App.vue)
- `styles/book-profile.css` Shadow DOM 样式 (StatBar override + Profile Nav + Author Grid + Timeline)

### Fixed
- **豆瓣图书详情页目录提取不完整**: `extractTOC()` 增加 `_full` / `.all` 三层回退策略，优先读取隐藏的完整目录 DOM 而非截断版本；同时过滤 `(更多)`/`(收起)` 等截断标记文本
- **Shadow DOM StatBar 样式缺失**: `book-profile.css` 补全 `umm-statbar-item`/`val`/`lbl`/`--clickable` 覆盖层

### Chore
- codereview 通过：`rel="noopener noreferrer"` 补全、冗余 DOM 查询移除
- 安全审计通过：纯 DOM 提取 + Vue 模板插值，无 XSS/注入风险
- type-check + build 通过
- 63 项单元测试全部通过
- `.gitignore` 复核通过

### Added
- **领域模型层**: 新建 `src/domain/` 目录，10 个领域实体 (Identity, StoreRecord, Platform, MediaType, Status, Rating) + 仓储接口 + 领域服务
- **领域模型层**: 新建 `src/domain/` 目录，10 个领域实体 (Identity, StoreRecord, Platform, MediaType, Status, Rating) + 仓储接口 + 领域服务
- **CSS 设计 Token 系统**: 新建 `design-tokens.css`，统一 HSL 色彩体系，浅色/深色双主题覆盖
- **PageMountFactory 模板化**: `definePageMount()` 工厂函数消除 19 个重复 mount 函数，`main.ts` 656→84 行
- **页面配置化**: 20 个 `pages/*/config.ts`，页面挂载配置与实现分离
- **Overlay 模块化**: `overlay.ts` 210 行拆分为 5 个聚焦模块 (create-overlay, mount-app, theme-sync, dismiss)
- **共享组件库**: UmmPaginator (分页器), UmmUserBar (用户栏), UmmStatBar (统计栏) — 覆盖 12 个页面
- **内容脚本句柄拆分**: `douban-sync.ts` 拆分为 3 模块 (sync-db, sync-neodb, sync-cross-platform)
- **详情页数据拆分**: `detail-data.ts` 拆分为 5 模块 (types, extractor, extra-extractor, record-loader)
- **CSS 响应式 Grid 变量**: `breakpoints.css` 13 级断点增加 `--umm-grid-cols` (2→14 列)

### Changed
- `.gitignore` 去重并补充 `.envrc`/`.direnv`/`.flox`/`.vite`/`.eslintcache` 等模式
- 依赖更新: TypeScript 6.0.3, `@types/dompurify` 3.2.0

### Fixed
- **豆瓣图书详情页 "添加到书单" 文本错误**: `doulist-replace.ts` 所有 12 处 "片单" 硬编码改为动态标签（片单/书单/歌单）
- **Dialog 无障碍**: 添加 `role="dialog"` / `aria-modal` / `aria-labelledby`
- **Dialog 标题样式**: `<h3>` 改为 `<div role="heading">` 防止豆瓣页面 h3 样式污染
- **`genre.css` 深色模式缺失**: 补全 `:host(.umm-theme--dark)` 块
- **11 个页面 CSS 自定义变量深色覆盖**: 补全 accent/card-bg/border 等暗色值
- **z-index 硬编码 token 化**: 10 处 → `var(--umm-z-*)`
- **`common.css`/`base.css` 去重**: 删除 `common.css` (375行)，消除每页冗余 CSS 注入
- **`design-tokens.css` 深色 shadow 覆盖**: 增加 4 个 `--umm-shadow-*` 白色阴影值
- **CSS 基础样式变量更新**: `base.css` 使用新 `--umm-color-*` 设计 Token
- **挂载失败处理**: `mount-app.ts` 挂载失败时移除加载动画+显示错误提示
- **主题监听器泄漏**: `startThemeSync` 返回清理函数，dismiss 时移除监听器
- **`doulist-replace.ts` 正则 Bug**: `/(\\d+)/` 双转义修复
- **`StoreRecord.ts` JSDoc**: 修正 `recordVersion` 描述（领域层不递增，仓库层递增）

### Removed
- `common.css` (被 `base.css` 取代)
- `components.css` (合并至 `base.css`)
- 19 个重复的 mount 函数 (被 `definePageMount` 取代)
- `overlay.ts` 单体文件 (拆分为 `overlay/` 5 模块)
- `douban-sync.ts` 单体 (拆分为 3 模块)
- `detail-data.ts` 单体 (拆分为 5 模块)
- `shared/theme-sync.ts` 独立文件 (合并入 `overlay/theme-sync.ts`)

### Chore
- code-review 通过：3 文件 +17/-2 行，CSS-only 变更
- 安全审计通过：CSS-only，无用户输入/数据流/执行风险
- 63 项单元测试全部通过
- `.gitignore` 复核通过：无需补充

### Added
- **豆瓣图书详情页深度适配**: `book.douban.com/subject/*` 全功能覆盖
  - 书名/副标题/原作名/作者/出版社/ISBN 等元信息完整提取
  - 评分条平铺结构兼容（`.starstop` + `.power` + `.rating_per` 兄弟节点）
  - 内容简介从 `#link-report .intro` 提取（支持多段合并）
  - 创作者/作者信息从 `#authors` 提取（过滤 `.fake` 占位元素）
  - **作者简介**卡片：提取"作者简介"章节 HTML，DOMPurify 消毒后渲染
  - **目录**卡片：从 `[id^="dir_"]` 提取按 `<br>` 分隔的目录项
  - **原文摘录**卡片：从 `.blockquote-list` 提取引用文本/来源/用户/赞数
  - **其他版本**卡片：从"这本书的其他版本"区域提取版本列表
  - `UmmInterestBar` 新增 `book` 类型标签（想读/在读/已读）
  - `detectStatusFromDom()` 支持图书状态文字（我读过/我在读/我想读）
  - 海报使用 2:3 竖版比例（`ASPECT_RATIO.POSTER`），按钮文字显示"添加到书单"
  - 推荐项 `.subject-rate` 评分提取兼容图书 `dl` 结构
  - 过滤空推荐项（跳过 `<dl class="clear">` 占位元素）

### Changed
- **detail-data.ts** — `extractDetailData()` 新增 `isBook`、`subtitle`、`authorBioHtml`、`tocItems`、`blockquoteItems`、`editionItems` 字段
- **App.vue** — 提取 `mediaType` computed 属性，消除 4 处重复类型分支
- 图书简介/作者/目录/原文摘录/其他版本卡片位于创作者区域下方

### Chore
- code-review 通过：4 文件 +122/-30 行，仅 DOM 读取 + DOMPurify 输出，零安全风险
- 安全审计通过：所有 HTML 输出经 DOMPurify 消毒，无 XSS 向量，无密钥泄露
- `.gitignore` 复核通过：`localref/` + `.localref/` 均已覆盖
  - 3 个 entrypoint matches 全面注册，`url-detector.ts` 新增 `book` mediaType
  - 主 overlay 挂载流程支持 book 类型：`cat=1001` URL 构造，`loadRecordMap('book')` 加载记录
  - 搜索结果卡片适配：POSTER 比例封面（同电影），隐藏 labels/chips/演职员行
  - 分页器完整支持（首页/上一页/下一页/末页/跳转输入）
  - 搜索标题显示"图书搜索"，不显示 all/movie/TV 筛选器

### Chore
- 测试产物清洁：删除 `test-results/` 目录
- 安全审计通过：仅 URL 匹配和条件渲染变更，零用户输入处理，Vue 模板自动转义
- `.gitignore` 复核：所有 AI 目录/产物模式已覆盖
- 简洁英文注释补充：`UmmSearchCard` 组件 JSDoc 更新

### Fixed
- **Options RatingTab/LinkedTab 豆瓣图书适配**: book 类型映射修复
  - `parseRatingInput()`: `book.douban.com` URL → `type: 'book'`（原被映射为 `'movie'`）
  - ID 输入时图书 URL 正确构造为 `book.douban.com/subject/{id}`
  - `autoDetectPlatform()`: `book.douban.com` 域名正确识别为 `'book'`
  - `Domain` 类型扩展支持 `'book'`，类型约束完整覆盖
- **豆瓣图书页面短评提取修复**: 嵌套 `.j.a_stars` DOM 结构干扰
  - 选择器 `.j.a_stars` → `div.j.a_stars`，排除嵌套的 `<span>` 评价格式区
  - 修复前：提取到 `"我的评价: 力荐"` 而非真实用户短评
- **短评更新丢失修复**: 空串无条件覆盖已有短评
  - `syncToLocalStorage()`: 当页面未提取到短评时，保留数据库中已有短评（`|| existingRecord?.comment` 守卫）

### Changed
- **Popup 布局优化**: 避免统计卡片 Y 轴溢出
  - 宽度 480px→600px，统计卡片 2 列→4 列（5 卡排成 2 行）
  - Options 按钮无需滚动直接可见

### Chore
- `.gitignore` 重构：去重 5 组重复条目（`.env`、`.env.local`、`.env.*.local`、`playwright-report/`、`test-results/`）
  - 新增 `.vercel/` `.netlify/` `.history/` 模式
- 63 项单元测试全部通过
- 安全审计通过：所有变更经正则输入验证 + `textContent` DOM 读取 + 无动态代码执行

## [4.11.0] - 2026-07-09

### Added
- **豆瓣图书首页深度适配**: `book.douban.com/` 页面全覆蓋
  - 新书速递：响应式 Grid 卡片区，复用 `UmmMediaRow`/`UmmMediaCard` 组件（`type="book"`）
  - 每月热门图书榜：排行列表 + 排行趋势指示器（↑↓N）
  - 读书活动：背景覆盖式活动卡片
  - 封面 `aspect-ratio: 2/3` 自适应 + hover 上浮动效
- **图书状态徽章全链路**: `UmmStatusBadge` 新增 `book` 类型（已读/想读/未读/在读）
  - 新书速递 Grid 卡片：悬浮于封面上角（`variant="small"`）
  - 排行榜列表：inline 嵌入标题前（`variant="inline"`）
  - 状态从 IndexedDB 异步加载
- **图书身份识别**: `Identity.fromUrl()` 支持 `book.douban.com/subject/{id}` → type `'book'`
  - `Identity.buildUrl()` 新增 `douban + book` 路径
- **图书详情页扫描**: `douban-scanner.ts` 图书状态文字适配（我读过/我想读/我在读）
- **图书首页导航入口**: UmmDynamicIsland 新增「图书」按钮（书本 SVG 图标）
- **全链路统计集成**: `useStats.ts` 新增 `book` 计数器
  - Popup Dashboard 新增 Book 统计卡片（Book 图标）
  - Options OverviewTab StatsGrid 新增 Book 条目 + platformStats 推断
- **图书类型埋点**: `host_permissions` + `matches` 三入口注册 `*://book.douban.com/*`
- **图书详情页路由**: `router.ts` 新增 `book.douban.com/subject/` 路由 → `handleDoubanDetailPage()`
- **图书详情页隐藏导航**: `hide-nav.ts` 支持 `bookNav`（`#db-nav-book`）

### Fixed
- **封面全屏溢出**: `css-composer.ts` 补充 `homepage.css` 到 book-homepage CSS preset，grid-track 约束 `aspect-ratio`

### Security
- 安全审计通过：所有 DOM 读取使用 `textContent`（非 `innerHTML`），URL 经 `new URL()` + 协议白名单过滤，Vue 模板 `{{ }}` 自动转义，无 `v-html`，外部链接含 `rel="noopener noreferrer"`

## [4.10.0] - 2026-07-09

### Added
- **豆瓣「用户片单」分类导航栏 UI**: `www.douban.com/people/{uid}/subject_doulists/{category}` 页面适配
  - 新增 `.xbar` 分类标签（豆列/片单/书单/地点）的提取与 UI 重建，胶囊式标签 + 当前 tab 高亮
  - 新增 `XbarCategory` 接口和 `xbarCategories` 数据字段
- **豆瓣「片单详情页」深度适配**: `www.douban.com/doulist/{id}/` 页面信息提取与 UI 重建
  - 水平三明治布局：固定封面列 + 信息列（垂直三明治：标题/创建者 → 统计/筛选/条目网格 → 分页器）
  - 条目卡片展示：海报、标题、星级评分（含评价人数）、导演/演员/类型/年份元数据
  - 记录状态集成：已看（含用户评分）和想看徽章，通过 IndexedDB recordMap 异步加载
  - 全部分类筛选 tab（全部/我没看过的/我看过的/可播放）
  - 数字排序分页器，正确识别当前页 `thispage` 位置
  - 共享 `umm-status` 组件样式（渐变胶囊徽章）
  - 浅色/深色主题自动适配（通过 `--dd-*` 本地变量 + `theme.css`）
- **NeoDB 自动同步 UI 实时刷新**: 自动同步成功后调用 `injectNeoDBPushButtons()` 刷新按钮组件
- **跨平台 Record 健康检查**: 每次已看页面加载时检查 IMDb/TMDB/NeoDB record 是否存在且状态正确
- **NeoDB URL 统一构建**: 处理 `show:`/`season:`/`episode:` 前缀
- **UmmStatusBadge 4 状态完整支持**: 新增 `doing`（在看/在听）状态类型
- **Color tokens (wish/doing)**: 全套颜色 Token（含 light/dark）
- **i18n 状态标签**: 4 个 locale 新增 wish/doing 相关标签
- **Personage 页面作品记录状态**: 加载 `loadRecordMap()` 填充记录状态与评分
- **豆瓣个人主页全面重建**: 新增 `#doulist`/`#friend`/`#review`/`#statuses` 区块提取
- WXT 内容脚本匹配：`*://www.douban.com/doulist/*` 加入 3 个入口点

### Fixed
- **豆瓣「片单列表」navLinks 域名错误**: `www.douban.com` 页面导航链接被错误重写为 `movie.douban.com`
- **豆瓣「片单列表」meta 提取不兼容书单/音乐**: 正则扩展为 `(?:看过|读过|听过)`，支持多介质格式
- **豆瓣「片单列表」activeTab 检测**: 新增 `?owned=followed` 查询参数检查
- **豆瓣同步/关联链路全面优化**: 修复 4 个同步链路问题
  - 非已看记录（想看/在看）同步到 IMDb/TMDB/NeoDB
  - 状态变更重新触发 NeoDB 推送
  - 跨平台对应记录缺失时自动创建
  - 新增 "在看"(doing) 状态支持（status=3）
  - `normalizeStatus` 修正 status=1 归为 done 的 bug
- **UmmStatusBadge 判断丢失**: 核心组件未处理 status=3(doing)
- **首页/详情页/演员页 Stale Render**: `UmmMediaCard` 动态 key 修复
- **详情页推荐区状态折叠**: `RecItem.isDone` → `recStatus`
- **搜索徽章 / 状态标签 二进制折叠**: status 映射扩展为完整 4 状态
- **User reviews list expand/collapse**: 超过 400 字显示展开/收起
- **User reviews list data extraction**: `.nlst h3 a` → `.nlst h3 > a` 选择器修复
- **IMDb clickable links on Douban detail page**: IMDb ID 包装为可点击链接
- **NeoDB "Open" button on Douban detail page**: 动态渲染打开按钮
- **豆瓣个人主页豆列/关注/广播提取**: 区块选择器和解析逻辑修复
- **Stat Bar 用户ID**: 从硬编码改为动态 `data.userId`

### Changed
- **依赖升级**: 升级多个依赖至最新兼容版本
  - `@types/chrome` 0.1.x → 0.2.x, `@types/node` 25.x → 26.x, `@types/archiver` 7.x → 8.x
  - `reka-ui` → 2.10.1, `vue` → 3.5.39, `vue-tsc` → 3.3.7, `vite` → 8.1.4
  - `wxt` → 0.20.27, `playwright` → 1.61.1, `tailwindcss` → 4.3.2, `tsx` → 4.23.0
  - `sharp` → 0.35.3, `adm-zip` → 0.5.18
- **url-detector.ts**: 新增 `isDoulistDetailPage()`, 扩展 `isDoulistsPage()` 正则
- **early.ts/main.ts/css-composer.ts/hide-nav.ts**: 新页面类型全链路注册
- **App.vue**: 移除未使用的 `activeFilter` ref（代码清理）
- **豆瓣注入架构**: 12 级自适应断点字体系统、分类徽章、悬浮缩放在封面动效等 UI 优化

### Security
- All external links use `target="_blank" rel="noopener noreferrer"`
- IMDb ID matching uses strict `/^tt\d+$/` regex — no XSS vector
- NeoDB URL is constructed from internal IndexedDB data, not user input

## [4.9.0] - 2026-07-07

### Architecture
- **豆瓣注入架构重构**: 三套并行注入系统（douban-early/douban-main/content.ts）统一通过 `shared/` 模块建立正式契约
  - 新建 6 个共享模块：`url-detector.ts`、`hide-nav.ts`、`extract-subject-id.ts`、`load-record-map.ts`、`theme-sync.ts`、`useCrossPlatformSync.ts`
  - `early.ts` 140→60 行（移出内联 URL 检测/CSS 组合/SPA 观察者）
  - `main.ts` 514→370 行（去除 8+ 处重复 mount 样板、导航隐藏逻辑、CSS 组合代码）
  - 删除 `useMusicHomepageObserver.ts` 和重复 CSS 声明，净减 ~490 行
  - 解决 12 类重复模式（R1-R12）和 1 个架构问题（A11 跨平台同步）

### Added
- **首页横向滚动→Grid 自适应**: 电影首页筛选/热门区域从横向滚动改为 CSS Grid 自适应布局
  - `.umm-grid-track` 容器：`auto-fill, minmax(150px, 1fr)` → 固定列数（6-9 列，跨 1280-3200px 断点）
  - `UmmScrollRow` 新增 `mode="grid"` prop 切换滚动/网格模式
  - `UmmMediaCard` 新增 `mode="grid"` 渲染路径
  - `homepage.css` 新增 grid 布局、行间距 `var(--umm-space-lg)`、hover 上浮动画
- **音乐详情推荐区域**: 修复音乐详情页推荐内容缺失（`#db-rec-section` 选择器）
  - `detail-data.ts` 推荐提取兼容 `#recommendations`（电影）和 `#db-rec-section`（音乐）
  - 封面使用 1:1 正方形比例（`:type="d.isMusic ? 'music' : 'movie'"`）
  - 图片 URL 尺寸升级：`s_ratio_poster`→`xl`、`/[slm]/`→`/xl/`、`/[slm]pic/`→`/xl/`

### Fixed
- **详情页推荐区域 rating 字体巨大**: `detail.css` 中 `.umm-rating-score { font-size: var(--umm-font-display) }` 为裸类选择器，泄漏至 Shadow DOM 内所有评分元素 → 限定作用域为 `.umm-rating-score-section .umm-rating-score`
- **首页 grid rating 大屏偏小**: 新增 `.umm-grid-track .umm-rec-item .umm-rating` 12 级自适应 `clamp(0.75rem, 0.55rem + 0.45vw, 1.125rem)`
- **音乐详情推荐封面始终 2:3**: `.umm-rec-cover` 硬编码 `aspect-ratio: var(--umm-aspect-poster)` → 移除以允许内部 `UmmImage` 动态控制
- **音乐条目主封面 URL 未升级至 xl**: `detail-data.ts:143` 仅处理 `s_ratio_poster`（电影），增加 `/subject/m/`→`/xl/` 替换
- **详情页添加到片单按钮浅色主题不可见**: W1.9 CSS 清理误删 `--umm-accent: #6366f1` → 恢复 `detail.css` 浅色变量
- **首页 grid 三明治样式错误**: `homepage.css` 补全 `.umm-rec-item/cover/title/rating` 卡片基类样式
- **首页 grid 大屏列数过多**: `auto-fill` 改为固定列数断点（6-9 列），宽屏防止过多列挤压
- **一周口碑榜元素样式**: `.umm-billboard-title` 增加 `max-width: 220px` + ellipsis 截断

### Changed
- **`.gitignore` 精简**: 去重 `playwright-report`×2 / `Thumbs.db`×2 / `.DS_Store`×2，合并同类条目

### Chore
- **版本升至 4.9.0**: 同步 `package.json` + `wxt.config.ts` manifest
- **测试产物清洁**: 删除 `test-results/` 目录，63 个单元测试全部通过
- **安全审计**: CSP/消息传递/Shadow DOM 隔离/凭据管理确认安全
- **英文注释补充**: `css-composer.ts` 模块 JSDoc + `?raw` 约束说明，`constants.ts` 导出简短注释

## [4.8.0] - 2026-07-07

### Added
- **音乐专辑多版本页面全屏覆盖层**: `music.douban.com/albums/{id}` — 版本列表 grid，1:1 方形专辑封面 + 介质 chip（CD/DVD/磁带/数字/黑胶 等）+ 评分 + IndexedDB 状态徽章
- **豆瓣音乐搜索结果优化**: 专辑封面宽度比从 2:3 改为 1:1 正方形比例；解析元数据中的介质信息（CD/DVD/磁带/数字/流媒体），在封面下方展示多色系 chip（亮/暗主题）
- **介质 chip 色系系统**: 11 种介质各配独立色值（亮色/暗色双主题），白字 ≥4.5:1 WCAG AA 可读性
- **i18n 音乐状态键值**: `common.listened`/`common.unlistened` 三语言（zh-CN/zh-TW/en）

### Fixed
- **音乐搜索结果状态徽章显示电影用语**: UmmSearchCard 缺失 `:type` prop → 加入 `:type="isMusic ? 'music' : 'movie'"`
- **专辑版本页状态徽章同问题**: albums/App.vue 固定 `type="music"`
- **Options RatingTab 音乐类型标签**: `getStatusLabel()` 当 `type='music'` 时返回 `common.listened`/`common.unlistened`
- **Options LinkedTab 音乐类型标签**: `getStatusText()` 之前忽略 `_type` 参数 → 使用 `type` 参数正确分支音乐/电影

### Changed
- **删除孤儿代码**: `useStatus.ts` composable（全库零引用）

### Chore
- **版本升至 4.8.0**: 同步 `package.json` + `wxt.config.ts` manifest

## [4.7.0] - 2026-07-07

### Added
- **豆瓣音乐首页全屏覆盖层**: `music.douban.com/` — 热门音乐人分类 pills + 新碟榜 grid（1:1 封面）+ 流行音乐人圆形头像
- **豆瓣音乐人概览页全屏覆盖层**: `music.douban.com/artists/` — 推荐艺人轮播、推荐活动、音乐视频、流派导航
- **豆瓣音乐流派页全屏覆盖层**: `music.douban.com/artists/genre_page/*/` — 流派艺人 grid
- **全局宽高比常量**: `ASPECT_RATIO.POSTER/SQUARE/WIDE`（TS 常量）+ `--umm-aspect-poster/square/wide`（CSS 变量），消除 33 处硬编码比例值
- **UmmInterestBar `type` 属性**: movie 上下文显"想看/在看/已看"，music 上下文显"想听/在听/已听"
- **音乐详情页优化**: 曲目列表（含序号）、表演者标题行、meta row chip 拆分表演者、正方形 1:1 专辑封面、简介/表演者标题适配
- **音乐详情页标记状态初始化**: 优先 IndexedDB record → DOM 检测（`#interest_sect_level`）→ fallback null，消除 API 返回空值时状态丢失

### Fixed
- **NeoDB 自动同步不持久化**: `App.vue` `onInterestSave()` 推送成功后将 `catalogUuid` 写入 `linkedIds.neodb` + 创建 `neodb_records` 本地记录 + 更新 IMDb/TMDB 记录的 NeoDB 反向链接
- **DataScheduler 缓存键隔离 Bug**: `DB_PUT`/`DB_DELETE`/`DB_SYNC_PAGE_RECORD` 写操作仅失效自身前缀的缓存键（`put:*/delete:*/sync:*`），`get:*` 缓存未被清除导致后续读取返回陈旧 null。三个写 handler 新增显式 GET 缓存失效
- **`DB_SYNC_PAGE_RECORD` 响应破损**: 返回体丢失 `result` 字段，`dbSyncPageRecord()` 始终返回 `{changed:false}`
- **NeoDB 推送失败 Toast 降级**: 从 `info` 恢复为 `error`，确保用户感知推送失败
- **豆瓣音乐详情页标记状态覆盖**: `fetchInterest()` API 返回空 `interest_status` 时不再覆盖已有的初始状态（来自 IndexedDB 或 DOM 检测）
- **音乐表演者标签提取**: `pl.textContent` 误包含嵌套 `<a>` 链接文本 → 改用 `pl.firstChild?.textContent` + 移动子节点至 wrapper 外再移除 `<span class="pl">`
- **音乐详情页空白标题**: `#content h1` 选择器在音乐页面不命中 → 添加 `#wrapper > h1` 回退
- **`UmmMediaCard` 滚动模式封面比例**: 缺少 `aspectRatio` prop，图片无约束拉伸
- **调试日志清理**: 移除 `useInterest.ts` 中遗留的 `console.log`

### Changed
- **豆瓣音乐首页入口匹配**: `douban-early.content` matches 从 `*://music.douban.com/subject/*` 扩展为 `*://music.douban.com/*`，覆盖首页/流派/艺人页
- **版本升至 4.7.0**: `package.json` + `wxt.config.ts` manifest

## [4.6.1] - 2026-07-06

### Changed
- **统一 z-index 层级体系**: 14 个文件中 15 个硬编码 z-index 值全部替换为 8 级语义化 CSS 变量（backdrop:10 / sticky:50 / floating:100 / tooltip:150 / overlay-host:200 / overlay:300 / dialog:400 / toast:500），消除 `9999`/`10000`/`999999`/`2147483647` 等随机值。Toast 从 `999999`（等于 overlay）提升至 `500`，确保始终在 dialog 之上。

### Fixed
- **照片页面总数显示为 0**: `photos-data.ts` — 单页照片列表无 `.paginator` 元素时 `extractPagination()` 返回 `totalCount=0`，增加回退逻辑使用实际 `photos.length` 作为总数

## [4.6.0] - 2026-07-05

### Added
- **设计规范文档体系**: 新增 `docs/DESIGN_GUIDE.md`（1205 行/11 节，含三层样式架构、token 引用、组件层级、命名规范、主题系统）、`docs/CONSISTENCY_CHECKLIST.md`（9 维度/28 条一致性规则）
- **暗色主题支持 — 全局注入 UI**: `tokens.ts` 新增 32 个 `_DARK` 颜色常量；`global.ts` 新增 `ALL_STYLES_DARK` 块通过 `[data-umm-theme="dark"]` 选择器注入暗色覆盖
- **主题同步监听**: `content.ts` + `douban.ts` 添加 `chrome.storage.onChanged` 监听 `umm:appearance`，跨上下文（popup/options/overlay）主题实时同步
- **CSS 架构**: `components.css` 共享 CSS 变量文件；`theme.css` 添加 `--umm-color-*` 统一 token 别名、`--umm-z-*` z-index 层级缩、`--umm-color-error` 变量（light + dark）
- **`useRecordCache` 共享化**: 从 `homepage/composables/` 提取至 `content/douban/shared/composables/`，消除 homepage/search 页面 DB 加载重复
- **预存 TS 错误修复**: `douban-neodb.ts` overlay 作用域修复、`neodb-push.ts` optional chaining 修复

### Fixed
- **早期注入浅色主题闪烁**: `overlay.css` 添加 `@media (prefers-color-scheme: light)` 匹配 OS 偏好；`overlay.ts` JS 注入 `<style>` 覆盖显式主题设置
- **meta-card a 标签蓝色突兀**: `.umm-meta-chip a` 改为 `color: inherit`，hover 使用 `opacity` 而非蓝色文字
- **`.umm-photo-badge` 黑字不可读**: `color: #fff`（图片叠加标签始终白色文字）
- **`.umm-comment-status--wish` 暗色主题不可见**: 添加 `:host(.umm-theme--dark)` 覆盖（`#f59e0b`）
- **`.umm-rating-better` / `.umm-better-chip` 暗色背景缺失**: 添加 `:host(.umm-theme--dark)` 覆盖
- **`#e74c3c` 硬编码无暗色变体**: 替换为 `var(--umm-color-error, #e74c3c)` CSS 变量

### Changed
- **全局注入样式暗色主题修正**: `UI_COMPONENT_STYLES` fallback 从深色默认值（`#1e1e1e`/`#333`）修正为浅色默认值（`#ffffff`/`#e5e7eb`）；新增 `ALL_STYLES_DARK` 响应 `[data-umm-theme="dark"]`
- **链接统一新标签打开**: 豆瓣重构页面中全部元素跳转默认新标签（`target="_blank" rel="noopener noreferrer"`），搜索页搜索导航除外
- **遮罩层 z-index 统一**: 所有 overlay 使用 `var(--umm-z-overlay, 999999)`，消除 `9999`/`999999` 不一致
- **NeoDB 按钮样式对齐**: `global.ts` 与 `interest.css`（canonical source）统一 padding/shadow/transition
- **`components.json` 配置修正**: CSS/Utils/Tailwind 路径对齐 `src/shared/styles/style.css`
- **版本升至 4.6.0**: `package.json` + `wxt.config.ts` manifest

[4.5.0] - 2026-07-01

### Added
- **全部演职员页面全屏覆盖层**: `/subject/{id}/celebrities` 支持影人分组网格，2/3 头像 + 代表作标签，12 级响应式断点
- **单个影人页面全屏覆盖层**: `www.douban.com/personage/{id}/` 含 profile header（2/3 头像 grid）、简介（meta OG 全文提取）、图片、获奖、作品三明治卡片（UmmMediaCard）、合作人物卡片网格、未上映作品列表
- **www.douban.com host_permission**: 新增 `*://www.douban.com/*`，扩展 content script 覆盖到豆瓣主站
- **`Identity.fromUrl()` 影人 ID 解析**: `www.douban.com/personage/{id}` 路径识别，type=movie, provider=douban
- **作品卡片复用 UmmMediaCard**: personage 页面 recentWorks/popularWorks 复用 UmmMediaCard grid 模式
- **作品提取重试兜底**: 5 次指数退避重试，解决豆瓣原生 JS 替换底部 sections DOM 的竞态问题

### Fixed
- **人物简介截断**: 从 `meta[property="og:description"]` 提取全文，替代原生 DOM 截断片段
- **工作区清洁**: `dist/`、`.wxt/` 构建产物清理
- **代表作链接新标签**: celebrities 页面代表作标签改为 `@click.prevent` + `window.open` new tab
- **影人卡片新标签**: celebrities 页面点击影人卡片改为 `@click.prevent` new tab
- **CSS 变量统一**: celebrities/personage 全量硬编码值替换为 `--umm-*` 带 fallback 变量
- **12 级断点体系**: 所有 grids 补齐 375px→5120px 完整 12 级断点

### Changed
- **合作人物卡片**: 从横向 flex 改为纵向卡片网格（2/3 封面 + 名称 + 合作数），hover 上浮阴影
- **Section heading 主题色**: 下划线统一使用 rosered accent (`--umm-personage-accent`)
- **"更多影视作品"按钮**: 从 `<a>` 内联样式改为统一 `.umm-personage-btn` 带 hover 效果

### Added
- **预告片/视频页面统一注入**: `/subject/{id}/trailer` 列表页网格 + `/trailer/{id}/` `/video/{id}/` 详情页内嵌视频播放器，原生 DOM 移除防止音频穿透
- **预告片详情页导航按钮**: 从 `.aside .links` 原生数据提取，"去本片全部视频"/"去影片页" 两个 `@click` 按钮新标签页打开
- **all_photos 页面导航按钮**: 从 `.aside .links` + `.mb30` 提取，显示剧照/海报/壁纸类型切换 + 影片页链接
- **全屏画廊 bottom-bar 动画**: Vue `<Transition>` 实现索引数字切换的淡入淡出动画，两端固定布局防重建

### Fixed
- **trailer selectors DOM 层级修复**: `h2 ~ ul.video-list` 改为 `.mod:has(h2#trailer) > ul.video-list`
- **trailer 路由优先级**: `isTrailerPage()` 移至 `isDetailPage()` 之前，防止双 overlay 冲突
- **详情页主演空 chip**: `metaToChips()` 在 `/` 分隔符后跳过闭合标签，展开 `display:none` 演员
- **照片页 all_photos `extractSidebarLinks` 函数缺失**: 修复 `ReferenceError`
- **早期注入白色闪烁**: 新增 `overlay.css` 通过 manifest `content_scripts.css` 注入，在浏览器渲染前设置 `<html>` 深色背景
- **预告片页面 subject ID 提取**: 改为从 DOM `<h1> <a href="/subject/{id}/">` 提取
- **Popup/Options 白闪及配色紊乱**: WXT CSP (`script-src 'self'`) 禁止 inline script——改用纯 CSS `html.dark { background; color-scheme }` 方案，零 JS 依赖
- **Popop/Options `color-scheme` 与扩展主题脱节**: CSS `html.dark { color-scheme: dark; }` + `@media` 兜底，消除系统颜色与扩展主题不一致
- **豆瓣 overlay Vue 主题 store 与宿主 `data-theme` 不同步**: `mountUmmOverlay()` 在 Vue 挂载前写入 `localStorage`，使主题 store 读取正确的扩展主题而非 OS 偏好
- **popup/options HTML 恢复 `@media (prefers-color-scheme: dark)`**: `color-scheme` 使用 OS 偏好 + 扩展主题兜底

### Changed
- **版本升至 4.4.0**: package.json + wxt.config.ts manifest
- **全局设计系统变量统一**: detail.css/photos.css :host 移除与 theme.css 重复的 font-family 和基础变量，统一继承；theme.css 新增 `--umm-link-hover` 变量
- **search.css 响应式化**: 标题/元数据字体、页面/空状态间距使用 `--umm-font-*` `--umm-space-*` 变量
- **detail.css 间距变量化**: `.umm-detail-left` gap 改用 `var(--umm-space-xl)`



### Added
- **共享 UmmMediaCard 组件**: defineComponent props 驱动双模式（grid + scroll），grid 模式 `@click="window.open"`，scroll 模式 `<a>` 包裹，详情页推荐区/首页媒体行统一使用
- **戏票/剧照/推荐 13 级响应式断点**: `detail.css` 网格列数从 3-4 级扩展为 320px-5120px 13 级自适应
- **meta 信息 chip 化**: 导演/演员/类型等元数据用 `/` 分割为独立 chip（`.umm-meta-chip`），保留原生 `<a>` 链接
- **better-than chip 化**: 评分对比区"好于 X%"从 `/` 拼接改为独立 chip（`.umm-better-chip`）
- **个人评分覆盖**: 已看推荐项 badge 显示 IndexedDB 个人评分，替代豆瓣大众评分
- **默认 footer**: `UmmPageLayout` 默认 footer 包含原生豆瓣链接 + GitHub 图标 + 扩展版本号，可通过 `#footer` slot 覆写
- **Doulist 主题系统**: 抽取 `createDialogTheme()` 替代 `c(l,d)` 内联 lambda，37 个语义化主题属性

### Fixed
- **演职员 @click 迁移**: 海报/排行榜/获奖提名/演职员/剧照/短评 9 处 `<a :href target="_blank">` → `@click="openLink()"`
- **Homepage 异步加载稳定性**: staggered re-parse（800/2500/6000ms）+ observer class 属性跟踪 + 轮询窗口 30s→60s + `start()` 立即首次解析
- **演职员 grid 列宽撑开**: 添加 `min-width: 0` 阻止长名撑开 CSS Grid `1fr` 列
- **Dark theme 颜色**: 新增 `--umm-text-primary/secondary/muted/link` 深色主题变量，提升评论、状态文字对比度
- **douban-neodb.ts 生产日志泄漏**: 15 处 `console.log` → `infoLog()`（production 默认静音）
- **CSRF 防护缺失**: `addToDoulist`/`removeFromDoulist` 补充 `X-Requested-With: XMLHttpRequest` 头
- **neodb-push.ts null safety**: `interestSect` 加 `?.` 可选链防止空值错误

### Changed
- **详情页字号缩减**: section heading `--umm-font-lg`→`--umm-font-md`，meta `--umm-font-md`→`--umm-font-sm`，正文 `--umm-font-md`→`--umm-font-base`
- **剧照/推荐 grid 最大列数**: 从 8/8 缩减至 4 列（base→480px→768px+ 三级递进）
- **海报列宽响应式**: 从固定 320px 扩展为 13 级（320px→5120px，320px→700px）
- **detail.css 移除 `:host` 独立变量**: 9 个 font 变量和 5 个 spacing 变量替换为 breakpoints.css 令牌，仅保留 `--umm-font-3xl`（标题）和 `--umm-font-display`
- **评分栏标签自适应**: `.umm-bar-label`/`.umm-bar-pct` 固定宽度改为 `flex-shrink: 0; min-width` 防止大字包裹

### Security
- **background.ts sender 校验**: `chrome.runtime.onMessage` 确认 `sender.id === chrome.runtime.id`（已有）
- **Doulist fetch**: 补充 CSRF 头 `X-Requested-With: XMLHttpRequest`
- **日志安全**: NeoDB handler 全部 `console.log` → `infoLog()`（DEVel 环境自动静音）

## [4.2.3] - 2026-06-29

### Added
- **标记 dialog 完整交互**: 支持"想看/在看/已看"三态选择、5星评分、标签(tags)推荐+自定义、短评输入(350字限制)，POST 豆瓣 API + IndexedDB 持久化
- **跨平台同步 (IMDb/TMDB/NeoDB)**: 第一次标记已看时自动扫描页面提取 IMDb/TMDB 链接，写入对应平台记录；NeoDB 自动推送（需配置）
- **我的短评展示**: 标记对话框保存的短评显示在 `#umm-interest-actions` 标记按钮下方
- **热门短评区域**: 从页面 `#comments-section` 解析热门短评并渲染到详情页 body
- **NeoDB 同步组件注入 Shadow DOM**: 页面加载+标记保存后注入到 overlay 内 `#umm-neodb-actions`，带按钮 loading 反馈和 toast 通知
- **演职员/剧照入口链接**: 复用原始页面的计数（全部 N / 预告片N / 图片N），点击跳转豆瓣原生页面

### Fixed
- **NeoDB 按钮操作失灵**: 使用事件委托 + `container.querySelectorAll` 替代 `document.getElementById` 穿透 Shadow DOM
- **NeoDB 容器样式丢失**: 移除内联 style，改用 CSS class（`.umm-neodb-push-buttons`）接入 Shadow DOM 设计令牌
- **NeoDB 首次注入时机**: 初始 `neoDBInjector` 在 Vue 挂载前运行 → 回退原生 DOM 被遮盖；改为 `onMounted` 中 `fetchInterest` 完成后主动触发
- **NeoDB 容器重复注入**: 清理旧按钮时优先 `shadowRoot?.getElementById`，兜底 `document.getElementById`
- **NeoDB watermark 层叠错误**: 补回 `.umm-neodb-btn { position: relative; z-index: 1 }`
- **添加到片单按钮缺 loading**: fetch 期间按钮显示"加载中…" + `[data-loading]` 属性
- **添加到片单 dialog 简化**: 移除"取消"/"保存"按钮，替换为"关闭"；二次确认携带片单名
- **"添加到片单"按钮浅色主题兼容**: `color: #fff` 替代 `--umm-text-primary`
- **年份显示不清晰**: `--umm-text-muted` → `--umm-text-secondary`，提升对比度
- **标记 dialog 保存无 toast**: 补全 DB 保存/跨平台同步/NeoDB 同步各阶段 toast 反馈

### Changed
- **UmmInterestBar 改用 Vue 渲染**: 从纯 `defineComponent("h")` 渲染，替代早期内联 HTML；dialog 及其交互状态通过 props 控制
- **useInterest composable**: 抽取豆瓣 interest API 封装（GET + POST），支持 MaybeRef subjectId，提供 loading/error 响应式状态
- **extractCrossPlatformLinks 接入**: 从页面 `#info` 提取 IMDb/TMDB 链接并双向同步记录

## [4.2.2] - 2026-06-28

### Added
- **豆瓣详情页"想看/已看"标记功能**: 在 Shadow DOM 详情页 overlay 中集成 `UmmInterestBar` 组件，支持下方面两项操作并通过豆瓣 API 同步状态:
  - "想看" / "看过" 开关按钮
  - 5-星评分选择器（选中"看过"后显示）
  - POST 至 `/j/subject/{id}/interest` 并持久化到 IndexedDB
  - CSRF token 从页面 `input[name="ck"]` 和 cookie 自动提取

### Fixed
- **详情页推荐评分丢失**: 修复 `.subject-rate` 选择器作用域错误（`linkEl` → `dl`），豆瓣 DOM 中评分元素不在 `<a>` 内部
- **添加到片单按钮在 Shadow DOM 中失灵**: 使用 `e.composedPath()` 替代 `e.target.closest()` 穿透 Shadow DOM 边界
- **片单 API 首调用返回空列表**: 添加 1 次重试（500ms 延迟），始终打开 dialog
- **添加到片单 `skind` 参数错误**: 修正为 `subject.cat`（cat_id 如 `1002`），原传入了 `kind`（`movie`）

### Added
- **创建新片单功能**: POST `/j/doulist/add`，footer 新增"＋ 新建片单"按钮，含名称输入、私密切换、自动刷新列表
- **加载动画反馈**: dialog 加载中 spinner、toggle 操作旋转动画、保存按钮 spinner+文字反馈

## [4.2.1] - 2026-06-28

### Added
- **统一模板注入框架 UmmPageLayout**: 创建 defineComponent 布局组件，header (UmmDynamicIsland) + content (slot) + footer (slot) 三明治结构，page-layout.css 共享布局样式
- **UmmRating 统一评分组件**: defineComponent 渲染分数+金色分段 (5+/7+/8+ 三级 gold low/mid/high)，适配亮暗主题
- **UmmMediaRow 首页媒体行组件**: 封装 UmmScrollRow + UmmMediaCard + record 查找，消除 3 处重复 App.vue 模板
- **useDoubanSection 通用工厂**: 替代 3 个 composable 的 ref/parse/watch 重复模式
- **UmmSearchCard 搜索结果卡片组件**: 多行标题 (2-line clamp)、cover hover 缩放、左边条视觉增强
- **UmmSearchFilter 搜索结果筛选器**: ALL/电影/剧集三档切换，基于豆瓣 labels 元数据判断类型，右侧结果计数显示
- **搜索结果卡片重构**: cover 100×140px、视觉层级 (title→rating→meta→cast 渐进淡化)、gap 8px 间距
- **Cover hover 动画统一优化**: 全线使用 cubic-bezier(0.22, 0.61, 0.36, 1) + will-change + backface-visibility，修复搜索页/详情页 transition 错放 :hover 导致鼠标离开瞬间回弹
- **12级断点自适应**: .umm-status--inline/--small font-size 从固定 px 改为 var(--umm-font-xs)
- **统一滚动条美化**: :host::-webkit-scrollbar 6px 圆角细条，Chrome+Firefox 双浏览器覆盖

### Changed
- **首页组件化**: App.vue 从 4 个独立 UmmScrollRow→3 行 UmmMediaRow，删除 3 个旧 composable
- **搜索结果组件化**: App.vue 删除内联模板，改用 UmmSearchCard + UmmSearchFilter
- **详情页图片 hover**: 修复海报/影人/剧照/推荐图片 CSS 选择器（旧 .umm-*-img→实际 .umm-image-img）
- **首页评分**: 移除 UmmMediaCard 的 starNum 计算 + ★ 渲染，统一使用 UmmRating
- **首页 Rank 增强**: billboard 金银铜牌勋章圈 + 渐变 + 辉光 + 左边色条

### Fixed
- **Cover hover 动画瞬间回弹**: transition 属性从 :hover 块移至基态，确保进出双向平滑
- **搜索结果筛选无效**: isTvItem 从抽象启发式改为直接检查豆瓣 labels 元数据 (.text === '剧集')

### Removed
- **useDoubanScreeningItems / useDoubanBillboard / useDoubanHotSection**: 被 useDoubanSection 工厂替代
- **UmmMediaCard 冗余 UmmImageWrapper 内联封装**: 改用共享组件导入

### Added
- **共享 UI 组件系统**：创建 4 个可复用组件，消除 Options 页面重复渲染模式
  - `OptionPicker`：提取 AppearanceTab 主题/语言 3 列按钮网格
  - `PlatformSearchForm`：提取 RatingTab/LinkedTab 重复搜索表单（4字段 Select + Input）
  - `SettingRow`：提取设置项 label+control 水平布局
  - `SkeletonLoader`：统一 App.vue/SyncTab 加载骨架屏

### Fixed
- **Options 页面 Switch 开关不响应**：reka-ui v2 SwitchRoot 改用 `modelValue/update:modelValue`，SettingsTab 绑定改为 `v-model`
- **Options 页面内容无法渲染**：移除 `<Transition mode="out-in">` 包裹 `<Suspense>`（Vue 3 不兼容）
- **CardContent 缺少 padding-top**：`px-6 pb-6` → `p-[var(--umm-card-padding)]`，四边统一流体间距
- **CardHeader 固定间距**：`p-6 pb-4` → `p-[var(--umm-card-padding)] pb-4`
- **豆瓣注入元素主题实时同步**：`applyOverlayTheme` 同时更新 `data-theme` 和 `umm-theme--*` CSS 类
- **Options 统计图颜色硬编码**：`barColor`/`platformColor` 从 JS `isDark` 检测改为 CSS 变量驱动
- **WebDAV 跨标签同步**：`chrome.storage.onChanged` 改用 `changes.newValue` 直接读取
- **Export 数据字段不完整**：`handleExportData` 导出全部 12 个 AppSettings 字段

### Changed
- **网格间距优化**：StatsGrid/Weekly 统计卡片 grid gap 从 `12px` 扩大为流体 `var(--umm-section-gap)`（16-56px自适应）
- **`:root` 补充 surface 颜色**：`--umm-color-surface-*` 亮色值补全（之前只在 `.dark` 有定义）
- **Options 各项 inline style**：统一为 Tailwind class（`umm:mb-3`, `umm:gap-2` 等）
- **`.gitignore`**：新增 `coverage/`、`*.crswap` 等模式

### Security
- **热力阴影硬编码 rgba**：`box-shadow` 改用 `hsl(var(--foreground) / 0.2)` 适应双主题
- **bar chart 样式**：CSS 变量 `--umm-bar-base-s/l`、`--umm-bar-platform-l` 在 `:root`/`.dark` 双定义

### 豆瓣注入体系统一：6个独立 WXT entrypoint 合并为2个薄层入口点 (`douban-early` / `douban-main`)，全部逻辑迁移到 `src/content/douban/`
  - `early.ts`：3个 early overlay 合并为 URL 路由的工厂函数
  - `main.ts`：3个 idle 入口合并为 URL 路由工厂，动态导入 page 模块
  - `UmmImageWrapper` / `UmmStatusBadgeWrapper` 提取到 `components/`，消除搜索/详情页重复 defineComponent
- **模板统一系统**：创建函数式模板构造架构，消除3个豆瓣入口点的重复代码
  - 共享 `UmmImage` 组件 (defineComponent + shimmer 覆盖式 loading，修复 `display:none` 导致 lazy 加载死锁)
  - 共享 `UmmStatusBadge` 组件 (纯渲染函数，无 computed 开销，三态 done/none/wish + 3种变体)
  - 共享 `mountUmmOverlay` 工厂函数 (beforeMount→createApp→afterMount 生命周期编排)
  - 共享 `composeStyles` CSS 组合工具
  - 共享 `douban-theme.css` (:host变量源) + `douban-common.css` (shimmer/status badge 样式)
  - 共享 `useStatus` composable (MaybeRefOrGetter 适配)
- **灵动岛统一**：`UmmDynamicIsland` 提取为跨三页共享组件，新增 `newTab`/`type`/`initialQuery` props
  - 搜索页：`newTab=false` 同标签导航；详情/首页：`newTab=true` 新标签
- **数据链路 v4：DataScheduler 调度中心** — 请求优先级队列 + 令牌桶限流 + 指数退避重试
  - `src/features/data-scheduler/`: PriorityQueue (HIGH/MEDIUM/LOW 三级)、RateLimiter (token bucket + timestamp refill)、RetryPolicy (exponential backoff + jitter)、SchedulerMonitor (P50/P95/P99 + 错误率 + 缓存命中率)
  - DataScheduler 编排器：缓存检查 → 限流 → 排队 → [重试循环] → 监控事件
  - 集成到 background.ts：所有 DB 消息通过 scheduler.schedule() 执行
- **多级缓存系统 CacheManager** — L1 (LruCache LRU 内存) + L2 (TtlCacheStore IndexedDB 持久层)
  - `src/features/cache/`: LruCache (可配 maxSize/TTL、deleteByPrefix)、TtlCacheStore (DbAdapter 接口)
  - 替换 MediaDatabase.readCache (Map → LruCache 500条 LRU 淘汰)
  - 替换 DataScheduler 内部缓存 (Map → CacheManager DI 注入)
- **查询优化层** — `query-utils.ts`: queryPage (limit/offset cursor pagination)、batchGet (单事务批量读取)
- **乐观锁 OptimisticLock** — 版本式写冲突检测，StoreRecord 新增 recordVersion 字段，put() 自动版本递增，optimisticPut() 条件写入
- **性能优化工具** — MemoryManager (Observer/Listener/Timer 生命周期管理)、Memoizer (计算结果记忆化缓存)
- **批量 ADULT_AV_CHECK_BATCH** — 一次性批量查询番号，避免并发消息超时
- **ADULT_AV_CHECK 跨源扫描** — 超出已知 sources 时游标扫描全 store 匹配任意 source
- **导入错误诊断增强** — BOM 剥离、JSON 前80字符预览、响应结果校验

### Fixed
- **vue-i18n SyntaxError: 9** — 双花括号 `{{level}}`/`{{count}}` 被 vue-i18n 解析为嵌套占位符触发 `NOT_ALLOW_NEST_PLACEHOLDER` (错误码 9)，改为单花括号
- **Toast 背景色丢失** — `@theme` 中 `--umm-color-state-*` 改为 `--color-state-*`，Tailwind 正确生成 `umm:bg-state-*`
- **图片加载死锁**：UmmImage 从 FunctionalComponent 改为 defineComponent，`loading="lazy"` + `display:none` 导致浏览器不触发加载
- **UmmStatusBadge**：移除 FunctionalComponent 内的 `computed` 误用
- **Dark 主题变量**：`--umm-text-muted`/`--umm-text-secondary` 暗色值交换
- **Promise 拒绝**：`mountUmmOverlay.finalize()` 添加 `.catch()`
- **CSS 组合**：`composeStyles` 每 chunk 尾部添加换行，防止注释粘连
- **搜索页重复搜索栏**：移除 `enhanceSearchPageSearch()` 调用，消除与 Vue App 重复注入
- **详情页灵动岛边距**：`.umm-detail-root` padding-top 0 → 16px
- **Wrapper 组件 props 类型**：从 loose array props 改为带类型声明的 props 对象
- **safeSendMessage null 处理** — AdultAvStore.has() 添加 try/catch

### Changed
- 共享组件和 CSS 集中到 `src/entrypoints/content/shared/`，3个入口点统一引用
- **CSS 变量集中化**：`--umm-island-*` 系列变量从 homepage.css/detail.css 迁移到 theme.css
- **CSS 去重**：删除 detail.css 中 `.umm-pill-wrap`/`.umm-search-bar` 等残留样式
- **构建优化**：`douban-main.js` 215→209 kB；`content.js` 168→162 kB
- `database/models.ts` — put() 自动 recordVersion、新增 optimisticPut()/queryPage()/batchGet()
- `data-scheduler/data-scheduler.ts` — CacheManager 构造函数注入
- `background.ts` — 注入 CacheManager/DataScheduler、新增 ADULT_AV_CHECK_BATCH 路由
- `locales/*.ts` — 统一单花括号占位符格式

### Removed
- 6个旧 Douban 入口点目录 (`douban-homepage-overlay.content/`, `douban-search-overlay.content/`, `douban-detail-early.content/`, `douban-homepage.content/`, `douban-search.content/`, `douban-detail.content/`)
- `entrypoints/content/shared/` 目录

### Security
- 全面审查 XSS/CSS 注入/数据流：DOMPurify 验证、搜索桥接安全性确认、Shadow DOM 隔离
- javdb.ts: textContent 替代 innerHTML，AdultAvStore 异常安全返回 false

### Fixed
- **热力图溢出**：修复活跃度热力图方块在 hover 放大时向上溢出被裁剪的问题
- **Tooltip 残留**：优化 tooltip 防抖配置，快速移动鼠标时不再出现残留轨迹
- **Tooltip 暂停**：移除关闭动画，消除 tooltip 关闭时的视觉暂停

### Changed
- Title card layout: horizontal title + original name + year row, responsive stack on small screens
- Rating card redesign: larger score (42px), focal score section, better bar design, `border-top` separator
- Status chip moved from actions area to top of title block
- Poster URL: `s_ratio_poster` → `xl` for high-resolution images
- Celebrity card: circular avatars → 2:3 portrait rectangles
- Search navigation uses `location.href` (same-tab) instead of `window.open` (new tab)

### Added
- Full-page overlay injection on Douban search page (`search.douban.com/movie|music/subject_search`)
  - New `src/entrypoints/douban-search-overlay.content/` content script (`document_start`)
  - New `src/entrypoints/douban-search.content/` Vue app with search results grid
  - Data extraction via 4-layer fallback: `window.__DATA__` → script tag regex → injected bridge → DOM parsing
  - Search bar with real-time input normalization and debounce
  - Watch-status badges integrated from IndexedDB
  - Dynamic pagination with page window and jump-to-page input
  - Music/movie search type auto-detection
  - Same-tab navigation for search, new-tab for result links
  - Themed scrollbar and fade-in transition
- Full-page overlay injection on Douban homepage (`movie.douban.com`) with `document_start` CSS blocking
  - New `src/entrypoints/douban-homepage-overlay.content/` content script
  - Early CSS injection prevents flash of original content
  - Shadow root container houses the entire Vue-enhanced homepage UI
  - Themed scrollbar (5px, `--umm-border` color, light/dark adaptive)
  - `user-select: none` on overlay (except search input)
  - Dynamic theme sync via `chrome.storage.onChanged` (`umm:appearance` key)
- Moved Dynamic Island styles from component `<style scoped>` to shadow DOM stylesheet (`style.css`)
  - Fixes Vue scoped styles not applying inside Shadow DOM
- Glassmorphic pill-shaped search bar on Douban detail and search pages, replacing native form
  - New `src/utils/search-normalizer.ts` shared normalizer (extracted from UmmDynamicIsland)
  - New `src/entrypoints/content/enhancers/douban-search-bar.ts` enhancer
  - Detail page integration via `handleDoubanDetailPage` in `douban.ts`
  - Search page integration via `startSearchEnhancer` in `douban-search.ts`
  - URL `search_text` prefilling on search result pages
  - Smart query normalization: PT release names → clean search terms (dots, brackets, season/episode → `Season 1`, year truncation)
  - 500ms debounce on blur for input normalization (no cursor jump during typing)
  - CSS isolation via inline styles + injected stylesheet with `!important` overrides
  - Responsive breakpoints: mobile (40px), tablet (42px), desktop
  - Dark mode support via `prefers-color-scheme`

### Security
- XSS prevention: DOMPurify integrated for all `v-html` usage
- Tabnabbing prevention: `rel="noopener noreferrer"` added to all `target="_blank"` links
- Dead code cleanup: Removed unused `vue-sonner` and `gsap` dependencies

## [4.1.0] - 2026-06-25

### Added
- Unified design system with Tailwind CSS v4 `prefix(umm)` configuration (v4 variant-style prefix)
- Design tokens consolidated in `src/style.css` `@theme` block (merged from `design-tokens.css` and `typography.css`)
- 13-level responsive breakpoint system (320px to 3200px) with 3K (2880px) support
- Fluid typography using `clamp()` for all text sizes
- `src/shared/` module for unified exports (utils, composables, stores, types)
- `scripts/add-umm-prefix.js` automation for adding `umm:` prefix to Tailwind classes

### Changed
- All shadcn/vue components now use `umm:` prefixed Tailwind classes (126 files updated)
- Options page and popup components updated with `umm:` prefix
- Custom components (HeatmapCalendar, PlatformDistribution, ToastContainer, StatCard, ConfirmDialog) updated with `umm:` prefix
- Variant files (index.ts) for Button, Badge, Alert, Toggle, Sheet, NavigationMenu, Avatar updated with `umm:` prefix
- `handleDoubanDetailPage` simplified from 1994→30 lines — overlay handles UI, handler does background sync only

### Fixed
- Tailwind CSS v4 prefix format: changed from `umm-` (v3 style) to `umm:` (v4 variant style)
- `data-[state=on]:` prefixed classes now correctly skip shadcn token classes
- Nested parentheses in `cn()` calls (e.g., `[&:has([role=checkbox])]`) now handled correctly
- Multi-line `:class="cn(...)"` bindings now processed correctly
- `size-*` Tailwind utility classes now receive `umm:` prefix
- `border-b` (without number suffix) now correctly identified as Tailwind utility

### Removed
- `src/styles/design-tokens.css` (merged into `src/style.css`)
- `src/styles/typography.css` (merged into `src/style.css`)
- `src/utils/theme.ts` (consolidated into `src/shared/`)
- Debug toggle (`Shift+\``) for showing/hiding overlay to inspect original page
- Status chip moved from actions area to top of title block
- Poster URL: `s_ratio_poster` → `xl` for high-resolution images
- Celebrity card: circular avatars → 2:3 portrait rectangles

- Full-page overlay injection on Douban search page (`search.douban.com/movie|music/subject_search`)
  - New `src/entrypoints/douban-search-overlay.content/` content script (`document_start`)
  - New `src/entrypoints/douban-search.content/` Vue app with search results grid
  - Data extraction via 4-layer fallback: `window.__DATA__` → script tag regex → injected bridge → DOM parsing
  - Search bar with real-time input normalization and debounce
  - Watch-status badges integrated from IndexedDB
  - Dynamic pagination with page window and jump-to-page input
  - Music/movie search type auto-detection
  - Same-tab navigation for search, new-tab for result links
  - Themed scrollbar and fade-in transition
- Full-page overlay injection on Douban homepage (`movie.douban.com`) with `document_start` CSS blocking
  - New `src/entrypoints/douban-homepage-overlay.content/` content script
  - Early CSS injection prevents flash of original content
  - Shadow root container houses the entire Vue-enhanced homepage UI
  - Themed scrollbar (5px, `--umm-border` color, light/dark adaptive)
  - `user-select: none` on overlay (except search input)
  - Dynamic theme sync via `chrome.storage.onChanged` (`umm:appearance` key)
- Moved Dynamic Island styles from component `<style scoped>` to shadow DOM stylesheet (`style.css`)
  - Fixes Vue scoped styles not applying inside Shadow DOM
- Glassmorphic pill-shaped search bar on Douban detail and search pages, replacing native form
  - New `src/utils/search-normalizer.ts` shared normalizer (extracted from UmmDynamicIsland)
  - New `src/entrypoints/content/enhancers/douban-search-bar.ts` enhancer
  - Detail page integration via `handleDoubanDetailPage` in `douban.ts`
  - Search page integration via `startSearchEnhancer` in `douban-search.ts`
  - URL `search_text` prefilling on search result pages
  - Smart query normalization: PT release names → clean search terms (dots, brackets, season/episode → `Season 1`, year truncation)
  - 500ms debounce on blur for input normalization (no cursor jump during typing)
  - CSS isolation via inline styles + injected stylesheet with `!important` overrides
  - Responsive breakpoints: mobile (40px), tablet (42px), desktop
  - Dark mode support via `prefers-color-scheme`

### Changed
- Search navigation uses `location.href` (same-tab) instead of `window.open` (new tab)

## [4.0.0] - 2026-06-24

### Changed
- **Background service worker refactored**: Split 1,439-line monolithic `background.ts` into modular handler architecture
  - `background/handlers/webdav.ts` — WebDAV sync handlers (test, upload, download, merge)
  - `background/handlers/neodb.ts` — NeoDB push rating handler
  - `background/handlers/data.ts` — Settings, export, import, statistics handlers
  - `background/handlers/toast.ts` — Toast notification handler with inline fallback
  - `background/handlers/adult-av.ts` — Adult AV ID operations + legacy sehuatang handlers
  - Main `background.ts` reduced to message routing entry point (457 lines)
- **Content script refactored**: Extracted NeoDB push logic from `content.ts` (707→272 lines)
  - New `content/neodb-push.ts` — NeoDB push button injection and push logic (312 lines)
  - New `content/shared/overlay.ts` — Shared shadow DOM overlay creation (127 lines)
- **Early scripts consolidated**: 3 near-identical douban early scripts now use shared `createOverlay()`
  - `douban-detail-early.content/index.ts` — 109→25 lines
  - `douban-homepage-overlay.content/index.ts` — 74→21 lines
  - `douban-search-overlay.content/index.ts` — 74→21 lines
- **Design tokens extracted**: New `content/styles/tokens.ts` with shared color constants
  - `global.ts` updated to import tokens instead of hardcoded values
  - UI component styles (`umm-panel`, `umm-overlay`, `umm-btn`) added to `global.ts`
- **UI panels refactored**: `manual-add-panel.ts` and `check-viewed-panel.ts` use CSS classes instead of inline styles
- Added 3K resolution breakpoint (`--bp-3k: 2880px`) to `design-tokens.css`

### Security
- Security audit passed: XSS prevention via `escapeHtml()` in toast handler, store name validation in DB operations, settings whitelist in import
- Known low-risk items deferred to 4.2.0: toast payload input validation, webdav credential leakage in error messages, import data structural validation

## [3.6.1] - 2026-06-20

### Fixed
- Fixed PT dimmer not activating on some sites after SPA navigation
- Removed redundant regex scan loop in list page handler causing unnecessary DOM queries for 6 sites
- MTeam pollTimer over-fetching cached data on every poll cycle
- MTeam pollTimer cascade triggering after observer attachment
- Scroll/resize event bursts triggering excessive reprocessing during SPA navigation

### Added
- Background scan support for 6 NexusPHP sites: pt.btschool.club, discfan.net, hhanclub.net, hdfans.org, pt.soulvoice.club, hdtime.org

### Security
- Added URL validation for external resource fetches
- Sanitized console output to prevent URL and data exposure

### Changed
- Router URL detection restored with setInterval polling and hashchange listener
- Removed redundant JSDoc, Chinese comments, and section headers from core modules
- Bumped version to 3.6.1
- Added `Thumbs.db` to .gitignore

---

## [3.5.2] - 2026-06-19

### Added
- **PT Dimmer 模块化重构**: 单文件 `pt-dimmer.ts` 重构为 `enhancers/pt/` 多模块架构（12 个文件，~1700 行）
  - `config/` — 站点配置注册表（`SITE_CONFIGS`），支持 17+ NexusPHP 站点
  - `scanner/` — 后台扫描队列（信号量并发控制、随机延迟、缓存优先、60s 冷却）
  - `dimmer/` — 处理器编排（MTeamHandler + NexusPHPHandler），per-task 回调实时淡化
  - `types.ts` / `utils.ts` — 共享类型和工具函数
- **NexusPHP 列表页扫描**: 后台请求详情页提取豆瓣/IMDb 平台 ID，IndexedDB 缓存，双保险策略（后台扫描 + 详情页手动访问）
- **17+ PT 站点适配**: ptsbao.club, audiences.me, hdhome.org, hdarea.club, ourbits.club, pterclub.net, pthome.net, haidan.cc, pt.btschool.club, discfan.net, hhanclub.net, hddolby.com, hdfans.org, pt.soulvoice.club, hdtime.org, piggo.me
- **豆瓣 ID 格式兼容**: 支持 `douban.com/subject/`（无 `movie.` 前缀）和 `movie.douban.com/subject/` 两种格式

### Changed
- **PT Dimmer 架构**: 从单文件 `enhancers/pt-dimmer.ts`（874 行）重构为模块化 `enhancers/pt/`（12 文件，1686 行）
- **数据属性提取**: `extractIdsFromRowLinks` 同时扫描 `<a>` 链接和 `data-doubanid`/`data-imdbid` 属性
- **性能优化**: `enableBackgroundScan: false` 时跳过 IndexedDB 缓存查询；`getScanner()` 单例支持动态更新并发参数

### Fixed
- **内存泄漏**: `waitForElement` observer 使用类属性而非本地变量，`cleanup()` 可正确断开
- **单例配置**: `getScanner()` 后续调用的 `concurrency`/`delayRange` 参数不再被忽略
- **userdetails.php 误匹配**: `extractDetailUrlFromLink` 跳过 `userdetails.php` 链接
- **DOMParser base URL**: `extractIdsFromDoc` 改用 `getAttribute('href')` 避免 `about:blank` 前缀
- **空结果缓存**: 无平台 ID 的详情页也写入空缓存条目，避免重复扫描
- **详情页更新**: 用户手动访问详情页时提取并更新缓存，双重保险

## [3.5.1] - 2026-06-19

### Added
- **Dynamic Island 搜索栏**: 豆瓣首页顶部新增悬浮搜索栏，集成电影/音乐/个人主页快捷入口
  - 左侧导航：电影（🎬）、音乐（🎵）、个人主页（👤）图标按钮
  - 右侧搜索框：支持实时规范化输入（去除 PT 发布组后缀、年份后内容）
  - 搜索按钮 loading 动画：提交时旋转 spinner + 800ms 脉冲防抖
  - 所有链接通过 `window.open` 新标签页打开，不使用原生 `<a>` 元素
- **12 级响应式 CSS Token 系统**: 全新 `breakpoints.css` 定义流体排版、间距、卡片尺寸
  - 覆盖 320px（手机）→ 5120px（5K）完整分辨率范围
  - 3 个显式断点覆写：2560px（2K）、3840px（4K）、5120px（5K）
  - 所有 CSS 硬编码 `px` 值替换为 `var(--umm-*)` token
- **深浅主题联动**: 支持 `auto`/`light`/`dark` 三种模式
  - 从 `chrome.storage.local` 读取扩展主题设置
  - `auto` 模式跟随 `prefers-color-scheme` 媒体查询
  - 监听系统主题变化实时切换
  - CSS 变量系统：`--umm-bg`, `--umm-text-primary`, `--umm-island-bg` 等
- **封面悬浮效果**: 仅封面图片盒浮动，标题/评分/徽章保持静止
- **useBadge 抽取**: 共享徽章计算逻辑抽取为独立 composable，消除 UmmMediaCard 和 UmmBillboardCard 重复代码
- **href 协议验证**: `sanitizeHref()` 函数验证 URL 仅允许 http/https 协议，阻止 javascript:/data:/vbscript: 注入

### Changed
- **重构为独立 WXT 入口点**: `src/entrypoints/douban-homepage.content/` 替代旧 `enhancers/douban-homepage/` 模块
  - 使用 `createShadowRootUi` Shadow DOM 隔离，无需 `all: initial` + `!important` CSS hack
  - 从 `content/router.ts` 解耦，独立匹配 `https://movie.douban.com/`
- **dbGetAll 优化**: `useRecordCache` 仅加载 `{ status, rating }` 字段，减少内存占用
- **搜索查询规范化**: 去除点号、括号、特殊字符，合并多余空格，年份后内容截断
  - 支持双年份场景（使用第二个年份作为截止点）
  - 防死循环：`isNormalizing` 标志 + `setTimeout(0)` 重置
- **所有导航链接**: 从原生 `<a>` 元素改为 `<button>` + `@click` 事件处理，统一新标签页打开

### Fixed
- **matchMedia 监听器泄漏**: `applyTheme` 每次调用新增监听器但从未移除 → 模块级 `activeMqHandler` 追踪 + `removeMqListener()` 清理
- **重复 `:host` 声明**: `style.css` 中 `:host` 声明两次，移除底部重复块
- **冗余注释清理**: 移除 `index.ts` 和 `App.vue` 中 8 条仅重述代码的内联注释
- **console.error 泄露**: `useRecordCache.ts` 移除 error 对象，仅记录通用错误信息

### Removed
- **旧 enhancers 模块**: 删除 `src/entrypoints/content/enhancers/douban-homepage/` 目录（cache, card, index, row, sections, styles, utils 共 7 个文件）
- **router.ts 豆瓣首页路由**: 移除 `content/router.ts` 中豆瓣首页增强器路由规则（21 行）

## [3.4.0] - 2026-06-16

### i18n
- **vue-i18n 体系**: 集成 vue-i18n v11.4.5，支持中文简体/繁体/英文三语言
  - 异步 locale 检测：`chrome.storage` → `navigator.language` → `zh-CN` 兜底
  - 用户语言选择持久化至 `chrome.storage.local`，全局生效
  - Vue 应用（popup/options）使用 `createAppI18n()` 异步 bootstrap，挂载前完成 locale 检测
  - Content script 使用独立 i18n 模块，与 Vue 应用共享 `chrome.storage.local` 语言设置
- **Options 页面**: 全量迁移 — 概览、评分管理、关联查询、数据同步、外观、设置等所有标签页已替换为 `t()` 调用
- **Content script**: NeoDB 推送按钮、Toast 通知、状态标签等注入 DOM 元素使用 `t()` 调用统一本地化
- **共享组件**: HeatmapCalendar（活跃度热力图）、PlatformDistribution（平台分布）使用 `t()` 调用
- **语言切换**: 外观设置新增语言选项（简体中文/繁體中文/English），切换后即时生效

### Added
- **每日详情平台名称**: 标签宽度从 48px 扩展至 80px，防止英文平台名（Sehuatang/IMDb 等）被进度条遮挡
- **热力图悬浮提示**: 热力方块悬浮时显示日期和活动条数 Tooltip 提示
- **热力图颜色图例**: 右下角新增「少 ↔ 多」渐变色阶示例条

### Fixed
- **活跃度计算**: 使用平方根曲线（`sqrt(count/max)`）替代线性映射，避免峰值日压制日常微小活动，层次更分明
- **活跃度色彩**: 暗色模式起点亮度提升至 29%、亮色模式起点设为柔和 82%，每级均匀步进，深浅度更易辨识
- **平台统计缺失**: JavDB/色花堂等成人视频数据现纳入概览页「平台分布」和「每日详情」统计
- **类型标签显示**: 平台卡片内的媒体类型（电影/剧集/音乐/书籍/成人视频）由原始 code 改为本地化显示名称
- **跨标签数据一致**: 多标签页下语言切换/配置修改现自动同步至所有打开的选项和弹出页
  - 使用 `useLocaleSync` composable 通过 `useI18n().locale.value` 模式保持响应式链完整
  - Content script 新增 `startLocaleSync()` 监听语言变更
  - SettingsTab/WebDAVTab 使用 `chrome.storage.onChanged` 同步配置，`syncingFromStorage` 防止重复写入

### Changed
- **License**: 项目许可证从 MIT 切换为 Apache-2.0 ([LICENSE](LICENSE))

### Docs
- **README**: 修正项目名称展开为 UM Multimedia Manager（UM 即 UnforgetMemory），之前误写为 "Unified" / "Universal"
- **README**: 添加项目 Logo，优化布局与排版，统一双语文档风格
- **README**: 添加中英文 README 之间的语言切换导航链接，支持一键切换语言

## [3.3.0] - 2026-06-15

### Architecture
- **Pinia 状态管理层**: 新增 3 个 Pinia stores (`theme`, `app`, `confirm`)，替代模块级 reactive 单例，状态变更可追踪
- **依赖全量更新**: vue 3.5.38, vue-router 5.1.0, pinia 3.0.4, reka-ui 2.9.10 等 15 个包升级至最新稳定版
  - 移除废依赖 `@crxjs/vite-plugin`
- **@vueuse/core 集成**: `useThemeStore` 使用 `useStorage` / `useMediaQuery` 替代手写 localStorage/matchMedia

### Composables
- **useStats**: 提取 OverviewTab + DashboardPage 共用的统计分类计算逻辑
- **usePlatformMeta**: 平台名称标签/色相映射表，统一管理和复用
- **useRecordLoader**: 消息通信加载逻辑（已整合入 `useAppStore`）

### Components
- **StatCard**: 统计卡片通用组件，替代 DashboardPage + OverviewTab 中 8 处内联卡片
- **HeatmapCalendar**: 90 天活跃度热力图组件
- **PlatformDistribution**: 平台分布详情列表组件

### Refactoring
- **OverviewTab**: 601 → 380 行，使用 stores + composables + 组件替代内联代码
- **Popup App.vue**: 67 → 10 行，内联主题逻辑统一由 `useThemeStore` 管理
- **DashboardPage**: 内联数据加载迁移至 `useAppStore`，统计卡片使用 `StatCard`
- **ConfirmDialog**: 使用 `useConfirmStore` 替代 `useConfirmDialog.ts`
- **Content script 状态观察者**: `startRatingObserver` 独立至 `observers/rating.ts`
- **豆瓣详情页处理器拆分**: `handlers/douban.ts` 1243 → 189 行，拆分为 5 个聚焦文件：
  - `douban-scanner.ts` (页面扫描), `douban-sync.ts` (保存同步), `douban-neodb.ts` (NeoDB 推送), `douban-toast.ts` (通知), `douban.ts` (入口)
- **清除废弃代码**: 移除 `handleDoubanDetailPage`、`waitForElement`、`renderDoubanStatusChip` 等已替换的过期函数

### Security
- **XSS 防护**: 所有 `innerHTML` 写入使用 `escapeHtml()` + `textContent`，无注入风险
- **`.gitignore` 加固**: 新增 `*.tsbuildinfo` 模式，覆盖 TypeScript 增量构建产物

### Fixed
- **Pinia store 解包兼容**: `useStats` 改用 getter 函数模式，避免 Pinia 自动解包 ref 导致 `TypeError: not iterable`
- **Unicode 转义修复**: 替换 `.vue` 模板中所有 `\uXXXX` 转义序列为实际中文字符
- **Options 页侧边栏精简**: 移除重复的页脚和标签页标题，修复 `LinkedTab.vue` 缺失的 `Input`/`Label` 导入

### Removed
- 临时 jav_ids 导入入口
- 各处重复的 `showPageToast` 函数
- `<all_urls>` 过度权限

## [3.2.0] - 2026-06-14

### Added
- **jav_ids 体系支持**: 评分管理、关联查询全面支持成人视频 ID 体系
  - 新增"成人视频"平台选项，支持 JavDB、色花堂、本地来源
  - jav_id 格式自动识别（FC2-PPV-1234567, ABP-123 等），支持 -UC/-C/-U 后缀
  - 评分管理：查询、评分、保存支持 jav_ids 存储
  - 关联查询：查询 jav_ids 独立存储记录
  - 概览统计：支持 local 源标签显示为"本地"
- **Toast 通知系统**: 新增 `useToast` composable + `ToastContainer` 全局组件
  - 选项页内所有操作反馈（配置保存、WebDAV 同步、导入导出等）使用统一通知
  - 平滑淡入淡出动画，自动消失（3s）
- **统一确认对话框**: 新增 `ConfirmDialog` 全局组件
  - 选项页内所有危险操作（导入数据、云端覆盖等）显示风格统一的确认框
- **导出/导入支持 jav_ids**: 导出包含 jav_ids 存储，导入恢复 jav_ids 数据
- **WebDAV 同步支持 jav_ids**: 同步元数据包含 jav_ids 存储
- **host_permissions 扩展**: 添加坚果云等常见 WebDAV 服务器权限
- **数字等宽显示**: 添加 `.tabular-nums` 类，统计数据数字对齐优化

### Fixed
- **安全审计修复**:
  - 添加 sender ID 校验（content.ts, event-bus.ts）
  - 添加 DB store 名称白名单校验（DB_GET_WATCHED_IDS, DB_SYNC_PAGE_RECORD）
  - 添加 toast 类型白名单校验
  - 修复 linked platform 验证使用 return 而非 break 的问题
  - 移除 `<all_urls>` 权限，WebDAV 改用具体域名 + HTTPS
- **查询状态管理**:
  - 评分管理：添加 `hasQueryed` 标记，消除"未找到"闪烁
  - 关联查询：添加 `hasQueryed` 标记，消除"未找到"闪烁
  - 统一防抖逻辑 `debouncedQuery()`，防止查询重入
  - 平台/类型/来源切换时自动触发重新查询
- **UI 动画优化**:
  - 评分管理：查询状态使用 `<Transition>` 平滑过渡
  - 关联查询：查询状态使用 `<Transition>` 平滑过渡
  - 修复下拉菜单按钮 label 闪烁问题（添加全局动画 CSS 类）
- **CSS 动画合规**:
  - 添加 `@keyframes umm-enter/umm-exit` 动画定义
  - 添加 `animate-in/out`、`fade-in/out`、`zoom-in/out` 等工具类
  - 修复 `@keyframes` 命名冲突（添加 `umm-` 前缀）

### Changed
- **代码质量优化**:
  - 提取共享 `auto-detect.ts` 模块，统一自动检测逻辑
  - 使用 `useToast` 替代各处重复的 `showPageToast`
  - 移除 `Badge`、`Alert` 等未使用导入
  - `VALID_TOAST_TYPES` 提升到模块作用域
  - `ConfirmDialog` 图标类型标注
  - Reka-ui 触发器排除全局主题过渡
- **配置优化**:
  - `.gitignore` 补充 `.env.*` 变体、包管理器配置、构建产物等规则
  - WebDAV host_permissions 限制为 HTTPS 仅
- **导出功能**: jav_ids 空存储时不在导出中包含（节省空间）

### Removed
- 临时 jav_ids 导入入口
- 各处重复的 `showPageToast` 函数
- `<all_urls>` 过度权限

## [3.1.0] - 2026-06-12

### Fixed
- 选项页独立配置页面侧边栏精简：移除冗余 footer 和 tab 标题
- 关联查询 LinkedTab 缺少 Input/Label 组件导入

[3.4.0]: https://github.com/UnforgetMemory/um-multimedia-manager/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/UnforgetMemory/um-multimedia-manager/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/UnforgetMemory/um-multimedia-manager/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/UnforgetMemory/um-multimedia-manager/compare/v3.0.0...v3.1.0
