<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, type Component } from 'vue';
import { Store } from '@/engine/database';
import { STORAGE_KEYS } from '@/libraries/config';
import { safeSendMessage } from '@/libraries/utils/context';
import { useI18n } from 'vue-i18n';
import { Button } from '@/libraries/ui/button';
import { Input } from '@/libraries/ui/input';
import { Badge } from '@/libraries/ui/badge';
import { Card, CardContent, CardHeader } from '@/libraries/ui/card';
import { RefreshCw, Download, Upload } from '@/libraries/ui/icons';
import { useConfirmStore, type ConfirmTable, type ConfirmTableRow } from '@/store/confirm';
import { useToast } from '@/feature/composables/use-toast';
import type { SyncPlanMode, SyncPlanRow, SyncPreview } from '@/types';
import SectionContainer from '@/libraries/ui/section-container/SectionContainer.vue';
import SectionHeader from '@/libraries/ui/section-header/SectionHeader.vue';
import FormField from '@/libraries/ui/form-field/FormField.vue';
import LoadingButton from '@/libraries/ui/loading-button/LoadingButton.vue';

const { t } = useI18n();
const toast = useToast();
const { show } = useConfirmStore();

const webdavConfig = ref({ url: '', username: '', password: '' });
const isConfigSaved = ref(false);
const loading = ref({ sync: false, download: false, upload: false });
/** 预检进行中（ADR-027：动作分「预检」「执行」两段，任一进行中禁用全部按钮）。 */
const previewing = ref(false);

const isAnyRunning = computed(
  () => previewing.value || Object.values(loading.value).some((v) => v),
);

let webdavOnChangedUnsub: (() => void) | null = null;
let syncCount = 0;

/** Storage key → webdavConfig field, applied one by one on cross-tab sync. */
const WEBDAV_SYNC_FIELDS: Array<[string, 'url' | 'username' | 'password']> = [
  [STORAGE_KEYS.WEBDAV_URL, 'url'],
  [STORAGE_KEYS.WEBDAV_USERNAME, 'username'],
  [STORAGE_KEYS.WEBDAV_PASSWORD, 'password'],
];

/** 数据集键 → 本地化名称键；未登记（含恶意/未知键）直接显示原始键。 */
const DATASET_LABEL_KEYS: Record<string, string> = {
  douban_records: 'platform.douban',
  imdb_records: 'platform.imdb',
  neodb_records: 'platform.neodb',
  tmdb_records: 'platform.tmdb',
  bilibili_records: 'platform.bilibili',
  youtube_records: 'platform.youtube',
  bangumi_records: 'platform.bangumi',
  jav_ids: 'sync.dataset.jav',
  usav_ids: 'sync.dataset.usav',
  sehuatang_ids: 'sync.dataset.sehuatang',
  __settings__: 'sync.dataset.settings',
};

interface ActionMeta {
  titleKey: string;
  descKey: string;
  confirmKey: string;
  successKey: string;
  failKey: string;
  icon: Component;
}

const ACTION_META: Record<SyncPlanMode, ActionMeta> = {
  sync: {
    titleKey: 'sync.smartMerge',
    descKey: 'sync.smartMergeDesc',
    confirmKey: 'sync.startSync',
    successKey: 'toast.syncSuccess',
    failKey: 'toast.syncFailed',
    icon: RefreshCw,
  },
  download: {
    titleKey: 'sync.cloudOverwrite',
    descKey: 'sync.cloudOverwriteDesc',
    confirmKey: 'sync.confirmOverwrite',
    successKey: 'sync.downloadSuccess',
    failKey: 'sync.downloadFailed',
    icon: Download,
  },
  upload: {
    titleKey: 'sync.localOverwrite',
    descKey: 'sync.localOverwriteDesc',
    confirmKey: 'sync.confirmOverwrite',
    successKey: 'sync.uploadSuccess',
    failKey: 'sync.uploadFailed',
    icon: Upload,
  },
};

