<script setup lang="ts">
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { UserCelebritiesData } from './types'

defineProps<{
  data: UserCelebritiesData
}>()
</script>

<template>
  <UmmPageLayout type="movie">
    <div class="umm-celebrities-root">
      <!-- User Bar -->
      <div v-if="data.displayName" class="umm-celebrities-userbar">
        <div
          v-if="data.avatarUrl"
          class="umm-celebrities-avatar"
          :style="{ backgroundImage: `url(${data.avatarUrl})` }"
        />
        <div class="umm-celebrities-userinfo">
          <a :href="`/people/${data.userId}/`" class="umm-celebrities-username" target="_blank">{{ data.displayName }}</a>
          <div v-if="data.navLinks.length > 0" class="umm-celebrities-nav">
            <a
              v-for="link in data.navLinks"
              :key="link.url"
              :href="link.url"
              class="umm-celebrities-navlink"
              target="_blank"
            >{{ link.label }}</a>
          </div>
        </div>
      </div>

      <!-- Title -->
      <div class="umm-celebrities-titlebar">
        <h1 class="umm-celebrities-title">收藏的影人</h1>
        <span class="umm-celebrities-count">共 {{ data.total.toLocaleString() }} 位</span>
      </div>

      <!-- Grid -->
      <div v-if="data.items.length > 0" class="umm-celebrities-grid">
        <a
          v-for="item in data.items"
          :key="item.url"
          :href="item.url"
          class="umm-celebrities-card"
          target="_blank"
        >
          <div
            class="umm-celebrities-photo"
            :style="{ backgroundImage: `url(${item.photoUrl})` }"
          />
          <div class="umm-celebrities-body">
            <span class="umm-celebrities-name">{{ item.name }}</span>
            <span v-if="item.roles" class="umm-celebrities-roles">{{ item.roles }}</span>
            <div v-if="item.works.length > 0" class="umm-celebrities-works">
              <span
                v-for="(w, i) in item.works.slice(0, 3)"
                :key="w.url"
              >{{ w.title }}{{ i < Math.min(item.works.length, 3) - 1 ? ' / ' : '' }}</span>
            </div>
          </div>
        </a>
      </div>
      <div v-else class="umm-empty">暂无内容</div>

      <!-- Paginator -->
      <div v-if="data.pageLinks.length > 0" class="umm-celebrities-paginator">
        <a
          v-if="data.prevPageUrl"
          :href="data.prevPageUrl"
          class="umm-celebrities-page"
        >‹</a>
        <a
          v-for="pl in data.pageLinks"
          :key="pl.label"
          :href="pl.url || undefined"
          :class="['umm-celebrities-page', pl.current ? 'umm-celebrities-page--active' : '']"
        >{{ pl.label }}</a>
        <a
          v-if="data.nextPageUrl"
          :href="data.nextPageUrl"
          class="umm-celebrities-page"
        >›</a>
      </div>
    </div>
  </UmmPageLayout>
</template>
