# ADR-012: chrome.offscreen API 可行性评估 — 2026-08-08

- **日期**: 2026-08-08
- **状态**: Proposed
- **决策**: 部分推荐（仅限无页面上下文的 SW 侧 HTML 解析场景；不替代现有 content script 架构）
- **依据**: 评估 `chrome.offscreen` API（Chrome 109+ GA）能否替代或增强 UMM 当前的 content script DOM 抽取架构，以及 SW 侧 `fetch` HTML 后经 offscreen 解析相比 content script 直提 DOM 的取舍。

---

## 背景

### UMM 当前内容脚本架构

UMM 是 Chrome MV3 扩展，统一管理豆瓣 / IMDb / NeoDB / TMDB / Bangumi / Mukaku / PT 站 / JavDB / Sehuatang 的观影收听记录。内容脚本分两套注入系统：

1. **Legacy 注入**（`src/entrypoints/content.ts` → `content/router.ts` → `handlers/`）：服务所有非 Douban 站点。`router.ts` 维护一张 `ROUTES` 表，按 URL 匹配分发到各站点 handler。URL 变化经 `watchUrlChanges()`（popstate + history.pushState/replaceState hook + 可见性轮询兜底）触发重新分发。
2. **新 Douban 注入**（`douban-early.content/` + `douban-main.content/`）：`document_start` 建 Shadow DOM overlay，`document_idle` 挂载 Vue app，32 个页面类型各走 `pages/{type}/` 四件套。

关键架构特征（源码佐证）：

| 特征 | 实现 | 依赖 content script 的程度 |
|---|---|---|
| **实时 DOM 观察** | Mukaku handler 用 `MutationObserver` + `IntersectionObserver` 监听 `.video-card` 懒加载卡片（`handler.ts` L437–471）；`processVisibleCards()` 在 SPA 导航后重新扫描 | **强依赖**：需要页面存活时的 DOM + observer |
| **页面 UI 注入** | NeoDB handler 注入 `.umm-status-chip`（`neodb.ts` L92–118）；Mukaku 注入 `.umm-mukaku-status` slot（`handler.ts` L341–346）；Douban 注入 Shadow DOM overlay | **强依赖**：必须向用户可见页面注入元素 |
| **SPA 路由感知** | `watchUrlChanges()` hook `pushState/replaceState`；Mukaku `resetForPage()` 在导航时清理 observer 并重建 | **强依赖**：需要页面 `window` / `history` 对象 |
| **SW 侧 fetch** | `features/neodb/api.ts` 在 background 侧 `fetch` NeoDB REST API（JSON）；`handleWebDAV*` 在 background 侧 fetch WebDAV | 不依赖 content script（纯 API 调用） |
| **消息路由** | `background.ts` 的 `handleMessage()` switch 路由 ~30 种 `MessageType`，content script 经 `chrome.runtime.sendMessage` 调用 | content script 是消息发起方 |

当前 `wxt.config.ts`（L14–21）声明权限：`storage / notifications / alarms / contextMenus / scripting / activeTab`。**无 `offscreen` 权限**，无 `minimum_chrome_version` 限制。全项目 grep `offscreen` 返回 0 处匹配。

### chrome.offscreen 能力概览

`chrome.offscreen` API（Chrome 109+ GA）允许 MV3 Service Worker 创建一个隐藏的、附加到 DOM 的 offscreen document。该 document 拥有完整的 DOM API（`document.createElement`、`DOMParser`、`canvas`、`audio` 等），可执行 SW 无法直接完成的 DOM 解析、音频播放、剪贴板操作等任务。

工作流程：SW 调用 `chrome.offscreen.createDocument()` → offscreen document 加载指定 HTML → SW 与 offscreen document 经 `chrome.runtime.sendMessage` 双向消息通信 → offscreen document 内脚本执行 DOM 操作 → 结果回传 SW → SW 调用 `chrome.offscreen.closeDocument()` 释放。

每个扩展同一时刻只能存活**一个** offscreen document。创建已有 document 会抛 `"Only a single offscreen document may be allowed"` 错误。

---

## 调研结论

### Fact 1 — API 状态与浏览器支持

