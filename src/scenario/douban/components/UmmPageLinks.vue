<script setup lang="ts">
/**
 * UmmPageLinks — shared LINK-style pagination for Douban pages (H3, 2026-08-08).
 *
 * Renders prev/next + numbered page links as plain <a href> anchors (no JS
 * navigation — the link targets are the site's own ?start=… URLs, so browser
 * navigation semantics are preserved, matching the 4 former hand-written
 * copies: book-reviews / user-reviews (byte-identical pair) and
 * doulist-detail / series (same structure, different class prefixes).
 *
 * Complements UmmPaginator.vue (numeric model with page-change events for
 * SPA-style pages); this one is for pages whose data carries real hrefs.
 *
 * The outer `v-if` gate (show/hide) stays with each consumer page — some
 * pages show the block when pageLinks.length > 0, others when > 1.
 *
 * Props:
 * - pages: Array<{ label, url, current }>
 * - prevUrl / nextUrl: hrefs for ‹ › anchors
 * - containerClass / pageClass: per-page class prefixes (the former
 *   hand-written copies differed only in these + data field names)
 */
defineProps<{
  pages: Array<{ label: string; url: string; current: boolean }>
  prevUrl?: string
  nextUrl?: string
  containerClass: string
  pageClass: string
}>()
</script>

<template>
  <div :class="containerClass">
    <a v-if="prevUrl" :href="prevUrl" :class="pageClass">‹</a>
    <a
      v-for="p in pages"
      :key="p.label"
      :href="p.url || undefined"
      :class="[pageClass, p.current ? `${pageClass}--active` : '']"
    >{{ p.label }}</a>
    <a v-if="nextUrl" :href="nextUrl" :class="pageClass">›</a>
  </div>
</template>
