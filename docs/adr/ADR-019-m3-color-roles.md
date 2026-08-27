# ADR-019: 色彩主题规范化 — Material 3 tonal roles 裁剪落地与对比度门禁

- **日期**: 2026-08-22
- **状态**: Accepted（用户确认方向：Material 3 tonal roles；缺陷遍布 popup/options/Douban overlay/legacy 注入/暗色全表面）
- **前置**: ADR-018 三层令牌模型（本 ADR 在其 Tier-2 内引入正式的角色体系，不推翻分层）

## 背景

ADR-018 完成了单一事实源收敛，但暴露两类问题：
1. **客观缺陷**：孤儿变量导致样式缺失（`--umm-titlebar-accent` 回退剥离后强调条消失、`--umm-bg-tertiary/--umm-info(-bg)/--umm-text-tertiary/--umm-accent-hover` 从未定义、`--umm-font-caption-size` Shadow DOM 内未定义）；light 下 `status-done` 绿色文本对白色对比度实测 3.77:1，低于 WCAG AA 4.5:1。
2. **规范缺失**：色阶步集不统一、无角色使用语义（哪档做底/边框/文本）、无对比度校验，「生动化」调整缺乏设计体系依据。

## 决策（参考 Material Design 3，裁剪贴合 UMM，非照抄）

### D1 引入 M3 式角色配对
采纳 M3 的核心语义结构，映射到既有 shadcn 变量名（消费方零迁移成本）：

| M3 Role | Light | Dark | UMM 载体 |
|---|---|---|---|
| primary / on-primary | tone40 / 100 | tone80 / tone20 | `--primary` / `--primary-foreground`（已符合） |
| primary-container / on-*-container | tone90 / tone30 | tone30 / tone90 | 新增 `--color-primary-container` 等 |
| surface（页面底） | **tone98 微灰** | tone6 深 | `--background`（修正：不再与卡片同为纯白） |
| surface-container-lowest（卡面） | white | tone13 | `--card` |
| surface-container-high | tone92 阶 | tone17 阶 | `--secondary` / `--muted` / `--accent` 统一取此带 |
| on-surface / on-surface-variant | tone10 / tone30 | tone90 / tone80 | `--foreground` / `--muted-foreground` |
| outline-variant（弱描边）/ outline（强描边/输入框） | tone80 / tone50 | tone30 / tone60 | `--border` / `--input` 分离 |
| error(-container) | red-600 / red-tint | red-400 / deep-red-tint | `--destructive` + 新增容器 |
| success / warning 扩展三件套 | 同 error 同构 | 同构 | `--color-state-*` 升级 |

### D2 彩色文本档位规则（修复 3.77 违规）
M3 原则「on-* 文本色取深档」落地为静态规则并脚本化：
- **Light**：彩色作为小号正文文本 → 用 **700 档**（≥4.5:1）；填充/图标可用 500–600
- **Dark**：文本用 300–400 档；填充用 500–700
- `scripts/check-design-tokens.cjs` 内置 WCAG 对比度校验模块，关键角色对全部断言 ≥4.5:1（大字号场景 ≥3:1 白名单）

### D3 Surface 层级重排（恢复空间层级）
Light：页面底 `neutral-25/50 微灰`，卡片纯白 → 卡片浮出；Dark 维持 bg=neutral-900 / card=neutral-850。
Douban overlay 同步：`--umm-color-surface`=微灰底、`--umm-card-bg`=白/暗卡，island/dialog 沿 surface 家族自动获得层级。

### D4 孤儿变量转正
`--umm-bg-tertiary`、`--umm-info(-bg)`、`--umm-text-tertiary`、`--umm-accent-hover`、`--umm-font-caption-size/weight` 正式进入 design-tokens/breakpoints 定义（已完成）；titlebar 默认条改挂 `--umm-brand-accent`（已完成）。ds:check 的 var 解析校验防止未来回归。

### D5 不做的事
- 不把变量重命名为 tone 数字（消费方大规模迁移无收益）
- 不引入 M3 动态取色（Chrome 扩展无 Wallpaper API 场景）
- 不照搬 M3 全部 ~30 角色：UMM 无 tertiary/quaternary 需求，裁剪保留 primary/error/success/warning 四组 + surface 家族

## 影响
- 改写：style.css（角色重排+container 扩展）、design-tokens.css（surface 家族）、tokens.ts（对齐）、Badge/Button（container 化）
- 新增：ds:check 对比度模块、DESIGN_GUIDE 角色矩阵与对比度表
- 兼容：shadcn 工具类名不变；`--color-state-*` 语义不变（值修正）

## 风险
- light 页面底变微灰为可感知视觉变化（正是规范要求；若观感不符再调 tone98↔97）
- 对比度断言可能暴露更多存量违例 → 逐个以「文本升档」修复而非放宽阈值

## 暗色抛光补遗（同日第二轮）

全暗色角色矩阵核算后修复两类问题：

1. **文字层级塌陷**：douban 暗色 text-secondary 与 muted 同为 neutral-400（5.82），三档变两档。secondary 恢复为 **neutral-300**（卡面 8.30），与浅色 600(7.13)/550(5.46) 的梯度对称；island-text-secondary 同步。
2. **tertiary 透明混合不达标**：`color-mix(... 70%)` 在浅色 3.47 / 暗色 3.60，doulists/celebrities/game-explore 页脚与 SPA `.text-tertiary-content`(72%) 均受影响 → 统一提至 **85%**（暗色 4.63–6.41、浅色 4.90）。

核算通过无需改动：暗色 accent-400 档对卡面全部 ≥4.57；on-accent 深墨对亮填充全部 ≥6.98；brand-accent-soft(950)+brand-400 = 5.67；tokens.ts 暗色状态药丸深底浅字逐对 AA。13 个无暗色块的页面 CSS 经扫描确认仅用语义变量与装饰阴影，自动适配无漏网。

## 暗色规范对齐轮（同日第三轮，用户要求全网调研 + 独特视觉）

调研说明：web_search 服务持续 404（基础设施故障），规范依据为公开稳定知识——M3 dark theme（on-surface=tone90 忌纯白正文；elevation 靠 surface-container 明度抬升）、Radix Colors dark（低强调文字 7–9:1、alpha hover）、Apple HIG（忌纯白、降饱和、强调色选区）。

对照审计结论与修复：
1. **douban 文字主档 n25(≈纯白) 违反 M3 tone90 原则** → 改 `neutral-100`（卡面 13.20:1），与 SPA `.dark --foreground` 跨表面对齐。
2. **island 暗色 bg=页面同色（n900@92%）零抬升** → 改 `neutral-850@94%`，落实 M3 容器抬升阶梯（page n900 < island n850 ≈ card）。
3. **独特签名**：新增品牌色染色的 `::selection`（SPA 用 `--primary`@30%、douban 用 `--umm-brand-accent`@32%，alpha 形式双主题免覆盖）——HIG/M3 认可的强调色用法，成为 UMM 暗色模式的可感知识别点。

审计通过保持不变：卡片 850>页面 900 抬升方向正确；hover 白 alpha@7% 即 Radix 模式；secondary/muted 两档（8.30/5.82）符合 Radix 灰阶节奏。未做：品牌 ramp 暗色降饱和（需动 Tier-1 全局恒值令牌，影响面大且缺用户视觉反馈回路，列为后续选项）。
