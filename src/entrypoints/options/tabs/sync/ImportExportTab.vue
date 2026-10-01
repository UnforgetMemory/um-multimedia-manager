<script setup lang="ts">
import { ref } from 'vue';
import { safeSendMessage } from '@/libraries/utils/context';
import { useI18n } from 'vue-i18n';
import { Download, Upload } from '@/libraries/ui/icons';
import { useConfirmStore } from '@/store/confirm';
import { useToast } from '@/feature/composables/use-toast';
import { Switch } from '@/libraries/ui/switch';
import SectionContainer from '@/libraries/ui/section-container/SectionContainer.vue';
import SectionHeader from '@/libraries/ui/section-header/SectionHeader.vue';
import LoadingButton from '@/libraries/ui/loading-button/LoadingButton.vue';
import type { AppSettings, MessagePayloadMap, StoreRecordSnapshot } from '@/types';

/** Backup file accepted here: v2 ExportData (stores) or pre-v2 export (datasets). */
interface ImportedBackup {
  schema?: string;
  version?: number;
  exportedAt?: string;
  stores?: Record<string, Record<string, ImportStoreEntry>>;
  datasets?: Record<string, Record<string, LegacyBackupRecord[]>>;
  settings?: Partial<AppSettings>;
}

/** Legacy dataset record — every field optional; the rebuild below supplies the defaults. */
interface LegacyBackupRecord {
  id?: string;
  providerId?: string;
  url?: string;
  status?: number;
  rating?: number | null;
  updatedAt?: string;
  linkedIds?: Record<string, string>;
}

/** Rebuilt entries may keep `rating: null`; the background write path normalizes it. */
type ImportStoreEntry = Omit<StoreRecordSnapshot, 'rating'> & { rating: number | null };

const { t } = useI18n();
const toast = useToast();
const { show } = useConfirmStore();
const isExporting = ref(false);
const isImporting = ref(false);
// ADR-016 decision 3 + 2026-09-30: one opt-in switch for credential material
// (WebDAV trio + NeoDB token) on export AND import. Defaults to off. Export
// warns about plaintext; import only applies credentials when this switch is
// on AND the user confirms (malicious-backup gate stays closed by default).
const includeCredentials = ref(false);

