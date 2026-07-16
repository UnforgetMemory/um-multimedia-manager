<script setup lang="ts">
/**
 * UmmPaginator — shared pagination component for Douban pages.
 *
 * Renders prev/next buttons + page numbers with ellipsis for large page counts.
 * Uses var(--umm-*) CSS custom properties for Shadow DOM theme compatibility.
 * Disables prev/next at boundaries; auto-hides when totalPages <= 1.
 *
 * Props:
 * - currentPage: number (1-based)
 * - totalPages: number
 *
 * Emits:
 * - page-change(page: number)
 */
import { computed } from 'vue'

const props = defineProps<{
  currentPage: number
  totalPages: number
}>()

const emit = defineEmits<{
  'page-change': [page: number]
}>()

/**
 * Generates the visible page window with ellipsis.
 *
 * Strategy: show first, last, currentPage ± 2, and '...' for large gaps.
 * - tp <= 7: show all pages
 * - tp > 7: 1 ... window ... last
 */
const visiblePages = computed<(number | string)[]>(() => {
  const cp = props.currentPage
  const tp = props.totalPages
  if (tp <= 7) {
    return Array.from({ length: tp }, (_, i) => i + 1)
  }
  const pages: (number | string)[] = [1]
  if (cp > 4) pages.push('...')
  const start = Math.max(2, cp - 2)
  const end = Math.min(tp - 1, cp + 2)
  for (let i = start; i <= end; i++) pages.push(i)
  if (cp < tp - 3) pages.push('...')
  if (tp > 1) pages.push(tp)
  return pages
})
</script>

<template>
  <div v-if="totalPages > 1" class="umm-paginator">
    <button
      class="umm-paginator-btn"
      :disabled="currentPage <= 1"
      @click="emit('page-change', currentPage - 1)"
    >
      ‹
    </button>
    <template v-for="page in visiblePages" :key="page">
      <button
        v-if="page !== '...'"
        class="umm-paginator-btn"
        :class="{ 'umm-paginator-btn--active': page === currentPage }"
        @click="typeof page === 'number' && emit('page-change', page)"
      >
        {{ page }}
      </button>
      <span v-else class="umm-paginator-ellipsis">…</span>
    </template>
    <button
      class="umm-paginator-btn"
      :disabled="currentPage >= totalPages"
      @click="emit('page-change', currentPage + 1)"
    >
      ›
    </button>
  </div>
</template>

<style scoped>
/* ===== Shared Paginator — Shadow-DOM friendly ===== */
.umm-paginator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: var(--umm-space-md, 16px) 0 var(--umm-space-lg, 24px);
  flex-wrap: wrap;
}
.umm-paginator-btn {
  /* Reset button defaults */
  font-family: inherit;
  font-size: var(--umm-font-xs, 0.75rem);
  line-height: 1;
  cursor: pointer;
  background: transparent;
  border: none;
  padding: 0;
  /* Layout */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 7px;
  border-radius: 6px;
  font-weight: 500;
  color: var(--umm-text-secondary);
  transition: background 0.15s ease, color 0.15s ease;
}
.umm-paginator-btn:hover:not(:disabled) {
  background: var(--umm-bg, #fff);
  color: var(--umm-text-primary);
}
.umm-paginator-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.umm-paginator-btn--active {
  background: var(--umm-text-primary, #333);
  color: var(--umm-bg, #fff);
  font-weight: 700;
}
.umm-paginator-btn--active:hover {
  background: var(--umm-text-primary, #333);
  color: var(--umm-bg, #fff);
}
.umm-paginator-ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  color: var(--umm-text-muted, #999);
  font-size: var(--umm-font-xs, 0.75rem);
}
</style>
