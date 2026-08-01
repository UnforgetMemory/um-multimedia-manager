<script setup lang="ts">
import { computed } from 'vue'
import type { HTMLAttributes } from 'vue'
import { cn } from '@/utils/cn'

const props = defineProps<{
  defaultValue?: string | number
  class?: HTMLAttributes['class']
}>()

const modelValue = defineModel<string | number>('modelValue')

const inputValue = computed({
  get: () => modelValue.value ?? props.defaultValue ?? '',
  set: (value: string | number) => {
    modelValue.value = value
  },
})
</script>

<template>
  <input
    v-model="inputValue"
    :class="cn('umm:flex umm:h-10 umm:w-full umm:rounded-md umm:border umm:border-input umm:bg-background umm:px-3 umm:py-2 umm:text-sm umm:ring-offset-background umm:file:border-0 umm:file:bg-transparent umm:file:text-sm umm:file:font-medium umm:placeholder:text-muted-foreground umm:focus-visible:outline-none umm:focus-visible:ring-2 umm:focus-visible:ring-ring umm:focus-visible:ring-offset-2 umm:disabled:cursor-not-allowed umm:disabled:opacity-50', props.class,
      )
"
  />
</template>
