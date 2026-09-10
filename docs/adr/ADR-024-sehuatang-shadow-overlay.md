# ADR-024 色花堂 Shadow DOM Overlay 重建 + 详情缓存数据层

- 状态：accepted
- 日期：2026-09-09
- 决策者：用户 + umpp 会话
-  superseded 关系：取代已回滚的 ADR-023 草案（overlay-watched / enhance-watched 两版，备份于 .um.agents/tmp/）；本 ADR 吸收其教训（不做版块过滤、不替换数据语义、不破坏既有已看体系）

## 背景

2026-09-04 ~ 09-08 的渐进增强波次（控件重建/动效/已看链路/主题适配）落地后，用户实测反馈三类系统性问题，局部修复无法根治：

1. **数据链路卡顿** [Fact]：列表页每帖一次详情页 fetch（sehuatang.ts createCard → fetchDetailPage），30 帖 = 30 次带凭据请求 + 30 次主线程整页 DOMParser，仅取 2 个字段（封面 zoomfile/file、磁力 .blockcode li）；并发 4 限流不减量，且**零缓存**——每次翻页/刷新全额重抓。
2. **渲染编排失序** [Fact]：①首屏被 legacy content.ts 的 DB 健康检查串行门禁锁死（最多 8 次指数退避，最坏 ~25s 无 UI）；②逐卡 appendChild（N 次回流）+ 每卡触发统计查询（含全文档 querySelectorAll）+ fetch 完成异步回填造成持续布局偏移；③30 张封面同时 blur(14px)+scrim 的 GPU 合成压力；④入场级联 45ms 递增拖尾 ~4.5s。
3. **内嵌而非覆盖** [Fact]：UI 壳以 light DOM `body.prepend` 注入，仅 display:none 原帖表与 4 个控件——原生 Discuz 页头/导航/广告/侧栏/页脚全部保留渲染与交互，宿主 CSS 可泄漏进卡片（历史 gotcha），主题/背景靠 `!important` 对抗。
4. **已知缺陷** [Fact]：`.umm-sht-hide-viewed` 运行时 CSS 规则缺失（菜单 toggle 对已渲染卡片无即时效果）；无 record:updated 订阅（跨标签写入后本页状态过期）。

用户裁决（2026-09-09 决策面板）：①详情数据做 **IndexedDB 持久缓存**；②overlay **参考 douban 模式**全覆盖；③先本地 commit 固化基线（已执行：59480d0…c3fc5f9，v5.15.0）。

## 决策

### D1：双入口 Shadow DOM 全覆盖（douban 模式复用）

- **sehuatang-early.content**（document_start，已存在）：追加 URL 判型（仅 forumdisplay：`forum-{fid}-{page}.html` / `forum.php?mod=forumdisplay`）→ 命中即调用 douban `createOverlay()`：fixed inset:0 全屏不透明 shadow host + `body{overflow:hidden}` + loading 骨架 + startThemeSync。首帧即覆盖原页面，零 FOUC、零 Discuz 闪现。
- **sehuatang-main.content**（新建，document_idle，窄 matches `/forum*`）：**不经过** legacy content.ts 的 DB 健康检查串行链。编排顺序：
  1. initI18n → DOM 守卫 `#threadlisttableid`（不命中 → dismiss overlay 退出，douban detail 同款兜底）；
  2. 同步提取（行数据 + 面包屑/选项卡/分页，纯函数复用现有模块）；
  3. shadow root 一次性渲染（编译期 ?raw 样式组合 + DocumentFragment 单帧挂载 header/网格/floatbar）；
  4. 并行异步扇出：已看批量检查（hide ON 时骨架等待检查完成再换真卡，无中途 pop；超时/失败降级全量渲染）、详情懒加载（D3）、历史总阅（1 次缓存）；
  5. 入场动画仅首屏可见卡；MutationObserver AJAX 分页沿用；record:updated 订阅补齐跨标签同步。
- **legacy 摘除**：content.ts matches 移除 4 条 sehuatang、router.ts 移除路由、handlers/sehuatang.ts 删除（逻辑迁入 src/content/sehuatang/）；extract/controls/menu/paging/effects 的纯函数模块原样保留复用（已有测试锁定）。
- **非 Vue**：手写 DOM + shadow（douban mount-app 的 ~40 行等价物）；禁止 import douban main/css-map/pages（752KB 单 chunk 教训）。overlay host z-index=2147483000，全局弹层 .umm-overlay（2147483001）仍居上。
- 主入口调用 injectGlobalStyles()：check-viewed-panel/manual-add-panel/FloatingToast 等 light-DOM 组件依赖其 --usl-* 变量与组件样式（原页面被覆盖，注入零视觉成本）。

### D2：详情数据 IndexedDB 持久缓存（独立 DB）

