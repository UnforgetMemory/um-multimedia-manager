<script setup lang="ts">
defineProps<{
  gap?: string;
}>();
</script>

<template vapor>
  <div class="umm:flex umm:flex-col umm:gap-[var(--umm-section-gap)]">
    <slot />
  </div>
</template>