onMounted(async () => {
  const settings = await Store.getSettings();
  webdavConfig.value = {
    url: settings.webdavUrl || '',
    username: settings.webdavUsername || '',
    password: settings.webdavPassword || '',
  };
  isConfigSaved.value = !!(
    settings.webdavUrl &&
    settings.webdavUsername &&
    settings.webdavPassword
  );

  // Sync WebDAV config across tabs. Per-field application behind a syncCount
  // window (SettingsTab pattern): a whole-object reassign would clobber
  // in-progress keystrokes, and an untyped newValue reaches `.startsWith` later.
  const onChange = async (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || syncCount > 0) return;
    const touched = WEBDAV_SYNC_FIELDS.filter(([key]) => key in changes);
    if (touched.length === 0) return;
    syncCount++;
    for (const [key, field] of touched) {
      const v = changes[key]?.newValue;
      webdavConfig.value[field] = typeof v === 'string' ? v : '';
    }
    isConfigSaved.value = !!(
      webdavConfig.value.url &&
      webdavConfig.value.username &&
      webdavConfig.value.password
    );
    await nextTick();
    syncCount--;
  };
  chrome.storage.onChanged.addListener(onChange);
  webdavOnChangedUnsub = () => {
    chrome.storage.onChanged.removeListener(onChange);
  };
});

onUnmounted(() => {
  webdavOnChangedUnsub?.();
});

async function saveConfig() {
  if (webdavConfig.value.url && !webdavConfig.value.url.startsWith('https://')) {
    toast.error(t('validation.httpsRequired'));
    return;
  }
  try {
    await Store.updateSettings({
      webdavUrl: webdavConfig.value.url,
      webdavUsername: webdavConfig.value.username,
      webdavPassword: webdavConfig.value.password,
    });
    isConfigSaved.value = true;
    toast.success(t('toast.configSaved'));
  } catch (e: unknown) {
    isConfigSaved.value = false;
    toast.error(t('toast.saveFailed'), String(e));
  }
}

async function testConnection() {
  if (!webdavConfig.value.url) {
    toast.error(t('validation.webdavUrlRequired'));
    return;
  }
  if (!webdavConfig.value.url.startsWith('https://')) {
    toast.error(t('validation.httpsRequired'));
    return;
  }
  const result = await safeSendMessage(
    { type: 'WEBDAV_TEST', payload: webdavConfig.value },
    { timeout: 10000 },
  );
  // The probe's **verdict** lives in `ok`; `success` only means "the background
  // answered". The old code checked success alone ⇒ 401/403 auth failures
  // popped a green success toast, and the server-provided message was dropped.
  if (result?.success && result?.ok) toast.success(t('toast.connectionSuccess'));
  else toast.error(t('toast.connectionFailed'), result?.message);
}

// ==================== ADR-027：预检 → 预览确认 → 执行 ====================

function datasetLabel(key: string): string {
  const labelKey = DATASET_LABEL_KEYS[key];
  return labelKey ? t(labelKey) : key;
}

function directionLabel(direction: SyncPlanRow['direction']): string {
  switch (direction) {
    case 'upload':
      return t('sync.dirUpload');
    case 'download':
      return t('sync.dirDownload');
    case 'merge':
      return t('sync.dirMerge');
    default:
      return t('sync.dirSkip');
  }
}

/** 风险列文案 + 色调；`sync` 模式理论上恒为无风险，出现即为合并语义回退。 */
function riskFor(row: SyncPlanRow): { text: string; tone: ConfirmTableRow['tone'] } {
  if (row.orphansRemote) return { text: t('sync.riskOrphan'), tone: 'danger' };
  if (row.lossEstimate > 0)
    return { text: t('sync.riskLoss', { n: row.lossEstimate }), tone: 'danger' };
  if (row.revertsNewer) return { text: t('sync.riskRevert'), tone: 'warn' };
  return { text: t('sync.riskNone'), tone: 'default' };
}

