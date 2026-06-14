<script setup lang="ts">
import { useConfirmStore } from '@/stores/confirm'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-vue-next'

const confirmStore = useConfirmStore()
const { state } = confirmStore
</script>

<template>
  <Dialog :open="state.open" @update:open="(open: boolean) => { if (!open) state.open = false }">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <component :is="state.icon" class="h-5 w-5 text-primary" />
          {{ state.title }}
        </DialogTitle>
        <DialogDescription>{{ state.description }}</DialogDescription>
      </DialogHeader>

      <div v-if="state.warning" class="rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950">
        <p class="text-sm text-orange-800 dark:text-orange-200">{{ state.warning }}</p>
      </div>

      <div v-if="state.details" class="text-sm text-secondary-content">
        {{ state.details }}
      </div>

      <DialogFooter>
        <Button variant="outline" @click="state.open = false" :disabled="state.loading">取消</Button>
        <Button @click="confirmStore.confirm" :disabled="state.loading">
          <Loader2 v-if="state.loading" class="mr-2 h-4 w-4 animate-spin" />
          {{ state.confirmText }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
