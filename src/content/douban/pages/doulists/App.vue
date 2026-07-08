<script setup lang="ts">
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { DoulistsPageData } from './types'

defineProps<{
  data: DoulistsPageData
}>()
</script>

<template>
  <UmmPageLayout type="movie">
    <div class="umm-doulists-root">
      <!-- User Bar -->
      <div v-if="data.displayName" class="umm-doulists-userbar">
        <div
          v-if="data.avatarUrl"
          class="umm-doulists-avatar"
          :style="{ backgroundImage: `url(${data.avatarUrl})` }"
        />
        <div class="umm-doulists-userinfo">
          <a :href="`/people/${data.userId}/`" class="umm-doulists-username" target="_blank">{{ data.displayName }}</a>
          <div v-if="data.navLinks.length > 0" class="umm-doulists-nav">
            <a
              v-for="link in data.navLinks"
              :key="link.url"
              :href="link.url"
              class="umm-doulists-navlink"
              target="_blank"
            >{{ link.label }}</a>
          </div>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div v-if="data.createdUrl || data.collectedUrl" class="umm-doulists-tabs">
        <a
          v-if="data.createdUrl"
          :href="data.createdUrl"
          :class="['umm-doulist-tab', data.activeTab === 'created' ? 'umm-doulist-tab--active' : '']"
        >
          我创建的豆列
          <span class="umm-doulist-count">{{ data.createdCount }}</span>
        </a>
        <a
          v-if="data.collectedUrl"
          :href="data.collectedUrl"
          :class="['umm-doulist-tab', data.activeTab === 'collected' ? 'umm-doulist-tab--active' : '']"
        >
          我关注的豆列
          <span class="umm-doulist-count">{{ data.collectedCount }}</span>
        </a>
      </div>
      <div v-else class="umm-doulists-tabs">
        <span class="umm-doulist-tab umm-doulist-tab--active">
          我创建的豆列
          <span class="umm-doulist-count">{{ data.createdCount }}</span>
        </span>
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
          <div v-if="item.coverUrl" class="umm-doulist-cover">
            <img :src="item.coverUrl" :alt="item.title" loading="lazy" />
          </div>
          <div class="umm-doulist-body">
            <h3 class="umm-doulist-title">{{ item.title }}</h3>
            <div class="umm-doulist-meta">
              <span>{{ item.itemCount }} 部</span>
              <span v-if="item.followerCount > 0"> · {{ item.followerCount }} 人关注</span>
            </div>
          </div>
        </a>
      </div>
      <div v-else class="umm-doulists-empty">暂无豆列</div>

      <!-- Paginator -->
      <div v-if="data.pageLinks.length > 0" class="umm-doulist-paginator">
        <a
          v-if="data.prevPageUrl"
          :href="data.prevPageUrl"
          class="umm-doulist-page"
        >‹</a>
        <a
          v-for="pl in data.pageLinks"
          :key="pl.label"
          :href="pl.url || undefined"
          :class="['umm-doulist-page', pl.current ? 'umm-doulist-page--active' : '']"
        >{{ pl.label }}</a>
        <a
          v-if="data.nextPageUrl"
          :href="data.nextPageUrl"
          class="umm-doulist-page"
        >›</a>
      </div>
    </div>
  </UmmPageLayout>
</template>
