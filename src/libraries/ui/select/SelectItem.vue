<script setup lang="ts">
import { forwardProps } from '@/libraries/ui/forward-props';
import type { SelectItemProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { Check } from '@/libraries/ui/icons';
import { SelectItem, SelectItemIndicator, SelectItemText } from 'reka-ui';
import { cn } from '@/libraries/utils/cn';

const props = defineProps<SelectItemProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = reactiveOmit(props, 'class');

const forwardedProps = forwardProps(delegatedProps);
</script>

<template vapor>
  <SelectItem
    v-bind="forwardedProps"
    :class="
      cn(
        'umm:relative umm:flex umm:w-full umm:cursor-default umm:select-none umm:items-center umm:rounded-sm umm:py-1.5 umm:pl-8 umm:pr-2 umm:text-sm umm:outline-none umm:focus:bg-accent umm:focus:text-accent-foreground umm:data-[disabled]:pointer-events-none umm:data-[disabled]:opacity-50',
        props.class,
      )
    "
  >
    <span
      class="umm:absolute umm:left-2 umm:flex umm:h-3.5 umm:w-3.5 umm:items-center umm:justify-center"
    >
      <SelectItemIndicator>
        <Check class="umm:h-4 umm:w-4" />
      </SelectItemIndicator>
    </span>

    <SelectItemText>
      <slot />
    </SelectItemText>
  </SelectItem>
</template>
