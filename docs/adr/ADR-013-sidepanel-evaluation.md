# ADR-013: chrome.sidePanel API 可行性评估

- **日期**: 2026-08-05
- **状态**: Proposed
- **决策者**: 架构调研子代理（草案，待团队评审）

---

## 背景

### UMM 当前 UI 架构

UMM（Unified Multimedia Manager）是 Chrome MV3 扩展（当前版本 5.12.0），采用 Vue 3 + TypeScript + WXT + Tailwind CSS v4 技术栈，拥有两个独立的 Vue SPA 入口：

| 入口 | 文件 | 作用 | 生命周期 |
|---|---|---|---|
| `popup/` | `App.vue` + `main.ts` + `router.ts` + `pages/DashboardPage.vue` + `index.html` | 统计仪表盘 SPA | **临时弹窗**——点击工具栏图标弹出，关闭即销毁（Chrome popup 标准行为） |
| `options/` | `App.vue`（129 行）+ 路由子页 | 完整设置管理面板（6 个标签页：overview/rating/linked/sync/appearance/settings），`open_in_tab: true` 在独立浏览器标签页打开 | 持久——浏览器标签页，关闭后需重新打开 |

**popup 的当前结构**（基于 `DashboardPage.vue`）：

- 固定尺寸 `600px × 480px`（见 `popup/index.html` 第 8 行）
- 单一页面（`router.ts` 只有一条 catch-all 路由指向 `DashboardPage.vue`）
- 内容极简：8 张 `StatCard`（movie/tv/music/book/game/jav/bilibili/youtube 统计）+ 总数汇总 + 一个"打开管理面板"按钮（`window.open` 跳转 options）
- 通过 `appStore.loadData()` 在 `onMounted` 加载数据（经 `chrome.runtime.sendMessage` → background SW → IndexedDB）
- 弹出时初始化整个 Vue 应用（`createApp` + Pinia + i18n + router），关闭后全部销毁

**options 的当前结构**（基于 `options/App.vue`）：

- 侧边栏 + 主内容区布局，响应式（xl 以上固定侧边栏，以下抽屉式）
- `vue-router` 多路由（overview/rating/linked/sync/appearance/settings）
- 复杂表单交互（同步、外观、数据管理）

### 用户痛点

用户在浏览豆瓣（或其他支持平台）页面时，希望"边看边记录"——即一边查看作品详情一边操作 UMM 的记录功能。当前 popup 是临时弹窗：

1. 点击工具栏图标 → popup 弹出
2. 稍微点击页面其他区域 → popup 立即关闭，全部状态丢失
3. 需要再次操作 → 重新点击，Vue 应用重新初始化，重新加载数据

这种"反复开关 popup"的交互摩擦在"边看边记录"场景下尤为明显。

### chrome.sidePanel 能力概览

`chrome.sidePanel` API（Chrome 114+ 稳定发布，2023 年 5 月 GA）提供：

- **持久的侧边面板 UI**：不因失焦而关闭，与浏览器窗口同生命周期
- **跨标签页持久**：默认在所有标签页显示，可通过 `setOptions({ tabId })` 按标签页定制内容
- **全局/按标签页行为控制**：`setPanelBehavior({ openPanelOnActionClick })` 可让工具栏图标直接切换 sidePanel（替代 popup）
- **独立 HTML 页面**：与 popup 一样是扩展页面（extension page），可使用完整扩展 API
- **用户可调整宽度**：sidePanel 宽度由用户拖拽调整，开发者无法强制锁定

---

## 调研结论

### Fact 1: chrome.sidePanel 自 Chrome 114 起稳定可用

