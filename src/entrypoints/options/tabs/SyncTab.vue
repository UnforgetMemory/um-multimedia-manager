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

    <div class="flex p-1 bg-muted rounded-xl" :style="{ gap: 'var(--space-1)' }">
      <button
        v-for="tab in subTabs"
        :key="tab.id"
        @click="activeSubTab = tab.id"
        :class="[
          'flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200',
          activeSubTab === tab.id
            ? 'bg-background text-primary-content shadow-sm'
            : 'text-secondary-content hover:text-primary-content hover:bg-background/50'
        ]"
      >
        {{ tab.label }}
      </button>
    </div>

    <Suspense>
      <WebDAVTab v-if="activeSubTab === 'webdav'" />
      <ImportExportTab v-else-if="activeSubTab === 'import-export'" />
      <template #fallback>
        <div class="space-y-4">
          <div class="h-8 bg-muted rounded-lg animate-pulse w-1/3"></div>
          <div class="h-4 bg-muted rounded-lg animate-pulse w-2/3"></div>
          <div class="h-32 bg-muted rounded-xl animate-pulse"></div>
        </div>
      </template>
    </Suspense>
  </div>
</template>
