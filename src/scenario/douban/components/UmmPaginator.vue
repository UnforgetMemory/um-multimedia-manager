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
import { computed, h, type FunctionalComponent } from 'vue';

/**
 * Chevron arrows inlined (not `@/libraries/ui/icons`): this component ships
 * inside douban-main.js (content-script IIFE). Pulling the icons module here
 * would drag the shared `createIcon` factory into that bundle for two glyphs.
 */
const chevron = (d: string, name: string): FunctionalComponent => {
  const Comp: FunctionalComponent = (_props, { attrs }) =>
    h(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        width: 24,
        height: 24,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        ...attrs,
      },
      [h('path', { d })],
    );
  Comp.displayName = name;
  return Comp;
};
const ChevronLeft = chevron('m15 18-6-6 6-6', 'ChevronLeft');
const ChevronRight = chevron('m9 18 6-6-6-6', 'ChevronRight');

const props = defineProps<{
  currentPage: number;
  totalPages: number;
}>();

const emit = defineEmits<{
  'page-change': [page: number];
}>();

/**
 * Generates the visible page window with ellipsis.
 *
 * Strategy: show first, last, currentPage ± 2, and '...' for large gaps.
 * - tp <= 7: show all pages
 * - tp > 7: 1 ... window ... last
 */
const visiblePages = computed<(number | string)[]>(() => {
  const cp = props.currentPage;
  const tp = props.totalPages;
  if (tp <= 7) {
    return Array.from({ length: tp }, (_, i) => i + 1);
  }
  const pages: (number | string)[] = [1];
  if (cp > 4) pages.push('...');
  const start = Math.max(2, cp - 2);
  const end = Math.min(tp - 1, cp + 2);
  for (let i = start; i <= end; i++) pages.push(i);
  if (cp < tp - 3) pages.push('...');
  if (tp > 1) pages.push(tp);
  return pages;
});
</script>

<template vapor>
  <div v-if="totalPages > 1" class="umm-paginator">
    <button
      class="umm-paginator-btn"
      :disabled="currentPage <= 1"
      aria-label="Previous page"
      @click="emit('page-change', currentPage - 1)"
    >
      <ChevronLeft class="umm-paginator-icon" />
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
      aria-label="Next page"
      @click="emit('page-change', currentPage + 1)"
    >
      <ChevronRight class="umm-paginator-icon" />
    </button>
  </div>
</template>

<!-- Paginator styles provided by shared paginator.css via css-composer.ts -->
