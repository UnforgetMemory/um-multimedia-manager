<script setup lang="ts">
import { openExternalUrl } from '@/libraries/utils/safe-url';
import type { StoreRecord } from '@/types';
import { computed } from 'vue';
import { UmmPageLayout } from '@/scenario/douban/components/umm-page-layout';
import { t } from '../../shared/legacy-bridge';
import { useRecordCache } from '../../shared/composables/use-record-cache';
import { subjectIdFromUrl } from '../../shared/subject-keys';
import {
  recordStatusBadge,
  type PersonageCreationsPageData,
  type CreationItem,
  type RecordStatusBadge,
} from './personage-creations-data';

const props = defineProps<{
  data: PersonageCreationsPageData;
  recordMap?: Map<string, StoreRecord>;
}>();
const d = props.data;

// Seeded from the mount-time batch read, then live-refreshed by record events.
const { records } = useRecordCache(
  'movie',
  () =>
    d.creations
      .map((creation) => subjectIdFromUrl(creation.url))
      .filter((id): id is string => Boolean(id)),
  props.recordMap ?? new Map<string, StoreRecord>(),
);

interface CreationWithBadge extends CreationItem {
  badge: RecordStatusBadge | null;
  recordRating: number;
}

/** Badge is derived from the live record map on every render, never stored back. */
const creations = computed<CreationWithBadge[]>(() =>
  d.creations.map((creation) => {
    const rec = records.value.get(subjectIdFromUrl(creation.url) ?? '');
    return {
      ...creation,
      badge: recordStatusBadge(rec?.status ?? 0),
      recordRating: rec?.rating ?? 0,
    };
  }),
);

const sortOptions = [
  { key: 'time', label: t('Sort By Time') },
  { key: 'collection', label: t('Sort By Collection') },
  { key: 'vote', label: t('Sort By Rating') },
] as const;

const typeTabs = [
  { key: 'filmmaker', labelKey: 'douban.pc.tab_filmmaker' },
  { key: 'writer', labelKey: 'douban.pc.tab_writer' },
  { key: 'musician', labelKey: 'douban.pc.tab_musician' },
] as const;

/** Base URL for filter links, preserving current sort/type/role state */
function filterUrl(params: Record<string, string>): string {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  url.searchParams.delete('start'); // pagination resets on filter change
  return url.toString();
}

function openUrl(url: string): void {
  if (url) openExternalUrl(url);
}

const roleOptions = computed(() => [
  {
    labelKey: 'douban.pc.role_all',
    role: '',
    url: filterUrl({ role: '' }),
    active: !d.currentRole,
  },
  ...d.roleOptions,
]);

/** e.g. "演员 - 配音" → "演员 · 配音" */
function formatRole(role: string): string {
  return role.replace(/\s*-\s*/g, ' · ').trim();
}
</script>

<template vapor>
  <UmmPageLayout type="movie">
    <div class="umm-personage-root">
      <!-- Empty state -->
      <div v-if="!d.creations.length" class="umm-personage-empty">
        <div class="umm-empty-icon">📭</div>
        <div class="umm-empty-text">{{ t('douban.pc.empty') }}</div>
      </div>

      <template v-else>
        <!-- Header -->
        <div class="umm-creations-header">
          <div class="umm-creations-title-row">
            <h1 class="umm-creations-title">{{ d.personName }}</h1>
            <span class="umm-creations-count">{{
              t('douban.pc.count', { count: d.totalWorks })
            }}</span>
          </div>

          <!-- Type tabs -->
          <div class="umm-creations-tabs">
            <button
              v-for="tab in typeTabs"
              :key="tab.key"
              class="umm-creations-tab"
              :class="{ 'umm-creations-tab--active': d.currentType === tab.key }"
              @click="openUrl(filterUrl({ type: tab.key }))"
            >
              {{ t(tab.labelKey) }}
            </button>
          </div>

          <!-- Sort options -->
          <div class="umm-creations-sort">
            <button
              v-for="opt in sortOptions"
              :key="opt.key"
              class="umm-creations-sort-btn"
              :class="{ 'umm-creations-sort-btn--active': d.currentSort === opt.key }"
              @click="openUrl(filterUrl({ sortby: opt.key }))"
            >
              {{ opt.label }}
            </button>
          </div>

          <!-- Role filter -->
          <div class="umm-creations-rolebar">
            <span class="umm-creations-rolebar-label">{{ t('douban.pc.role_hint') }}</span>
            <div class="umm-creations-rolebar-options">
              <a
                v-for="opt in roleOptions"
                :key="opt.role || 'all'"
                :href="opt.url"
                class="umm-creations-role-chip"
                :class="{ 'umm-creations-role-chip--active': opt.active }"
                @click.prevent="openUrl(opt.url)"
                >{{ t(opt.labelKey) }}</a
              >
            </div>
          </div>
        </div>

        <!-- Creations list -->
        <div class="umm-creations-list">
          <div v-for="(creation, i) in creations" :key="i" class="umm-creation-card">
            <!-- Poster -->
            <div
              class="umm-creation-poster"
              :style="{ backgroundImage: `url(${creation.poster})` }"
              @click="openUrl(creation.url)"
            />
            <!-- Info -->
            <div class="umm-creation-info">
              <div class="umm-creation-title-row">
                <a
                  :href="creation.url"
                  class="umm-creation-title"
                  @click.prevent="openUrl(creation.url)"
                  >{{ creation.title }}</a
                >
                <span v-if="creation.year" class="umm-creation-year">({{ creation.year }})</span>
                <span v-if="creation.status" class="umm-creation-status">{{
                  creation.status
                }}</span>
                <span v-if="creation.role" class="umm-creation-role">{{
                  formatRole(creation.role)
                }}</span>
              </div>

              <!-- Director & Cast -->
              <div v-if="creation.director" class="umm-creation-meta">
                <span class="umm-creation-meta-label">{{ t('douban.pc.director') }}</span>
                {{ creation.director.replace(/^导演：/, '') }}
              </div>
              <div v-if="creation.cast" class="umm-creation-meta">
                <span class="umm-creation-meta-label">{{ t('douban.pc.cast') }}</span>
                {{ creation.cast.replace(/^主演：/, '') }}
              </div>

              <!-- Rating -->
              <div v-if="creation.rating" class="umm-creation-rating">
                <span class="umm-creation-rating-star">{{ creation.rating }}</span>
                <span class="umm-creation-rating-label">{{ t('douban.pc.score_suffix') }}</span>
              </div>
            </div>

            <!-- Record status badge (variant from recordStatusBadge pure fn) -->
            <div
              v-if="creation.badge"
              class="umm-creation-badge"
              :class="'umm-creation-badge--' + creation.badge.variant"
            >
              <span>{{ t(creation.badge.labelKey) }}</span>
              <span v-if="creation.recordRating" class="umm-creation-badge-rating">{{
                creation.recordRating
              }}</span>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="d.totalPages > 1" class="umm-creations-paginator">
          <button v-if="d.hasPrev" class="umm-paginator-btn" @click="openUrl(d.prevUrl)">
            {{ t('douban.pc.prev') }}
          </button>
          <span class="umm-paginator-info">
            {{ t('douban.pc.page_info', { current: d.currentPage, total: d.totalPages }) }}
          </span>
          <button v-if="d.hasNext" class="umm-paginator-btn" @click="openUrl(d.nextUrl)">
            {{ t('douban.pc.next') }}
          </button>
        </div>
      </template>
    </div>
  </UmmPageLayout>
</template>
