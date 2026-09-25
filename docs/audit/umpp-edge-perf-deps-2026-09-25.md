# UMM 全面剖析 — 边界问题 / 性能优化 / 最新语法与依赖

- **日期**: 2026-09-25 00:10 +08:00（本地时钟；开放网页授时不可用，按 base-constraints 时间锚点次优先级）
- **状态**: 调研定稿（**纯只读，未改业务代码**）→ 待用户裁决执行波次
- **基线**: v5.17.1 · WXT 0.21.4 · TS 6.0.3 · Vite 8.2.2 · Vue 3.5.42 · Pinia 4.0.3 · Tailwind 4.3.3 · reka-ui 2.10.4 · Chrome 最低 119
- **方法**: umpp P0–P3；对照 2026-08-29 全栈调研 + 5.15–5.17 记忆增量 + 当前文件系统/命令实测
- **标注**: **[Fact]** 本地证据 · **[Assumption]** 推断 · **[Decision]** 需拍板
- **「最新」语义**: 依赖版本以 **npm registry 实时查询**为权威源（`npm outdated` / `npm view`，2026-09-25）；语法/平台边界以 Chrome 119 + ADR-008 实测结论为准。**Browser Use / IAB 开放网页检索在本会话工具面不可用**，未做 SERP 页面阅读——涉及第三方博客/未在 registry 的资讯标为信息缺口，不编造。

---

## 0. Executive Summary

代码库纪律面持续向好：消息层已类型化（`ResponseMessageMap`/`SuccessDataMap` + `never` 穷尽门禁）、跨平台同步已收敛到 `RecordService`、`icon-original.png` 死重已移出、`Promise.withResolvers`/`Map.groupBy`/`useTemplateRef`/ES2024 已落地。

本轮真正剩余的短板集中在 **4 类**：

| # | 主题 | 严重度 | 一句话 |
|---|------|--------|--------|
| 1 | **安全依赖** | **P0** | `adm-zip@0.6.0` 有 high 漏洞，**registry 已有修复版 0.6.1**（5.15 时「上游无修复」结论已过期） |
| 2 | **质量门禁假红** | P1 | `ds:check` 4 项失败 = 5.16.0 有意暗色调优未登记 SPOT_CHECKS，门禁长期红灯 |
| 3 | **性能残余** | P1–P2 | NeoDB 无超时、DataScheduler 串行长任务、PT dimmer 全表重扫、PriorityQueue `shift` O(n) |
| 4 | **依赖/工具链刷新** | P2 | patch/minor 共 11 包可升；major 3 包需评估（TS 7 仍阻塞于 vue-tsc） |

**不做**：douban-main 拆 chunk（用户 2026-08-29 已裁决不做）、大规模重构、空抽象、自动 commit/push。

---

## 1. 既有调研闭环核对（2026-08-29 → 2026-09-25）

| 既有发现 | 当前状态 | 证据 |
|---|---|---|
| P0-2 `icon-original.png` 680KB 死重 | ✅ **已修** | `dist/chrome-mv3` 与 `icons/` 均无该文件 [Fact] |
| X-1 / P1-1 `useCrossPlatformSync` 第二套同步引擎覆盖 rating | ✅ **已修** | 已委托 `Store.dbSyncPageRecord`（`useCrossPlatformSync.ts:68-77` 注释自证 + `RecordService.ts:143` 保留 rating）[Fact] |
| Wave 1.3/1.4 消息 any 源头 + 穷尽检查 | ✅ **已修** | `types/messages.ts` ResponseMessageMap/SuccessDataMap；`background.ts:407` `const _exhaustive: never = message` [Fact] |
| P0-3 超时 timer 泄漏 | ✅ **已修** | `data-scheduler.ts:180-214` `clearTimeout` 成对 [Fact] |
| Wave 2.1 douban-main 拆 chunk | ⏸️ **用户裁决不做** | decisions 2026-08-29；产物仍 `douban-main.js` **778,938 B** 单 chunk [Fact] |
| 3 处 `Promise<any>` 响应源头 | ✅ **主源头已修** | `context.ts` / `database/api.ts` 已接 ResponseMessageMap；残余见 §2.4 [Fact] |
| `Utils` 死方法 / 真死常量 / 孤儿脚本 | 大部分已清 | 2026-08-29 记忆 Wave 1.6/1.7 [Fact·记忆] |
| NeoDB 无 AbortController | ❌ **仍开放** | `features/neodb/api.ts:59-76` 裸 `fetch` + 递归重试，grep `AbortController` 0 命中 [Fact] |
| PriorityQueue `Array.shift` O(n) | ❌ **仍开放** | `priority-queue.ts:44` [Fact] |
| PT dimmer 写后全表 `clearResolvedMarkers` | ❌ **仍开放** | `dimmer/index.ts:229,237-239` [Fact] |
| `features/database` barrel 泄露 `mediaDB` | ❌ **仍开放** | `features/database/index.ts:3` `export * from './models'` [Fact] |
| `Identity` YouTube 死路径 | ❌ **仍开放（已文档化）** | `Identity.ts:158-167` KNOWN LIMITATION [Fact] |
| tsconfig 未开 `noUncheckedIndexedAccess` 等 | ❌ **仍开放** | `tsconfig.json` 仅 strict 系 + erasableSyntaxOnly [Fact] |
| tests/ + scripts/ 不在 type-check | ❌ **仍开放** | `tsconfig.json:36` `include` 仅 `src/**` [Fact] |

