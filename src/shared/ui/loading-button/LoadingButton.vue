<script setup lang="ts">
import type { FunctionalComponent, SVGAttributes } from 'vue'
import { Button } from '@/shared/ui/button'
import { RefreshCw } from 'lucide-vue-next'

defineProps<{
  icon: FunctionalComponent<SVGAttributes>
  label: string
  loading?: boolean
  loadingLabel?: string
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  disabled?: boolean
  class?: string
}>()

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <Button
    @click="emit('click')"
    :variant="variant"
    :disabled="disabled || loading"
    :class="['umm:gap-2', $attrs.class]"
  >
    <RefreshCw v-if="loading" class="umm:h-4 umm:w-4 umm:animate-spin" />
    <component v-else :is="icon" class="umm:h-4 umm:w-4" />
    {{ loading ? loadingLabel : label }}
  </Button>
</template>
