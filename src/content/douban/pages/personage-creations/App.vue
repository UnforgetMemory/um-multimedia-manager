<script setup lang="ts">
import { computed } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import {
  recordStatusBadge,
  type PersonageCreationsPageData,
  type CreationItem,
  type RecordStatusBadge,
} from './personage-creations-data'

const props = defineProps<{ data: PersonageCreationsPageData }>()
const d = props.data

interface CreationWithBadge extends CreationItem {
  badge: RecordStatusBadge | null
}

/** Decorate creations with their record-status badge (pure mapping). */
const creations = computed<CreationWithBadge[]>(() =>
  d.creations.map((c) => ({
    ...c,
    badge: c.recordStatus ? recordStatusBadge(c.recordStatus) : null,
  })),
)

const sortOptions = [
  { key: 'time', label: '按时间排序' },
  { key: 'collection', label: '按标记排序' },
  { key: 'vote', label: '按评价排序' },
] as const

const typeTabs = [
  { key: 'filmmaker', label: '影视' },
  { key: 'writer', label: '图书' },
  { key: 'musician', label: '音乐' },
] as const

/** Base URL for filter links, preserving current sort/type/role state */
function filterUrl(params: Record<string, string>): string {
  const url = new URL(location.href)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
  }
  url.searchParams.delete('start') // pagination resets on filter change
  return url.toString()
}

function openUrl(url: string): void {
  if (url) window.open(url, '_blank')
}

function getCreationKey(creation: CreationItem, index: number): string {
  return `${index}-${creation.recordStatus ?? 0}-${creation.recordRating ?? 0}`
}

const roleOptions = computed(() => [
  { label: '全部', role: '', url: filterUrl({ role: '' }), active: !d.currentRole },
  ...d.roleOptions,
])

/** e.g. "演员 - 配音" → "演员 · 配音" */
function formatRole(role: string): string {
  return role.replace(/\s*-\s*/g, ' · ').trim()
}
</script>

<template>
  <UmmPageLayout type="movie">
    <div class="umm-personage-root">
      <!-- Empty state -->
      <div v-if="!d.creations.length" class="umm-personage-empty">
        <div class="umm-empty-icon">📭</div>
        <div class="umm-empty-text">暂无作品信息</div>
      </div>

      <template v-else>
        <!-- Header -->
        <div class="umm-creations-header">
          <div class="umm-creations-title-row">
            <h1 class="umm-creations-title">{{ d.personName }}</h1>
            <span class="umm-creations-count">共 {{ d.totalWorks }} 部作品</span>
          </div>

          <!-- Type tabs -->
          <div class="umm-creations-tabs">
            <button
              v-for="tab in typeTabs"
              :key="tab.key"
              class="umm-creations-tab"
              :class="{ 'umm-creations-tab--active': d.currentType === tab.key }"
              @click="openUrl(filterUrl({ type: tab.key }))"
            >{{ tab.label }}</button>
          </div>

          <!-- Sort options -->
          <div class="umm-creations-sort">
            <button
              v-for="opt in sortOptions"
              :key="opt.key"
              class="umm-creations-sort-btn"
              :class="{ 'umm-creations-sort-btn--active': d.currentSort === opt.key }"
              @click="openUrl(filterUrl({ sortby: opt.key }))"
            >{{ opt.label }}</button>
          </div>

          <!-- Role filter -->
          <div class="umm-creations-rolebar">
            <span class="umm-creations-rolebar-label">按角色查看：</span>
            <div class="umm-creations-rolebar-options">
              <a
                v-for="opt in roleOptions"
                :key="opt.role || 'all'"
                :href="opt.url"
                class="umm-creations-role-chip"
                :class="{ 'umm-creations-role-chip--active': opt.active }"
                @click.prevent="openUrl(opt.url)"
              >{{ opt.label }}</a>
            </div>
          </div>
        </div>

        <!-- Creations list -->
        <div class="umm-creations-list">
          <div
            v-for="(creation, i) in creations"
            :key="getCreationKey(creation, i)"
            class="umm-creation-card"
          >
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
                >{{ creation.title }}</a>
                <span v-if="creation.year" class="umm-creation-year">({{ creation.year }})</span>
                <span v-if="creation.status" class="umm-creation-status">{{ creation.status }}</span>
                <span v-if="creation.role" class="umm-creation-role">{{ formatRole(creation.role) }}</span>
              </div>

              <!-- Director & Cast -->
              <div v-if="creation.director" class="umm-creation-meta">
                <span class="umm-creation-meta-label">导演：</span>
                {{ creation.director.replace(/^导演：/, '') }}
              </div>
              <div v-if="creation.cast" class="umm-creation-meta">
                <span class="umm-creation-meta-label">主演：</span>
                {{ creation.cast.replace(/^主演：/, '') }}
              </div>

              <!-- Rating -->
              <div v-if="creation.rating" class="umm-creation-rating">
                <span class="umm-creation-rating-star">{{ creation.rating }}</span>
                <span class="umm-creation-rating-label">分</span>
              </div>
            </div>

            <!-- Record status badge (variant from recordStatusBadge pure fn) -->
            <div
              v-if="creation.badge"
              class="umm-creation-badge"
              :class="'umm-creation-badge--' + creation.badge.variant"
            >
              <span>{{ creation.badge.label }}</span>
              <span v-if="creation.recordRating" class="umm-creation-badge-rating">{{ creation.recordRating }}</span>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="d.totalPages > 1" class="umm-creations-paginator">
          <button
            v-if="d.hasPrev"
            class="umm-paginator-btn"
            @click="openUrl(d.prevUrl)"
          >&lt; 前页</button>
          <span class="umm-paginator-info">
            第 {{ d.currentPage }} / {{ d.totalPages }} 页
          </span>
          <button
            v-if="d.hasNext"
            class="umm-paginator-btn"
            @click="openUrl(d.nextUrl)"
          >后页 &gt;</button>
        </div>
      </template>
    </div>
  </UmmPageLayout>
</template>