<script setup lang="ts">
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { DoulistsPageData } from './types'
import { CATEGORY_LABELS } from './types'

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
