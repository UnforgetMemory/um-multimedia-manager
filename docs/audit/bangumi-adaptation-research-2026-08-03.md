# Bangumi 网站适配调研报告（2026-08-03）

- **日期**: 2026-08-03
- **状态**: ✅ 调研定稿（2026-08-03 用户确认：**无需 API**，纯 DOM 注入方案）
- **范围修订**: 用户指示「目前无需 api，直接通过详情页判断，以及其他的一些页面通过 id 判断等」→ API 部分（§4）降级为未来参考，当前实施 = 纯前端 DOM 注入
- **方式**: 3 路并行调研（UMM codebase 模式 / Bangumi 离线 DOM / Bangumi API v0）
- **支撑报告**:
  - `.omo/research/bangumi/codebase-patterns.md` — UMM legacy raw-injection「新增站点」完整实施手册
  - `.omo/research/bangumi/offline-dom.md` — 离线页面 DOM 分析（样本 `/subject/253`，已登录态）
  - `.omo/research/bangumi/api-reference.md` — API v0 参考手册（端点已实测）
- **标注**: **[Fact]** 已验证 / **[Assumption]** 推断 / **[Decision]** 建议决策

---

## 0. Executive Summary

**结论先行：Bangumi 适配走 legacy 原始注入体系（`content.ts → router.ts → handlers/`），不用新 Douban 的 Shadow DOM 体系。** 这是 UMM 现有 IMDb/NeoDB/TMDB 的同一套模式，有现成工厂 `createDetailPageHandler` 可复用，**预计只需新增 1 个 handler 文件 + 修改 10 个既有文件，零新增消息类型，不碰 background 逻辑**。

**当前范围（用户定稿）：不接 Bangumi API。** 详情页直接 DOM 判断并注入 umm-status；其他页面（`/subject/{id}/*` 子页、含条目卡片的列表页）通过 URL/卡片中的 subject id 判断。API 富化/收藏回写全部留作未来阶段。

- **站点性质**：纯服务端渲染 MPA + jQuery 渐进增强，无 SPA 路由 → `document_idle` 一次性注入即可，**MutationObserver 非必需** [Fact]
- **页面类型**：全站只有 `/subject/{id}` 详情页值得注入；其余（person/character/user/blog/浏览/榜单/日历/搜索）全部跳过 [Fact]
- **注入锚点**：收藏盒 `#panelInterestWrapper .SidePanel` 内、`form[name="rate-now"]` 之前（已登录态）；未登录降级 `#headerSubject .subjectNav` [Fact]
- **状态模型**：Bangumi 收藏 5 态（1想看/2看过/3在看/4搁置/5抛弃）vs UMM 4 态（0无/1想看/2看过/3在看）需做映射决策 [Assumption]
- **API 富化**：`GET /v0/subjects/{id}` 匿名可用（300s 缓存），一次请求拿全标题/封面/年份/评分/标签 [Fact]
- **收藏回写**（可选增强）：`PATCH /v0/users/-/collections/{id}` 需 Personal Access Token（bgm.tv/dev/app 生成，无过期）→ 仿 NeoDB token 设置页模式 [Decision]
- **限流**：3000 次/10min（均值 5 req/s）按 user_id 计，UMM DataScheduler 预算足够 [Fact]

---

## 1. 页面类型判定（详情页 vs 其他页）

全站内链仅 **`bgm.tv` 单域名**（图片 CDN `lain.bgm.tv`，天窗 `doujin.bgm.tv`）[Fact]。

