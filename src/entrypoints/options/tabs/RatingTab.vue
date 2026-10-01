<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Store } from '@/engine/database';
import type { Domain, Provider } from '@/libraries/config';
import type { StoreRecord } from '@/types';
import { useI18n } from 'vue-i18n';
import { Button } from '@/libraries/ui/button';
import { Star, CheckCircle2, XCircle, Database, RefreshCw } from '@/libraries/ui/icons';
import { useToast } from '@/feature/composables/use-toast';
import { useDebouncedQuery } from '@/feature/composables/use-debounced-query';
import { errorMessage } from '@/libraries/utils/error-message';
import { JAV_IDS_STORE_NAME } from '@/provider/adult-av/models';
import { autoDetectPlatform } from '@/provider/adult-av/auto-detect';
import SectionContainer from '@/libraries/ui/section-container/SectionContainer.vue';

import FormField from '@/libraries/ui/form-field/FormField.vue';
import { PlatformSearchForm } from '@/libraries/ui/platform-search-form';
import { PLATFORM_OPTIONS, JAV_SOURCE_OPTIONS } from '../constants';
import { parseRecordInput, type RecordProvider } from '../record-input-parser';

const { t } = useI18n();
const toast = useToast();

interface RatingQueryRecord extends StoreRecord {
  type: string;
  provider: Provider | 'jav_ids';
  providerId: string;
}

const ratingInput = ref('');
const ratingValue = ref<number | null>(null);
const ratingComment = ref('');
const selectedPlatform = ref<string>('douban');
const selectedDomain = ref<Domain>('movie');
const selectedJavSource = ref<string>('local');
const ratingQueryResult = ref<RatingQueryRecord | null>(null);
const isQuerying = ref(false);
const hasQueryed = ref(false);

function currentParse() {
  return parseRecordInput(
    ratingInput.value,
    selectedPlatform.value as RecordProvider,
    selectedDomain.value,
    selectedJavSource.value,
  );
}

const parseResult = computed(() => {
  if (!ratingInput.value.trim()) return null;
  return currentParse();
});

function getStatusLabel(status: number, type: string): string {
  if (type === 'music') {
    const labels: Record<number, string> = {
      0: t('common.unlistened'),
      1: t('common.wish'),
      2: t('common.listened'),
      3: t('common.doing'),
    };
    return labels[status] || '';
  }
  const labels: Record<number, string> = {
    0: t('common.unwatched'),
    1: t('common.wish'),
    2: t('common.watched'),
    3: t('common.doing'),
  };
  return labels[status] || '';
}

async function queryRecordFromDB() {
  const parsed = currentParse();
  // An invalid parse echoes the raw input as providerId — never read (let
  // alone write) a key built from it.
  if (!parsed.valid || !parsed.type || !parsed.providerId) {
    ratingQueryResult.value = null;
    hasQueryed.value = false;
    isQuerying.value = false;
    return;
  }
  isQuerying.value = true;
  hasQueryed.value = false;
  try {
    if (parsed.provider === 'jav_ids') {
      const record = await Store.dbGet(JAV_IDS_STORE_NAME, parsed.providerId);
      ratingQueryResult.value = record
        ? { ...record, type: 'jav_ids', provider: 'jav_ids', providerId: parsed.providerId }
        : null;
    } else {
      const storeName = `${parsed.provider}_records`;
      const key = `${parsed.type}::${parsed.providerId}`;
      const record = await Store.dbGet(storeName, key);
      ratingQueryResult.value = record
        ? { ...record, type: parsed.type, provider: parsed.provider, providerId: parsed.providerId }
        : null;
    }
  } finally {
    hasQueryed.value = true;
    isQuerying.value = false;
  }
}

const { run: debouncedQuery } = useDebouncedQuery(queryRecordFromDB, {
  isRunning: () => isQuerying.value,
  onError: (error: unknown) => {
    // WHY: a failed read is not "no record" — clear the empty state and report
    // through the SPA toast (same channel as saveRating failures).
    ratingQueryResult.value = null;
    hasQueryed.value = false;
    toast.error(t('common.loadFailed'), errorMessage(error));
  },
});

