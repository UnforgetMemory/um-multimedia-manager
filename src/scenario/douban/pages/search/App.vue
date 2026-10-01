<script setup lang="ts">
import type { DoubanSearchData, SearchItem } from './types';
import type { StoreRecord } from '@/types';
import { computed, ref } from 'vue';
import { safeHref } from '@/libraries/utils/safe-url';
import { UmmPageLayout } from '@/scenario/douban/components/umm-page-layout';
import { useRecordCache } from '../../shared/composables/use-record-cache';
import { t } from '../../shared/legacy-bridge';
import UmmSearchCard from './components/UmmSearchCard.vue';
import UmmSearchFilter, { type FilterType } from './components/UmmSearchFilter.vue';

const props = defineProps<{
  searchData?: DoubanSearchData;
  recordMap?: Map<string, StoreRecord>;
  type: 'movie' | 'music' | 'book';
}>();

const cat = props.type === 'book' ? '1001' : props.type === 'music' ? '1003' : '1002';

const perPage = computed(() => props.searchData?.count || 15);
const totalPages = computed(() =>
  props.searchData ? Math.ceil(props.searchData.total / perPage.value) : 0,
);
const currentPage = computed(() =>
  props.searchData ? Math.floor((props.searchData.start || 0) / perPage.value) + 1 : 1,
);

const jumpToPage = ref<number | null>(null);
const filterType = ref<FilterType>('all');

/** TV detection: check if item has a "剧集" label from Douban's own metadata.
 *  这里是宿主侧栏匹配串（合法债务）：与 `douban.search.filter_tv` 同字面但不同
 *  角色——不要把它「抽取」成 t()，词典化后 en-US 下匹配恒假、页签筛选恒空，
 *  而钉 zh-CN 跑的用例看不见这种坏。 */
function isTvItem(item: SearchItem): boolean {
  return item.labels?.some((l) => l.text === '剧集') ?? false;
}

const filteredItems = computed(() => {
  if (!props.searchData?.items || filterType.value === 'all') return props.searchData?.items ?? [];
  const wantTv = filterType.value === 'tv';
  return props.searchData.items.filter((i) => isTvItem(i) === wantTv);
});

// Seeded from the mount-time batch read so the first paint already has badges;
// the subscription only re-reads when a visible subject is written elsewhere.
const { records: liveRecordMap } = useRecordCache(
  props.type,
  () => filteredItems.value.filter((i) => i.id).map((i) => String(i.id)),
  props.recordMap ?? new Map<string, StoreRecord>(),
);

const pageWindow = computed(() => {
  const tp = totalPages.value;
  const cp = currentPage.value;
  const maxShow = 9;
  if (tp <= maxShow) return Array.from({ length: tp }, (_, i) => i + 1);
  let start = Math.max(1, cp - 4);
  let end = start + maxShow - 1;
  if (end > tp) {
    end = tp;
    start = Math.max(1, end - maxShow + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
});

function pageUrl(page: number): string {
  const q = encodeURIComponent(props.searchData?.text || '');
  const start = page ? (page - 1) * perPage.value : 0;
  return `https://search.douban.com/${props.type}/subject_search?search_text=${q}&cat=${cat}${start > 0 ? `&start=${start}` : ''}`;
}

function navigate(url: string): void {
  location.href = safeHref(url);
}

function handlePageJump(): void {
  const p = Math.round(Number(jumpToPage.value));
  if (!Number.isFinite(p)) {
    jumpToPage.value = null;
    return;
  }
  const clamped = Math.max(1, Math.min(p, totalPages.value));
  jumpToPage.value = null;
  if (clamped === currentPage.value) return;
  navigate(pageUrl(clamped));
}

function clampJumpInput(): void {
  if (jumpToPage.value == null) return;
  const p = Math.round(Number(jumpToPage.value));
  if (!Number.isFinite(p)) {
    jumpToPage.value = null;
    return;
  }
  jumpToPage.value = Math.max(1, Math.min(p, totalPages.value));
}
</script>

<template vapor>
  <UmmPageLayout :newTab="false" :type="type" :initialQuery="searchData?.text || ''">
    <div class="umm-search-page">
      <UmmSearchFilter
        v-if="searchData && type === 'movie'"
        v-model="filterType"
        :total="searchData.total"
        :filtered="filteredItems.length"
        :query="searchData.text"
      />

      <div v-else-if="searchData" class="umm-search-hd">
        <div class="umm-search-hd-left">
          <h1 class="umm-search-title">
            {{
              type === 'music'
                ? t('douban.search.title_music')
                : type === 'book'
                  ? t('douban.search.title_book')
                  : t('douban.search.title')
            }}
          </h1>
        </div>
        <span class="umm-search-hd-meta">
          {{ t('douban.search.results', { text: searchData.text, count: searchData.total }) }}
        </span>
      </div>

      <div v-if="filteredItems.length > 0" class="umm-search-grid">
        <UmmSearchCard
          v-for="item in filteredItems"
          :key="item.id"
          :item="item"
          :records="liveRecordMap"
          :type="type"
        />
      </div>
      <div v-else class="umm-search-empty">
        <p>{{ t('douban.search.unavailable') }}</p>
      </div>

      <div v-if="totalPages > 1" class="umm-paginator">
        <a
          v-if="currentPage > 1"
          :href="pageUrl(1)"
          @click.prevent="navigate(pageUrl(1))"
          class="umm-page-link"
          >{{ t('douban.search.first') }}</a
        >
        <a
          v-if="currentPage > 1"
          :href="pageUrl(currentPage - 1)"
          @click.prevent="navigate(pageUrl(currentPage - 1))"
          class="umm-page-link"
          >{{ t('douban.search.prev') }}</a
        >
        <template v-for="p in pageWindow" :key="p">
          <a v-if="p === currentPage" class="umm-page-link umm-page-link--active">{{ p }}</a>
          <a
            v-else
            :href="pageUrl(p)"
            @click.prevent="navigate(pageUrl(p))"
            class="umm-page-link"
            >{{ p }}</a
          >
        </template>
        <a
          v-if="currentPage < totalPages"
          :href="pageUrl(currentPage + 1)"
          @click.prevent="navigate(pageUrl(currentPage + 1))"
          class="umm-page-link"
          >{{ t('douban.search.next') }}</a
        >
        <a
          v-if="currentPage < totalPages"
          :href="pageUrl(totalPages)"
          @click.prevent="navigate(pageUrl(totalPages))"
          class="umm-page-link"
          >{{ t('douban.search.last') }}</a
        >
        <span class="umm-page-jump">
          <input
            type="number"
            class="umm-page-input"
            :placeholder="currentPage.toString()"
            :min="1"
            :max="totalPages"
            :title="'1～' + totalPages"
            @keyup.enter="handlePageJump"
            @blur="clampJumpInput"
            v-model.number="jumpToPage"
          />
          <button class="umm-page-go" @click="handlePageJump">{{ t('douban.search.go') }}</button>
        </span>
      </div>
    </div>
  </UmmPageLayout>
</template>
