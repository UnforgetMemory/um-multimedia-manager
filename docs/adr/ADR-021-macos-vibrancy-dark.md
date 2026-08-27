# ADR-021: 暗色主题采用 macOS Vibrancy 风格系统

- **日期**: 2026-08-25
- **状态**: Accepted（用户提供 STYLEKIT macos-vibrancy Hard Prompt，要求严格遵守、禁止风格漂移）
- **前置**: ADR-018 三层令牌（本 ADR 仅重映射 Tier-2 暗色块，Tier-1 新增面板灰阶）；ADR-019/020 的对比度纪律全部继承

## 决策

### D1 三级灰阶面板系统
Tier-1 新增恒值令牌 `--umm-static-vibrancy-0/1/2`（#1c1c1e → #2c2c2e → #3a3a3c，Apple 式无色相深灰）。暗色别名层整体重映射：page=vib-0、card/surface-secondary=vib-1、bg-tertiary/hover 填充=vib-2；SPA `.dark` 的 background/card/popover/secondary/muted/accent/sidebar 同步。冷蓝灰（neutral-8xx）仅保留给亮色主题与中性文字档。

### D2 white-alpha 文字三档
暗色文字改为 Apple 式透明度白：primary 95% / secondary 72% / muted **58%**。偏离说明：stylekit 标注弱化档 white/40，但对卡面实测 3.4:1 违反其自身 WCAG AA 检查项 → 提至 58%（5.73–6.51:1），white/40 语义保留给纯装饰微字。

### D3 Apple 系统蓝的角色裁剪
`--umm-static-apple-blue #0a84ff` 只承担**文字级高亮**：ring/focus、选区（35% alpha）、island focus 边框。因白字配蓝底仅 4.03:1，禁止作为实底填充；链接使用提亮档 `apple-blue-bright #4da3ff`（vib-1 卡面 5.31:1）。实底按钮维持既有 AA 配对。

### D4 无渐变化 / 去辉光（暗色范围）
- global.ts legacy 注入层 24 条暗色 linear-gradient 全部转纯色（浅色渐变保留——stylekit 为暗色规范）
- design-tokens 暗色覆盖 neodb 四按钮渐变→纯色、彩色辉光→0 1px 2px 黑
- homepage 奖牌暗色改纯金属色（gold-500/n300/amber-600）+ 去光晕；ds:check 扩容 3 组 Vibrancy 断言（共 29）

### D5 island 毛玻璃
island bg 改 `rgb(28 28 30 / 0.8)`，消费端已有 blur(24px) saturate(180%) —— NSVisualEffectView 质感成立，无需新 CSS。

### D6 三处硬编码镜像同步
overlay 外壳/page-lock/theme-sync html 兜底的暗色底统一改为 vib-0 同源值；popup/options 预绘背景同步 #1c1c1e。

## 明确保留的偏离

| 偏离 | 理由 |
|---|---|
| 未引入衬线标题字体 | 字体随主题切换会造成跨主题回流抖动；如需启用建议全局身份级变更单独决策 |
| 功能性动画保留（spinner/shimmer/pulse-loading） | 规范禁的是**装饰性**动画；加载反馈属交互状态 |
| 头像/媒体圆形不变 | rounded-full 禁令针对装饰芯片；圆形头像为功能性识别 |
| 亮色主题不动 | stylekit 为暗色原生规范 |

## 影响
tokens.static.css（+4 恒值）、design-tokens.css/style.css 暗色块、global.ts（24 渐变→纯色 + 清理 6 个失效 END_DARK 导入）、homepage.css 奖牌、create-overlay/theme-sync/popup/options 底色镜像、check-design-tokens.cjs（29 组断言）。

**Wave-C 补充**：22 处 `border-radius:999px` 药丸 → `var(--umm-radius-lg)` 12px（含 island 改工具栏形态；圆形头像/图标钮不受影响）；createDialogTheme 暗色分支整体迁移 Vibrancy 灰阶 + Apple 蓝选区/焦点（white/25 输入焦点边框）。

**Wave-E 补充（light-DOM 语义变量单轨制重构）**：global.ts 全层重构——新增 `--usl-*` 语义角色表（THEME_VARS/THEME_VARS_DARK/GLOW_VARS，值插值自 Tier-3 常量），六大家族（搜索徽章/状态芯片/列表状态/NeoDB 按钮/首页徽章/评论徽章）全部改为变量消费；`ALL_STYLES_DARK` 从 ~120 行组件级暗色覆盖收缩为**纯变量翻转表**。消除三类历史缺陷：双源漂移（interest.css vs global.ts 各写一份）、规则顺序依赖（.umm-status--wish 墨色靠后置规则兜底）、data-umm-theme 失联（startThemeAttrSync 常驻同步补上信号通道）。配套：扫描器 v5 支持 Tier-3 常量插值 + 双向修饰符配对，legacy 层首次纳入全量审计（结论：仅存豁免对）。NeoDB 三钮统一 700 档纯色 × 白墨（5.02/5.48/7.90）。
