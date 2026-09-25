<script setup lang="ts">
interface Option {
  id: string
  label: string
}

const props = defineProps<{
  options: Option[]
  /** Content-sized buttons (no equal stretch) + small paddings — for headers/toolbars */
  compact?: boolean
}>()

const modelValue = defineModel<string>('modelValue', { required: true })
</script>

<template>
  <div class="umm:flex umm:bg-muted umm:p-1 umm:rounded-xl umm:gap-1">
    <button
      v-for="option in options"
      :key="option.id"
      @click="modelValue = option.id"
      :class="[
        'umm:font-medium umm:rounded-lg umm:transition-all umm:duration-200',
        props.compact ? 'umm:whitespace-nowrap' : '',
        props.compact
          ? 'umm:px-2.5 umm:py-1 umm:text-xs'
          : 'umm:flex-1 umm:px-4 umm:py-2 umm:text-sm',
        modelValue === option.id
          ? 'umm:bg-background umm:text-primary-content umm:shadow-sm'
          : 'umm:text-secondary-content umm:hover:text-primary-content umm:hover:bg-background/50'
      ]"
    >
      {{ option.label }}
    </button>
  </div>
</template>