/** ISO 时间 → 本地 `YYYY-MM-DD HH:mm`；空值显示占位符。 */
function formatTime(iso: string): string {
  if (!iso) return t('sync.empty');
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildTable(preview: SyncPreview): ConfirmTable {
  return {
    headers: [
      t('sync.colDataset'),
      t('sync.colLocal'),
      t('sync.colRemote'),
      t('sync.colLocalLatest'),
      t('sync.colRemoteLatest'),
      t('sync.colDirection'),
      t('sync.colRisk'),
    ],
    rows: preview.rows.map((row) => {
      const risk = riskFor(row);
      return {
        tone: risk.tone,
        cells: [
          datasetLabel(row.key),
          String(row.localCount),
          String(row.remoteCount),
          formatTime(row.localLatest),
          formatTime(row.remoteLatest),
          directionLabel(row.direction),
          risk.text,
        ],
      };
    }),
  };
}

/** 目标目录可见化：host + path（无凭据）——防止指向错误目录而不可见（真机教训）。 */
function targetDir(): string {
  try {
    const u = new URL(webdavConfig.value.url);
    return `${u.host}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return webdavConfig.value.url;
  }
}

function detailsFor(preview: SyncPreview): string {
  return `${t('sync.targetDir', { dir: targetDir() })}
${summaryFor(preview)}`;
}

function summaryFor(preview: SyncPreview): string {
  return t('sync.previewSummary', {
    up: preview.totals.upload,
    down: preview.totals.download,
    merge: preview.totals.merge,
    skip: preview.totals.skip,
  });
}

function warningFor(mode: SyncPlanMode, preview: SyncPreview): string | undefined {
  if (preview.totals.lossEstimate > 0) {
    // 逐条点名会被清空的表：仅给总数不足以让用户判断「我到底丢的是什么」。
    const affected = preview.rows
      .filter((row) => row.lossEstimate > 0 || row.orphansRemote)
      .map((row) => datasetLabel(row.key))
      .join('、');
    const detail = affected ? ` ${t('sync.lossStores', { stores: affected })}` : '';
    return `${t('sync.lossWarning', { n: preview.totals.lossEstimate })}${detail}`;
  }
  return mode === 'sync' ? undefined : t('sync.irreversible');
}

/** 统一回报：成功走成功 toast，失败带上后端 message/error。 */
function report(
  meta: ActionMeta,
  r:
    | { success: true; message: string }
    | { success: false; error: string; message?: string }
    | null,
): void {
  if (r?.success) toast.success(t(meta.successKey), r.message);
  else toast.error(t(meta.failKey), r ? r.message || r.error : undefined);
}

/**
 * 执行阶段：携带预检指纹，后台重算不一致即中止（TOCTOU）。
 *
 * `retries: 1` 是硬要求（**不是 0**）：`safeSendMessage` 的 `retries` 是**尝试次数**
 * 而非「额外重试次数」（`for (attempt = 1; attempt <= retries; attempt++)`），
 * 传 0 会一次都不发送、直接返回 null。而默认值 2 会在**超时后重发**，对写操作
 * 等于重复执行 —— 前一次可能已经在后台改了数据。故取 1：只发一次、绝不重试。
 * 超时上限高于后台调度预算（WEBDAV_SYNC 180s），保证先拿到后台的结构化失败
 * （如 STALE_PLAN）而不是模糊的 UI 侧超时。
 */
async function runAction(mode: SyncPlanMode, fingerprint: string): Promise<void> {
  const meta = ACTION_META[mode];
  loading.value[mode] = true;
  const payload = { expectedFingerprint: fingerprint };
  const opts = { timeout: 200_000, retries: 1 };
  try {
    if (mode === 'sync') {
      report(meta, await safeSendMessage({ type: 'WEBDAV_SYNC', payload }, opts));
    } else if (mode === 'upload') {
      report(meta, await safeSendMessage({ type: 'WEBDAV_UPLOAD', payload }, opts));
    } else {
      report(meta, await safeSendMessage({ type: 'WEBDAV_DOWNLOAD', payload }, opts));
    }
  } catch (e: unknown) {
    toast.error(t(meta.failKey), String(e));
  } finally {
    loading.value[mode] = false;
  }
}

/** 先只读预检，拿到逐表计划与指纹后才弹确认框（确认框内呈现完整对照矩阵）。 */
async function startAction(mode: SyncPlanMode): Promise<void> {
  if (!isConfigSaved.value) {
    toast.error(t('validation.saveConfigFirst'));
    return;
  }
  if (isAnyRunning.value) return;

  const meta = ACTION_META[mode];
  previewing.value = true;
  try {
    const r = await safeSendMessage(
      { type: 'WEBDAV_PREVIEW', payload: { mode } },
      { timeout: 30000 },
    );
    if (!r || !r.success) {
      toast.error(t('sync.previewFailed'), r && !r.success ? r.message : undefined);
      return;
    }
    const preview = r.preview;
    const fingerprint = r.fingerprint;
    show({
      title: t(meta.titleKey),
      description: t(meta.descKey),
      warning: warningFor(mode, preview),
      details: detailsFor(preview),
      table: buildTable(preview),
      icon: meta.icon,
      confirmText: t(meta.confirmKey),
      action: () => runAction(mode, fingerprint),
    });
  } catch (e: unknown) {
    toast.error(t('sync.previewFailed'), String(e));
  } finally {
    previewing.value = false;
  }
}
</script>

<template vapor>
  <SectionContainer>
    <Card>
      <CardHeader class="umm:pb-3">
        <div class="umm:flex umm:items-center umm:justify-between">
          <SectionHeader :title="t('settings.webdav')" />
          <Badge v-if="isConfigSaved" variant="default" class="umm:bg-state-success">{{
            t('toast.configSaved')
          }}</Badge>
          <Badge v-else variant="outline" class="umm:text-orange-500 umm:border-orange-500">{{
            t('common.unsaved')
          }}</Badge>
        </div>
      </CardHeader>
      <CardContent class="umm:flex umm:flex-col umm:gap-4">
        <FormField :label="t('common.serverUrl')">
          <Input v-model="webdavConfig.url" placeholder="https://example.com/dav/" />
        </FormField>
        <FormField :label="t('common.username')">
          <Input v-model="webdavConfig.username" />
        </FormField>
        <FormField :label="t('common.password')">
          <Input v-model="webdavConfig.password" type="password" />
        </FormField>
        <div class="umm:flex umm:gap-2">
          <Button @click="saveConfig" class="umm:flex-1">{{ t('common.saveConfig') }}</Button>
          <Button @click="testConnection" variant="outline" class="umm:flex-1">{{
            t('common.testConnection')
          }}</Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="umm:pb-3">
        <SectionHeader :title="t('sync.smartMerge')" />
      </CardHeader>
      <CardContent class="umm:flex umm:flex-col umm:gap-2">
        <p class="umm:text-sm umm:text-secondary-content">{{ t('sync.previewHint') }}</p>
        <LoadingButton
          :icon="Download"
          :label="t('sync.cloudOverwrite')"
          :loading="loading.download"
          :loading-label="t('common.downloading')"
          variant="outline"
          class="umm:w-full"
          :disabled="!isConfigSaved || isAnyRunning"
          @click="startAction('download')"
        />
        <LoadingButton
          :icon="Upload"
          :label="t('sync.localOverwrite')"
          :loading="loading.upload"
          :loading-label="t('common.uploading')"
          variant="outline"
          class="umm:w-full"
          :disabled="!isConfigSaved || isAnyRunning"
          @click="startAction('upload')"
        />
        <LoadingButton
          :icon="RefreshCw"
          :label="t('sync.smartMerge')"
          :loading="loading.sync"
          :loading-label="t('common.syncing')"
          class="umm:w-full"
          :disabled="!isConfigSaved || isAnyRunning"
          @click="startAction('sync')"
        />
      </CardContent>
    </Card>
  </SectionContainer>
</template>
