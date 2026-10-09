<script setup lang="ts">
import { forwardProps } from '@/libraries/ui/forward-props';
import type { SelectScrollUpButtonProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { ChevronUp } from '@/libraries/ui/icons';
import { SelectScrollUpButton } from 'reka-ui';
import { cn } from '@/libraries/utils/cn';

const props = defineProps<SelectScrollUpButtonProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = reactiveOmit(props, 'class');

const forwardedProps = forwardProps(delegatedProps);
</script>

<template vapor>
  <SelectScrollUpButton
    v-bind="forwardedProps"
    :class="
      cn('umm:flex umm:cursor-default umm:items-center umm:justify-center umm:py-1', props.class)
    "
  >
    <slot>
      <ChevronUp class="umm:h-4 umm:w-4" />
    </slot>
  </SelectScrollUpButton>
</template>
