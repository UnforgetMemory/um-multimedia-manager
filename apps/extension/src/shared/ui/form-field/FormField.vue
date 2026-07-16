<script setup lang="ts">
import { Label } from '@/shared/ui/label'

defineProps<{
  label: string
  description?: string
}>()
</script>

<template>
  <div class="umm:flex umm:flex-col umm:gap-2">
    <Label>{{ label }}</Label>
    <p v-if="description" class="umm:font-caption umm:text-secondary-content">{{ description }}</p>
    <slot />
  </div>
</template>