watch(ratingInput, (v) => {
  const input = v.trim();
  if (!input) {
    ratingQueryResult.value = null;
    hasQueryed.value = false;
    return;
  }
  hasQueryed.value = false;
  ratingQueryResult.value = null;
  autoDetectPlatform(input, selectedPlatform.value, {
    setPlatform: (p) => {
      selectedPlatform.value = p;
    },
    setDomain: (d) => {
      selectedDomain.value = d as Domain;
    },
  });
  debouncedQuery();
});

watch(selectedDomain, () => {
  if (ratingInput.value.trim() && !isQuerying.value) debouncedQuery();
});
watch(selectedJavSource, () => {
  if (selectedPlatform.value === 'jav_ids' && ratingInput.value.trim() && !isQuerying.value)
    debouncedQuery();
});
watch(selectedPlatform, () => {
  if (ratingInput.value.trim() && !isQuerying.value) debouncedQuery();
});

async function saveRating() {
  if (!ratingInput.value.trim()) {
    toast.error(t('validation.cannotParse'));
    return;
  }
  if (!ratingValue.value || ratingValue.value < 1 || ratingValue.value > 10) {
    toast.error(t('common.ratingRequired'));
    return;
  }
  const parsed = currentParse();
  // A valid:false result still carries a truthy object echoing the raw input —
  // saving it would write `{type}::<garbage>` keys and broadcast record:updated.
  if (!parsed.valid) {
    toast.error(t('validation.cannotParse'), t(parsed.errorKey));
    return;
  }
  try {
    if (parsed.provider === 'jav_ids') {
      const existing = await Store.dbGet(JAV_IDS_STORE_NAME, parsed.providerId);
      await Store.dbPut(JAV_IDS_STORE_NAME, parsed.providerId, {
        url: parsed.url || existing?.url || '',
        status: existing?.status ?? 2,
        rating: ratingValue.value,
        comment: ratingComment.value || undefined,
        updatedAt: new Date().toISOString(),
        linkedIds: existing?.linkedIds ?? {},
      });
    } else {
      const storeName = `${parsed.provider}_records`;
      const key = `${parsed.type}::${parsed.providerId}`;
      const existing = await Store.dbGet(storeName, key);
      await Store.dbPut(storeName, key, {
        url: parsed.url,
        status: existing?.status ?? 1,
        rating: ratingValue.value,
        comment: ratingComment.value || undefined,
        updatedAt: new Date().toISOString(),
        linkedIds: existing?.linkedIds ?? {},
      });
    }
    toast.success(t('toast.saved'));
    ratingInput.value = '';
    ratingValue.value = null;
    ratingComment.value = '';
    ratingQueryResult.value = null;
  } catch (e: unknown) {
    toast.error(t('toast.saveFailed'), errorMessage(e));
  }
}
</script>

