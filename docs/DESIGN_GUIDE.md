# UMM Design Guide (UMM 设计指南)

> **本文档是 UMM 项目所有 UI 样式决策的单一权威来源。**
> 所有新的 UI 贡献在 PR 合并前必须对照此文档进行审查。
>
> This is the single source of truth for all UI styling decisions in the UMM project.
> Every new UI contribution MUST be reviewed against this document before merging.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Design Tokens (CSS Variables)](#2-design-tokens)
3. [Typography System](#3-typography-system)
4. [Spacing and Layout](#4-spacing-and-layout)
5. [Shadow DOM Styling Rules](#5-shadow-dom-styling-rules)
6. [Content Script Global Styling Rules](#6-content-script-global-styling)
7. [Popup / Options Styling Rules](#7-popup-options-styling)
8. [Component Naming and Hierarchy](#8-component-naming)
9. [Theme System](#9-theme-system)
10. [Component Reference & Duplication Audit](#10-component-reference)
11. [Consistency Checklist](#11-consistency-checklist)

---

## 1. Architecture Overview

UMM 的样式系统分为 **三层**，每一层对应不同的渲染上下文和隔离级别。每层使用不同的变量体系和样式注入方式。

### Three-Layer Architecture

```
┌────────────────────────────────────────────────────┐
│  Layer 1: Popup/Options (Tailwind v4 + shadcn/vue) │
│  Context: <html> (无 Shadow DOM, 标准 Vue SPA)      │
│  Entry:   src/shared/styles/style.css               │
│  Prefix:  umm: (如 umm:bg-background)              │
│  Theme:   Pinia store → .dark class on <html>      │
│  Scope:   Popup window, Options page                │
├────────────────────────────────────────────────────┤
│  Layer 2: Content Script Shadow DOM                 │
│  Context: <host> (Shadow DOM, Douban overlay)       │
│  Entry:   12 CSS files in                           │
│          src/content/douban/styles/                 │
│  Style:   Raw CSS via composeStyles()               │
│  Theme:   host(.umm-theme--dark) selectors          │
│  Scope:   Douban page overlays (homepage, detail,   │
│           search, celebrities, personage, photos,   │
│           trailer, interest dialog)                 │
├────────────────────────────────────────────────────┤
│  Layer 3: Content Script Global Injected Styles     │
│  Context: document.head (主机页面, 无隔离)           │
│  Entry:   src/entrypoints/content/styles/global.ts   │
│  Colors:  Hardcoded hex/rgba from tokens.ts         │
│  Theme:   data-status 属性 (无 CSS 变量)             │
│  Scope:   Search badges, status chips, NeoDB        │
│           buttons, dimmer effects, homepage badges  │
│           (在宿主页面 DOM 中渲染的元素)               │
└────────────────────────────────────────────────────┘
```

### When to Use Each Layer

| Scenario | Layer | Why |
|----------|-------|-----|
| Popup window / Options page | Layer 1 | Tailwind v4 hot-reload, shadcn components |
| Douban page overlay (homepage, detail) | Layer 2 | Style isolation from Douban's CSS |
| Badge on a search result link (injected into host page) | Layer 3 | Must render inside host document DOM |
| NeoDB push button | Layer 3 | Injected into host page interest section |
| Dimmer effect on PT/Mukaku sites | Layer 3 | Global effect on host page elements |
| A brand-new Douban page overlay | Layer 2 | Create a new CSS file in `styles/` dir |
| A new popup feature (stats, settings) | Layer 1 | Tailwind v4 + shadcn |

### File Organization Map

```
src/
├── shared/styles/
│   ├── style.css              ← Layer 1: Tailwind v4 entry + shadcn + UMM tokens
│   └── toast-css.ts           ← Shared: Toast CSS (consumed by Layer 2 & 3)
│
├── content/douban/styles/      ← Layer 2: Shadow DOM styles (12 files)
│   ├── theme.css               ← 基础 --umm-* CSS 变量 + 主题
│   ├── breakpoints.css         ← 13 级响应式断点系统
│   ├── page-layout.css         ← 页面骨架：header/content/footer
│   ├── common.css              ← 滚动条、shimmer、评级、状态徽章、Dynamic Island
│   ├── homepage.css            ← 首页：滚动区、卡片、Billboard
│   ├── search.css              ← 搜索：筛选器、结果卡片、分页器
│   ├── detail.css              ← 详情页：网格布局、评分、演员、评论
│   ├── interest.css            ← 标记兴趣度对话框
│   ├── celebrities.css         ← 演职员表页面
│   ├── personage.css           ← 人物资料页面
│   ├── photos.css              ← 照片画廊页面
│   └── trailer.css             ← 预告片页面
│
├── entrypoints/content/styles/ ← Layer 3: Global injected styles
│   ├── tokens.ts               ← 硬编码颜色常量 (无法使用 CSS 变量)
│   └── global.ts               ← JS 模板字符串注入到 document.head
│
├── shared/ui/                  ← shadcn/vue UI 组件
│   └── badge/index.ts          ← badgeVariants cva 定义
│
└── stores/theme.ts             ← 主题状态管理 (Pinia)
```

---

## 2. Design Tokens

UMM has **TWO separate CSS variable systems** that are NOT connected:

| System | Scope | File | Naming |
|--------|-------|------|--------|
| `@theme` block | Layer 1 (Tailwind) | `style.css` | `--umm-*` in `@theme {}` |
| `:host` variables | Layer 2 (Shadow DOM) | `theme.css`, `breakpoints.css`, `detail.css`, etc. | `--umm-*` in `:host {}` |

### CRITICAL: Atualm, esses dois sistemas são INDEPENDENTES.

Tanto `style.css` (`@theme`) quanto `theme.css` (`:host`) definem variáveis `--umm-*` com valores **diferentes**. Elas não se sincronizam. Um componente Shadow DOM usa as variáveis de `:host`; um componente Tailwind `umm:` usa as variáveis de `@theme `. Nunca assuma que `var(--umm-text-primary)` em um Shadow DOM equivale a `umm:text-primary` no Tailwind.

### 2.1 @theme Block Tokens (Layer 1)

Defined in `src/shared/styles/style.css` → `@theme {}` block.

**Color System (shadcn complete set):**

```css
/* HSL variables — actual values set in :root block */
--color-background:        hsl(var(--background));
--color-foreground:        hsl(var(--foreground));
--color-card:              hsl(var(--card));
--color-card-foreground:   hsl(var(--card-foreground));
--color-primary:           hsl(var(--primary));
--color-primary-foreground:hsl(var(--primary-foreground));
--color-secondary:         hsl(var(--secondary));
--color-secondary-foreground: hsl(var(--secondary-foreground));
--color-muted:             hsl(var(--muted));
--color-muted-foreground:  hsl(var(--muted-foreground));
--color-accent:            hsl(var(--accent));
--color-accent-foreground: hsl(var(--accent-foreground));
--color-destructive:       hsl(var(--destructive));
--color-destructive-foreground: hsl(var(--destructive-foreground));
--color-border:            hsl(var(--border));
--color-input:             hsl(var(--input));
--color-ring:              hsl(var(--ring));
```

**UMM Section System:**
```css
--umm-section-bg: transparent;
--umm-section-border: hsl(240 5.9% 90% / 0.5);
--umm-section-radius: 0.75rem;
--umm-section-padding: 1rem;
```

**UMM Element System:**
```css
--umm-element-radius: 0.5rem;
--umm-element-padding: 0.5rem 0.75rem;
--umm-element-gap: 0.5rem;
```

**UMM Interactive System:**
```css
--umm-interactive-bg: transparent;
--umm-interactive-hover: hsl(240 4.8% 95.9% / 0.8);
--umm-interactive-active: hsl(240 4.8% 95.9% / 0.6);
--umm-interactive-radius: 0.5rem;
```

**UMM Status Colors:**
```css
--umm-color-status-unknown: hsl(220 9% 46%);
--umm-color-status-unwatched: hsl(215 16% 47%);
--umm-color-status-watched: hsl(217 91% 60%);
--umm-color-status-done: hsl(160 84% 39%);
/* Dark theme overrides in .dark {} block */
```

**UMM Badge Colors (Layer 1):**
```css
--umm-badge-done-bg-start: rgba(17, 111, 70, 0.96);
--umm-badge-done-bg-end: rgba(11, 83, 53, 0.98);
--umm-badge-done-text: #f4fff8;
--umm-badge-done-border: rgba(198, 255, 228, 0.26);
--umm-badge-none-bg-start: rgba(164, 43, 60, 0.96);
--umm-badge-none-bg-end: rgba(126, 28, 48, 0.98);
--umm-badge-none-text: #fff7f8;
--umm-badge-none-border: rgba(255, 214, 220, 0.22);
--umm-badge-wish-bg-start: #2563eb;
--umm-badge-wish-bg-end: #1d4ed8;
--umm-badge-wish-text: #fff;
--umm-badge-wish-border: rgba(37, 99, 235, 0.3);
```

**Layout tokens:**
```css
--popup-max-width: 560px;
--page-margin: 20px;
--section-gap: 24px;
--card-padding: 16px;
--umm-space-0: 0;
--umm-space-1: 0.25rem;
--umm-space-2: 0.5rem;
--umm-space-3: 0.75rem;
--umm-space-4: 1rem;
/* ... up to --umm-space-20: 5rem */
```

### 2.2 :host Variables (Layer 2)

Defined in `src/content/douban/styles/theme.css` → `:host {}`.

**Core theme variables:**
```css
--umm-bg:                #ffffff;          /* Host page background */
--umm-bg-secondary:      #f8f9fa;          /* Card/section bg */
--umm-text-primary:      #1a1a1a;          /* Main text */
--umm-text-secondary:    #666666;          /* Subtitle text */
--umm-text-muted:        #aaaaaa;          /* Hint text */
--umm-border:            #e5e7eb;          /* Card borders */
--umm-link:              #1757d6;          /* Links / interactive */
--umm-link-hover:        #0d47b8;
```

**Dynamic Island variables:**
```css
--umm-island-bg:              color-mix(in srgb, #ffffff 92%, transparent);
--umm-island-border:          color-mix(in srgb, #e5e7eb 6%, transparent);
--umm-island-border-hover:    color-mix(in srgb, #e5e7eb 10%, transparent);
--umm-island-border-focus:    color-mix(in srgb, #1757d6 30%, transparent);
--umm-island-text-primary:    #1a1a1a;
--umm-island-text-secondary:  #666666;
--umm-island-text-muted:      #aaaaaa;
--umm-island-hover-bg:        rgba(0, 0, 0, 0.05);
--umm-island-active-bg:       rgba(0, 0, 0, 0.06);
--umm-island-divider:         color-mix(in srgb, #e5e7eb 8%, transparent);
```

**Rating gold tiers:**
```css
--umm-rating-gold-low:  #b8860b;  /* < 7.0 */
--umm-rating-gold-mid:  #c9941a;  /* 7.0-8.9 */
--umm-rating-gold-high: #d4a017;  /* >= 9.0 */
```

### 2.3 Detail Page Overrides (Layer 2)

`detail.css` redefines several `:host` variables in its own `:host {}` block:

```css
:host {
  --umm-accent: #6366f1;
  --umm-success: #116f46;
  --umm-success-bg: rgba(17, 111, 70, 0.1);
  --umm-card-bg: #ffffff;
  --umm-card-border: #e5e7eb;
  --umm-overlay-bg: rgba(0, 0, 0, 0.5);
  --umm-rating-score: #e0901a;
  --umm-rating-bar: #f5a623;
  --umm-font-3xl: clamp(1.25rem, 1rem + 1.25vw, 2.25rem);
  --umm-font-display: clamp(1.5rem, 1.1rem + 2vw, 3rem);
}
```

> ⚠️ Note: `detail.css` does NOT redefine `--umm-bg`, `--umm-text-primary`, etc. — those are inherited from `theme.css` via cascade. This relies on the CSS file order in `composeStyles()`.

### 2.4 Page-Specific Variable Overrides

Several pages define their own accent variables:

| Page | File | Override Variables |
|------|------|-------------------|
| Celebrities | `celebrities.css` | `--umm-celebrity-accent: #f43f5e`, `--umm-celebrity-card-bg`, `--umm-celebrity-card-border` |
| Personage | `personage.css` | `--umm-personage-accent: #f43f5e`, `--umm-personage-card-bg`, `--umm-personage-card-border` |
| Photos | `photos.css` | `--umm-accent: #6366f1`, `--umm-card-bg`, `--umm-card-border` |
| Trailers | `trailer.css` | `--umm-trailer-radius: 10px`, `--umm-trailer-aspect: 16/9` |

### 2.5 Hardcoded Color Tokens (Layer 3)

Defined in `src/entrypoints/content/styles/tokens.ts`. Used by `global.ts` for injecting styles into the host page (outside Shadow DOM).

```typescript
export const COLOR_PRIMARY_START = '#1757d6'
export const COLOR_PRIMARY_END = '#0d47b8'
export const COLOR_PRIMARY_SHADOW = 'rgba(13, 71, 184, 0.3)'
export const COLOR_DONE_START = 'rgba(17, 111, 70, 0.96)'
export const COLOR_DONE_END = 'rgba(11, 83, 53, 0.98)'
export const COLOR_DONE_TEXT = '#f4fff8'
export const COLOR_NONE_START = 'rgba(164, 43, 60, 0.96)'
export const COLOR_NONE_END = 'rgba(126, 28, 48, 0.98)'
export const COLOR_NONE_TEXT = '#fff7f8'
// ... and more
```

> ⚠️ **Migration Note**: These colors DUPLICATE the values in `theme.css` and `style.css` but as hardcoded constants. They exist because global injected styles (Layer 3) can't use CSS variables (they're injected into a scope where those variables don't exist). Future work should consider a shared source of truth.

### 2.6 Token Naming Convention Rules

| Pattern | Example | Layer | Purpose |
|---------|---------|-------|---------|
| `--umm-*` | `--umm-bg` | Layer 1 & 2 | All UMM design tokens |
| `--umm-<component>-*` | `--umm-island-bg` | Layer 2 | Component-specific scoping |
| `--umm-font-<name>-size` | `--umm-font-h1-size` | Layer 1 | Typography sizing |
| `--umm-space-<scale>` | `--umm-space-4` | Layer 1 & 2 | Spacing scale |
| `--color-*` | `--color-background` | Layer 1 | shadcn standard tokens |
| `--radius-*` | `--radius-lg` | Layer 1 | Border radius (shadcn) |
| `--umm-color-*` | `--umm-color-primary` | Layer 1 | UMM profile colors |
| `--umm-badge-<status>-*` | `--umm-badge-done-bg-start` | Layer 1 | Badge gradients |
| `COLOR_*` | `COLOR_DONE_START` | Layer 3 | Hardcoded constants |
| `--umm-celebrity-*` | `--umm-celebrity-accent` | Layer 2 | Page-specific overrides |

Rules:
1. **Layer 1**: Always within `@theme {}` in `style.css`
2. **Layer 2**: Always within `:host {}` blocks in individual CSS files
3. **Layer 3**: Always as exported consts in `tokens.ts`
4. NEVER define the same token name with different values in two places
5. NEVER use hardcoded colors in Vue SFCs — always reference variables

---

## 3. Typography System

UMM has two separate typography scales — one for each layer.

### 3.1 Layer 1: Tailwind Typography (@theme block)

Defined in `style.css` `@theme {}`. Uses `clamp()` for responsive sizing:

```css
--umm-font-display-size:    clamp(2rem, 1.5rem + 1.5vw, 4rem);
--umm-font-h1-size:         clamp(1.25rem, 1rem + 0.75vw, 2.25rem);
--umm-font-h2-size:         clamp(1rem, 0.875rem + 0.375vw, 1.5rem);
--umm-font-h3-size:         clamp(0.875rem, 0.75rem + 0.375vw, 1.25rem);
--umm-font-body-size:       clamp(0.875rem, 0.75rem + 0.375vw, 1.25rem);
--umm-font-caption-size:    clamp(0.75rem, 0.625rem + 0.375vw, 1rem);
--umm-font-mono-size:       clamp(0.75rem, 0.625rem + 0.375vw, 1rem);
```

**Usage in templates:**

```html
<!-- Use utility classes (preferred) -->
<h1 class="font-h1">Title</h1>
<p class="font-body">Body text</p>
<span class="font-caption">Hint text</span>

<!-- Or Tailwind classes with umm: prefix -->
<p class="umm:text-xl umm:font-semibold">Large text</p>
```

**Font utility classes defined in `style.css`:**
```css
.font-display { font-size: var(--umm-font-display-size); font-weight: 700; line-height: 1.1; }
.font-h1      { font-size: var(--umm-font-h1-size); font-weight: 600; line-height: 1.3; }
.font-h2      { font-size: var(--umm-font-h2-size); font-weight: 600; line-height: 1.4; }
.font-h3      { font-size: var(--umm-font-h3-size); font-weight: 600; line-height: 1.4; }
.font-body    { font-size: var(--umm-font-body-size); font-weight: 400; line-height: 1.6; }
.font-caption { font-size: var(--umm-font-caption-size); font-weight: 400; line-height: 1.5; }
.font-mono    { font-family: ui-monospace, ...; font-size: var(--umm-font-mono-size); line-height: 1.5; }
```

### 3.2 Layer 2: Shadow DOM Typography (breakpoints.css)

Defined in `src/content/douban/styles/breakpoints.css`.

Uses a **13-level responsive system** with both `clamp()` defaults and `@media` overrides:

```css
/* Base (clamp fallback for in-between screens) */
:host {
  --umm-font-xs: clamp(0.65rem, 0.58rem + 0.35vw, 1rem);
  --umm-font-sm: clamp(0.75rem, 0.65rem + 0.5vw, 1.25rem);
  --umm-font-base: clamp(0.85rem, 0.72rem + 0.65vw, 1.5rem);
  --umm-font-md: clamp(0.95rem, 0.78rem + 0.85vw, 1.875rem);
  --umm-font-lg: clamp(1.125rem, 0.875rem + 1.25vw, 2.75rem);
  --umm-font-xl: clamp(1.375rem, 1rem + 1.875vw, 3.75rem);
  --umm-font-2xl: clamp(1.75rem, 1.1rem + 3.25vw, 5.5rem);
}
```

**13 Breakpoints:**

| Breakpoint | Width | Usage |
|------------|-------|-------|
| Mobile S | 320px | Old phones |
| Mobile M | 375px | iPhone SE/12 Mini |
| Mobile L | 480px | Large phones |
| Tablet S | 640px | iPad Mini portrait |
| Tablet L | 768px | iPad portrait |
| Laptop S | 1024px | iPad landscape / small laptop |
| Laptop L | 1280px | Standard laptop |
| Desktop HD | 1536px | Large desktop |
| Desktop FHD | 1920px | Full HD |
| Desktop QHD | 2560px | 2K |
| Desktop 3K | 3200px | 3K display |
| 4K | 3840px | 4K UHD |
| 5K | 5120px | 5K display |

Each breakpoint overrides: `--umm-font-{xs,sm,base,md,lg,xl,2xl}` and `--umm-space-{xs,sm,md,lg,xl,2xl}` and `--umm-card-{width,height,radius}`.

### 3.3 Font Families

| Context | Font Stack |
|---------|-----------|
| Layer 1 (Tailwind / shadcn) | Tailwind default (system stack) |
| Layer 2 (Shadow DOM) | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |
| Layer 3 (Global injected) | Inherits from host page; explicitly set in `.umm-toast` etc. |

### 3.4 When to Use clamp() vs Fixed Values

| Situation | Approach | Why |
|-----------|----------|-----|
| Shadow DOM base values | `clamp()` | Graceful scaling on any viewport |
| Shadow DOM exact breakpoints | `@media (min-width: Npx)` | Predictable layout at popular sizes |
| Popup (fixed-width window) | `clamp()` or fixed rem | Viewport range is narrower |
| Card dimensions | `--umm-card-width: clamp(...)` | Adapts to screen width |
| Page margins | `clamp(16px, 12px + 1vw, 64px)` | Even at extreme sizes |

**Rule of thumb**: Use `clamp()` for anything that varies with viewport. Use fixed `rem` only when the value should NOT scale (e.g., icon sizes, border widths).

---

## 4. Spacing and Layout

### 4.1 Spacing Scale

**Layer 1 (Tailwind `@theme`):**
```css
--umm-space-0: 0;
--umm-space-0-5: 0.125rem;
--umm-space-1: 0.25rem;
--umm-space-1-5: 0.375rem;
--umm-space-2: 0.5rem;
--umm-space-2-5: 0.625rem;
--umm-space-3: 0.75rem;
--umm-space-4: 1rem;
--umm-space-5: 1.25rem;
--umm-space-6: 1.5rem;
--umm-space-8: 2rem;
--umm-space-10: 2.5rem;
--umm-space-12: 3rem;
--umm-space-16: 4rem;
--umm-space-20: 5rem;
```

**Layer 2 (Shadow DOM `breakpoints.css`):**
```css
--umm-space-xs: clamp(4px, 0.25rem + 0.3vw, 12px);
--umm-space-sm: clamp(8px, 0.4rem + 0.5vw, 20px);
--umm-space-md: clamp(12px, 0.6rem + 0.75vw, 28px);
--umm-space-lg: clamp(16px, 0.75rem + 1vw, 40px);
--umm-space-xl: clamp(24px, 1rem + 1.5vw, 56px);
--umm-space-2xl: clamp(32px, 1.25rem + 2vw, 72px);
```

> ⚠️ The Layer 1 and Layer 2 spacing scales use the same semantic names (xs through 2xl) but different values. The `@theme` block uses static rem; `breakpoints.css` uses responsive `clamp()`.

### 4.2 Layout System

**Page Layout (Layer 2 - `page-layout.css`):**

```css
.umm-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: var(--umm-text-primary);
  background: var(--umm-bg);
}
.umm-layout-header {
  position: sticky; top: 0; z-index: 10000;
  padding-top: var(--umm-space-md);
}
.umm-layout-content { flex: 1; }
.umm-layout-footer {
  border-top: 1px solid var(--umm-card-border);
  margin-top: auto;
}
```

**Card Layout (Layer 2 - `homepage.css`):**

```css
.umm-card {
  display: flex;
  flex-direction: column;
  gap: var(--umm-space-xs);
  width: var(--umm-card-width);
  min-width: var(--umm-card-width);
}
.umm-card-cover {
  width: var(--umm-card-width);
  height: var(--umm-card-height);
  border-radius: var(--umm-card-radius);
  overflow: hidden;
}
```

**Search Results Layout (Layer 2 - `search.css`):**

```css
.umm-search-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 16px;
}
```

**Detail Page Layout (Layer 2 - `detail.css`):**
```css
.umm-detail-grid {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--umm-space-lg);
}
/* Responsive: */
@media (min-width: 5120px) { .umm-detail-grid { grid-template-columns: 700px 1fr; } }
@media (max-width: 768px)   { .umm-detail-grid { grid-template-columns: 1fr; } }
```

### 4.3 Section and Card Gaps

| Token | Layer 1 | Layer 2 |
|-------|---------|---------|
| `--section-gap` | `24px` | N/A (uses `--umm-space-xl`) |
| `--umm-section-gap` | `clamp(16px, 12px + 1vw, 56px)` | N/A |
| `--card-padding` | `16px` | N/A |
| `--umm-space-xl` | `1.5rem` in `@theme` | `clamp(24px, 1rem + 1.5vw, 56px)` in breakpoints.css |

---

## 5. Shadow DOM Styling Rules

### 5.1 How to Create a New Shadow DOM Component

1. Create a new CSS file in `src/content/douban/styles/`
2. Import it in the page's Vue SFC or `main.ts`
3. Use `composeStyles()` from `src/content/douban/css-composer.ts`

**Example (from `detail/App.vue` import pattern):**

```typescript
import { composeStyles } from '@/content/douban/css-composer'
import theme from '@/content/douban/styles/theme.css?raw'
import breakpoints from '@/content/douban/styles/breakpoints.css?raw'
import detail from '@/content/douban/styles/detail.css?raw'
import common from '@/content/douban/styles/common.css?raw'

const styles = composeStyles(
  { name: 'breakpoints', css: breakpoints },
  { name: 'theme', css: theme },
  { name: 'common', css: common },
  { name: 'detail', css: detail },
)
```

**CSS file order matters**: later files can override variables and styles from earlier files. Standard order:

1. `breakpoints.css` — responsive variable defaults
2. `theme.css` — core `--umm-*` variables
3. `common.css` — scrollbar, shimmer, rating, status badge, island
4. `page-layout.css` — header/content/footer (if page uses the layout template)
5. `<pagetype>.css` — page-specific styles (homepage, detail, search, ...)

### 5.2 CSS Variable Usage in :host

All Shadow DOM CSS must use `var(--umm-*)` references. Never hardcode colors.

```css
/* ✅ CORRECT */
.umm-card {
  background: var(--umm-card-bg);
  border: 1px solid var(--umm-card-border);
  color: var(--umm-text-primary);
}

/* ❌ WRONG - hardcoded color */
.umm-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  color: #1a1a1a;
}
```

### 5.3 Theme Adaptation for Shadow DOM

All Shadow DOM files use `:host(.umm-theme--dark)` selectors for dark theme:

```css
:host(.umm-theme--dark) {
  --umm-bg: #1e1f24;
  --umm-text-primary: #e0e0e0;
}

/* Inline dark overrides for specific elements: */
:host(.umm-theme--dark) .umm-status--done {
  background: linear-gradient(180deg, #15803d 0%, #166534 100%);
}
```

**How `umm-theme--dark` is applied**: The content script reads `data-theme` from the shadow host element (set via `chrome.storage` sync → early script). The theme sync flow:

```
chrome.storage.local → early.ts reads `umm:appearance` → 
sets host.dataset.theme → CSS :host(.umm-theme--dark) matches
```

### 5.4 composeStyles() Pattern

```typescript
// css-composer.ts
export interface CssChunk {
  name: string
  css: string
}

export function composeStyles(...chunks: CssChunk[]): string {
  return chunks.map(c => `/* === ${c.name} === */\n${c.css}\n`).join('\n')
}
```

Each CSS file is imported as `?raw` string:

```typescript
import theme from '@/content/douban/styles/theme.css?raw'
```

The composed string is injected into the shadow root via `adoptedStyleSheets` or as a `<style>` element in the shadow DOM template.

### 5.5 Image Rendering (UmmImage + Shimmer)

UMM uses the `UmmImage` Vue component with a shimmer loading placeholder. Defined in `common.css`:

```css
.umm-img-shimmer {
  position: absolute; inset: 0;
  background: var(--umm-bg-secondary, #f0f0f0);
  overflow: hidden;
}
.umm-img-shimmer::after {
  content: '';
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: umm-shimmer 1.8s ease-in-out infinite;
}
:host(.umm-theme--dark) .umm-img-shimmer {
  background: var(--umm-bg-secondary, #2a2b30);
}
```

All image hover effects use a standard scale transition:

```css
.umm-card-cover > .umm-image-container > .umm-image-img {
  will-change: transform;
  backface-visibility: hidden;
  transition: transform 0.4s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.umm-card-cover:hover > .umm-image-container > .umm-image-img {
  transform: scale(1.08);
}
```

---

## 6. Content Script Global Styling

### 6.1 When to Use Global Styles vs Shadow DOM

| Use Global Styles (Layer 3) | Use Shadow DOM (Layer 2) |
|----------------------------|-------------------------|
| Element must live in host page DOM | Full overlay / new page |
| Injected into a Douban/PT site element | Complete UI isolation needed |
| Small badge, button, chip | Complex component with internal state |
| Dimmer effect on host elements | Responsive grid layout |
| Background script injects via `executeScript` | All interactive UI |

### 6.2 Color Tokens Reference (tokens.ts)

See [Section 2.5](#25-hardcoded-color-tokens-layer-3) for the full list.

These colors reflect the Shadow DOM theme values but are **hardcoded as JS constants** because:

1. Styles are injected as JS template strings (not CSS files → can't use `var()`)
2. The injection target is the host page, not the Shadow DOM (no `--umm-*` variables available)

### 6.3 Injected Style Categories

From `src/entrypoints/content/styles/global.ts`:

| Category | CSS Block | Selectors |
|----------|-----------|-----------|
| Search badges | `SEARCH_BADGE_STYLES` | `.umm-search-badge` |
| Status chips | `STATUS_CHIP_STYLES` | `.umm-status-chip` |
| NeoDB buttons | `NEODB_BUTTON_STYLES` | `.umm-neodb-btn` |
| Dimmer effect | `DIMMER_STYLES` | `.umm-dimmed` |
| Homepage badges | `HOMEPAGE_BADGE_STYLES` | `.umm-homepage-badge` |
| UI components | `UI_COMPONENT_STYLES` | `.umm-panel`, `.umm-overlay`, `.umm-btn` |
| Focus visible | `FOCUS_VISIBLE_STYLES` | `:focus-visible`, specific buttons |
| Scrollbar | `SCROLLBAR_STYLES` | `::-webkit-scrollbar` |

### 6.4 injectGlobalStyles() Contract

```typescript
/**
 * Injects ALL global styles into document.head.
 * Idempotent — checks for #umm-global-styles before injecting.
 * Call ONCE at content script init.
 */
export function injectGlobalStyles(): void
```

```typescript
/**
 * Dynamically adds a single CSS rule to the global stylesheet.
 * @param selector - CSS selector string
 * @param rules - CSS property declarations (no braces)
 * Example: addStyleRule('.umm-foo', 'color: red; font-size: 14px')
 */
export function addStyleRule(selector: string, rules: string): void
```

### 6.5 Migration Path from Hardcoded Colors

The ideal state is to derive Layer 3 colors from the Layer 2 variables:

```
theme.css (:host)  →  tokens.ts (hardcoded export)  →  global.ts (template literal)
                         ↓
                  Keep as runtime source of truth
                  Add script to sync from theme.css
```

Currently, `tokens.ts` duplicates values that also exist in `theme.css` and `style.css`. A `sync-tokens` script could validate they match or generate `tokens.ts` from `theme.css`.

---

## 7. Popup/Options Styling

### 7.1 Tailwind v4 with `umm:` Prefix

All Tailwind classes in the popup/options app use the `umm:` prefix:

```html
<div class="umm:bg-background umm:text-foreground umm:font-semibold">
  <span class="umm:text-muted-foreground umm:text-xs">Label</span>
</div>
```

The prefix is configured in `style.css`:
```css
@import "tailwindcss" prefix(umm);
```

### 7.2 cn() Utility

```typescript
// src/utils/cn.ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Always use `cn()` for conditional class merging in Vue components. Never construct `class` strings manually.

### 7.3 shadcn/vue Component Customization

shadcn/vue components live in `src/components/ui/`. They use:

- `class-variance-authority` for variant props (e.g., `badgeVariants`)
- `Reakit` / `reka-ui` primitives for accessibility
- Tailwind `umm:` classes

**Example — Badge variants** (`src/shared/ui/badge/index.ts`):
```typescript
export const badgeVariants = cva(
  "umm:inline-flex umm:gap-1 umm:items-center umm:rounded-full ...",
  {
    variants: {
      variant: {
        default:   "umm:border-transparent umm:bg-primary ...",
        secondary: "umm:border-transparent umm:bg-secondary ...",
        destructive: "umm:border-transparent umm:bg-destructive ...",
        outline: "umm:text-foreground",
      },
    },
  },
)
```

### 7.4 Theme Transition Gating

Theme transitions in Layer 1 are gated by a `.theme-ready` class:

```typescript
// stores/theme.ts
function applyAll() {
  applyTheme(theme.value)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.add('theme-ready')
    })
  })
}
```

```css
/* style.css */
.theme-ready,
.theme-ready *,
.theme-ready *::before,
.theme-ready *::after {
  transition: background-color 0.5s ease, color 0.5s ease, 
              border-color 0.5s ease, box-shadow 0.5s ease;
}

/* Exclude dropdown triggers from transition */
[data-reka-select-trigger],
[role="combobox"],
[data-reka-dropdown-menu-trigger],
[data-reka-menubar-trigger] {
  transition: none !important;
}
```

This double-RAF pattern ensures the theme is applied before transitions are enabled, preventing a flash on initial load.

---

## 8. Component Naming and Hierarchy

### 8.1 Naming Conventions

| Entity | Convention | Examples |
|--------|------------|---------|
| Vue SFC files | `PascalCase.vue` + `Umm` prefix | `UmmMediaCard.vue`, `UmmSearchCard.vue` |
| Vue components (defineComponent) | `Umm` prefix + PascalCase | `UmmPageLayout`, `UmmMediaCard` |
| CSS classes | `.umm-*` kebab-case | `.umm-card`, `.umm-search-grid` |
| CSS variables | `--umm-*` kebab-case | `--umm-bg`, `--umm-card-width` |
| CSS files | kebab-case | `page-layout.css`, `breakpoints.css` |
| TypeScript files | camelCase | `useTheme.ts`, `css-composer.ts` |
| TypeScript constants | `UPPER_SNAKE_CASE` | `COLOR_DONE_START`, `SHADOW_CSS` |
| Pinia stores | `use*Store` | `useThemeStore` |
| Composables | `use*` | `useBadge`, `useStatus` |

### 8.2 Component Hierarchy

**Douban Homepage:**
```
UmmPageLayout (template)
├── UmmIsland (search bar)
├── UmmScrollRow (horizontal scroll sections)
│   └── UmmMediaCard (media item card)
├── UmmBillboardCard (ranking card)
└── UmmReviewsSection
```

**Douban Detail Page:**
```
UmmPageLayout (template)
├── UmmDetailTitle
├── UmmRatingCard
├── UmmCelebrityGrid
├── UmmCommentCard
├── UmmPhotoCard
├── UmmRecommendationGrid
└── UmmTrailerSidebar
```

**Douban Search:**
```
UmmPageLayout (template)
├── UmmSearchFilter
├── UmmSearchCard (media result card)
└── UmmPaginator
```

**Interest Dialog:**
```
UmmDialogOverlay
└── UmmDialogPanel
    ├── StatusPicker (done/wish/none)
    ├── StarRating
    ├── UmmTagPicker
    └── DialogActions (save/cancel/remove)
```

### 8.3 When to Use defineComponent vs .vue SFC

| Scenario | Format | 
|----------|--------|
| Standalone page | `.vue` SFC with `<script setup>` |
| Shared component | `.vue` SFC with `<script setup>` |
| Composables (logic only) | `.ts` with `defineComponent` if needed |
| Simple wrapper | `.ts` with `defineComponent` |
| Content script template | `.vue` SFC (Vite-processed) |
| Injected shadow DOM content | `.vue` SFC or `defineComponent` |

---

## 9. Theme System

### 9.1 Theme Modes

Three modes: `'light' | 'dark' | 'auto'`

- **Light**: Always light
- **Dark**: Always dark
- **Auto**: Follows `prefers-color-scheme` media query

### 9.2 Layer 1: Pinia Store (useThemeStore)

```typescript
// src/stores/theme.ts
const STORAGE_KEY = 'umm:appearance'

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<ThemeMode>('auto')
  const isDark = useMediaQuery('(prefers-color-scheme: dark)')
  
  function applyTheme(mode: ThemeMode) {
    const dark = mode === 'dark' || (mode === 'auto' && isDark.value)
    document.documentElement.classList.toggle('dark', dark)
  }
  
  // ... persistence, sync
})
```

**Flow:**
1. Store reads from `localStorage` (via `useStorage`) on init
2. `applyTheme()` sets `.dark` on `<html>`
3. `style.css` `.dark {}` block overrides CSS variables
4. Double-RAF gates theme transitions
5. Changes sync to `chrome.storage.local` for cross-context use

### 9.3 Layer 2: Shadow DOM Theme Sync

**Sync path:**

```
chrome.storage.local 'umm:appearance'
    → early.ts reads on content script init
    → host.dataset.theme = 'dark' | 'light'
    → CSS :host(.umm-theme--dark) selects dark values
```

CSS variables change automatically once the `:host(.umm-theme--dark)` selector matches.

### 9.4 Layer 3: Global Styles Theme Adaptation

Global injected styles (Layer 3) use `data-status` attributes instead of class-based theme switching for most components:

```css
.umm-search-badge[data-status="done"] { /* dark green */ }
.umm-status-chip[data-status="none"]  { /* dark red */ }
```

For dark-adaptive elements, `tokens.ts` values could be conditionally applied at injection time — but currently they're static.

> ⚠️ **Known issue**: The `UI_COMPONENT_STYLES` in `global.ts` uses `var(--umm-bg, #1e1e1e)` fallback. These references to `--umm-*` variables are NOT connected to the Shadow DOM variables — they're resolved from the host page's global CSS scope. If the host page happens to define these variables, the injected styles pick them up; otherwise the fallback applies.

### 9.5 Toast System (Cross-Layer)

Toasts in UMM come from two sources:

| Source | CSS | File |
|--------|-----|------|
| FloatingToast (content script Vue) | `TOAST_CORE_CSS` | `toast-css.ts` |
| Background `__showInlineToast` | Same `TOAST_CORE_CSS` | `toast-css.ts` |

`toast-css.ts` is the **canonical source** for toast styles. Both consumers import from it.

Toast variant colors:
```css
.umm-toast--success { background: linear-gradient(180deg, rgba(17,111,70,0.96), rgba(11,83,53,0.98)); color: white; }
.umm-toast--error   { background: linear-gradient(180deg, rgba(164,43,60,0.96), rgba(126,28,48,0.98)); color: white; }
.umm-toast--info    { background: linear-gradient(180deg, #1757d6 0%, #0d47b8 100%); color: white; }
.umm-toast--loading { background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%); color: white; }
```

WCAG AA contrast verified: All four variants pass ≥ 4.5:1 ratio.

---

## 10. Component Reference & Duplication Audit

### 10.1 Status Badge Implementations (5 systems)

| Badge | Layer | File | Context | Notes |
|-------|-------|------|---------|-------|
| `.umm-status` | Layer 2 | `common.css` | Shadow DOM general status | Canonical Shadow DOM badge |
| `.umm-status--inline` | Layer 2 | `common.css` | Inline variant | Smaller, inline with text |
| `.umm-status-chip` | Layer 3 | `global.ts` | Injected into host detail page | Different gradient, more padding |
| `.umm-search-badge` | Layer 3 | `global.ts` | Injected search result badge | Uses `data-status` attribute |
| `.umm-homepage-badge` | Layer 3 | `global.ts` | Injected homepage overlay badge | Small circle/pill on card corner |

**Color duplication**: Layer 2 uses green/red/orange gradients with `rgba()`; Layer 3 uses similar but independently maintained values from `tokens.ts`. They do NOT share a source of truth.

### 10.2 Button Implementations (5+ systems)

| Button | Layer | Location | Style | 
|--------|-------|----------|-------|
| `.umm-mark-btn` | Layer 2 | `interest.css` | Rounded pill, accent background |
| `.umm-neodb-btn` | Layer 2 | `interest.css` | 8px radius, variant gradients (minus/plus/original) |
| `.umm-neodb-btn` (global) | Layer 3 | `global.ts` | Same name, different values! |
| `.umm-dl-trigger` | Layer 2 | `detail.css` | Accent-fill download trigger |
| `.umm-type-btn` | Layer 2 | `search.css` | Small pill with active state |
| `.umm-nav-btn` | Layer 2 | `photos.css` | Outlined nav button |
| `.umm-dialog-save` | Layer 2 | `interest.css` | Full-width accent save |
| `.umm-btn` | Layer 3 | `global.ts` | Generic button (panel/modal) |

> ⚠️ **Critical duplication**: `.umm-neodb-btn` exists in BOTH `interest.css` (Layer 2) and `global.ts` (Layer 3) with different values. They serve different render contexts but should be visually consistent.

### 10.3 Card Implementations (4+ systems)

| Card | Layer | File | Layout |
|------|-------|------|--------|
| `.umm-card` | Layer 2 | `homepage.css` | Flex column, fixed width/height, scroll row |
| `.umm-search-card` | Layer 2 | `search.css` | Horizontal flex, left accent border |
| `.umm-billboard-card` | Layer 2 | `homepage.css` | Horizontal flex, left rank color stripe |
| `.umm-recommendation-*` | Layer 2 | `detail.css` | Grid of recs, cover + title + rating |
| `.umm-trailer-card` | Layer 2 | `trailer.css` | Vertical card with 16:9 thumbnail |
| `.umm-photo-card` | Layer 2 | `photos.css` | Vertical card, download overlay |

### 10.4 Toast Implementations (2 systems)

| Toast | Source | Injection | 
|-------|--------|-----------|
| `FloatingToast` (Vue component) | `toast-css.ts` | Content script Vue app |
| `__showInlineToast` (JS-only) | `toast-css.ts` | Background via `executeScript` |

Both use the `TOAST_CORE_CSS` from `toast-css.ts`. This is a good example of a **shared canonical source**.

### 10.5 Overlay Systems (2 approaches)

| Overlay | Layer | z-index | Opacity | File |
|---------|-------|---------|---------|------|
| `.umm-dialog-overlay` | Layer 2 | `999999` | `rgba(0,0,0,.45)` | `interest.css` |
| `SHADOW_CSS` (ov) | Layer 2 | N/A (shadow) | `hsla(0,0%,0%,...)` | `overlay.ts` |

Note the different z-index values and opacity between dialog and overlay implementations.

### 10.6 NeoDB Button Duplication

`.umm-neodb-btn` is defined in TWO places:

1. **Layer 2** (`interest.css`, lines 445-510): Uses `var(--umm-font-xs)` for font-size, different padding (7px 14px), and different gradient colors.
2. **Layer 3** (`global.ts`, lines 131-203): Uses fixed `13px` font-size, different padding (8px 16px), colors from `tokens.ts`.

These should ideally share values, but they operate in different CSS scopes.

---

## 11. Consistency Checklist

### MUST-DO Rules for Every New Contribution

Before submitting any UI change, verify ALL of the following:

#### Colors

- [ ] ✅ Is every color sourced from a CSS variable, not hardcoded?
- [ ] ✅ If you MUST hardcode (Layer 3), is the value in `tokens.ts`?
- [ ] ✅ Are gradient colors consistent with the badge/button status conventions?
- [ ] ✅ Have you verified WCAG AA contrast (≥ 4.5:1) for text colors?

#### Tokens

- [ ] ✅ Does this use existing design tokens or introduce new hardcoded values?
- [ ] ✅ If adding a new token, which system does it belong to (`@theme`, `:host`, or `tokens.ts`)?
- [ ] ✅ Is the new token name following the naming convention?
- [ ] ✅ Check: does a token with the same semantic meaning already exist elsewhere?

#### Duplication

- [ ] ✅ Is this component already implemented elsewhere?
- [ ] ✅ If a similar component exists, can you share the CSS/component instead of duplicating?
- [ ] ✅ Are you creating a new variant of `.umm-status`, `.umm-btn`, or `.umm-card`? If so, consider extending existing classes with modifier.

#### Shadow DOM (Layer 2)

- [ ] ✅ Are all styles scoped under `:host` or `.umm-*` class names?
- [ ] ✅ Is the CSS file in `composeStyles()` order correct?
- [ ] ✅ Are dark theme overrides present via `:host(.umm-theme--dark)`?
- [ ] ✅ Does the component use `var(--umm-*)` references for all colors?

#### Global Styles (Layer 3)

- [ ] ✅ Is `injectGlobalStyles()` idempotent (checks `#umm-global-styles`)?
- [ ] ✅ Are hardcoded colors sourced from `tokens.ts` exports?
- [ ] ✅ Are injected styles necessary? Could this live in Shadow DOM instead?

#### Theme

- [ ] ✅ Does the component/page properly adapt to light/dark mode?
- [ ] ✅ Are theme transitions smooth (test with swift toggling)?
- [ ] ✅ Does the content script properly listen to `data-theme` changes?

#### Responsive

- [ ] ✅ Is the responsive breakpoint system respected?
- [ ] ✅ For Shadow DOM: which breakpoints does the layout need?
- [ ] ✅ For Layer 1: is `clamp()` used appropriately?
- [ ] ✅ Test at 320px, 768px, 1280px, 1920px, and 2560px.

#### Naming

- [ ] ✅ Is the component named following `Umm*` convention (`.vue` SFC/component)?
- [ ] ✅ Are CSS classes prefixed with `.umm-`?
- [ ] ✅ Are CSS files in kebab-case?
- [ ] ✅ Are TypeScript files in camelCase?

#### Layers

- [ ] ✅ Have you chosen the correct styling layer for this feature?
- [ ] ✅ Does the component need Shadow DOM isolation or can it use Tailwind/shadcn?
- [ ] ✅ Is the component injected into a host page (Layer 3) or is it a full overlay (Layer 2)?

#### Popup (Layer 1)

- [ ] ✅ Is the `umm:` prefix used for all Tailwind classes?
- [ ] ✅ Is `cn()` used for conditional class merging?
- [ ] ✅ Are shadcn components customized via `cva` variants, not overwritten globally?

---

## Appendix A: Quick Reference

### CSS Variable Sources by Layer

| Variable | Defined In | Layer |
|----------|-----------|-------|
| `--umm-bg` | `theme.css` `:host` | 2 |
| `--umm-text-primary` | `theme.css` `:host` | 2 |
| `--umm-text-secondary` | `theme.css` `:host` | 2 |
| `--umm-text-muted` | `theme.css` `:host` | 2 |
| `--umm-border` | `theme.css` `:host` | 2 |
| `--umm-link` | `theme.css` `:host` | 2 |
| `--umm-link-hover` | `theme.css` `:host` | 2 |
| `--umm-island-*` | `theme.css` `:host` | 2 |
| `--umm-rating-gold-*` | `theme.css` `:host` | 2 |
| `--umm-font-{xs,sm,base,md,lg,xl,2xl}` | `breakpoints.css` `:host` | 2 |
| `--umm-space-{xs,sm,md,lg,xl,2xl}` | `breakpoints.css` `:host` | 2 |
| `--umm-card-{width,height,radius}` | `breakpoints.css` `:host` | 2 |
| `--umm-accent` | `detail.css` / `photos.css` `:host` | 2 |
| `--umm-success-*` | `detail.css` `:host` | 2 |
| `--umm-card-bg` | `detail.css` `:host` | 2 |
| `--umm-overlay-bg` | `detail.css` `:host` | 2 |
| `--umm-rating-score` | `detail.css` `:host` | 2 |
| `--umm-rating-bar` | `detail.css` `:host` | 2 |
| `--umm-celebrity-*` | `celebrities.css` `:host` | 2 |
| `--umm-personage-*` | `personage.css` `:host` | 2 |
| `--umm-trailer-*` | `trailer.css` `:host` | 2 |
| `--umm-dialog-width` | `interest.css` `:host` | 2 |
| `--umm-star-*` | `interest.css` `:host` | 2 |
| `--color-*` (shadcn) | `style.css` `@theme` + `:root`/`.dark` | 1 |
| `--umm-color-*` | `style.css` `@theme` + `.dark` | 1 |
| `--umm-section-*` | `style.css` `@theme` | 1 |
| `--umm-element-*` | `style.css` `@theme` | 1 |
| `--umm-interactive-*` | `style.css` `@theme` | 1 |
| `--umm-badge-*` | `style.css` `@theme` | 1 |
| `--umm-space-*` (0..20) | `style.css` `@theme` | 1 |
| `--umm-font-*-size` | `style.css` `@theme` | 1 |
| `COLOR_*` (exports) | `tokens.ts` | 3 |

### File Dependency Order (Shadow DOM CSS Composition)

```
breakpoints.css   ← Must be first (establishes responsive var defaults)
      ↓
theme.css         ← Core --umm-* variables
      ↓
common.css        ← Shared components (scrollbar, shimmer, rating, status, island)
      ↓
page-layout.css   ← Page structural layout (header/content/footer)
      ↓
<pagetype>.css    ← Page-specific styles (detail, homepage, search, ...)
```

### Directory Layout

```
src/
├── components/ui/           ← Layer 1 UI components (shadcn/vue)
├── shared/styles/            ← Layer 1 CSS entry + shared CSS
├── shared/ui/                ← Layer 1 shadcn components
├── content/douban/styles/    ← Layer 2 CSS (12 files)
├── content/douban/pages/     ← Layer 2 Vue pages (homepage, detail, search, ...)
├── entrypoints/content/styles/ ← Layer 3 injected styles
├── entrypoints/popup/        ← Layer 1 popup Vue app
└── stores/                   ← Layer 1 Pinia stores
```

---

*Last updated: 2025-07-05*
*Maintainer: UMM Team*
*Review cadence: Every PR with UI changes must reference this guide.*
