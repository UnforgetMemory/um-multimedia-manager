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
  success: 'umm:bg-state-success',
  error: 'umm:bg-state-error',
  info: 'umm:bg-state-info',
  loading: 'umm:bg-state-info',
}
</script>

<template>
  <Teleport to="body">
    <div class="umm:fixed umm:bottom-6 umm:right-6 umm:z-[999999] umm:flex umm:flex-col umm:gap-3 umm:items-end umm:pointer-events-none">
      <TransitionGroup
        enter-active-class="umm:transition-all umm:duration-300 umm:ease-out"
        leave-active-class="umm:transition-all umm:duration-200 umm:ease-in"
        enter-from-class="umm:translate-x-full umm:opacity-0"
        enter-to-class="umm:translate-x-0 umm:opacity-100"
        leave-from-class="umm:translate-x-0 umm:opacity-100"
        leave-to-class="umm:translate-x-full umm:opacity-0"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="
  [
            'umm:pointer-events-auto umm:flex umm:items-start umm:gap-3 umm:px-4 umm:py-3 umm:rounded-lg umm:shadow-lg umm:text-white umm:min-w-[280px] umm:max-w-[400px]',
            colors[toast.type],
          ]
"
        >
          <component
            :is="icons[toast.type]"
            :class="
  ['umm:w-5 umm:h-5 umm:mt-0.5 umm:shrink-0', toast.type === 'loading' && 'umm:animate-spin']
"
          />
          <div class="umm:flex-1 umm:min-w-0">
            <p class="umm:font-medium umm:text-sm">{{ toast.title }}</p>
            <p v-if="toast.message" class="umm:text-xs umm:opacity-90 umm:mt-0.5">{{ toast.message }}</p>
          </div>
          <button
            @click="dismiss(toast.id)"
            class="umm:shrink-0 umm:p-0.5 umm:rounded umm:hover:bg-white/20 umm:transition-colors"
          >
            <X class="umm:w-4 umm:h-4" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
