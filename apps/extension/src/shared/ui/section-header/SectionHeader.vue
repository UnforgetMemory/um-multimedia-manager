<script setup lang="ts">
import type { FunctionalComponent, SVGAttributes } from 'vue'

defineProps<{
  title: string
  icon?: FunctionalComponent<SVGAttributes>
}>()
</script>

<template>
  <div class="umm:flex umm:items-center umm:gap-2">
    <component v-if="icon" :is="icon" class="umm:w-5 umm:h-5 umm:text-primary-content" />
    <h3 class="umm:font-h2 umm:text-primary-content">{{ title }}</h3>
  </div>
</template>