| URL 模式 | 页面类型 | UMM 行为 |
|---|---|---|
| `/subject/{id}` | 条目详情（主页面） | ✅ **唯一注入目标**：状态按钮 + 元数据采集 |
| `/subject/{id}/ep` | 章节子页（含 `#headerSubject`） | ⚠️ 可选（锚点 `#headerSubject .subjectNav`） |
| `/subject/{id}/{characters\|persons\|relations\|comments\|...}` | 其余子页 | ⚠️ 可选：URL 含 id，可同锚点注入（DOM 元数据不全，建议仅状态按钮） |
| `/ep/{id}` | 单集页 | ❌（无条目语义，跳过） |
| `/person/{id}` `/character/{id}` | 人物/角色 | ❌ |
| `/user/*` `/blog/*` | 用户/日志 | ❌ |
| `/anime\|book\|music\|game` `/browser` `/chart` `/tag` `/calendar` | 浏览/榜单/日历 | ⚠️ 列表页可选增强：卡片 `a[href*="/subject/"]` 提取 id 后可显示已看标记（sehuatang/dimmer 模式，见 §3.4） |
| `/subject_search`（POST） | 搜索 | ❌ |
| `/wiki` `/index` `/group/*` `/settings` 等 | 杂项 | ❌ |

**判定规则（详情页双保险）** [Fact]：
1. URL 正则：`location.pathname.match(/\/subject\/(\d+)/)`
2. DOM 标记：`#headerSubject`（`typeof="v:Movie"`）或 `#bangumiInfo` / `#infobox` / `#panelInterestWrapper` 任一存在

**其他页面「通过 id 判断」**（用户确认的适配方向）[Assumption]：
- `/subject/{id}/*` 子页：URL 捕获组直接得 id，判定同详情页；注入锚点统一 `#headerSubject .subjectNav`（子页不全有 `#panelInterestWrapper`，未登录锚点天然兜底）
- 列表页（`/anime` `/list/{uid}/{status}` 等）：卡片容器内 `a[href*="/subject/"]` 逐卡提取 id → 批量 `DB_GET_WATCHED_IDS` 判断已看 → 可选标记（**注意：列表页 DOM 无离线样本，实施前需实测一次**）

---

## 2. 详情页元数据提取（全部 DOM 可取，无需 JS 状态）

| 字段 | 选择器 | 说明 |
|---|---|---|
| 条目 ID | URL 正则捕获组 | 回退：`initSubjectPrgs({id})` / `data-like-main-id` / 表单 action `/subject/{id}/interest/update` |
| 原名 | `#headerSubject h1.nameSingle a` 的 **text** | 例：カウボーイビバップ |
| 中文名 | 同一 `<a>` 的 **title** 属性 | 例：星际牛仔；兜底 `#infobox li:first-child` |
| 形态 | `h1.nameSingle small.grey` | TV / WEB / OVA |
| 封面 | `#bangumiInfo .infobox .cover img` | 线上 src 为 `//lain.bgm.tv/pic/cover/l/...` |
| 年份 | `#infobox li` 含「放送开始/出版」行 → `/(\d{4})年/` | 书籍取「出版」类字段 |
| 评分 | `.global_rating .global_score .number`（`v:average`，1 位小数） | 投票数 `#ChartWarpper .chart_desc span` |
| 简介 | `#subject_summary` | `collapsed` class 默认折叠 |
| 标签 | `.subject_tag_section .inner > a.l.meta > span` | |
| 状态回显 | `var INTEREST_TYPE = N`（1-5）或 `.interest_now` 文本 | 内联全局变量 |

⚠️ **URL 不带类型**（无 `/anime/subject/` 之类）：Bangumi subject 类型（1书/2动画/3音乐/4游戏/6三次元）需从 DOM 推断（infobox 关键词：「话数」→tv、「册数」→book）或 API `GET /v0/subjects/{id}` 的 `type` 字段 [Assumption]。

---

## 3. umm-status 注入方案

### 3.1 锚点（核心决策）

| 锚点 | 选择器 | 场景 | 评价 |
|---|---|---|---|
| **A（推荐）** | `#panelInterestWrapper .SidePanel` 内、`form[name="rate-now"]` 之前 | 已登录 | 始终可见、紧邻收藏语义、右列布局稳定 |
| **C（未登录降级）** | `#headerSubject .subjectNav` 尾部 | 未登录 | 全类型恒在、不依赖登录态 |
| B（可选增强） | `#panel #collectBoxForm` 内、`#submitBtnO` 前 | 已登录 | 模态内与「保存」同一视觉流，但默认隐藏 |

