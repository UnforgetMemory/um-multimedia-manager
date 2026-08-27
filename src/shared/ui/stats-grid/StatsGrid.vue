<script setup lang="ts">
import type { FunctionalComponent, SVGAttributes } from 'vue'
import StatCard, { type Accent } from '@/shared/StatCard.vue'

interface StatItem {
  key: string
  icon: FunctionalComponent<SVGAttributes>
  label: string
  value: number
  accent?: Accent
}

defineProps<{
  stats: StatItem[]
  loading?: boolean
}>()
</script>

<template>
  <div class="umm:grid umm:grid-cols-2 umm:lg:grid-cols-4 umm:gap-3">
    <StatCard
      v-for="stat in stats"
      :key="stat.key"
      :icon="stat.icon"
      :label="stat.label"
      :value="stat.value"
      :accent="stat.accent"
      :loading="loading"
    />
  </div>
</template>