---

## 2. 边界问题清单（按用户可见 / 工程风险排序）

### 2.1 P0 · 安全：adm-zip 漏洞已有修复版（结论过期）

**[Fact]** `npm audit`（含 dev）：`adm-zip <=0.6.0` **1 high**（GHSA-vwc7-r8mq-g2x9 路径符号链接任意写 + GHSA-7q85-xj36-vmfc 解压内存 DoS）。  
**[Fact]** `npm outdated`：`adm-zip` Current `0.6.0` → Latest **`0.6.1`**；`npm audit` 提示 `fix available via npm audit fix`。  
**[Fact]** 5.15.1 决策写「latest 0.6.0 即在受影响区间、上游无修复」——**该结论相对 2026-09-25 registry 已失效**。  
**[Assumption]** 0.6.1 为安全修复版（audit 将 `<=0.6.0` 判为受影响）；影响面仍是 **devDependency + 3 个本地打包脚本**，不进扩展运行时。  
**[Decision]** 升 `adm-zip@0.6.1` 并跑 `package`/`unpack` 冒烟；或按原计划迁 `fflate`（更大变更，需单测）。

### 2.2 P1 · 质量门禁假红：ds:check 4 项

**[Fact]** `npm run ds:check` 当前 **FAILED (4)**：

| 常量 | tokens.ts 实际 | static 期望 | 来源 |
|---|---|---|---|
| `COLOR_PRIMARY_START_DARK` | `#3e63dd` | brand-600 `#3a55ec` | 5.16.0 Radix 暗色降饱和 |
| `COLOR_OVERLAY_TEXT_SECONDARY_DARK` | `#a9b4c6` | neutral-400 `#94a0b5` | 同上 |
| `COLOR_OVERLAY_TEXT_MUTED_DARK` | `#8b98ad` | neutral-400 `#94a0b5` | 同上 |
| `COLOR_OVERLAY_ACCENT_DARK` | `#9ba8f0` | brand-400 `#7e9bf9` | 同上 |

**[Assumption]** 为有意设计（CHANGELOG 5.16.0「dark 色系调优」+ 对比度仍过 AA），但 **SPOT_CHECKS 未登记** → 门禁无法区分「有意偏差」与「真漂移」。  
**[Decision]** 把 4 个 dark 值写入 `check-design-tokens.cjs` 的豁免/期望表，门禁回绿；禁止用「改回 static」破坏已验收视觉。

### 2.3 P1 · 正确性边界（低频但用户可见）