- 新建独立数据库 **`umm-sehuatang-cache`**（v1，store `details`，keyPath `tid`），与主库 umm-media-db 完全隔离：不进 STORE_NAMES/BACKUP_STORES/migrate 链/导出导入/DataScheduler；background 端独立懒初始化，绕过主 DB 就绪门禁。
- 记录：`{ tid, imageUrl, magnetLink, cachedAt }`；TTL 7 天；上限 500 条，超限 LRU 淘汰最旧。
- 消息协议（MessageType + MessagePayloadMap + background switch + ResponseMessageMap/SuccessDataMap 四处同步）：
  - `SEHUATANG_CACHE_GET_BATCH { tids } → { entries }`（批量读，过期即 miss）
  - `SEHUATANG_CACHE_PUT { entries } → { ok }`（批量写 + 淘汰）
- **降级语义**：缓存层任何失败 = 直接 fetch——缓存是优化层，不是正确性层。

### D3：渲染管线正确顺序（消除卡顿根因）

1. document_start 壳 + 骨架（零等待）；
2. document_idle 行内数据（标题/日期/链接）**先行全量渲染**——首屏不依赖任何网络与 DB；
3. 已看检查异步到达后一次性批量应用类（单次类写入，无逐卡消息）；
4. 封面/磁力 **IntersectionObserver 懒加载**（rootMargin 预取）→ L1 内存 Map → D2 IndexedDB → 最后才 fetch（RequestQueue 并发 4 + 8s AbortController）；DOMParser 结果立即回填并写缓存；
5. 渲染纪律：DocumentFragment 单帧挂载；统计经卡片注册表增量维护（禁全文档扫描）；图片 `loading=lazy` + `decoding=async`；blur 仅作用于已加载未揭示封面；入场动画 transform/opacity only 且仅首屏可见卡；`prefers-reduced-motion` 全禁用（沿用）。

### D4：样式收编 Shadow

- 现 4 个运行时拼接 style 字符串（sehuatang/controls/effects/menu）收编为编译期常量 `src/content/sehuatang/styles.ts`（**TS 模板常量而非 ?raw**——项目测试链（Playwright node 侧）不解析 ?raw，且 global.ts/tokens.ts 已有 TS 样式常量先例）；「隐藏已看」以命令式显隐修复（`setGridHideViewed`，非持久 CSS 规则——保留「运行时标记只 dim 不隐藏」语义）；
- shadow 内令牌：tokens.static + design-tokens（`:host` / `:host(.umm-theme--dark)` 开关）+ usl 变量块（:host 作用域化复用 THEME_VARS 常量）——零裸色值，ds:check 门禁沿用；
- 主题：host `data-theme` + `umm-theme--*` 类（startThemeSync 既有机制）。

### D5：交互全量保留

面包屑/选项卡/窗口化分页悬浮栏/返回/发新帖（原生 DOM 保留于覆盖层下，click() 转发）/复制全部磁力（对未加载项并发补抓 + 进度提示）/菜单（手动添加/查询已阅/隐藏已看运行时即时生效——D4 修复）/统计三字段/模糊揭示/已看 dimmer/隐藏语义（初始只隐藏、运行时只 dim）/AJAX 分页同步/跨页保存失败诊断。

## 影响面

- 新增：`src/entrypoints/sehuatang-main.content/`、`src/content/sehuatang/`（overlay/app/styles.css/detail-cache）、`src/features/sehuatang-cache/`、`src/entrypoints/background/handlers/sehuatang-cache.ts`、`tests/unit/sehuatang-cache.spec.ts` 等。
- 修改：`sehuatang-early.content/index.ts`、`content.ts`（matches）、`content/router.ts`、`types/messages.ts`、`background.ts`、`handlers/sehuatang-{controls,effects,menu}.ts`（DOM 挂载目标改 shadow root）、content i18n locales（如需）。
- 删除：`handlers/sehuatang.ts`（D2 级，git 可恢复；功能由 src/content/sehuatang/app.ts 取代）。
- 不动：主 DB schema/migrate/备份链、jav_ids 已看体系、douban 体系、settings 项、popup/options。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| URL 判型误覆盖非列表页 | 主入口 DOM 守卫 + dismiss overlay 兜底（douban detail 同款） |
| SW 冷启动已看检查晚到 | hide ON 骨架等待 + 8s 超时降级全量渲染；hide OFF 先渲染后批量加类 |
| 缓存层故障 | 全路径降级直接 fetch；缓存零正确性依赖 |
| Discuz DOM 结构变化 | 选择器集中纯函数模块（extract/controls），测试锁定 |
| 原页面 JS 依赖（发新帖等） | DOM 完整保留于覆盖层下，click() 转发沿用 |
| 覆盖层遮挡全局弹层 | host z=2147483000 < .umm-overlay 2147483001 |

## 备选方案

- **保持内嵌 + 局部优化**：被否决——用户明确判定内嵌为结构性错误，且无法解决宿主 CSS 泄漏与 FOUC。
- **overlay + Vue app（douban-main 同构）**：被否决——752KB 单 chunk 教训（WXT content script IIFE 内联使代码切分失效）；色花堂 UI 复杂度手写 DOM 足够，体积预估 40-60KB。
- **缓存入主库新 store**：被否决——migration 版本链风险 vs 独立 DB 零迁移风险（ADR-023 旧 D2 同结论）。
- **sessionStorage 缓存**：被否决——用户明确指定 IndexedDB 持久缓存（跨会话存活）。
