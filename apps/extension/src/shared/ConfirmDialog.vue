<script setup lang="ts">
import { useConfirmStore } from '@/stores/confirm'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/shared/ui/dialog'
import { Button } from '@/shared/ui/button'
import { Loader2 } from 'lucide-vue-next'

const confirmStore = useConfirmStore()
const { state } = confirmStore
</script>

<template>
  <Dialog :open="state.open" @update:open="(open: boolean) => { if (!open) state.open = false }">
    <DialogContent class="umm:sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="umm:flex umm:items-center umm:gap-2">
          <component :is="state.icon" class="umm:h-5 umm:w-5 umm:text-primary" />
          {{ state.title }}
        </DialogTitle>
        <DialogDescription>{{ state.description }}</DialogDescription>
      </DialogHeader>

      <div v-if="state.warning" class="umm:rounded-lg umm:border umm:border-orange-200 umm:bg-orange-50 umm:p-3 umm:dark:border-orange-800 umm:dark:bg-orange-950">
        <p class="umm:text-sm umm:text-orange-800 umm:dark:text-orange-200">{{ state.warning }}</p>
      </div>

      <div v-if="state.details" class="umm:text-sm umm:text-secondary-content">
        {{ state.details }}
      </div>

      <DialogFooter>
        <Button variant="outline" @click="state.open = false" :disabled="state.loading">取消</Button>
        <Button @click="confirmStore.confirm" :disabled="state.loading" class="umm:gap-2">
          <Loader2 v-if="state.loading" class="umm:h-4 umm:w-4 umm:animate-spin" />
          {{ state.confirmText }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