登录态检测：`#panelInterestWrapper` 存在与否（已登录才有收藏盒）[Fact]。

### 3.2 注入实现（照抄 imdb.ts 模式）

```ts
// createDetailPageHandler 配置（src/entrypoints/content/handlers/bangumi.ts）
createDetailPageHandler({
  platform: 'bangumi',
  titleSelector: '#headerSubject h1.nameSingle a',      // waitForElement 用
  scanFn: /* DOM 读状态/评分：INTEREST_TYPE 或 .interest_now + rate-tip */,
  renderFn: /* createStatusChip(type, status, rating, note) + insertAdjacentElement */,
  savedMessageKey: 'bangumi.saved',
})
```

- chip 为**纯 DOM div**（非 Shadow DOM），class `umm-status-chip`，`data-umm-owner="bangumi-{type}"` 幂等去重 [Fact]
- 样式由 `injectGlobalStyles()` 注入全局 `<style id="umm-global-styles">`，`!important` 对抗站点样式 [Fact]

### 3.3 样式冲突注意事项（bangumi.min.css，569KB）[Fact]

- **禁止复用裸 `.btn` class** —— 站点已占用（暗色有 `#3d3d3d` 变体）
- 建议仿 `.inputBtn` 胶囊按钮（`border-radius:50px`、`background:var(--primary-color,#f09199)`、白字、`padding:6px 18px`）
- 站点 CSS 变量：`--primary-color`（默认粉 `#f09199`）；暗色主题走 `html[data-theme=dark]` 前缀
- `#collect` 无独立 CSS 规则，样式由 `.collectType`/`.collectBox` 承担 → 注入元素用 `umm-` 前缀 + 内联样式避免被通用类误伤
- 星星评分 `.star-rating` 为雪碧图，勿覆盖
- ⚠️ 离线样本尾部 `#manga-button`/Vuetify 是**其他扩展注入的噪音，非站点元素**，实现时勿混淆

---

## 4. API 集成方案（✅ 当前范围外 — 用户确认无需 API，仅作未来参考保留）

### 4.1 核心端点

| 端点 | 用途 | 鉴权 | 关键字段 |
|---|---|---|---|
| `GET https://api.bgm.tv/v0/subjects/{id}` | 条目富化（核心） | 匿名（NSFW 需 token，否则 404） | `id,type,name,name_cn,summary,date,images{l,m,c,s,g},rating{score,rank,count},collection{wish,collect,doing,on_hold,dropped},tags,eps,volumes,nsfw`；服务端缓存 300s |
| `GET /v0/users/{u}/collections/{id}` | 查收藏状态 | 匿名（私有需 token） | 响应内嵌 `SlimSubject`（一条响应=富化+状态）；**未收藏返回 404** → 需当「未收藏」处理 |
| `POST/PATCH /v0/users/-/collections/{id}` | 创建/修改收藏（回写） | Bearer + `write:collection` | body 全可选：`type(1-5), rate(0=删评分), comment, tags([]=删全部), private, ep_status/vol_status` |
| `POST /v0/search/subjects` | 关键词搜索（跨平台匹配） | 无 | body `{keyword, sort, filter{type[],tag[],air_date,rating,nsfw}}`；返回完整 Subject，一次搜索即完成匹配 |
| `GET /v0/users/{u}/collections` | 全量拉取收藏（同步） | 匿名（私有需 token） | limit≤50，默认 30 |
| `GET /v0/me` | 校验 token | Bearer | — |

### 4.2 认证 [Decision]

- **推荐：Personal Access Token**（bgm.tv/dev/app 生成，无过期）→ 仿 NeoDB token 设置页模式，零 OAuth 回调开销
- OAuth2 authorization code 亦可：授权/换 token 均在 **bgm.tv**（非 api.bgm.tv），`expires_in=604800`（7 天），refresh_token 续期；`scope` 官方「尚未实现」，`write:collection` 默认授予
- v0 **不允许 query 传 token**，仅 `Authorization: Bearer`
- Token 只存 background/设置，绝不下发 content script

