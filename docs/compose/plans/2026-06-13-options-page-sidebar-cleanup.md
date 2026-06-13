# Options Page Sidebar Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant sidebar footer and tab component headers from the options page to reduce visual clutter.

**Architecture:** Minimal changes to App.vue (remove footer) and 6 tab components (remove `<h2>` headers). No structural changes needed.

**Tech Stack:** Vue 3, Tailwind CSS

---

### Task 1: Remove sidebar footer from App.vue

**Covers:** [S1]

**Files:**
- Modify: `src/entrypoints/options/App.vue:89-92`

- [ ] **Step 1: Remove footer section**

Delete lines 89-92 in App.vue:
```vue
<!-- Sidebar footer -->
<div class="px-5 pt-4 border-t border-border">
  <span class="font-caption text-tertiary-content">UMManager · v{{ appVersion }}</span>
</div>
```

- [ ] **Step 2: Verify build passes**

Run: `npm run type-check`
Expected: PASS

---

### Task 2: Remove tab headers from all tab components

**Covers:** [S2]

**Files:**
- Modify: `src/entrypoints/options/tabs/OverviewTab.vue:252-258`
- Modify: `src/entrypoints/options/tabs/RatingTab.vue:154-156`
- Modify: `src/entrypoints/options/tabs/SettingsTab.vue:55-57`
- Modify: `src/entrypoints/options/tabs/AppearanceTab.vue:27-29`
- Modify: `src/entrypoints/options/tabs/LinkedTab.vue`
- Modify: `src/entrypoints/options/tabs/SyncTab.vue`

- [ ] **Step 1: Remove header from OverviewTab.vue**

Delete lines 253-258 (the `<div class="flex items-center justify-end">` with refresh button):
```vue
<!-- Header -->
<div class="flex items-center justify-end">
  <Button variant="ghost" size="sm" @click="loadData" :disabled="loading">
    <RefreshCw :class="['h-4 w-4', loading && 'animate-spin']" />
  </Button>
</div>
```

- [ ] **Step 2: Remove header from RatingTab.vue**

Delete lines 155-156:
```vue
<h2 class="font-h1 text-primary-content">评分管理</h2>
```

- [ ] **Step 3: Remove header from SettingsTab.vue**

Delete lines 56-57:
```vue
<h2 class="font-h1 text-primary-content">设置</h2>
```

- [ ] **Step 4: Remove header from AppearanceTab.vue**

Delete lines 28-29:
```vue
<h2 class="font-h1 text-primary-content">外观设置</h2>
```

- [ ] **Step 5: Remove headers from LinkedTab.vue and SyncTab.vue**

Check and remove similar `<h2>` headers if present.

- [ ] **Step 6: Verify build passes**

Run: `npm run type-check`
Expected: PASS

---

### Task 3: Commit changes

- [ ] **Step 1: Stage and commit**

```bash
git add src/entrypoints/options/App.vue src/entrypoints/options/tabs/*.vue
git commit -m "fix: remove redundant sidebar footer and tab headers from options page"
```

- [ ] **Step 2: Verify no type errors**

Run: `npm run type-check`
Expected: PASS
