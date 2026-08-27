# ADR-020: on-color 全覆盖 — 文字/底色配对审计与门禁扩展

- **日期**: 2026-08-22
- **状态**: Accepted（用户报告：彩色底上字色不适配主题/底色，视觉识别困难）
- **前置**: ADR-018 三层令牌、ADR-019 M3 角色与状态三件套（本 ADR 将其 on-\* 纪律推广到全部 accent 填充并门禁化）

## 背景

全仓规则块扫描（80 对 text-on-fill 配对）发现三类系统性违规：

1. **暗色亮填充 × 固定近白字**：页面 accent 在暗色取亮档（brand-400 / indigo-400 / rose-400），却承载 `--umm-static-neutral-00` 白字（对比度 2.9–4.0 不等）——涉及 paginator 激活页码、各收藏页筛选按钮、标记按钮、类型徽标等约 40 处
2. **浅色中调填充白字临界不达标**：brand-500(4.29)、indigo-500(4.47)、rose-500(≈3.9) 作为填充配白字均低于 4.5:1
3. **高亮度填充类（amber/gold/金属渐变）承载白字**：金/银/铜排名瓷片、gold 实心徽标、amber accent 按钮（≤2.9:1）

依据：WCAG SC 1.4.3（正文 ≥4.5:1）/1.4.11（非文本 ≥3:1）、M3 on-\* 配对铁律（角色值随主题翻转）、Radix「11/12 文字专用档」「高亮度阶配深字」。调研说明：联网检索服务不可用（web_search 持续 404），规范依据为上述体系公开稳定知识。

## 决策

### D1 翻转令牌 `--umm-on-accent`
design-tokens.css 新增：light = neutral-00（白），dark = neutral-1000（深墨）。所有「主题自适应 accent 填充」上的文字一律引用该令牌，禁止写死白字。

### D2 浅色 accent 填充加深一档（满足白字 ≥4.5）
- `--umm-brand-accent` light：brand-500 → **brand-600**（strong 600→700）
- 各文件自定义 indigo accent（detail/photos/genre/profile/collect 系列）light：indigo-500 → **indigo-600**
- rose accent（personage/personage-creations/celebrities）light：rose-500 → **rose-600**
- NeoDB original 渐变 indigo-500→600 升为 600→700

### D3 高亮度类固定深字（Radix amber 规则）
amber/gold/金属渐变填充上的文字一律 `var(--umm-static-neutral-1000)`，双主题不变：排名瓷片（金银铜）、gold 实心徽标、user-reviews/review-detail 的 rd/rev amber accent 按钮。

### D4 金色文字改用文字专用档
金色调文本（评分数字、评分徽标）在浅色用 gold-700（≥4.5），暗色用 amber-400/300；不再以 gold-500 兼任文字。

### D5 门禁扩展
ds:check 对比度断言矩阵新增：on-accent 双主题对、indigo/rose-600 白字对、amber/gold 深字对、金色文字档对；后续新增 accent 角色必须随附 on 色与断言条目（准入流程）。

## 影响
- design-tokens.css（on-accent + brand 加深 + neodb-original）
- 约 20 个 Douban 页面 CSS 的字色替换（脚本化块级突变 + 特例手工）
- ds:check 断言扩容；DESIGN_GUIDE 补 on-accent 纪律
- 风险：accent 加深为可感知变化（正是规范要求）；金属瓷片深字改变观感但可读性质变提升

## 深扫补漏（同日第二轮，用户反馈「仍遗漏」后）

首轮扫描器只识别「同块 `var(--umm-static-neutral-00)`」模式，存在四类盲区。扩展扫描（字面量 white/#fff、TS 模板字符串、Vue 内联样式、muted 文字档）后新增修复：

| 盲区 | 修复 |
|---|---|
| L2 muted 文字档过低（2.83/3.55） | light=neutral-550(5.46) / dark=neutral-400(5.82)，island-muted 同步 |
| video-overlay `STATUS_COLORS` 橙/绿/蓝白字 | AA 化 `#4d5870/#b45309/#047857/#2563eb` |
| media-chips 暗色 color-mix 提亮致白字失效 | 删除提亮，双主题深底白字 |
| toast info/loading 亮端 blue-500 | 深化 brand-600/700、blue-600/700 |
| L1 状态徽章浅色档（LinkedTab） | unwatched=n500/watched=blue-600/done=green-700 |
| doulist-theme 对话框 9 处（accent 白字临界、muted/thead/empty/close/placeholder/unchecked） | 新增 `onAccent` 翻转 + 全档位提升；accent 按钮 `color:${theme.onAccent}` |
| check-viewed-panel 浅皮暗字（#aaa/#4caf50/#e0e0e0） | token 级 AA 字色 |
| bilibili 本地 STATUS_COLORS 副本 | 与共享 AA 集对齐（YouTube 走共享常量已覆盖） |
| doulist toggle #e74c3c 小字 | →#b91c1c |

ds:check 断言扩至 **26 组**；全仓 `f97316/22c55e` 亮色副本清零；残余白字均为「深填充配对」或 scrim 豁免上下文。

## 三轮深扫补漏（同日，用户反馈「继续修复」）

第三轮扫描器升级解决两类新盲区：**组件内局部自定义属性不可解析**（`--dc-accent`/`--umm-profile-accent` 等仅存在于单文件 `:host` 块，前两轮主题映射表解析不到 → 整片冲突静默漏报）与 **color-mix(transparent) 重复提取**（mix 内层 var 被通用正则当实底二次配对产生假阳性）。另新增跨规则级联配对（容器块设底、后代块设字的文件内推导）。

| 盲区 | 修复 |
|---|---|
| doulists `--dc-accent` light=rose-500 实底白字 3.67 | → rose-600（4.70），D2 rose 规则补漏到该文件 |
| xbar 激活计数芯片白字压 20% 白玻璃（暗色压 rose-400 ≈2.8） | 改描边芯片 + `color: inherit` 随 on-accent 双主题翻转 |
| homepage 奖牌暗色覆盖 `neutral-25` 近白墨压亮金属渐变（≈1.7–2.5） | 删除覆盖，深墨 neutral-1000 双主题不变（D3 强化） |
| 铜牌渐变尾停 amber-800 配深墨 2.72 | 尾停改 amber-600（6.06），保持铜色相区分金牌橄榄尾 |
| series doing 徽章 amber-600 字未达档（3.07） | → amber-700（4.84），与 done/wish 同构 |
| book/user/music/movie-profile 局部 indigo accent 仍是 500（D2 首轮漏改）：计数 3.66 / 音乐人芯片 4.10 / musician:hover 白字临界 | 四文件统一 indigo-500→600（≥5.15） |
| personage creation-status 金字 gold-500 压金 tint 2.22 | light→gold-800（5.62）+ 新增暗色 amber-300 覆盖 |
| personage 三状态徽章 15% 透明 tint 浮于封面图上无对比度下限（wish/do 实测 4.33/4.26 压线） | 改近实底药丸（light 100 档 @92% + 700 档字；dark 深色 @92% + 300 档字），加 backdrop-blur 对齐 cat-badge 既有模式 |
| UmmUserBar 过期 fallback 字面量（#6366f1/#9ca3af/#111827 等）构成失联即回归的低对比地雷 | 全部刷新为当前调色板等值 |

豁免判定维持三项：book-homepage activity 标签（图片+黑渐变 scrim 上）、photos 图库玻璃控件（0.92 黑幕上）、sehuatang 复制按钮禁用态（WCAG inactive UI 豁免）。ds:check 26 组断言保持全绿。
