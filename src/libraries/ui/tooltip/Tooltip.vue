<script setup lang="ts">
import { computed } from 'vue';
import { forwardProps, forwardEmits } from '@/libraries/ui/forward-props';
import type { TooltipRootEmits, TooltipRootProps } from 'reka-ui';
import { TooltipRoot } from 'reka-ui';

const props = defineProps<TooltipRootProps>();
const emits = defineEmits<TooltipRootEmits>();

const forwardedProps = forwardProps(props);
const forwardedEmits = forwardEmits<TooltipRootEmits>(emits, ['update:open']);
const forwarded = computed(() => ({ ...forwardedProps.value, ...forwardedEmits }));
</script>

<template vapor>
  <TooltipRoot v-bind="forwarded">
    <slot />
  </TooltipRoot>
</template>
