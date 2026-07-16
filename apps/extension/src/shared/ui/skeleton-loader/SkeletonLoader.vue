<script setup lang="ts">
/**
 * SkeletonLoader — reusable loading skeleton
 *
 * Replaces repeated pulse-animated skeleton HTML in App.vue and SyncTab.vue
 */
defineProps<{
  lines?: number
  lastLineWidth?: string
}>()
</script>

<template>
  <div class="umm:flex umm:flex-col umm:gap-4 umm:animate-pulse">
    <div
      v-for="i in (lines ?? 3)"
      :key="i"
      class="umm:bg-muted umm:rounded-lg"
      :style="{
        height: i === 1 ? 'var(--umm-spacing-8)' : i === 2 ? 'var(--umm-spacing-4)' : 'var(--umm-spacing-32)',
        width: i === (lines ?? 3) && lastLineWidth ? lastLineWidth : undefined,
      }"
    />
  </div>
</template>
