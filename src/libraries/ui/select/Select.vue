<script setup lang="ts">
import { computed } from "vue"
import { forwardProps, forwardEmits } from '@/libraries/ui/forward-props'
import type { SelectRootEmits, SelectRootProps } from "reka-ui"
import { SelectRoot } from "reka-ui"

const props = defineProps<SelectRootProps>()
const emits = defineEmits<SelectRootEmits>()

const forwardedProps = forwardProps(props)
const forwardedEmits = forwardEmits<SelectRootEmits>(emits, ['update:modelValue', 'update:open'])
const forwarded = computed(() => ({ ...forwardedProps.value, ...forwardedEmits }))
</script>

<template vapor>
  <SelectRoot v-bind="forwarded">
    <slot />
  </SelectRoot>
</template>