- **Fact**: `chrome.sidePanel` API 自 Chrome 114（2023 年 5 月）起进入稳定通道（非 origin trial），无需 feature flag。
- **Fact**: Chrome 114 当前为过时版本。Chrome 主版本约每 4 周发布一次，截至 2026 年 8 月，当前稳定版约为 Chrome 140+，Chrome 114 的覆盖率已接近 100%。
- **来源**: [Chrome Developers — Side panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

### Fact 2: sidePanel 与 popup 是互斥选择（openPanelOnActionClick）

- **Fact**: 若设置 `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`，点击工具栏图标将打开 sidePanel 而**不再**打开 popup。二者不能同时由工具栏图标触发。
- **Fact**: 若不设置 `openPanelOnActionClick: true`，则需通过 `chrome.sidePanel.open()` 程序化打开（通常绑定到 contextMenu 或特定用户手势），工具栏点击仍走 popup。
- **来源**: [Chrome Developers — Side panel API — Set panel behavior](https://developer.chrome.com/docs/extensions/reference/api/sidePanel#usage-open)

### Fact 3: sidePanel 宽度由用户控制，无 API 锁定

- **Fact**: sidePanel 的宽度由用户拖拽分隔条调整，扩展无法通过 API 强制设定或锁定宽度。最小约 280px，默认约 320–400px，最大可达窗口一半。
- **影响**: 面向窄宽度（min ~280px）和宽宽度两种极端都需做响应式适配。UMM 当前 popup 固定 600px，迁移后需重构为响应式。
- **来源**: [Chrome Developers — Side panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

### Fact 4: sidePanel 跨标签页持久，可按标签页定制

- **Fact**: sidePanel 默认在所有标签页持续显示，切换标签页时面板不关闭。
- **Fact**: `chrome.sidePanel.setOptions({ tabId, path, enabled })` 可为特定标签页设置不同的面板页面或启用/禁用。
- **Fact**: 面板内容是独立 HTML 页面，标签页切换时页面会重新加载（除非内容相同则可能复用），但扩展上下文（SW、IndexedDB）持久。
- **来源**: [Chrome Developers — Side panel API — Set panel options](https://developer.chrome.com/docs/extensions/reference/api/sidePanel#usage-per-tab)

### Fact 5: sidePanel 作为 extension page 拥有完整扩展 API 权限

- **Fact**: sidePanel 加载的是扩展 HTML 页面（`chrome-extension://<id>/sidepanel.html`），与 popup/options 一样可使用 `chrome.runtime`、`chrome.storage`、`chrome.tabs`、`chrome.scripting` 等完整扩展 API。
- **Fact**: UMM 的消息流（`chrome.runtime.sendMessage` → background SW → IndexedDB）在 sidePanel 中完全可用，无需架构变更。
- **来源**: [Chrome Developers — Extension pages](https://developer.chrome.com/docs/extensions/whatsnew) / [Side panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

### Fact 6: sidePanel 的 WXT 声明式支持

- **Fact**: WXT 支持通过 `entrypoints/sidepanel.html` + `entrypoints/sidepanel/` 目录声明 sidePanel 入口，manifest 的 `side_panel` 字段由 WXT 自动生成。
- **Fact**: 声明后需在 manifest `permissions` 中添加 `"sidePanel"`。
- **来源**: [WXT — Side Panel entrypoint](https://wxt.dev/guide/essentials/entrypoints/sidepanel.html) / [Chrome Manifest V3 — side_panel](https://developer.chrome.com/docs/extensions/reference/manifest/side-panel)

### Fact 7: 常见共存模式——popup 保留或由 sidePanel 替代

- **Fact**: 社区常见两种模式：
  1. **替代模式**：`openPanelOnActionClick: true`，工具栏点击直接开 sidePanel，移除 popup。适合"边看边操作"为主的扩展。
  2. **共存模式**：保留 popup 做轻量速览，sidePanel 做持久操作面板，通过 contextMenu 或某个 popup 内按钮触发 `chrome.sidePanel.open()` 打开。
- **Fact**: `chrome.sidePanel.open()` 必须在用户手势上下文中调用（如点击事件回调），不能在 SW 后台静默打开。
- **来源**: [Chrome Developers — Side panel API — Open a side panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel#usage-open) / [Stack Overflow — sidePanel open user gesture](https://stackoverflow.com/questions/tagged/chrome-side-panel-api)

### Fact 8: 当前项目 0 处使用 chrome.sidePanel

- **Fact**: 通过代码检索确认，UMM 项目当前无 `sidePanel` 权限声明（`wxt.config.ts` 第 14–21 行 permissions 数组仅含 `storage/notifications/alarms/contextMenus/scripting/activeTab`），无 `side_panel` manifest 字段，无 `sidepanel` 入口目录。
- **来源**: 本仓库 `wxt.config.ts` / `src/entrypoints/` 目录结构

---

## 可行性评估

### popup vs sidePanel 维度对比

| 维度 | popup（当前） | sidePanel |
|---|---|---|
| **生命周期** | 临时，失焦即销毁 | 持久，窗口生命周期内常驻 |
| **状态保持** | 关闭即丢失，每次重开需重新初始化 + 加载数据 | 跨标签页持久，状态在标签页切换间保持 |
| **尺寸** | 固定 `600px × 480px`（开发者完全控制） | 宽度用户拖拽（~280px ~ 窗口一半），高度铺满 |
| **响应式要求** | 低（固定尺寸） | 高（280px 到 800px+ 都需适配） |
| **工具栏图标行为** | 点击弹出 popup（默认） | 点击切换 sidePanel（需 `openPanelOnActionClick: true`） |
| **与页面共视** | 弹窗遮挡部分页面，需来回切换 | 并排显示，真正"边看边操作" |
| **初始化成本** | 每次打开都 `createApp` + Pinia + i18n + `loadData` | 首次加载后常驻，后续切换标签页成本低 |
| **迁移成本** | —（现状） | 中等：新建 sidepanel 入口 + 响应式重构 + manifest 权限 |
| **兼容性** | Chrome 0+（所有版本） | Chrome 114+（当前覆盖率 ~100%） |

### UMM popup 当前内容是否适合迁移？

**结论：部分适合，需区分"统计速览"与"操作面板"两类内容。**

UMM 当前 popup 内容（`DashboardPage.vue`）实际上是**纯统计速览 + 跳转入口**：

1. 8 张 `StatCard`——只读统计数字
2. 1 个总数汇总——只读
3. 1 个"打开管理面板"按钮——`window.open(options.html)`

**没有**任何记录操作（标记看过、打分、同步等）在 popup 内完成。真正需要"边看边操作"的记录功能，目前分布在：

- **Douban 内容脚本 overlay**（`content/douban/`，Shadow DOM 内的 Vue app）——这是用户在豆瓣页面"边看边记录"的实际载体
- **options 页面**——完整管理面板，但需切到独立标签页

**关键洞察**：用户痛点"边看边记录"在 UMM 中**已经由 Douban content overlay 解决**（Shadow DOM overlay 直接注入豆瓣页面），popup 并不是记录操作的入口。popup 的真实定位是"快速看一眼统计 + 跳转管理面板"。

因此：

- **将 popup 统计速览迁移到 sidePanel**：可行但收益有限。统计数字是只读的，持久常驻的sidePanel 显示静态统计意义不大——用户更可能在想"我现在共多少条记录"时点一下 popup 即可。
- **在 sidePanel 中新增"边看边记录"操作面板**：这才是 sidePanel 的价值所在，但它要求 sidePanel 承载记录操作 UI（标记/评分/同步按钮），而**当前 popup 没有这些 UI**，需新建。

### 共存方案评估

若采用 **共存模式**（保留 popup + 新增 sidePanel）：

- popup 保持现状（统计速览 + 跳转），零改动
- 新增 `sidepanel/` 入口，承载持久操作面板（记录标记、评分、快速同步状态）
- 通过 popup 内按钮或 contextMenu 调用 `chrome.sidePanel.open()` 触发
- 代价：维护两套 UI，存在功能重叠的认知负担

若采用 **替代模式**（`openPanelOnActionClick: true`，移除 popup）：

- 工具栏点击直接打开 sidePanel
- sidePanel 内同时承载统计速览 + 操作面板（需响应式重构）
- 失去 popup"即点即看、关了即走"的轻量体验——用户只想看统计时也要打开一个常驻面板
- popup 当前 600px 宽的固定布局必须重做为响应式（280px ~ 800px+）

### UX 影响

- **正面**：sidePanel 持久 + 共视，真正解决"边看边记录"的切换摩擦；跨标签页保持状态减少重复加载。
- **负面**：
  - 常驻 sidePanel 占用屏幕空间（尤其小屏笔记本），用户不操作时也挤占视野
  - 失去 popup"轻量即用即走"特性——纯统计速览场景被强加持久面板
  - 响应式适配工作（当前 popup 是固定 600px 单页面，sidePanel 需 280–800px+ 全适配）
  - WXT 多入口 + manifest 权限 + i18n 双系统补键（sidePanel 作为 extension page 用 vue-i18n）的工程成本

---

## 决策建议

### 建议：部分推荐——采用共存模式，sidePanel 作为"边看边记录"操作面板，popup 保持统计速览不变

**理由**：

1. **popup 当前定位明确**——纯统计速览 + 跳转，改造成本低但收益也低。统计数字是只读的，常驻 sidePanel 显示静态统计对用户价值有限。
2. **真正的"边看边记录"痛点**在 UMM 中主要由 Douban content overlay 承担，sidePanel 可作为 overlay 的补充（覆盖非 Douban 站点，或提供 overlay 之外的批量操作视图），而非替代 popup。
3. **共存模式零破坏**：popup 不动，sidePanel 作为新增入口渐进上线，可灰度验证用户是否真用。
4. **避免响应式大重构**：sidePanel 独立设计为窄列操作面板（~320px），无需迁入 popup 的 600px 固定布局，降低迁移成本。
5. 若后续验证 sidePanel 使用率低，可低成本移除而不影响 popup 现状。

**不推荐**直接采用替代模式（`openPanelOnActionClick: true` 移除 popup），理由：

- 丢失 popup 轻量速览体验
- 需将 popup 600px 固定布局全面响应式重构
- 对只想"看一眼统计"的用户造成常驻面板的屏幕占用负担

**不推荐**近期实施，理由：

- 当前 popup 已满足"看统计"需求，Douban overlay 已满足"边看边记录"需求
- sidePanel 的增量价值需先通过用户反馈验证（是否有用户明确抱怨 popup 反复开关影响记录操作）
- 建议先收集用户场景反馈，确认痛点真实存在后再启动实施

---

## 回滚方案

由于本 ADR 仅处于 Proposed 状态、未实施任何代码变更，无需回滚。

若后续实施共存方案后需回滚：

1. 删除 `src/entrypoints/sidepanel/` 入口目录及 `sidepanel.html`
2. 从 `wxt.config.ts` 的 `manifest.permissions` 移除 `"sidePanel"`
3. 移除 background SW 中 `chrome.sidePanel.setPanelBehavior` / `setOptions` 调用
4. 移除 contextMenu 或 popup 中触发 `chrome.sidePanel.open()` 的入口
5. 移除 sidePanel 相关 i18n 键（`src/shared/locales/`）
6. `npm run build` 验证产物无 sidePanel 残留

popup 与 options 在共存模式下未受影响，回滚零风险。

---

## 后续（不在本次范围）

以下事项为本 ADR 的自然后续，但**不在本次调研范围**内：

- [ ] 用户场景调研：收集"边看边记录"痛点的真实用户反馈，验证 sidePanel 价值假设
- [ ] sidePanel 操作面板 UI 设计：确定承载哪些记录操作（标记/评分/同步状态/快速搜索）
- [ ] 响应式布局方案：sidePanel 窄列（~280–400px）的组件适配设计
- [ ] WXT sidepanel 入口实现：`entrypoints/sidepanel.html` + `sidepanel/` 目录 + manifest 权限
- [ ] 非 Douban 站点的 sidePanel 集成：评估 sidePanel 是否可替代部分 legacy content overlay（`content/handlers/`）
- [ ] contextMenu 触发方案：在豆瓣等页面右键菜单提供"在侧栏打开记录面板"入口
- [ ] 性能评估：sidePanel 常驻对内存占用的实测（对比 popup 反复初始化）
- [ ] 若实施：更新 `docs/` 相关文档与 i18n 双系统键
