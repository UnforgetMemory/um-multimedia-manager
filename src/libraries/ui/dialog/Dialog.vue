<script setup lang="ts">
import { computed } from "vue"
import { forwardProps, forwardEmits } from '@/libraries/ui/forward-props'
import type { DialogRootEmits, DialogRootProps } from "reka-ui"
import { DialogRoot } from "reka-ui"

const props = defineProps<DialogRootProps>()
const emits = defineEmits<DialogRootEmits>()

const forwardedProps = forwardProps(props)
const forwardedEmits = forwardEmits<DialogRootEmits>(emits, ['update:open'])
const forwarded = computed(() => ({ ...forwardedProps.value, ...forwardedEmits }))
</script>

<template vapor>
  <DialogRoot v-bind="forwarded">
    <slot />
  </DialogRoot>
</template>
