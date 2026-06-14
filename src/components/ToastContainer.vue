<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import { CheckCircle, XCircle, Info, Loader2, X } from 'lucide-vue-next'

const { toasts, dismiss } = useToast()

const icons = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  loading: Loader2,
}

const colors = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  loading: 'bg-blue-500',
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed bottom-6 right-6 z-[999999] flex flex-col gap-3 items-end pointer-events-none">
      <TransitionGroup
        enter-active-class="transition-all duration-300 ease-out"
        leave-active-class="transition-all duration-200 ease-in"
        enter-from-class="translate-x-full opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-full opacity-0"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="[
            'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg text-white min-w-[280px] max-w-[400px]',
            colors[toast.type],
          ]"
        >
          <component
            :is="icons[toast.type]"
            :class="['w-5 h-5 mt-0.5 shrink-0', toast.type === 'loading' && 'animate-spin']"
          />
          <div class="flex-1 min-w-0">
            <p class="font-medium text-sm">{{ toast.title }}</p>
            <p v-if="toast.message" class="text-xs opacity-90 mt-0.5">{{ toast.message }}</p>
          </div>
          <button
            @click="dismiss(toast.id)"
            class="shrink-0 p-0.5 rounded hover:bg-white/20 transition-colors"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