| # | 问题 | 证据 | 影响 |
|---|------|------|------|
| B1 | YouTube `Identity.fromUrl` 死路径（query 先被剥） | `Identity.ts:158-167` | YouTube 页不进 Identity 体系（视频 overlay 另有路径，属已知限制） |
| B2 | `upgradeDoubanImageSrc` **零单测** | `tests/` grep 0 命中 | 尺寸常量改动无回归锚点（5.16.1 umreview 已挂起） |
| B3 | detail `extractPhotos` 相关图未升 `x` | umreview Optional 挂起 | 部分剧照/相关图仍可能 404 |
| B4 | flaky：`sehuatang-search-extract` + `import.meta.env.DEV` | decisions 2026-09-23；worker 串扰 | 全量偶发 1 失败，单跑绿 |
| B5 | `AGENTS.md` 版本 **5.16.0** vs 实际 **5.17.1** | `AGENTS.md:5` | 文档漂移（5.17.0 发布记录已点名） |
| B6 | `requestQueue.QueueItem` 仍 `Promise<any>` | `requestQueue.ts:22-24` | 泛型 `enqueue<T>` 被内部 any 削弱（非消息层主路径） |
| B7 | migration/webdav/neodb 边界 `any` | `migration/models.ts`、`webdav/api.ts:159`、`neodb/api.ts:119,168` | 外部/迁移输入弱类型；webdav 有下游 allowlist 兜底 |

### 2.4 P2 · 架构/结构边界

| # | 问题 | 证据 | 建议 |
|---|------|------|------|
| S1 | `features/database` barrel `export * from './models'` 泄露 IDB 单例 | `index.ts:3` | 只导出 `Store` + `STORE_NAMES`；`models` 走深路径（内容脚本禁触 IDB 靠纪律） |
| S2 | `noUncheckedIndexedAccess` 仍不可开 | 记忆：需先解 `StoreRecordSnapshot` 可变性（`models.ts` 原地改 + deprecated 别名） | 保持排序约束，勿并行开 |
| S3 | type-check 盲区：`tests/**`、`scripts/**` | `tsconfig.json:36` | 扩大 include 或单独 tsconfig；死导出仍无 lint 补位 |
| S4 | `components.json` 别名漂移（`@/components` 不存在） | 2026-08-29 §4.6 | 低优先，shadcn 元数据 |
| S5 | i18n 双系统 locale 数不一致（vue-i18n 3 vs content 4） | 2026-08-29 §4.6 | 治理项，非紧急 |
| S6 | scenario 层缺位已被 composable 委托缓解，但 `useCrossPlatformSync` 仍 fat | `useCrossPlatformSync.ts` 339 行 | 已正确委托 domain；再拆属结构优化非缺陷 |

---

## 3. 性能优化剩余

### 3.1 P1 · NeoDB `fetchWithRetry` 无超时（SW 保活风险）

**[Fact]** `features/neodb/api.ts:59-76`：裸 `fetch`，无 `AbortController`；仅 5xx/网络错误各重试 3 次 + `sleep(1000)`。对比 `webdav/api.ts` 有 30s 超时。  
**[Assumption]** NeoDB 挂起时 SW 被 Promise 保活、消息端口悬挂。  
**[Decision]** AbortController 15–30s（与 WebDAV 对齐）；`NEODB_PUSH_RATING` 是否过 scheduler 另议。

### 3.2 P1 · DataScheduler 严格串行

**[Fact]** `processLoop` `await executeTask` 逐个执行（`data-scheduler.ts:153-175`）；`DEFAULT_TASK_TIMEOUT=8000`；rate 10/s。长任务（统计/导出/WebDAV）与交互级 `DB_GET/PUT` 争同一槽位。  
**[Assumption]** 重度用户在导出/备份时其它页保存会排队。  
**[Decision]** 长任务独立低优先级队列或旁路；重试回退与任务超时已部分解耦（timeoutHandle 已清），但仍可按「单次尝试」计超时。

### 3.3 P2 · PT dimmer 全表重扫

**[Fact]** `clearResolvedMarkers` 清 `[data-umm-resolved]` 后全表 `process()`（`dimmer/index.ts:223-241` 一带）；event-bus 广播可放大到 N tab。  
**[Decision]** 受影响行 patch + 定向广播（需特征测试铺垫，Wave 3 级）。

### 3.4 P2 · PriorityQueue / RequestQueue `Array.shift` O(n)

**[Fact]** `priority-queue.ts:44`、`requestQueue.ts:54` 均 `shift()`。MAX_QUEUE_SIZE=1000 时排空约 O(N²) 搬移。  
**[Decision]** head 指针或双端队列；收益小、改动极低风险。

### 3.5 有意保留（勿当缺陷再开）

- douban-main 单 chunk / 不拆 entry（用户裁决）
- content script IIFE 内联 CSS（WXT lib 模式约束）
- 双 toast 渲染实现（Shadow DOM 边界）
- 显式深路径导入（无 auto-imports）
- `chrome.*` 不切 `browser.*`

