<script setup lang="ts">
/**
 * UmmStatBar — shared stat bar component for Douban pages.
 *
 * Renders stat items as a horizontal flex row: each item shows a large value
 * with a small label below. Items with a URL open the link via click handler.
 * Uses var(--umm-*) CSS custom properties for Shadow DOM theme compatibility.
 *
 * Props:
 * - items: StatBarItem[] — the data to display
 * - title?: string — optional group title above the grid
 *
 * StatBarItem:
 * - label: string — displayed below the value
 * - value: number | string — displayed large (numbers are toLocaleString'd)
 * - url?: string — optional link target (opens via window.open on click)
 * - active?: boolean — optional active/highlight state
 */

export interface StatBarItem {
  label: string
  value: number | string
  url?: string
  active?: boolean
}

const props = defineProps<{
  items: StatBarItem[]
  title?: string
}>()

function handleClick(item: StatBarItem): void {
  if (item.url) {
    window.open(item.url, '_blank')
  }
}
</script>

<template>
  <div v-if="title" class="umm-statbar-title">{{ title }}</div>
  <div class="umm-statbar-grid">
    <div
      v-for="item in items"
      :key="item.label"
      class="umm-statbar-item"
      :class="{
        'umm-statbar-item--active': item.active,
        'umm-statbar-item--clickable': !!item.url,
      }"
      :tabindex="item.url ? 0 : -1"
      role="button"
      @click="handleClick(item)"
      @keydown.enter="handleClick(item)"
    >
      <span class="umm-statbar-val">{{ typeof item.value === 'number' ? item.value.toLocaleString() : item.value }}</span>
      <span class="umm-statbar-lbl">{{ item.label }}</span>
    </div>
  </div>
</template>

<style scoped>
/* ===== Shared StatBar — Shadow-DOM friendly ===== */

.umm-statbar-title {
  font-size: var(--umm-font-sm, 0.85rem);
  font-weight: 600;
  color: var(--umm-text-primary);
  margin-bottom: var(--umm-space-1-5, 6px);
  white-space: nowrap;
}

.umm-statbar-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--umm-space-md, 14px);
}

.umm-statbar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--umm-bg-secondary);
  border: 1px solid var(--umm-border);
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  cursor: default;
}

.umm-statbar-item--clickable {
  cursor: pointer;
}

.umm-statbar-item--clickable:hover {
  background: var(--umm-accent-soft, #e0e7ff);
  border-color: var(--umm-accent, #6366f1);
}

.umm-statbar-val {
  font-size: var(--umm-font-lg, 1.125rem);
  font-weight: 700;
  color: var(--umm-accent, #6366f1);
  line-height: 1.2;
  transition: color 0.15s;
  white-space: nowrap;
}

.umm-statbar-item--active .umm-statbar-val {
  color: var(--umm-accent, #6366f1);
}

.umm-statbar-lbl {
  font-size: var(--umm-font-xs, 0.7rem);
  color: var(--umm-text-muted);
  line-height: 1.2;
  transition: color 0.15s;
  white-space: nowrap;
}
</style>
