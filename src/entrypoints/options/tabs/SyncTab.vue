<script setup lang="ts">
import { ref, defineAsyncComponent } from 'vue'

const activeSubTab = ref('webdav')

const WebDAVTab = defineAsyncComponent(() => import('./sync/WebDAVTab.vue'))
const ImportExportTab = defineAsyncComponent(() => import('./sync/ImportExportTab.vue'))

const subTabs = [
  { id: 'webdav', label: 'WebDAV' },
  { id: 'import-export', label: '导入/导出' },
]
</script>

<template>
  <div class="space-y-[var(--section-gap)]">
    <h2 class="font-h1 text-primary-content">数据同步</h2>

    <div class="flex gap-2 border-b border-border pb-2">
      <button
        v-for="tab in subTabs"
        :key="tab.id"
        @click="activeSubTab = tab.id"
        :class="[
          'px-4 py-2 text-sm font-medium rounded-t-md transition-colors',
          activeSubTab === tab.id
            ? 'bg-primary text-primary-foreground'
            : 'text-secondary-content hover:bg-muted'
        ]"
      >
        {{ tab.label }}
      </button>
    </div>

    <Suspense>
      <WebDAVTab v-if="activeSubTab === 'webdav'" />
      <ImportExportTab v-else-if="activeSubTab === 'import-export'" />
      <template #fallback>
        <div class="py-8 text-center text-secondary-content font-body">加载中...</div>
      </template>
    </Suspense>
  </div>
</template>