---

## 4. 最新语法（运行时基线 = Chrome 119）

### 4.1 已落地（保持）

| API / 语法 | 状态 |
|---|---|
| `target`/`lib` **ES2024** | 已开（tsconfig + wxt `build.target: es2024` 对齐） |
| `Map.groupBy`（Chrome 117+） | `handleAdultAvBatchAdd` 已用 |
| `Promise.withResolvers`（Chrome 119+） | requestQueue / detail-loader / Semaphore |
| `useTemplateRef`（Vue 3.5） | 3 处只读 |
| `toSorted`（ES2023） | webdav / detail App / hash-utils / scheduler-monitor |
| `satisfies` / `erasableSyntaxOnly` / `strict` 系 | 已开 |
| `never` 穷尽门禁 | `background.ts:407` |

### 4.2 可用但未用（Chrome 119 内）[Decision 候选]

| API | Chrome | 候选场景 | 优先级 |
|---|---|---|---|
| **`Object.groupBy`** | 117+（与 Map.groupBy 同提案） | 分组但键为对象字段、无需 Map 语义处 | 低；已有 Map.groupBy，无则 YAGNI |
| `Array.findLast` / `findLastFrom` | 117+ | 逆序查找 | 低 |
| `Change Array by copy` 其余（`toSpliced`/`with`/`toReversed`） | 110+ | 不可变数组更新 | 低-中；`models.ts` 原地改可借 `toSpliced` 语义（属 Wave 4 铺垫） |

### 4.3 超出基线 — **禁止**（minimum_chrome_version=119）

| API | 需要 | 结论 |
|---|---|---|
| `using` / Disposable | Chrome **134** | 禁用（type-check 亦因 lib 无 Disposable 报错） |
| `Array.fromAsync` | Chrome 121+ | 禁用 |
| Set 集合运算（union/intersection…） | Chrome 122+ | 禁用 |
| `Promise.try` | 更新的 Chrome | 禁用（未在本仓使用；勿引入） |

### 4.4 TS / Vue 语法前沿（registry 2026-09-25）

| 技术 | registry 现状 | 项目策略 |
|---|---|---|
| **TypeScript** | latest **7.0.2**；next **7.1.0-dev.20260924.1** | **保持 6.0.3**。ADR-008：vue-tsc 不能消费 TS7（无 `typescript/lib/tsc`）；7.1 正式 API 未出（next 仍 dev） |
| **Vue** | latest **3.5.43**（3.6 **尚未 stable**） | 保持 3.5.x，patch 即可；Vapor Mode 不适用（reka-ui VDOM） |
| **vue-tsc** | 3.3.11，peer `typescript >=5` | 未声明 TS7 支持；与 ADR 一致继续等 |

---

## 5. 最新可用依赖（npm registry 2026-09-25）

### 5.1 建议本轮升（semver 范围内 / 安全）

| 包 | 当前 | Wanted/Latest | 备注 |
|---|---|---|---|
| **adm-zip** | 0.6.0 | **0.6.1** | **安全修复，P0** |
| vite | 8.2.2 | 8.3.1 | 构建链 |
| vue | 3.5.42 | 3.5.43 | patch |
| vue-i18n | 11.4.10 | 11.4.12 | patch |
| reka-ui | 2.10.4 | 2.10.5 | patch |
| dompurify | 3.4.15 | 3.4.16 | patch |
| tailwind-merge | 3.6.0 | 3.7.0 | minor |
| @vitejs/plugin-vue | 6.0.8 | 6.0.9 | patch |
| tsx | 4.23.13 | 4.23.15 | patch |
| jsdom | 30.0.1 | 30.1.1 | patch（test） |
| @types/node | 24.13.4 | 24.13.6 | **保持 24.x** 对齐 Node 24 |

### 5.2 major — 需单独决策

| 包 | 当前 → latest | 建议 |
|---|---|---|
| @types/chrome | 0.2.9 → **0.3.0** | 可试升；type-check 门禁验证 API 面变化 |
| @vueuse/core | 14.4.0 → **15.0.0** | peer 仍 `vue ^3.5`；读 changelog 后升 |
| typescript | 6.0.3 → **7.0.2** | **不升**（vue-tsc 阻塞） |
| @types/node | 24.x → 26.x | **不升**（运行时 Node 24） |

