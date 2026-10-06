<script setup lang="ts">
import { useConfirmStore, type ConfirmTableRow } from '@/store/confirm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/libraries/ui/dialog';
import { Button } from '@/libraries/ui/button';
import { Loader2 } from '@/libraries/ui/icons';

const confirmStore = useConfirmStore();
const { state } = confirmStore;

/**
 * 行末（风险列）的语义色调（ADR-027）：danger = 会覆盖/丢失数据；warn = 需留意。
 * 颜色取自既有状态语义色与 orange 档，避免新增调色板。
 */
function cellClass(row: ConfirmTableRow, index: number): string {
  if (index !== row.cells.length - 1) return index === 0 ? 'umm:font-medium' : '';
  if (row.tone === 'danger') return 'umm:font-medium umm:text-state-error';
  if (row.tone === 'warn') return 'umm:text-orange-600 umm:dark:text-orange-400';
  return '';
}
</script>

<template vapor>
  <Dialog
    :open="state.open"
    @update:open="
      (open: boolean) => {
        if (!open) state.open = false;
      }
    "
  >
    <DialogContent :class="state.table ? 'umm:sm:max-w-3xl' : 'umm:sm:max-w-md'">
      <DialogHeader>
        <DialogTitle class="umm:flex umm:items-center umm:gap-2">
          <component :is="state.icon" class="umm:h-5 umm:w-5 umm:text-primary" />
          {{ state.title }}
        </DialogTitle>
        <DialogDescription>{{ state.description }}</DialogDescription>
      </DialogHeader>

      <div
        v-if="state.warning"
        class="umm:rounded-lg umm:border umm:border-orange-200 umm:bg-orange-50 umm:p-3 umm:dark:border-orange-800 umm:dark:bg-orange-950"
      >
        <p class="umm:text-sm umm:text-orange-800 umm:dark:text-orange-200">{{ state.warning }}</p>
      </div>

      <div
        v-if="state.details"
        class="umm:text-sm umm:text-secondary-content umm:whitespace-pre-line"
      >
        {{ state.details }}
      </div>

      <!-- ADR-027：逐表预览矩阵（同步/上传/下载执行前的可见面） -->
      <div
        v-if="state.table"
        class="umm:max-h-80 umm:overflow-auto umm:rounded-lg umm:border umm:border-gray-200 umm:dark:border-gray-700"
      >
        <table class="umm:w-full umm:border-collapse umm:text-sm">
          <thead class="umm:sticky umm:top-0 umm:bg-gray-50 umm:dark:bg-gray-800">
            <tr>
              <th
                v-for="(header, hi) in state.table.headers"
                :key="hi"
                class="umm:px-2 umm:py-2 umm:text-left umm:font-medium umm:whitespace-nowrap umm:text-gray-600 umm:dark:text-gray-300"
              >
                {{ header }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, ri) in state.table.rows"
              :key="ri"
              class="umm:border-t umm:border-gray-100 umm:dark:border-gray-700"
            >
              <td
                v-for="(cell, ci) in row.cells"
                :key="ci"
                class="umm:px-2 umm:py-1.5 umm:whitespace-nowrap umm:text-secondary-content"
                :class="cellClass(row, ci)"
              >
                {{ cell }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="state.open = false" :disabled="state.loading"
          >取消</Button
        >
        <Button @click="confirmStore.confirm" :disabled="state.loading" class="umm:gap-2">
          <Loader2 v-if="state.loading" class="umm:h-4 umm:w-4 umm:animate-spin" />
          {{ state.confirmText }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
