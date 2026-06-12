# Options Page Design System — Design Spec

> **Anchors:** [S1] Problem · [S2] Theme System · [S3] Typography · [S4] Spacing · [S5] Responsive Breakpoints · [S6] Appearance Settings · [S7] Performance · [S8] Naming · [S9] File Map

## [S1] Problem

Options Page needs a unified design system:
- Theme (light/dark/auto) not applied consistently
- No appearance customization (font size, density)
- Name stuck at UMM, needs UMManager
- Fixed layout doesn't adapt to small phones or 5K displays
- No text brightness hierarchy — all text same visual weight
- Tab content blocks on async data load

## [S2] Theme System

### Architecture

Theme state stored in `chrome.storage.local` under key `appearance`:

```typescript
type ThemeMode = 'light' | 'dark' | 'auto'
```

- **light**: Force light mode (CSS class removal)
- **dark**: Force dark mode (add `dark` class to `<html>`)
- **auto**: Follow system via `prefers-color-scheme` media query + listener

### Implementation

Options Page `App.vue` manages theme:

1. On mount: read `appearance` from `chrome.storage.local`
2. Apply class to `<html>` immediately (before render)
3. Listen for `chrome.storage.onChanged` to react to settings changes
4. For `auto`: add `matchMedia` listener for live system theme changes

### CSS Variables

Existing `style.css` already defines `:root` and `.dark` variables. No changes needed to CSS — the theme classes are already wired.

### Theme Toggle UI

In `AppearanceTab`:
- 3 radio buttons: 浅色 / 深色 / 跟随系统
- Each option shows a preview thumbnail
- Changes apply instantly (no save button needed)

## [S3] Typography

### Scale (7 levels)

| Level | Token | Usage | sm | md-lg | xl | 2xl | 3xl | 4xl+ |
|-------|-------|-------|-----|-------|-----|------|------|------|
| Display | `--font-display` | Hero numbers | 2rem/700 | 2.5rem/700 | 3rem/700 | 3.5rem/700 | 4rem/700 | 4.5rem/700 |
| H1 | `--font-h1` | Page titles | 1.25rem/600 | 1.5rem/600 | 1.75rem/600 | 2rem/600 | 2.25rem/600 | 2.5rem/600 |
| H2 | `--font-h2` | Section titles | 1rem/600 | 1.125rem/600 | 1.25rem/600 | 1.5rem/600 | 1.5rem/600 | 1.75rem/600 |
| H3 | `--font-h3` | Subsection titles | 0.875rem/600 | 0.875rem/600 | 1rem/600 | 1.125rem/600 | 1.25rem/600 | 1.25rem/600 |
| Body | `--font-body` | Paragraphs, labels | 0.875rem/400 | 0.875rem/400 | 1rem/400 | 1rem/400 | 1.125rem/400 | 1.25rem/400 |
| Caption | `--font-caption` | Hints, timestamps | 0.75rem/400 | 0.75rem/400 | 0.875rem/400 | 0.875rem/400 | 1rem/400 | 1rem/400 |
| Mono | `--font-mono` | Code, IDs | 0.75rem/400 | 0.75rem/400 | 0.875rem/400 | 0.875rem/400 | 1rem/400 | 1rem/400 |

### Brightness Hierarchy (3 levels)

| Level | CSS Class | Light | Dark | Usage |
|-------|-----------|-------|------|-------|
| Primary | `text-primary` | `foreground` | `foreground` | Headings, key numbers, active states |
| Secondary | `text-secondary` | `muted-foreground` | `muted-foreground` | Body text, labels, descriptions |
| Tertiary | `text-tertiary` | `muted-foreground/60` | `muted-foreground/60` | Hints, timestamps, placeholders |

### Density Modes

| Mode | Font Scale | Line Height | Letter Spacing |
|------|-----------|-------------|----------------|
| Compact | 0.9x | 1.4 | Tight |
| Default | 1.0x | 1.5 | Normal |
| Comfortable | 1.1x | 1.6 | Relaxed |

Applied via CSS custom property `--font-scale` multiplier.

## [S4] Spacing

### Base Unit: 4px

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Tight gap (icon-text) |
| `--space-2` | 8px | Default gap |
| `--space-3` | 12px | Card internal |
| `--space-4` | 16px | Section internal |
| `--space-5` | 20px | Card padding |
| `--space-6` | 24px | Section gap |
| `--space-8` | 32px | Page margin (sm) |
| `--space-10` | 40px | Page margin (md-lg) |
| `--space-12` | 48px | Page margin (xl) |
| `--space-16` | 64px | Page margin (2xl+) |

### Responsive Padding

| Element | sm | md-lg | xl | 2xl | 3xl | 4xl+ |
|---------|-----|-------|-----|------|------|------|
| Page horizontal | 16px | 24px | 32px | 48px | 64px | 80px |
| Card internal | 12px | 16px | 20px | 24px | 32px | 40px |
| Section gap | 16px | 24px | 32px | 40px | 48px | 56px |
| Tab item padding | 8px 12px | 10px 16px | 12px 20px | 14px 24px | 16px 28px | 20px 32px |

