<script setup lang="ts">
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import type { UserProfileData } from './types'

defineProps<{
  data: UserProfileData
}>()
</script>

<template>
  <UmmPageLayout type="movie">
    <div class="umm-user-profile-root">

      <!-- ===== Hero ===== -->
      <div class="umm-hero">
        <div
          v-if="data.avatarUrl"
          class="umm-hero-avatar"
          :style="{ backgroundImage: `url(${data.avatarUrl})` }"
        />
        <div class="umm-hero-body">
          <h1 class="umm-hero-name">{{ data.displayName }}</h1>
          <p v-if="data.signature" class="umm-hero-sig">{{ data.signature }}</p>
          <div v-if="data.location || data.joinDate" class="umm-hero-meta">
            <span v-if="data.location" class="umm-hero-tag">📍 {{ data.location }}</span>
            <span v-if="data.joinDate" class="umm-hero-tag">🗓️ {{ data.joinDate }}加入</span>
          </div>
        </div>
      </div>

      <!-- ===== Stat Bar ===== -->
      <div class="umm-statbar">
        <!-- Media (movie + TV) -->
        <div v-if="data.movieStats.watching > 0 || data.movieStats.wish > 0 || data.movieStats.collect > 0 || data.movieStats.doulist > 0" class="umm-statbar-group">
          <span class="umm-statbar-gtitle">🎬 影视</span>
          <div class="umm-statbar-items">
            <a v-if="data.movieStats.watching > 0" href="https://movie.douban.com/mine?status=do" class="umm-statbar-item" target="_blank">
              <span class="umm-statbar-val">{{ data.movieStats.watching.toLocaleString() }}</span>
              <span class="umm-statbar-lbl">在看</span>
            </a>
            <a v-if="data.movieStats.wish > 0" href="https://movie.douban.com/mine?status=wish" class="umm-statbar-item" target="_blank">
              <span class="umm-statbar-val">{{ data.movieStats.wish.toLocaleString() }}</span>
              <span class="umm-statbar-lbl">想看</span>
            </a>
            <a v-if="data.movieStats.collect > 0" href="https://movie.douban.com/mine?status=collect" class="umm-statbar-item" target="_blank">
              <span class="umm-statbar-val">{{ data.movieStats.collect.toLocaleString() }}</span>
              <span class="umm-statbar-lbl">看过</span>
            </a>
            <a v-if="data.movieStats.doulist > 0" href="https://www.douban.com/people/148839064/subject_doulists/movie" class="umm-statbar-item" target="_blank">
              <span class="umm-statbar-val">{{ data.movieStats.doulist.toLocaleString() }}</span>
              <span class="umm-statbar-lbl">片单</span>
            </a>
          </div>
        </div>
        <!-- Music -->
        <div v-if="data.musicStats.collect > 0" class="umm-statbar-group">
          <span class="umm-statbar-gtitle">🎵 音乐</span>
          <div class="umm-statbar-items">
            <a href="https://music.douban.com/mine?status=collect" class="umm-statbar-item" target="_blank">
              <span class="umm-statbar-val">{{ data.musicStats.collect.toLocaleString() }}</span>
              <span class="umm-statbar-lbl">听过</span>
            </a>
          </div>
        </div>
        <!-- Book -->
        <div v-if="data.bookStats.wish > 0 || data.bookStats.collect > 0 || data.bookStats.doulist > 0" class="umm-statbar-group">
          <span class="umm-statbar-gtitle">📚 读书</span>
          <div class="umm-statbar-items">
            <a v-if="data.bookStats.wish > 0" href="https://book.douban.com/mine?status=wish" class="umm-statbar-item" target="_blank">
              <span class="umm-statbar-val">{{ data.bookStats.wish.toLocaleString() }}</span>
              <span class="umm-statbar-lbl">想读</span>
            </a>
            <a v-if="data.bookStats.collect > 0" href="https://book.douban.com/mine?status=collect" class="umm-statbar-item" target="_blank">
              <span class="umm-statbar-val">{{ data.bookStats.collect.toLocaleString() }}</span>
              <span class="umm-statbar-lbl">读过</span>
            </a>
            <a v-if="data.bookStats.doulist > 0" href="https://www.douban.com/people/148839064/subject_doulists/book" class="umm-statbar-item" target="_blank">
              <span class="umm-statbar-val">{{ data.bookStats.doulist.toLocaleString() }}</span>
              <span class="umm-statbar-lbl">书单</span>
            </a>
          </div>
        </div>
        <!-- Game -->
        <div v-if="data.gameStats.playing > 0 || data.gameStats.played > 0" class="umm-statbar-group">
          <span class="umm-statbar-gtitle">🎮 游戏</span>
          <div class="umm-statbar-items">
            <a v-if="data.gameStats.playing > 0" href="https://www.douban.com/game/36188787/" class="umm-statbar-item" target="_blank">
              <span class="umm-statbar-val">{{ data.gameStats.playing.toLocaleString() }}</span>
              <span class="umm-statbar-lbl">在玩</span>
            </a>
            <a v-if="data.gameStats.played > 0" href="https://www.douban.com/people/148839064/games?action=collect" class="umm-statbar-item" target="_blank">
              <span class="umm-statbar-val">{{ data.gameStats.played.toLocaleString() }}</span>
              <span class="umm-statbar-lbl">玩过</span>
            </a>
          </div>
        </div>
      </div>

      <!-- ===== Sections (dashboard-style) ===== -->
      <div v-for="section in data.sections" :key="section.id" class="umm-dash-section">
        <h2 class="umm-dash-head">{{ section.title }}</h2>
        <div v-for="sub in section.subsections" :key="sub.label" class="umm-dash-row">
          <div class="umm-dash-row-head">
            <span class="umm-dash-row-lbl">{{ sub.label }}</span>
            <a
              v-if="section.statLinks[0]"
              :href="section.statLinks[0].url"
              class="umm-dash-more"
              target="_blank"
            >全部 →</a>
          </div>
          <div class="umm-dash-grid">
            <a
              v-for="item in sub.items"
              :key="item.url"
              :href="item.url"
              class="umm-dash-card"
              target="_blank"
            >
              <div
                class="umm-dash-card-cover"
                :style="{ backgroundImage: `url(${item.posterUrl})` }"
              />
              <span class="umm-dash-card-title">{{ item.title }}</span>
            </a>
          </div>
        </div>
      </div>

    </div>
  </UmmPageLayout>
</template>
