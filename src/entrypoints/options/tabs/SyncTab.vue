<script setup lang="ts">
import { ref, defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import SegmentedControl from '@/shared/ui/segmented-control/SegmentedControl.vue'

const { t } = useI18n()
const activeSubTab = ref('webdav')

const WebDAVTab = defineAsyncComponent(() => import('./sync/WebDAVTab.vue'))
const ImportExportTab = defineAsyncComponent(() => import('./sync/ImportExportTab.vue'))

const subTabs = [
  { id: 'webdav', label: 'WebDAV' },
  { id: 'import-export', label: t('tab.importExport') as string },
]
</script>

<template>
  <div class="umm:flex umm:flex-col umm:gap-[var(--umm-section-gap)]">
    <SegmentedControl v-model="activeSubTab" :options="subTabs" />

    <Suspense>
      <WebDAVTab v-if="activeSubTab === 'webdav'" />
      <ImportExportTab v-else-if="activeSubTab === 'import-export'" />
      <template #fallback>
        <div class="umm:flex umm:flex-col umm:gap-4">
          <div class="umm:h-8 umm:bg-muted umm:rounded-lg umm:animate-pulse umm:w-1/3"></div>
          <div class="umm:h-4 umm:bg-muted umm:rounded-lg umm:animate-pulse umm:w-2/3"></div>
          <div class="umm:h-32 umm:bg-muted umm:rounded-xl umm:animate-pulse"></div>
        </div>
      </template>
    </Suspense>
  </div>
</template>