### 5.3 已最新 / 无需动

`wxt@0.21.4`、`playwright@1.63.0`、`vue-tsc@3.3.11`、`pinia@4.0.3`、`tailwindcss@4.3.3`、`typescript@6.0.3`（有意锁）。

---

## 6. 集成优化路线图（建议波次）

> 约束：每波可独立验证；禁大规模重构；禁空抽象；修改前过门禁 A–E；**不自动 commit**。

### Wave A · 卫生 + 安全 + 门禁回绿（XS–S，建议立即）

| # | 动作 | 轴 |
|---|---|---|
| A1 | `adm-zip@0.6.1` + package/unpack 冒烟 | 安全 |
| A2 | ds:check 登记 4 个 dark 有意值，门禁回绿 | 治理 |
| A3 | AGENTS.md 版本 5.17.1 | 文档 |
| A4 | `upgradeDoubanImageSrc` 单测（纯函数） | 测试缺口 |
| A5 | 可选：范围内 patch 依赖一并升（vite/vue/i18n/reka…） | 依赖 |

**验收**: `type-check` 0 · `build` ok · `test:unit` 不新增失败（基线 11 既有 personage）· `ds:check` **全绿** · `i18n:check` · `npm audit` high=0。

### Wave B · 边界正确性 + 低风险性能（S–M）

| # | 动作 |
|---|---|
| B1 | NeoDB `fetchWithRetry` + AbortController 超时（15–30s） |
| B2 | `requestQueue` 泛型收窄（去掉 QueueItem any） |
| B3 | detail `extractPhotos` 升尺寸接 `upgradeDoubanImageSrc` |
| B4 | PriorityQueue/RequestQueue `shift` → head 指针 |
| B5 | flaky 测试：`import.meta.env.DEV` 隔离（beforeEach 重置 / 不共享 worker 全局） |

### Wave C · 治理（M，需特征测试则后置）

| # | 动作 | 前置 |
|---|---|---|
| C1 | `features/database` barrel 收窄 | 调用图 |
| C2 | DataScheduler 长任务旁路 | 调度特征测试 |
| C3 | PT dimmer 行级 patch + 定向广播 | dimmer 测试 |
| C4 | tsconfig include 扩到 tests/scripts 或独立 project | 修存量 |
| C5 | 快照可变性收敛 → 才开 `noUncheckedIndexedAccess` | 单独波 |

### 明确不做

见 §3.5 + TS 7 / Vue 3.6 stable / Vapor / `using` / 拆 douban-main。

---

## 7. 验证与方法学限制

- **[Fact]** 门禁 A–D：root 唯一 `C:/a/code/my/um-multimedia-manager`，remote `origin`，identity 已配，`main...origin/main` 同步。本轮**零修改业务源码**。
- **[Fact]** `npm outdated` / `npm view` / `npm audit` / `ds:check` / dist 体积为实测命令输出。
- **[限制]** 开放网页 SERP（Browser Use/IAB）本会话不可用 → 未阅读第三方「最新优化技术」文章；依赖版本不依赖网页。若需扩展 API/社区实践专题检索，需可启动 Browser Use 的环境补一轮。
- **[限制]** 未跑全量 `test:unit`（本轮只读；执行波次时以「不新增失败」为门禁）。

---

## 8. umpp 报告摘要

### 问题定义
在 5.15–5.17 大量落地后，系统性盘点**剩余边界问题、性能优化、最新语法/依赖**，避免重复已修项、避免过期结论（如 adm-zip）。

### 工程规格
- 优先级：安全依赖 > 门禁假红 > 用户可见边界 > 性能 > 结构治理 > 严格度。
- 运行时语法边界锁 **Chrome 119**；工具链锁 **TS 6 + vue-tsc** 直至 7.1 正式 API。
- 依赖升级走 npm registry 实测 + type-check/build/test 门禁。

### 变更文件
无（本报告新增 1 份 docs/audit 文档）。

### 验证结果
见 §7（命令实测清单）。

### 风险与剩余工作
- Wave A/B/C 未执行；adm-zip 0.6.1 需脚本冒烟确认 API 兼容。
- TS7 / Vue3.6 继续观望（ADR-008 附录路径）。

### 提交状态: 未提交（报告文件待 umcommit）

### ⚠️ 状态: COMPLETED（调研） / 待用户裁决执行波次
