<script setup lang="ts">
import { computed } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { DoulistsPageData } from './types'
import { CATEGORY_LABELS } from './types'
import UmmPaginator from '@/content/douban/components/UmmPaginator.vue'
import UmmUserBar from '@/content/douban/components/UmmUserBar.vue'

const props = defineProps<{
  data: DoulistsPageData
}>()

/** Derive current page number from pageLinks */
const currentPage = computed(() => {
  const current = props.data.pageLinks.find(p => p.current)
  if (!current) return 1
  const n = parseInt(current.label, 10)
  return isNaN(n) ? 1 : n
})

/** Derive total pages from last page link label */
const totalPages = computed(() => {
  const links = props.data.pageLinks
  if (links.length === 0) return 1
  const last = links[links.length - 1].label
  const n = parseInt(last, 10)
  return isNaN(n) ? 1 : n
})

/** Navigate to the URL for the requested page */
function onPageChange(page: number): void {
  const link = props.data.pageLinks.find(p => p.label === String(page))
  if (link?.url) {
    window.location.href = link.url
    return
  }
  if (page < currentPage.value && props.data.prevPageUrl) {
    window.location.href = props.data.prevPageUrl
  } else if (page > currentPage.value && props.data.nextPageUrl) {
    window.location.href = props.data.nextPageUrl
  }
}
</script>

<template>
  <UmmPageLayout type="movie">
    <div class="umm-doulists-root">
      <UmmUserBar
        :avatar-url="data.avatarUrl"
        :display-name="data.displayName"
        :user-id="data.userId"
        :nav-links="data.navLinks"
      />

      <!-- Xbar Category Tabs -->
      <div v-if="data.xbarCategories.length > 0" class="umm-doulist-xbar">
        <a
          v-for="cat in data.xbarCategories"
          :key="cat.label"
          :href="cat.url"
          :class="['umm-doulist-xbar-tab', cat.current ? 'umm-doulist-xbar-tab--active' : '']"
          target="_blank"
        >
          {{ cat.label }}
          <span class="umm-doulist-count">{{ cat.count }}</span>
        </a>
      </div>

      <!-- Tab Navigation -->
      <div class="umm-doulists-tabs">
        <template v-if="data.collectedUrl">
          <a
            :href="data.createdUrl || '#'"
            :class="['umm-doulist-tab', data.activeTab === 'created' ? 'umm-doulist-tab--active' : '']"
          >
            创建的
            <span class="umm-doulist-count">{{ data.createdCount }}</span>
          </a>
          <a
            :href="data.collectedUrl"
            :class="['umm-doulist-tab', data.activeTab === 'collected' ? 'umm-doulist-tab--active' : '']"
          >
            关注的
            <span class="umm-doulist-count">{{ data.collectedCount }}</span>
          </a>
        </template>
        <template v-else>
          <span class="umm-doulist-tab umm-doulist-tab--active">
            我创建的豆列
            <span class="umm-doulist-count">{{ data.createdCount }}</span>
          </span>
        </template>
      </div>

      <!-- List -->
      <div v-if="data.items.length > 0" class="umm-doulist-grid">
        <a
          v-for="item in data.items"
          :key="item.id"
          :href="item.url"
          class="umm-doulist-card"
          target="_blank"
        >
          <!-- Layer 1: Title -->
          <h3 class="umm-doulist-title">{{ item.title }}</h3>
          <!-- Layer 2: Cover hero -->
          <div class="umm-doulist-cover-wrap">
            <div v-if="item.coverUrl" class="umm-doulist-cover">
              <img :src="item.coverUrl" :alt="item.title" loading="lazy" />
            </div>
            <div v-else class="umm-doulist-cover umm-doulist-cover--empty">
              <span class="umm-doulist-cover-icon">📋</span>
            </div>
            <span
              v-if="item.category !== 'other'"
              class="umm-doulist-cat-badge"
              :class="`umm-doulist-cat--${item.category}`"
            >{{ CATEGORY_LABELS[item.category] }}</span>
          </div>
          <!-- Layer 3: Body -->
          <div class="umm-doulist-body">
            <!-- Stats: watched + total -->
            <div class="umm-doulist-stats">
              <span class="umm-doulist-stat-item">已看 {{ item.watchedCount }}</span>
              <span class="umm-doulist-stat-divider" />
              <span class="umm-doulist-stat-item">{{ item.itemCount }} 项</span>
            </div>
            <!-- Description -->
            <p v-if="item.intro" class="umm-doulist-intro">{{ item.intro }}</p>
            <!-- Footer: time + followers -->
            <div class="umm-doulist-footer">
              <span v-if="item.updateTime" class="umm-doulist-time">{{ item.updateTime }}</span>
              <span class="umm-doulist-footer-space" />
              <span v-if="item.followerCount > 0" class="umm-doulist-followers">{{ item.followerCount }} 关注</span>
            </div>
          </div>
        </a>
      </div>
      <div v-else class="umm-doulists-empty">暂无豆列</div>

      <!-- Paginator -->
      <UmmPaginator
        :current-page="currentPage"
        :total-pages="totalPages"
        @page-change="onPageChange"
      />
    </div>
  </UmmPageLayout>
</template>
