<script setup lang="ts">
interface Option {
  id: string
  label: string
}

defineProps<{
  options: Option[]
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="umm:flex umm:bg-muted umm:p-1 umm:rounded-xl umm:gap-1">
    <button
      v-for="option in options"
      :key="option.id"
      @click="emit('update:modelValue', option.id)"
      :class="[
        'umm:flex-1 umm:px-4 umm:py-2 umm:text-sm umm:font-medium umm:rounded-lg umm:transition-all umm:duration-200',
        modelValue === option.id
          ? 'umm:bg-background umm:text-primary-content umm:shadow-sm'
          : 'umm:text-secondary-content umm:hover:text-primary-content umm:hover:bg-background/50'
      ]"
    >
      {{ option.label }}
    </button>
  </div>
</template>