## [S5] Responsive Breakpoints

### 12-Level System

| Name | Min-Width | Target | Layout |
|------|-----------|--------|--------|
| `xs` | 0px | Small phones (iPhone SE) | Single column, bottom nav, 16px margins |
| `sm` | 320px | Standard phones | Single column, bottom nav, 16px margins |
| `md` | 375px | Large phones (iPhone 14) | Single column, bottom nav, 20px margins |
| `lg` | 480px | Small tablets | Single column, bottom nav, 24px margins |
| `xl` | 640px | Tablets | Side nav appears, 24px margins |
| `2xl` | 768px | Large tablets | Side nav, 32px margins |
| `3xl` | 1024px | Small laptops | Side nav, 32px margins, 2-col grids |
| `4xl` | 1280px | Laptops | Side nav, 40px margins, 2-col grids |
| `5xl` | 1536px | Desktops (2K) | Side nav, 48px margins, 2-3 col grids |
| `6xl` | 1920px | Large desktops | Side nav, 48px margins, 3-col grids |
| `7xl` | 2560px | 4K displays | Side nav, 64px margins, 3-4 col grids |
| `8xl` | 3200px | 5K+ displays | Side nav, 80px margins, 4-col grids |

### Layout Behavior

| Breakpoint | Nav | Content Width | Max Width |
|------------|-----|---------------|-----------|
| xs–lg | Bottom bar (fixed) | 100% | None |
| xl–2xl | Left sidebar (200px) | calc(100% - 200px) | None |
| 3xl–4xl | Left sidebar (240px) | calc(100% - 240px) | 960px |
| 5xl–6xl | Left sidebar (260px) | calc(100% - 260px) | 1200px |
| 7xl–8xl | Left sidebar (280px) | calc(100% - 280px) | 1440px |

## [S6] Appearance Settings

### New Tab: AppearanceTab

Located at `/appearance` route, added to tab list.

**Sections:**

1. **Theme**
   - 3 radio cards: 浅色 / 深色 / 跟随系统
   - Each card shows mini preview (colored border indicating active)
   - Instant apply on select

2. **Font Size**
   - Slider or 3 options: 紧凑 / 标准 / 宽松
   - Stores to `chrome.storage.local` key `fontSize`
   - Applies `--font-scale` CSS variable

3. **Density**
   - 3 options: 紧凑 / 默认 / 宽松
   - Affects spacing tokens
   - Stores to `chrome.storage.local` key `density`

### Settings Persistence

All appearance settings stored in `chrome.storage.local`:

```typescript
interface AppearanceSettings {
  theme: 'light' | 'dark' | 'auto'    // default: 'auto'
  fontSize: 'compact' | 'default' | 'comfortable'  // default: 'default'
  density: 'compact' | 'default' | 'comfortable'   // default: 'default'
}
```

Applied in `App.vue` on mount via CSS custom properties.

## [S7] Performance

### Skeleton Loading Pattern

Each tab component uses a skeleton placeholder:

```vue
<template>
  <div v-if="!dataReady" class="space-y-4">
    <div class="h-8 bg-muted rounded animate-pulse w-1/3" />
    <div class="h-4 bg-muted rounded animate-pulse w-2/3" />
    <div class="h-32 bg-muted rounded animate-pulse" />
  </div>
  <div v-else>
    <!-- actual content -->
  </div>
</template>
```

### Tab Preloading

- Active tab loads immediately (already implemented via `defineAsyncComponent`)
- Adjacent tabs preload after 2s idle (optional, `requestIdleCallback`)
- Tab content stays in memory after first visit (no re-fetch on re-visit)

### Data Fetching

- Each tab fetches its own data in `onMounted`
- No global data provider — each tab is self-contained
- `safeSendMessage` with timeout + retry for all background calls

## [S8] Naming

### UMM → UMManager

All references updated:
- Options Page title: "UMManager 管理面板"
- Popup header: "UMManager"
- Manifest name: "UMManager - 多媒体管理器"
- Footer: "UMManager · v{version}"

### Files affected:
- `wxt.config.ts` (manifest.name)
- `src/entrypoints/options/App.vue` (header)
- `src/entrypoints/popup/pages/DashboardPage.vue` (header)
- `src/entrypoints/popup/index.html` (title)

## [S9] File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/entrypoints/options/tabs/AppearanceTab.vue` | Theme + font size + density settings |
| `src/composables/useTheme.ts` | Theme management composable (read/write/apply) |
| `src/styles/design-tokens.css` | Centralized design tokens (breakpoints, typography, spacing) |

### Modified Files
| File | Change |
|------|--------|
| `src/entrypoints/options/App.vue` | Theme init, 12-level breakpoints, UMManager name, sidebar responsive |
| `src/entrypoints/options/router.ts` | Add `/appearance` route |
| `src/styles/typography.css` | Extended to 7-level typography + 3-level brightness |
| `src/styles/style.css` | Add 12-level breakpoint media queries |
| `src/entrypoints/popup/pages/DashboardPage.vue` | UMManager name |
| `wxt.config.ts` | Manifest name update |
