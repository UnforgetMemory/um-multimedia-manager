<script setup lang="ts">
import { ref, watch } from 'vue';
import { Store } from '@/engine/database';
import type { Domain } from '@/libraries/config';
import type { StoreRecord } from '@/types';
import { Badge } from '@/libraries/ui/badge';
import { Separator } from '@/libraries/ui/separator';
import { RefreshCw, Star } from '@/libraries/ui/icons';
import { JAV_IDS_STORE_NAME } from '@/provider/adult-av/models';
import { autoDetectPlatform } from '@/provider/adult-av/auto-detect';
import SectionContainer from '@/libraries/ui/section-container/SectionContainer.vue';
import { useToast } from '@/feature/composables/use-toast';
import { useDebouncedQuery } from '@/feature/composables/use-debounced-query';
import { errorMessage } from '@/libraries/utils/error-message';

import { PlatformSearchForm } from '@/libraries/ui/platform-search-form';
import { PLATFORM_OPTIONS, JAV_SOURCE_OPTIONS } from '../constants';
import { parseRecordInput, type RecordProvider } from '../record-input-parser';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const toast = useToast();

const linkedInput = ref('');
const linkedSelectedPlatform = ref<string>('douban');
const linkedSelectedDomain = ref<Domain>('movie');
const linkedSelectedJavSource = ref<string>('local');
const isLinkedQuerying = ref(false);

interface LinkedQueryResult {
  source: {
    provider: string;
    type: string;
    providerId: string;
    url: string;
    status: number;
    rating: number;
    updatedAt: string;
  };
  linked: Array<{
    provider: string;
    type: string;
    providerId: string;
    url: string;
    status: number;
    rating: number;
    updatedAt: string;
    storeName: string;
  }>;
}

const linkedQueryResult = ref<LinkedQueryResult | null>(null);
const hasQueryed = ref(false);

async function queryLinkedData() {
  const parsed = parseRecordInput(
    linkedInput.value,
    linkedSelectedPlatform.value as RecordProvider,
    linkedSelectedDomain.value,
    linkedSelectedJavSource.value,
  );
  // A valid:false parse echoes the raw input as providerId — never key a read off it.
  if (!parsed.valid || !parsed.type || !parsed.providerId) {
    linkedQueryResult.value = null;
    hasQueryed.value = false;
    return;
  }
  isLinkedQuerying.value = true;
  hasQueryed.value = false;
  try {
    if (parsed.provider === 'jav_ids') {
      // Query jav_ids store
      const record = await Store.dbGet(JAV_IDS_STORE_NAME, parsed.providerId);
      if (!record) {
        linkedQueryResult.value = null;
        return;
      }
      const source = {
        provider: 'jav_ids',
        type: 'jav_ids',
        providerId: parsed.providerId,
        url: record.url || '',
        status: record.status ?? 2,
        rating: record.rating || 0,
        updatedAt: record.updatedAt || '',
      };
      linkedQueryResult.value = { source, linked: [] };
    } else {
      // Query regular record store
      const storeName = `${parsed.provider}_records`;
      const key = `${parsed.type}::${parsed.providerId}`;
      const record = await Store.dbGet(storeName, key);
      if (!record) {
        linkedQueryResult.value = null;
        return;
      }
      const source = {
        provider: parsed.provider,
        type: parsed.type,
        providerId: parsed.providerId,
        url: record.url,
        status: record.status,
        rating: record.rating,
        updatedAt: record.updatedAt,
      };
      // Bulk read replaces the previous N sequential dbGet round-trips:
      // one dbGetBulk per distinct store; output order follows linkedIds
      // insertion order regardless of batch completion order.
      const targets: Array<{ provider: string; type: string; providerId: string }> = [];
      for (const [lp, lk] of Object.entries(record.linkedIds || {})) {
        if (!lk) continue;
        let lt: string, lpid: string;
        // WHY !: guarded by lk.includes('::') ⇒ split yields ≥2 defined segments
        if (lk.includes('::')) {
          const sep = lk.split('::');
          lt = sep[0]!;
          lpid = sep[1]!;
        } else {
          lt = parsed.type;
          lpid = lk;
        }
        targets.push({ provider: lp, type: lt, providerId: lpid });
      }
      const keysByStore = new Map<string, string[]>();
      for (const target of targets) {
        const store = `${target.provider}_records`;
        const keys = keysByStore.get(store) ?? [];
        keys.push(`${target.type}::${target.providerId}`);
        keysByStore.set(store, keys);
      }
      const stores = [...keysByStore.entries()];
      const batches = await Promise.all(
        stores.map(([store, keys]) => Store.dbGetBulk(store, keys)),
      );
      const found = new Map<string, StoreRecord>();
      batches.forEach((entries, i) => {
        const store = stores[i]![0];
        for (const { key, record: entryRecord } of entries)
          found.set(`${store}::${key}`, entryRecord);
      });
      const linked: LinkedQueryResult['linked'] = targets.map((target) => {
        const lr = found.get(`${target.provider}_records::${target.type}::${target.providerId}`);
        return {
          provider: target.provider,
          type: target.type,
          providerId: target.providerId,
          url: lr?.url || '',
          status: lr?.status ?? -1,
          rating: lr?.rating || 0,
          updatedAt: lr?.updatedAt || '',
          storeName: `${target.provider}_records`,
        };
      });
      linkedQueryResult.value = { source, linked };
    }
  } finally {
    hasQueryed.value = true;
    isLinkedQuerying.value = false;
  }
}