### 4.3 限流（源码确认，非旧社区数字）[Fact]

- 固定窗口 Redis 计数：**登录按 user_id、匿名按 IP**
- 默认 **3000 次 / 10min**（均值 5 req/s），超限封 **1h** 全 429
- 旧说「180/min、30/s」已过时
- UMM DataScheduler 限流/重试直接复用；429 后指数退避（退避需足够长，1h 级）

### 4.4 实用注意事项 [Fact]

- **Base URL**：`https://api.bgm.tv`（文档域名只是 Swagger 壳）
- **CORS**：`Allow-Origin: *` 实测，但服务端 origin 中间件对非 GET 校验 → **一律从 background 发请求**（`host_permissions: ["https://api.bgm.tv/*"]`），content script 不直接调
- **UA 必须自定义**（带项目名+版本，如 `UMM/5.6.0 (Chrome Extension)`），默认库 UA 可能被禁；禁 `database`/`Bangumi/1.0`
- **图片**：封面在 `lain.bgm.tv`，需加 host_permissions 或代理
- legacy `/v0/small`、`/search/subject/:keywords` 已废弃，不用

---

## 5. 消息流（零新增）

```
bangumi.ts handler
  → Store.dbGet  (DB_GET 消息)
  → Store.dbPut  (DB_PUT 消息)
  → Store.dbSyncPageRecord (DB_SYNC_PAGE_RECORD → RecordService.syncRecord 跨平台同步)
  → FloatingToast.success (t('bangumi.saved'))
```

现有通用消息类型（DB_GET/DB_PUT/DB_SYNC_PAGE_RECORD/SHOW_TOAST/HEALTH_CHECK）已完全覆盖，**background.ts 零改动** [Fact]。

### 跨平台关联

- providerId = Bangumi subject 数字 ID；store key `{type}::{providerId}`（如 `tv::253`）
- 同步模板抄 `neodb.ts` 的 `onSave` 钩子（从页面提取豆瓣/IMDb/TMDB 链接 → `linkedIds[platform]` → 低优先级写库）[Fact]
- 或经 API 搜索做 ID 匹配（`POST /v0/search/subjects` 返回完整 Subject）

---

## 6. 状态映射决策（待确认）[Assumption]

| Bangumi 收藏类型 | UMM status | 说明 |
|---|---|---|
| 1 想看 (wish) | 1 (wish) | 直接对应 |
| 2 看过 (collect) | 2 (done) | 直接对应 |
| 3 在看 (doing) | 3 (doing) | 直接对应 |
| 4 搁置 (on_hold) | ? | UMM 4 态无对应 → **建议归入 1 (wish)** 或先忽略 |
| 5 抛弃 (dropped) | ? | UMM 4 态无对应 → **建议归入 0 (none)** 或先忽略 |

反向（UMM → Bangumi）：done→2(collect)、doing→3(do)、wish→1(wish)、none→删除收藏或置 0。

> 备选：若产品要求完整 5 态，需扩 UMM status 模型（影响统计/导出/全部站点），**不推荐** —— 保持简单优先。

---

## 7. 最小改动清单（14 项，零新增消息）

