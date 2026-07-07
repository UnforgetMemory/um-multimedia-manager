<script setup lang="ts">
interface Props {
  title: string
  mode?: 'scroll' | 'grid'
}

defineProps<Props>()
</script>

<template>
  <section class="umm-section">
    <h2 v-if="title" class="umm-section-hd">{{ title }}</h2>
    <div v-if="mode === 'scroll'" class="umm-scroll-wrap">
      <div class="umm-scroll-track">
        <slot />
      </div>
      <div class="umm-mask umm-mask--left"></div>
      <div class="umm-mask umm-mask--right"></div>
    </div>
    <div v-else class="umm-grid-wrap">
      <div class="umm-grid-track">
        <slot />
      </div>
    </div>
  </section>
</template>
