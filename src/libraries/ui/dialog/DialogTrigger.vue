<script setup lang="ts">
import type { DialogTriggerProps } from 'reka-ui';
import { DialogTrigger } from 'reka-ui';

const props = defineProps<DialogTriggerProps>();
</script>

<template vapor>
  <DialogTrigger v-bind="props">
    <slot />
  </DialogTrigger>
</template>