async function performExport() {
  isExporting.value = true;
  try {
    const response = await safeSendMessage(
      {
        type: 'EXPORT_DATA',
        payload: {
          includeWebDAVCredentials: includeCredentials.value,
          includeNeoDbToken: includeCredentials.value,
        },
      },
      { timeout: 30000 },
    );
    if (!response?.success) throw new Error(response?.error || t('toast.exportFailed'));
    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `umm-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(t('toast.exportSuccess'));
  } catch (e: unknown) {
    toast.error(t('toast.exportFailed'), String(e));
  } finally {
    isExporting.value = false;
  }
}

async function exportData() {
  // ADR-016 decision 3: when the user opts to include credentials,
  // surface a confirm dialog warning that the file will contain secrets
  // in plaintext. Only proceed after explicit confirmation.
  if (!includeCredentials.value) {
    await performExport();
    return;
  }
  show({
    title: t('confirm.exportWithCredentials'),
    description: t('confirm.exportWithCredentialsDesc'),
    warning: t('confirm.exportWithCredentialsDesc'),
    icon: Download,
    confirmText: t('common.exportData'),
    action: async () => {
      await performExport();
    },
  });
}

function triggerImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const raw = (event.target?.result as string) || '';
        const clean = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
        let payload: ImportedBackup;
        try {
          payload = JSON.parse(clean);
        } catch (parseErr: unknown) {
          const preview = raw
            .slice(0, 80)
            .replace(
              /[\x00-\x1f]/g,
              (ch) => `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`,
            );
          console.error('[Import] JSON parse failed. Raw[:80]:', preview, 'length:', raw.length);
          toast.error(
            t('toast.importFailed'),
            `${String(parseErr)}\n\nFile starts with: "${preview}"`,
          );
          return;
        }
        let recordCount = 0;
        if (payload.stores) {
          for (const sn in payload.stores) {
            recordCount += Object.keys(payload.stores[sn] ?? {}).length;
          }
        }
        const fileHasCreds = !!(
          payload?.settings &&
          (payload.settings.webdavUrl ||
            payload.settings.webdavUsername ||
            payload.settings.webdavPassword ||
            payload.settings.neodbToken)
        );
        const restoreCreds = includeCredentials.value && fileHasCreds;
        show({
          title: t('confirm.importData'),
          description: t('confirm.importRecords', { count: recordCount.toLocaleString() }),
          warning: restoreCreds
            ? `${t('common.overrideWarning')}\n\n${t('confirm.importWithCredentialsDesc')}`
            : t('common.overrideWarning'),
          details: `${t('common.fileName')}: ${file.name}`,
          icon: Upload,
          confirmText: t('common.startImport'),
          action: async () => {
            isImporting.value = true;
            try {
              let importPayload = payload;
              if (payload.datasets && !payload.stores) {
                const stores: Record<string, Record<string, ImportStoreEntry>> = {};
                for (const provider of ['douban', 'imdb', 'neodb', 'tmdb']) {
                  const sn = `${provider}_records`;
                  const byType = payload.datasets[provider];
                  if (byType) {
                    const bucket: Record<string, ImportStoreEntry> = {};
                    for (const type of Object.keys(byType)) {
                      const records = byType[type];
                      if (!records) continue;
                      for (const r of records) {
                        bucket[`${type}::${r.providerId || r.id}`] = {
                          url: r.url || '',
                          status: r.status ?? 1,
                          rating: r.rating ?? null,
                          updatedAt: r.updatedAt || new Date().toISOString(),
                          linkedIds: r.linkedIds || {},
                        };
                      }
                    }
                    stores[sn] = bucket;
                  }
                }
                importPayload = { stores, settings: payload.settings };
              }
              const res = await safeSendMessage(
                {
                  type: 'IMPORT_DATA',
                  // Files may be pre-v2 (no schema/version); the handler normalizes,
                  // while the ExportData contract only describes the v2 success shape.
                  payload: {
                    ...importPayload,
                    includeWebDAVCredentials: restoreCreds,
                    includeNeoDbToken: restoreCreds,
                  } as MessagePayloadMap['IMPORT_DATA'],
                },
                { timeout: 30000 },
              );
              if (res?.success) {
                toast.success(t('toast.importSuccess'));
              } else {
                console.error('[Import] background handler returned error:', JSON.stringify(res));
                throw new Error(res?.error || 'Import returned no response');
              }
            } catch (e: unknown) {
              const errMsg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
              console.error('[Import] action error:', errMsg);
              toast.error(t('toast.importFailed'), errMsg);
            } finally {
              isImporting.value = false;
            }
          },
        });
      } catch (e: unknown) {
        toast.error(t('toast.importFailed'), String(e));
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
</script>

<template vapor>
  <SectionContainer>
    <SectionHeader :title="t('tab.importExport')" />
    <div class="umm:grid umm:grid-cols-2 umm:gap-3">
      <LoadingButton
        :icon="Download"
        :label="t('common.exportData')"
        :loading="isExporting"
        :loading-label="t('common.exporting')"
        variant="outline"
        :disabled="isExporting || isImporting"
        @click="exportData"
      />
      <LoadingButton
        :icon="Upload"
        :label="t('common.importData')"
        :loading="isImporting"
        :loading-label="t('common.importing')"
        variant="outline"
        :disabled="isExporting || isImporting"
        @click="triggerImport"
      />
    </div>
    <div class="umm:flex umm:items-center umm:justify-between umm:mt-3 umm:gap-3">
      <label
        class="umm:text-sm umm:text-muted-foreground umm:cursor-pointer"
        for="umm-include-webdav-creds"
      >
        {{ t('common.includeWebdavCredentials') }}
      </label>
      <Switch id="umm-include-webdav-creds" v-model="includeCredentials" />
    </div>
    <p class="umm:text-xs umm:text-muted-foreground umm:mt-1">
      {{ t('common.includeWebdavCredentialsHint') }}
    </p>
  </SectionContainer>
</template>
