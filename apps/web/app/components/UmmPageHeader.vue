<template>
  <div class="mb-6">
    <h1 class="text-xl font-semibold text-umm-text-primary">{{ title }}</h1>
    <p v-if="description" class="mt-1 text-sm text-umm-text-secondary">{{ description }}</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>