| # | 文件 | 改动 |
|---|---|---|
| 1 | `src/entrypoints/content.ts` | `matches` 加 `'*://bgm.tv/*'`、`'*://bangumi.tv/*'`、`'*://chii.in/*'` |
| 2 | `src/entrypoints/content/router.ts` | `ROUTES` 加 bangumi 路由（match 三域名 → `handleBangumiDetailPage`） |
| 3 | `src/entrypoints/content/handlers/bangumi.ts`（**新建**） | `createDetailPageHandler` 组装：platform/scanFn（DOM 读状态+评分+类型推断）/renderFn（createStatusChip + 锚点注入）/savedMessageKey |
| 4 | `src/domain/platform/Platform.ts` | `KNOWN` 加 `'bangumi'`；`SPECIAL` 加 `bangumi: 'Bangumi'` |
| 5 | `src/domain/identity/Identity.ts` | `fromUrl` 加 bgm.tv 分支（`/subject/(\d+)` → type 映射）；`buildCanonicalUrl` 加 bangumi 分支 |
| 6 | `src/features/database/models.ts` | `STORE_NAMES.BANGUMI`；`RECORD_STORES` 加入；`DB_VERSION` 11→12 + v12 迁移段 |
| 7 | `src/types/index.ts` | `RecordStoreName` 联合加 `'bangumi_records'` |
| 8 | `src/entrypoints/background/handlers/db.ts` | **无需改**（白名单从 RECORD_STORES 派生） |
| 9 | `wxt.config.ts` | `host_permissions` 加 `'*://bgm.tv/*'`、`'*://bangumi.tv/*'`、`'*://chii.in/*'`（**无需 api.bgm.tv/lain.bgm.tv** —— 当前不接 API） |
| 10 | `src/entrypoints/content/i18n/locales.ts` | 4 locale 各加 `bangumi.saved`、`platform.bangumi` |
| 11 | `src/shared/locales/{en,zh-CN,zh-TW}.ts` | 各加 `platform.bangumi`（`npm run i18n:check` 门禁） |
| 12 | `src/config.ts` | **无需改**（Provider 自动派生自 KNOWN） |
| 13 | `src/features/database/api.ts` / `background.ts` | **无需改**（通用消息已够用） |
| 14 | （可选）设置页 | 加 Bangumi Personal Access Token 输入（仿 NeoDB）→ 收藏回写/NSFW 可见 |

**验收门禁**：`npm run type-check` → `npm run build`（AGENTS.md）；`npm run i18n:check`。

---

## 8. 分阶段实施建议

| 阶段 | 内容 | 依赖 | 说明 |
|---|---|---|---|
| **P1（✅ 当前范围）** | #1-11：详情页状态 chip 注入 + `/subject/{id}/*` 子页同锚点注入 + 本地记录 + 跨平台 sync | 无 | 纯 DOM 注入，零 API 依赖，`createDetailPageHandler` 现成工厂，预计 1 个新文件 |
| **P1b（可选增强）** | 列表页卡片已看标记（通过卡片链接 id 判断） | P1 | 参照 sehuatang/dimmer 模式；列表页 DOM 需实测确认 |
| **P2（未来）** | 背景调 `GET /v0/subjects/{id}` 补全元数据 | — | 用户已确认暂不需要 |
| **P3（未来）** | 设置页 token + 收藏回写 `PATCH /v0/users/-/collections/{id}` | — | 用户已确认暂不需要 |

> 用户定稿：「目前无需 api，直接通过详情页判断，以及其他的一些页面通过 id 判断等」→ **P1（+可选 P1b）即全部范围**。

---

## 9. 风险与边界

| 风险 | 等级 | 缓解 |
|---|---|---|
| 未登录页面渲染差异（收藏盒不存在） | 低 | 锚点降级 `#headerSubject .subjectNav` |
| Bangumi 改版（收藏盒重构） | 中 | 双保险判定（URL + DOM 标记）；titleSelector waitForElement 失败即静默跳过 |
| NSFW 条目 | 低 | 不接 API，纯 DOM 注入不受影响（隐藏项） |
| `.btn` class 冲突 | 低 | 禁裸 `.btn`，`umm-` 前缀 + 内联样式 |
| 搁置/抛弃状态无 UMM 对应 | 中 | 映射决策（§6），实施前需产品确认 |
| 列表页 DOM 无离线样本 | 中 | P1b 实施前实测一次列表页结构再定 |
| 限流 429（P2/P3 才涉及） | 低 | 不接 API，当前不适用（未来阶段启用） |

---

## 10. 结论

**Bangumi 适配完全契合 UMM 现有 legacy 原始注入体系**：一个 `bangumi.ts` handler + 10 处既有文件小改即可实现详情页 umm-status 注入与本地记录（P1），不引入 Shadow DOM、不新增消息类型、不重构 background。页面类型判断清晰（仅 `/subject/{id}` 注入），API 富化与收藏回写作为后续可选阶段。建议用户批准后按 P1 → P2 → P3 推进。
