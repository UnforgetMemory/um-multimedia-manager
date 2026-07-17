<template>
  <div class="rounded-lg border bg-umm-surface border-umm-border px-5 py-4 theme-transition">
    <p class="text-xs font-medium uppercase tracking-wider text-umm-text-muted">{{ label }}</p>
    <p class="mt-1 text-2xl font-semibold" :class="valueColor">{{ value }}</p>
    <p v-if="subtext" class="mt-1 text-xs text-umm-text-muted">{{ subtext }}</p>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  label: string
  value: string | number
  subtext?: string
  color?: 'default' | 'success' | 'warning' | 'error' | 'info'
}>(), {
  color: 'default',
})

const valueColor = computed(() => {
  switch (props.color) {
    case 'success': return 'text-umm-success'
    case 'warning': return 'text-umm-warning'
    case 'error': return 'text-umm-error'
    case 'info': return 'text-umm-info'
    default: return 'text-umm-text-primary'
  }
})
</script>