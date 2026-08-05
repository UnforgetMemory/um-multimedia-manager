# UMM 一致性检查清单

> **所有新增/修改代码必须通过此清单。** 不符合的变更将被拒绝。

---

## 1. 设计 Token 检查

- [ ] **CSS 值必须使用 Token，禁止硬编码颜色/间距/字体**
  - Popup/Options: 使用 Tailwind `umm:` 类或 `var(--umm-*)` CSS 变量
  - Shadow DOM: 使用 `var(--umm-*)` 变量（定义在 `theme.css`）
  - 全局注入: 优先使用 CSS 变量引用，而非 JS 硬编码常量

- [ ] **禁止引入新的硬编码颜色值**
  - 所有颜色必须从 `@theme` 块（Popup）或 `theme.css` `:host` 变量（Shadow DOM）引用
  - 仅 `src/entrypoints/content/styles/tokens.ts` 中的 JS 常量作为过渡期例外

## 2. 组件复用检查

- [ ] **新增功能前，先搜索是否存在已有实现**
  - 状态标签 → 检查 `UmmStatusBadge` / `UmmStatusBadgeWrapper`
  - 图片展示 → 检查 `UmmImage` / `UmmImageWrapper`
  - 评级显示 → 检查 `UmmRating`
  - 媒体卡片 → 检查 `UmmMediaCard`
  - 页面布局 → 检查 `UmmPageLayout`
  - 弹窗通知 → 检查 `FloatingToast`
  - 按钮 → 检查 `shared/ui/button/` shadcn Button

- [ ] **禁止重复实现已有组件**
  - 如果已有组件不完全满足需求：**扩展它，不要重写**
  - 如果需要在不同上下文（Shadow DOM vs Popup）中使用：提取共用到共享模块

## 3. 样式层归属检查

- [ ] **确定新样式属于哪个层**

| 样式层 | 适用场景 | 目录 |
|--------|----------|------|
| **Popup/Options** | 弹窗、设置页 UI | `src/shared/styles/style.css` + `umm:` Tailwind 类 |
| **Shadow DOM** | Douban 覆盖层内元素 | `src/content/douban/styles/*.css`，?raw 导入 |
| **全局注入** | 宿主页面内元素（非 Shadow DOM） | `src/entrypoints/content/styles/global.ts` |

- [ ] **全局注入样式应尽可能少**：优先使用 Shadow DOM，仅在元素必须直接存在于宿主页面时使用全局注入
- [ ] **不要在错误层定义样式**：全局注入样式不能引用 Shadow DOM 变量，反之亦然

## 4. 主题系统检查

- [ ] **必须在亮/暗两种主题下验证视觉效果**
- [ ] **Shadow DOM 组件必须通过 `:host(.umm-theme--dark)` 支持暗色主题**
- [ ] **Popup/Options 组件通过 `dark:` 前缀或 `.dark` 父级选择器支持暗色主题**
- [ ] **全局注入样式必须通过 `document.documentElement.classList.contains('dark')` 检查动态切换**
- [ ] **主题切换不应导致闪烁**（Shadow DOM: 优先使用 `data-theme` 属性）

## 5. 响应式检查

- [ ] **所有布局必须适配 13 级断点系统（320px → 3200px）**
- [ ] **优先使用 `clamp()` 实现流体尺寸，而非固定值**
- [ ] **Shadow DOM 页面必须包含 `breakpoints.css` 在 composeStyles() 中**

## 6. 命名规范

- [ ] **Vue 组件**: `Umm` 前缀（PascalCase），如 `UmmMediaCard`、`UmmImage`
- [ ] **CSS 类名**: `umm-` 前缀（kebab-case），如 `umm-card`、`umm-status--done`
- [ ] **Tailwind 类**: 必须使用 `umm:` 前缀，如 `umm:bg-background`（禁止无前缀用法）
- [ ] **CSS 变量**: `--umm-*` 格式，如 `--umm-color-primary`
- [ ] **文件命名**: 与组件名一致（`UmmMediaCard.ts` 或 `media-card.css`）

## 7. 文件组织检查

- [ ] **Content Script 组件** → `src/content/douban/components/`（defineComponent）或 `src/content/douban/pages/*/components/`（.vue SFC）
- [ ] **Content Script 页面** → `src/content/douban/pages/*/App.vue`
- [ ] **Content Script 样式** → `src/content/douban/styles/*.css`
- [ ] **共享 UI 组件** → `src/shared/ui/*/`
- [ ] **Popup 组件** → `src/entrypoints/popup/components/`
- [ ] **Options 组件** → `src/entrypoints/options/tabs/`

## 8. 性能检查

- [ ] **避免在不必要的动画上使用高开销属性（box-shadow、backdrop-filter）**
- [ ] **Shadow DOM CSS 保持精简**：仅包含该页面所需的样式
- [ ] **全局注入样式仅在首次注入，不重复注入**
- [ ] **避免 @keyframes 重复定义**（已在 `common.css` 中的动画不再在其他文件中定义）

## 9. 代码审查触发条件

以下情况必须触发完整 review：

- [ ] 新增或修改了 CSS 变量定义
- [ ] 引入了新的组件类型（非已有组件的变体）
- [ ] 在全局注入样式或 Shadow DOM 中添加了新样式
- [ ] 修改了主题系统（亮/暗切换逻辑）
- [ ] 引入了新的 Tailwind 无前缀用法

---

*此清单随 DESIGN_GUIDE.md 更新而更新。如有冲突，以 DESIGN_GUIDE.md 为准。*