<template vapor>
  <SectionContainer>
    <PlatformSearchForm
      v-model:platform="selectedPlatform"
      v-model:domain="selectedDomain"
      v-model:javSource="selectedJavSource"
      v-model:search="ratingInput"
      :platform-options="PLATFORM_OPTIONS"
      :jav-source-options="JAV_SOURCE_OPTIONS"
    />

    <div class="umm:flex umm:flex-col umm:gap-2 umm:min-h-[40px]">
      <!-- Parse result -->
      <Transition name="fade" mode="out-in">
        <div
          v-if="ratingInput && parseResult && parseResult.valid"
          key="parse-ok"
          class="umm:flex umm:items-center umm:gap-2 umm:p-2 umm:rounded-md umm:bg-state-success/10 umm:dark:bg-state-success/20 umm:text-xs"
        >
          <CheckCircle2 class="umm:h-3.5 umm:w-3.5 umm:text-state-success umm:shrink-0" />
          <span class="umm:text-state-success"
            >{{ parseResult.provider }} / {{ parseResult.type }}</span
          >
          <span class="umm:text-state-success/70 umm:dark:text-state-success/70 umm:font-mono">{{
            parseResult.providerId
          }}</span>
        </div>
        <div
          v-else-if="ratingInput && parseResult && !parseResult.valid"
          key="parse-err"
          class="umm:flex umm:items-center umm:gap-2 umm:p-2 umm:rounded-md umm:bg-state-error/10 umm:dark:bg-state-error/20 umm:text-xs"
        >
          <XCircle class="umm:h-3.5 umm:w-3.5 umm:text-state-error umm:shrink-0" />
          <span class="umm:text-state-error">{{ t(parseResult.errorKey) }}</span>
        </div>
      </Transition>

      <!-- Query state -->
      <Transition name="fade" mode="out-in">
        <div
          v-if="isQuerying"
          key="querying"
          class="umm:flex umm:items-center umm:gap-2 umm:p-2 umm:rounded-md umm:bg-muted/50 umm:text-xs"
        >
          <RefreshCw class="umm:h-3.5 umm:w-3.5 umm:animate-spin umm:text-muted-foreground" />
          <span class="umm:text-muted-foreground">{{ t('common.loading') }}</span>
        </div>

        <div
          v-else-if="ratingQueryResult && ratingQueryResult.status === 2"
          key="viewed"
          class="umm:flex umm:items-center umm:gap-2 umm:p-2 umm:rounded-md umm:bg-state-success/10 umm:dark:bg-state-success/30 umm:border umm:border-state-success/30 umm:dark:border-state-success/30 umm:text-xs"
        >
          <CheckCircle2
            class="umm:h-3.5 umm:w-3.5 umm:text-state-success umm:dark:text-state-success umm:shrink-0"
          />
          <span class="umm:text-state-success umm:dark:text-state-success umm:font-medium">{{
            t('common.savedToDb')
          }}</span>
          <span v-if="ratingQueryResult.rating" class="umm:text-state-success"
            >· {{ ratingQueryResult.rating }}/10</span
          >
          <span
            v-if="ratingQueryResult.comment"
            class="umm:text-state-success/70 umm:dark:text-state-success/70 umm:italic"
            >· "{{ ratingQueryResult.comment }}"</span
          >
        </div>

        <div
          v-else-if="ratingQueryResult"
          key="found"
          class="umm:flex umm:items-center umm:gap-2 umm:p-2 umm:rounded-md umm:bg-blue-50 umm:dark:bg-blue-950/30 umm:border umm:border-blue-200 umm:dark:border-blue-800 umm:text-xs"
        >
          <Database
            class="umm:h-3.5 umm:w-3.5 umm:text-blue-600 umm:dark:text-blue-400 umm:shrink-0"
          />
          <span class="umm:text-blue-800 umm:dark:text-blue-200 umm:font-medium">{{
            t('common.recordFound')
          }}</span>
          <span class="umm:text-blue-700 umm:dark:text-blue-300"
            >· {{ getStatusLabel(ratingQueryResult.status, ratingQueryResult.type) }}</span
          >
          <span v-if="ratingQueryResult.rating" class="umm:text-blue-600 umm:dark:text-blue-300"
            >· {{ ratingQueryResult.rating }}/10</span
          >
        </div>

        <div
          v-else-if="ratingInput && hasQueryed && !isQuerying"
          key="notfound"
          class="umm:flex umm:items-center umm:gap-2 umm:p-2 umm:rounded-md umm:bg-muted/30 umm:border umm:border-dashed umm:border-muted-foreground/20 umm:text-xs"
        >
          <Database class="umm:h-3.5 umm:w-3.5 umm:text-muted-foreground umm:shrink-0" />
          <span class="umm:text-muted-foreground">{{ t('common.noData') }}</span>
        </div>
      </Transition>
    </div>

    <FormField :label="t('common.rating') + ' (1-10)'">
      <div class="umm:grid umm:grid-cols-5 umm:gap-2">
        <Button
          v-for="i in 10"
          :key="i"
          variant="outline"
          :class="{ 'umm:bg-primary umm:text-primary-foreground': ratingValue === i }"
          @click="ratingValue = i"
          class="umm:h-9"
          >{{ i }}</Button
        >
      </div>
    </FormField>

    <FormField :label="t('common.comment')">
      <textarea
        v-model="ratingComment"
        :placeholder="t('common.comment')"
        class="umm:w-full umm:min-h-[60px] umm:rounded-md umm:border umm:border-input umm:bg-transparent umm:px-3 umm:py-2 umm:text-sm umm:shadow-sm umm:placeholder:text-muted-foreground umm:focus-visible:outline-none umm:focus-visible:ring-1 umm:focus-visible:ring-ring"
      />
    </FormField>

    <Button @click="saveRating" class="umm:w-full umm:gap-2"
      ><Star class="umm:h-4 umm:w-4" />{{ t('common.saveRating') }}</Button
    >
  </SectionContainer>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
.fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
