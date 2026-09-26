<script setup lang="ts">
import { forwardProps } from '@/libraries/ui/forward-props';
import type { DialogTitleProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { DialogTitle } from 'reka-ui';
import { cn } from '@/libraries/utils/cn';

const props = defineProps<DialogTitleProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = reactiveOmit(props, 'class');

const forwardedProps = forwardProps(delegatedProps);
</script>

<template vapor>
  <DialogTitle
    v-bind="forwardedProps"
    :class="cn('umm:text-lg umm:font-semibold umm:leading-none umm:tracking-tight', props.class)"
  >
    <slot />
  </DialogTitle>
</template>
