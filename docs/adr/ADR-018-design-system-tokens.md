# ADR-018: 设计体系统一 — DSH 式三层令牌模型与单一事实源

- **日期**: 2026-08-22
- **状态**: Accepted（随 umpp 全面样式重构波次执行落地）
- **依据**: docs/audit/css-audit.md（36% 共享令牌值不一致、27% CSS 重复）；docs/DESIGN_GUIDE.md（四套令牌系统并存现状）；DSH web 设计体系（`dsh-client-ui-theme/lib/styles/design-platform.css` 的 static→alias→specific 三层模型，经实测读取提取）

## 背景

UMM 样式分三层渲染上下文（SPA 文档 / Shadow DOM / 全局注入），历史上每层独立演化出各自的色彩定义：

| 层 | 载体 | 问题 |
|---|---|---|
| L1 Tailwind `@theme` | `src/shared/styles/style.css` | shadcn 中性近黑主色；`--umm-color-surface` 等在文件内重复定义两次 |
| L2 Shadow DOM | `src/content/douban/styles/design-tokens.css` + 43 个 css | 与 L1 同名令牌约 36% 值不一致；391 处硬编码 hex；页面各自定义 accent 变量 |
| L3 JS 注入常量 | `src/entrypoints/content/styles/tokens.ts` | 与 L2 值重复维护，靠注释约定同步 |

品牌色三处分裂（L1 近黑 / L2 `#4f6ef7` / L3 `#1757d6`），状态色语义冲突（wish 在 L1 为蓝、L3 为橙）。任何配色调整需人工同步 4 处，已发生漂移。

## 决策

### D1 采纳 DSH 式三层令牌模型，Tier-1 static 单一事实源

新增 `src/shared/styles/tokens.static.css` 作为**唯一允许书写原始色值的 CSS 文件**：

```
Tier1 static   tokens.static.css        「:root, :host」双选择器；主题无关色阶
Tier2 semantic style.css(:root/.dark)    只做 var() 引用，零字面量
               design-tokens.css(:host)  只做 var() 引用，零字面量
Tier3 specific --umm-island-* 等          组件侧写，可引用 Tier1/2
L3 tokens.ts   与 Tier1 同值派生         scripts/check-design-tokens.cjs 校验
```

`:root, :host` 双选择器使同一文件同时服务文档上下文（Tailwind 入口 `@import`）与 shadow 上下文（css-composer `?raw` 组合块首位）——shadow 内 `:root` 不匹配故需 `:host`。static 层明暗同值（DSH 特征），主题切换全部发生在 semantic 层。

### D2 弃用 shadcn 裸 HSL 三元组格式

`--background: 240 10% 3.9%` + `hsl(var(--background))` 消费模式改为直连颜色变量（`var(--umm-static-neutral-*)`）。理由：三元组格式是四套系统无法共享字面值的根因之一；Tailwind v4 以 color-mix 实现任意颜色格式的 opacity 修饰符，直连变量不损失能力。

### D3 配色方向：生动化但锚定既有品牌资产

- 品牌 = indigo-blue 渐阶（500 锚定现存 `#4f6ef7`），SPA primary/ring 由近黑切换为 brand-600/500；
- 中性色转向 DSH 式低饱和蓝灰（luminosity 对齐旧值，色相偏冷），明暗两版观感连续；
- 状态语义全局统一：done=green、wish=amber、watched/doing=blue、none=red、page-accent 按 hue 单变量注入；
- 图表分类色从品牌渐阶派生。

### D4 Icon button 推进与简约化

Button 组件扩展 `tonal`（品牌淡底）/`gradient`（品牌渐变）变体与 `xs/icon-sm` 尺寸；Douban overlay 分页器/标题栏按钮图标化（lucide-vue-next 已可用——Shadow DOM 页面本身是 Vue 应用）。文字按钮优先转图标+tooltip，降噪提效。

## 影响

- 新增：`tokens.static.css`、`scripts/check-design-tokens.cjs`（`npm run ds:check`）、IconButton
- 重写：`design-tokens.css`（别名层）、`style.css`（去重+接入 static）
- 批量替换：L2 页面 css 硬编码 hex → 令牌引用；`tokens.ts` 重生成对齐
- 文档：DESIGN_GUIDE.md 第 2 节重写为三层模型
- 兼容：CSS 变量名保持 `--umm-*` 前缀不变，消费方 API 不破坏；`hsl(var(--x))` 模式迁移点以 grep 清单驱动

## 风险

- Shadow DOM `?raw` 组合顺序敏感 → static 块必须为每个 preset 首位（PAGE_CSS_PRESETS 统一修改）
- opacity 修饰符依赖 color-mix → Chrome 111+（Manifest V3 目标环境满足）
- tokens.ts 手动同步仍可能漂移 → ds:check 脚本门禁