const { run: debouncedQuery } = useDebouncedQuery(queryLinkedData, {
  isRunning: () => isLinkedQuerying.value,
  onError: (error: unknown) => {
    // WHY: a failed read is not "no record in DB" — clear the empty state and
    // report through the SPA toast (same channel as saveRating failures).
    linkedQueryResult.value = null;
    hasQueryed.value = false;
    toast.error(t('common.loadFailed'), errorMessage(error));
  },
});

watch(linkedInput, (v) => {
  const input = v.trim();
  if (!input) {
    linkedQueryResult.value = null;
    hasQueryed.value = false;
    return;
  }
  hasQueryed.value = false;
  linkedQueryResult.value = null;
  autoDetectPlatform(input, linkedSelectedPlatform.value, {
    setPlatform: (p) => {
      linkedSelectedPlatform.value = p;
    },
    setDomain: (d) => {
      linkedSelectedDomain.value = d as Domain;
    },
  });
  debouncedQuery();
});

watch(linkedSelectedDomain, () => {
  if (linkedInput.value.trim() && !isLinkedQuerying.value) debouncedQuery();
});
watch(linkedSelectedJavSource, () => {
  if (
    linkedSelectedPlatform.value === 'jav_ids' &&
    linkedInput.value.trim() &&
    !isLinkedQuerying.value
  )
    debouncedQuery();
});
watch(linkedSelectedPlatform, () => {
  if (linkedInput.value.trim() && !isLinkedQuerying.value) debouncedQuery();
});

function getPlatformLabel(p: string): string {
  const labels: Record<string, string> = {
    douban: t('platform.douban'),
    imdb: t('platform.imdb'),
    neodb: t('platform.neodb'),
    tmdb: t('platform.tmdb'),
    bilibili: t('platform.bilibili'),
    youtube: t('platform.youtube'),
    bangumi: t('platform.bangumi'),
    local: t('platform.local'),
    jav_ids: t('platform.jav'),
  };
  return labels[p] || p;
}
function getStatusText(s: number, type: string): string {
  const isMusic = type === 'music';
  const labels: Record<number, string> = {
    [-1]: t('common.noData'),
    0: isMusic ? t('common.unlistened') : t('common.unwatched'),
    1: t('common.wish'),
    2: isMusic ? t('common.listened') : t('common.watched'),
    3: t('common.doing'),
  };
  return labels[s] || '';
}
function getStatusColor(s: number): string {
  const map: Record<number, string> = {
    '-1': 'var(--umm-color-status-unknown)',
    0: 'var(--umm-color-status-unwatched)',
    1: 'var(--umm-color-status-watched)',
    2: 'var(--umm-color-status-done)',
    3: 'var(--umm-color-status-watched)',
  };
  return map[s] ?? map[0] ?? '';
}
</script>

