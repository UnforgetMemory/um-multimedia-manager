<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/libraries/utils/cn';

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();
</script>

<template vapor>
  <div :class="cn('umm:text-sm umm:[&_p]:leading-relaxed', props.class)">
    <slot />
  </div>
</template>
