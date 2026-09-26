<script setup lang="ts">
import type { SelectValueProps } from 'reka-ui';
import { SelectValue } from 'reka-ui';

const props = defineProps<SelectValueProps>();
</script>

<template vapor>
  <SelectValue v-bind="props">
    <slot />
  </SelectValue>
</template>