<template vapor>
  <SectionContainer>
    <PlatformSearchForm
      v-model:platform="linkedSelectedPlatform"
      v-model:domain="linkedSelectedDomain"
      v-model:javSource="linkedSelectedJavSource"
      v-model:search="linkedInput"
      :platform-options="PLATFORM_OPTIONS"
      :jav-source-options="JAV_SOURCE_OPTIONS"
      search-description=""
    />

    <div class="umm:min-h-[60px]">
      <Transition name="fade" mode="out-in">
        <!-- Querying state -->
        <div
          v-if="isLinkedQuerying"
          key="querying"
          class="umm:flex umm:items-center umm:gap-2 umm:p-3 umm:rounded-lg umm:bg-muted/50"
        >
          <RefreshCw class="umm:h-4 umm:w-4 umm:animate-spin umm:text-muted-foreground" />
          <span class="umm:text-sm umm:text-muted-foreground">{{ t('common.loading') }}</span>
        </div>

        <!-- Query result -->
        <div v-else-if="linkedQueryResult" key="result" class="umm:flex umm:flex-col umm:gap-4">
          <div
            class="umm:p-[var(--umm-card-padding)] umm:border umm:border-border umm:rounded-lg umm:bg-muted/30"
          >
            <div class="umm:flex umm:items-center umm:justify-between umm:mb-3">
              <h4 class="umm:font-h2 umm:text-primary-content">{{ t('common.search') }}</h4>
              <Badge variant="outline" class="umm:text-xs">{{
                getPlatformLabel(linkedQueryResult.source.provider)
              }}</Badge>
            </div>
            <div class="umm:flex umm:flex-col umm:gap-2 umm:text-sm">
              <div class="umm:flex umm:items-center umm:justify-between">
                <span class="umm:text-secondary-content">{{ t('common.mediaType') }}</span
                ><span class="umm:font-medium">{{ linkedQueryResult.source.type }}</span>
              </div>
              <div class="umm:flex umm:items-center umm:justify-between">
                <span class="umm:text-secondary-content">ID</span
                ><span class="umm:font-mono umm:text-xs">{{
                  linkedQueryResult.source.providerId
                }}</span>
              </div>
              <div class="umm:flex umm:items-center umm:justify-between">
                <span class="umm:text-secondary-content">{{ t('common.status') }}</span
                ><Badge
                  :style="{
                    backgroundColor: getStatusColor(linkedQueryResult.source.status),
                    color: 'var(--primary-foreground)',
                  }"
                  class="umm:text-xs"
                  >{{
                    getStatusText(linkedQueryResult.source.status, linkedQueryResult.source.type)
                  }}</Badge
                >
              </div>
              <div
                v-if="linkedQueryResult.source.rating > 0"
                class="umm:flex umm:items-center umm:justify-between"
              >
                <span class="umm:text-secondary-content">{{ t('common.rating') }}</span
                ><span class="umm:font-medium umm:flex umm:items-center umm:gap-1"
                  ><Star class="umm:h-3 umm:w-3 umm:text-yellow-500" />{{
                    linkedQueryResult.source.rating
                  }}/10</span
                >
              </div>
            </div>
          </div>
          <div v-if="linkedQueryResult.linked.length > 0">
            <Separator class="umm:my-4" />
            <h4 class="umm:font-h2 umm:text-primary-content umm:mb-3">{{ t('nav.linked') }}</h4>
            <div class="umm:flex umm:flex-col umm:gap-3">
              <div
                v-for="(item, i) in linkedQueryResult.linked"
                :key="i"
                class="umm:p-3 umm:border umm:border-border umm:rounded-lg"
                :class="{ 'umm:bg-muted/20': item.status === -1 }"
              >
                <div class="umm:flex umm:items-center umm:justify-between umm:mb-2">
                  <div class="umm:flex umm:items-center umm:gap-2">
                    <Badge variant="secondary" class="umm:text-xs">{{
                      getPlatformLabel(item.provider)
                    }}</Badge
                    ><span class="umm:text-xs umm:text-secondary-content">{{ item.type }}</span>
                  </div>
                  <Badge
                    :style="{
                      backgroundColor: getStatusColor(item.status),
                      color: 'var(--primary-foreground)',
                    }"
                    class="umm:text-xs"
                    >{{ getStatusText(item.status, item.type) }}</Badge
                  >
                </div>
                <div class="umm:flex umm:flex-col umm:gap-1 umm:text-sm">
                  <div class="umm:flex umm:items-center umm:justify-between">
                    <span class="umm:text-secondary-content">ID</span
                    ><span class="umm:font-mono umm:text-xs">{{ item.providerId }}</span>
                  </div>
                  <div v-if="item.rating > 0" class="umm:flex umm:items-center umm:justify-between">
                    <span class="umm:text-secondary-content">{{ t('common.rating') }}</span
                    ><span class="umm:font-medium umm:flex umm:items-center umm:gap-1"
                      ><Star class="umm:h-3 umm:w-3 umm:text-yellow-500" />{{
                        item.rating
                      }}/10</span
                    >
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div
            v-else
            class="umm:p-4 umm:text-center umm:text-sm umm:text-secondary-content umm:border umm:border-dashed umm:border-border umm:rounded-lg"
          >
            {{ t('common.noData') }}
          </div>
        </div>

        <!-- Not found -->
        <div
          v-else-if="linkedInput && hasQueryed && !isLinkedQuerying"
          key="notfound"
          class="umm:p-4 umm:text-center umm:text-sm umm:text-secondary-content umm:border umm:border-dashed umm:border-border umm:rounded-lg"
        >
          {{ t('common.noRecordInDb') }}
        </div>
      </Transition>
    </div>
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