> **Fact**: `chrome.offscreen` 自 Chrome 109（2022-11 正式版）起 GA（Generally Available），不需要 flag。
>
> 来源：[Chrome Developers — Offscreen Documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen)、[Chrome 109 release notes](https://developer.chrome.com/blog/new-in-chrome-109)

> **Fact**: Firefox 和 Safari **不支持** `chrome.offscreen`。UMM 当前仅面向 Chrome MV3（`wxt.config.ts` 无 Firefox/Safari 适配），此限制不影响当前决策，但若未来跨浏览器需保留 fallback。
>
> 来源：[MDN — browser.offscreen](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/offscreen)（标注 "Non-standard, Firefox only" 且 API 形态不同）

### Fact 2 — reasons 枚举（固定，不可扩展）

> **Fact**: `createDocument()` 的 `reasons` 参数是闭合枚举，必须声明至少一个，且必须与实际用途匹配。Chrome 当前定义以下值：
>
> | Reason 常量 | 用途 |
> |---|---|
> | `AUDIO_PLAYBACK` | 音频播放 |
> | `IFRAME_SCRIPTING` | 在 iframe 中执行脚本（需要 `WEB_AUTH` 可达性） |
> | `DOM_PARSER` | DOM 解析 / DOM 操作（如 `DOMParser`、`document.querySelector`） |
> | `USER_MEDIA` | `getUserMedia` / 音视频捕获 |
> | `DISPLAY_MEDIA` | `getDisplayMedia` 屏幕捕获 |
> | `WEB_RTC` | WebRTC 通信 |
> | `CLIPBOARD` | 剪贴板读写 |
> | `LOCAL_STORAGE` | localStorage / sessionStorage 访问 |
> | `WORKERS` | Worker（SharedWorker / ServiceWorker 代理等） |
> | `BATTERY_STATUS` | 电池状态 API |
> | `MATCH_MEDIA` | `window.matchMedia` |
> | `GEOLOCATION` | 地理位置API |
>
> UMM 若使用 offscreen 解析 HTML，应声明 `DOM_PARSER`。
>
> 来源：[Chrome Developers — Offscreen Reasons](https://developer.chrome.com/docs/extensions/reference/api/offscreen#reasons)、[Chromium offscreen_reasons.h](https://source.chromium.org/chromium/chromium/src/+/main:extensions/browser/api/offscreen/)

### Fact 3 — 单例约束与生命周期

> **Fact**: 每个扩展同时只能有一个存活的 offscreen document。重复创建抛 `Error: Only a single offscreen document may be allowed.`。需用 `hasDocument()` 或自管标志位检查。
>
> 来源：[Chrome Developers — Manage the lifecycle of an offscreen document](https://developer.chrome.com/docs/extensions/reference/api/offscreen#lifecycle)

> **Fact**: offscreen document 的生命周期不与 SW 生命周期绑定——SW 被 idle 回收后，offscreen document 可能继续存活。应在用完时显式 `closeDocument()` 或实现空闲超时关闭。
>
> 来源：[Chrome Developers — Offscreen Documents guide](https://developer.chrome.com/docs/extensions/develop/concepts/offscreen-documents)

### Fact 4 — 消息通信路径与开销

> **Fact**: SW 与 offscreen document 之间的通信路径是 `chrome.runtime.sendMessage` → `chrome.runtime.onMessage`，数据必须为**可结构化克隆**的 JSON 值（字符串 / 数字 / 对象 / 数组）。HTML 字符串需作为 string 经消息传输。
>
> 来源：[Chrome Developers — Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)

> **Fact**: Chrome `chrome.runtime.sendMessage` 没有文档化的硬性字节上限，但实践中单条消息建议 < 64 MB（超出 V8 序列化栈限制可能抛 `DataCloneError` 或 OOM）。一个典型的站点详情页 HTML 约 200 KB–1.5 MB，列表页可达数 MB。
>
> 来源：[Chrome Developers — sendMessage limits](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-sendMessage)、[Chromium IPC size limits](https://source.chromium.org/chromium/chromium/src/+/main:ipc/)

### Fact 5 — offscreen 不能替代 content script 的注入能力

> **Fact**: offscreen document 是**隐藏**的、独立于任何标签页的 document。它无法访问用户当前浏览的标签页 DOM，无法注入可见 UI，无法监听标签页的 `MutationObserver` / `IntersectionObserver`，无法 hook `history.pushState`。这些能力仍需 content script。
>
> 来源：[Chrome Developers — Offscreen Documents — "Offscreen documents do not have access to the DOM of any tab"](https://developer.chrome.com/docs/extensions/develop/concepts/offscreen-documents)

### Fact 6 — SW 已具备 fetch 能力（UMM 现状）

> **Fact**: MV3 Service Worker 已可直接 `fetch()` 跨域资源（需 host_permissions）。UMM 的 `features/neodb/api.ts` 已在 background 侧直接 `fetch` NeoDB REST API（`fetchCatalogByUrl` L116、`markItem` L159），`background/handlers/webdav.ts` 也在 SW 侧直接 fetch WebDAV。**对于 JSON API，SW fetch 已是现状，无需 offscreen。**
>
> 来源：UMM 源码 `src/features/neodb/api.ts` L116–149、`src/entrypoints/background.ts` L36

---

## 可行性评估

### 场景分类：适合用 offscreen 的场景

| # | 场景 | 描述 | 适合度 | 理由 |
|---|---|---|---|---|
| **A1** | SW 侧 fetch HTML 后解析为 DOM | SW fetch 第三方站点 HTML（已有 host_permissions），在 offscreen document 内用 `DOMParser` 解析并 `querySelector` 提取数据，无需注入 content script 到目标页面 | ✅ 适合 | SW 无 DOM API，offscreen 提供完整 `DOMParser` + `querySelector`；适合"无页面上下文的批量抓取"（如后台同步某用户书架页 HTML） |
| **A2** | 跨标签页 DOM 查询 | 用户在标签页 A，需要查询标签页 B 的 DOM 状态（如 PT 站列表页与详情页的关联） | ⚠️ 边缘适合 | 理论可用 `chrome.tabs.sendMessage` 把 B 的 HTML 传给 SW 再交给 offscreen，但 content script 直提更直接 |

### 场景分类：不适合用 offscreen 的场景

| # | 场景 | 描述 | 适合度 | 理由 |
|---|---|---|---|---|
| **B1** | 实时 DOM 观察 + SPA 导航 | Mukaku 的 `MutationObserver` + `IntersectionObserver` 监听懒加载卡片（`handler.ts` L437–471）、`watchUrlChanges()` hook `pushState/replaceState`（`router.ts` L225–260） | ❌ 不适合 | offscreen 无法访问标签页 DOM，无法挂 observer，无法 hook history API。这是 content script 的核心职责 |
| **B2** | 页面 UI 注入 | NeoDB 注入 `.umm-status-chip`（`neodb.ts` L92–118）、Mukaku 注入 `.umm-mukaku-status` slot（`handler.ts` L341–346）、Douban Shadow DOM overlay | ❌ 不适合 | offscreen document 对用户不可见，无法向用户浏览的页面注入任何可见元素 |
| **B3** | 用户交互监听 | content script 监听用户点击"同步"按钮、浮动 Toast 交互、`beforeunload` 清理 | ❌ 不适合 | offscreen 无用户交互面 |
| **B4** | SW 侧 JSON API 调用 | NeoDB REST API（`api.ts`）、WebDAV API（`webdav.ts`） | ❌ 不适合 | SW 已能直接 `fetch` JSON，无需 DOM 解析。UMM 现状即如此。offscreen 反而多一层消息中转开销 |
| **B5** | Douban 32 页面类型 | `content/douban/pages/{type}/` 四件套，需要 `document_start` 建 Shadow DOM + `document_idle` 挂 Vue app | ❌ 不适合 | 需要 Shadow DOM 完全样式隔离 + 页面生命周期时序控制，offscreen 无法提供 |

### 开销分析：offscreen 消息中转 HTML vs content script 直提 DOM

#### 路径对比

```
方案 X（content script 直提，UMM 现状）:
  Tab DOM → content script querySelector → {field: value}
  消息: content → SW:  {type, payload: {field: value}}  // 小 JSON 对象（KB 级）

方案 Y（SW fetch + offscreen 解析）:
  SW fetch(url) → response.text() → HTML string (200KB–1.5MB)
  SW → offscreen:  chrome.runtime.sendMessage({html: "...1MB..."})  // 结构化克隆 ~1MB
  offscreen: DOMParser + querySelector → {field: value}
  offscreen → SW:  chrome.runtime.sendMessage({data: {...}})  // 小 JSON 对象
  SW → content (可选):  chrome.tabs.sendMessage(tabId, {data})  // 再中转一次
```

#### 开销维度

| 维度 | 方案 X（content 直提） | 方案 Y（SW fetch + offscreen） | 取舍 |
|---|---|---|---|
| **消息体积** | KB 级（提取后的结构化数据） | 200KB–1.5MB（原始 HTML 字符串） | X 胜 100–1000× |
| **序列化开销** | 极低（小 JSON） | 结构化克隆 ~1MB string | X 胜 |
| **DOM 解析时机** | 浏览器已渲染，DOM 就绪 | offdocument 内 `DOMParser` 从字符串重建 DOM | X 胜（复用浏览器已构建的 DOM） |
| **网络开销** | 用户打开页面时浏览器已下载 HTML | SW 重复 fetch 一次同一 URL（除非已有缓存） | X 胜 |
| **认证/Cookie** | 浏览器自动带 cookie + CSP 上下文 | SW `fetch` 带 host_permissions 的 cookie，但跨域 CSRF token / Referer 可能缺失 | X 胜（页面上下文完整） |
| **SPA 动态内容** | 看到的是 JS 渲染后的实时 DOM | fetch 拿到的是原始 HTML（JS 未执行），可能缺失动态渲染内容 | X 胜（对 Mukaku 等 SPA 尤为关键） |
| **无需注入 content script** | N/A | SW 直接 fetch，无需向目标页面注入脚本 | Y 胜（隐蔽性 + 无需 manifest matches） |
| **批量/后台抓取** | 需要打开标签页才能提取 | SW 可在后台批量 fetch + 解析多个 URL | Y 胜 |

#### 结论

对于 UMM 的核心场景（用户正在浏览某站点页面、需要提取该页面的 DOM 数据），**方案 Y 的开销和正确性都劣于方案 X**：

1. **体积膨胀 100–1000×**：content script 直提只需传回提取后的字段（KB 级），offscreen 路径必须把整个 HTML 字符串经消息中转（MB 级）。
2. **SPA 动态内容丢失**：Mukaku（`web5.mukaku.com`）是 Vue SPA，`.video-card` 由 JS 动态渲染——SW `fetch` 拿到的原始 HTML 不含这些节点，offscreen 解析也无法复现。只有 content script 在页面 JS 执行后才能看到真实 DOM。NeoDB 同理（部分内容经 hydration 渲染）。
3. **认证上下文缺失**：Mukaku / PT 站需要登录态 + CSRF token + Referer 校验。content script 在页面上下文内运行，天然继承这些；SW `fetch` 可能因缺少 header 被拒绝。
4. **重复网络请求**：用户已打开页面（浏览器已下载 HTML），SW 再 fetch 一次是浪费。

方案 Y 唯一胜出的场景是**无页面上下文的批量后台抓取**——但 UMM 当前不存在此类场景（UMM 的后台操作都是 JSON API 调用：NeoDB REST API、WebDAV API）。

---

## 决策建议

### 部分推荐

**不推荐**用 `chrome.offscreen` 替代 UMM 现有的 content script DOM 抽取架构。**推荐**仅在以下未来场景引入：

1. ✅ **未来场景：SW 侧需要解析第三方 HTML（非 JSON API）**——例如未来 UMM 想在后台抓取某站点的"用户书架 HTML 页面"（非 JSON API）并提取记录。此时 SW `fetch` HTML → offscreen `DOMParser` 解析 → `querySelector` 提取 → 回传结构化数据。声明 `reasons: ['DOM_PARSER']`。
2. ❌ **不推荐**用于 Mukaku / NeoDB / Douban / IMDb / TMDB / Bangumi / PT 站的页面级 DOM 抽取——这些场景**强依赖**实时 DOM、SPA 路由观察、用户可见的 UI 注入，offscreen 无法满足。
3. ❌ **不推荐**用于 NeoDB REST API / WebDAV API 调用——这些是 JSON API，SW `fetch` 已是现状，无需 DOM 解析。

### 理由汇总

1. **架构契合度**：UMM 的 content script 架构（router + handlers + observers + UI 注入）深度耦合页面上下文。offscreen 是隐藏 document，无法访问标签页 DOM、无法注入可见 UI、无法监听 observer、无法 hook history——替代 content script 会丢失全部实时性和交互性。
2. **开销**：对于页面级提取，offscreen 路径的消息体积膨胀 100–1000×（HTML 字符串 vs 提取后字段），且重复网络请求。content script 直提在体积、网络、解析时机上全面更优。
3. **正确性风险**：SPA 站点（Mukaku、NeoDB hydration）的动态内容由 JS 渲染，SW `fetch` 原始 HTML 无法复现，offscreen `DOMParser` 也无法执行 JS。content script 是唯一能看到真实 DOM 的路径。
4. **认证上下文**：PT 站 / Mukaku 需要登录态 + CSRF + Referer，content script 天然继承页面上下文；SW `fetch` 可能被拒绝。
5. **当前无需求**：UMM 当前所有后台操作（NeoDB API、WebDAV）都是 JSON API 调用，不需要 DOM 解析。引入 offscreen 属于无场景的过度设计。

### 若未来引入 offscreen 的实施要点（备忘）

- `wxt.config.ts` permissions 增加 `'offscreen'`（当前无）。
- 在 `src/entrypoints/` 新建 offscreen 入口（如 `offscreen/index.html` + `offscreen/main.ts`），WXT 支持 `offscreen` entrypoint 类型。
- SW 侧封装 `ensureOffscreenDocument()` / `closeOffscreenDocument()` 管理单例生命周期（检查 `chrome.offscreen.hasDocument()`）。
- 消息协议：`{ target: 'offscreen', op: 'parseHtml', html: string, selectors: ... }` → offdocument 解析 → 回传 `{ data: {...} }`。
- 大 HTML（> 1 MB）考虑分片或流式，避免单条消息过大。

---

## 回滚方案

本 ADR 为**评估性质（Proposed）**，不涉及代码改动。若后续实施了 offscreen 集成并需要回滚：

1. **移除 offscreen entrypoint**：删除 `src/entrypoints/offscreen/`（或 WXT offscreen 入口）。
2. **移除 manifest 权限**：从 `wxt.config.ts` 的 `permissions` 数组移除 `'offscreen'`。
3. **移除 SW 侧 offscreen 管理代码**：删除 `ensureOffscreenDocument()` / `closeOffscreenDocument()` 及调用点。
4. **恢复调用方**：原本委托给 offscreen 解析的调用方，恢复为 content script 直提或 JSON API 调用（取决于场景）。
5. **验证**：`npm run type-check` + `npm run build` 确保无残留引用。grep `offscreen` 返回 0。

由于 offscreen 是纯增量能力（不修改现有 content script 路径），回滚不涉及数据迁移。

---

## 后续（不在本次范围）

- [ ] 若未来出现"后台批量抓取 HTML 页面"需求，编写 ADR-013 详述 offscreen 具体实施（entrypoint 结构、消息协议、大 HTML 分片策略）。
- [ ] 评估 `minimum_chrome_version: "109"` 对 UMM 用户基数的影响（Chrome 109 发布于 2022-11，当前应已无低版本用户，但需数据确认）。
- [ ] 评估 offscreen 与 WXT 的 entrypoint 集成方式（WXT 是否原生支持 `offscreen` entrypoint 类型，或需手写 HTML + scripting API 注册）。
- [ ] 本 ADR 不覆盖 content script 与 offscreen 混合架构的可能性（如 content script 提取 + offscreen 二次解析），留待未来场景驱动。

---

## 参考资料

- [Chrome Developers — Offscreen Documents API Reference](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Chrome Developers — Offscreen Documents guide](https://developer.chrome.com/docs/extensions/develop/concepts/offscreen-documents)
- [Chrome Developers — Reasons enumeration](https://developer.chrome.com/docs/extensions/reference/api/offscreen#reasons)
- [Chrome Developers — Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [MDN — browser.offscreen (Firefox)](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/offscreen)
- [Chrome 109 release notes](https://developer.chrome.com/blog/new-in-chrome-109)
- UMM 源码：`src/entrypoints/background.ts`、`src/entrypoints/content/router.ts`、`src/entrypoints/content/handlers/neodb.ts`、`src/entrypoints/content/handlers/mukaku/handler.ts`、`src/features/neodb/api.ts`、`wxt.config.ts`
