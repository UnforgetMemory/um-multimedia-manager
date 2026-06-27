<script setup lang="ts">
interface Props {
  title: string
}

defineProps<Props>()
</script>

<template>
  <div class="umm-section">
    <div class="umm-section-hd">
      <h2>{{ title }}</h2>
    </div>
    <div class="umm-scroll-wrap">
      <div class="umm-scroll-track">
        <slot />
      </div>
      <div class="umm-mask umm-mask--left"></div>
      <div class="umm-mask umm-mask--right"></div>
    </div>
  </div>
</template>
