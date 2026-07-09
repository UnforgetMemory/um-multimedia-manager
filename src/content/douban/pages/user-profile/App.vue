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
            <a v-if="data.movieStats.doulist > 0" :href="`https://www.douban.com/people/${data.userId}/subject_doulists/movie`" class="umm-statbar-item" target="_blank">
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
            <a v-if="data.bookStats.doulist > 0" :href="`https://www.douban.com/people/${data.userId}/subject_doulists/book`" class="umm-statbar-item" target="_blank">
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
            <a v-if="data.gameStats.played > 0" :href="`https://www.douban.com/people/${data.userId}/games?action=collect`" class="umm-statbar-item" target="_blank">
              <span class="umm-statbar-val">{{ data.gameStats.played.toLocaleString() }}</span>
              <span class="umm-statbar-lbl">玩过</span>
            </a>
          </div>
        </div>
        <!-- Reviews & Follow -->
        <div v-if="data.reviewCount > 0 || data.followerCount > 0" class="umm-statbar-group">
          <span class="umm-statbar-gtitle">📊 社交</span>
          <div class="umm-statbar-items">
            <a v-if="data.reviewCount > 0" :href="`https://www.douban.com/people/${data.userId}/reviews`" class="umm-statbar-item" target="_blank">
              <span class="umm-statbar-val">{{ data.reviewCount.toLocaleString() }}</span>
              <span class="umm-statbar-lbl">评论</span>
            </a>
            <a v-if="data.followerCount > 0" :href="`https://www.douban.com/people/${data.userId}/contacts`" class="umm-statbar-item" target="_blank">
              <span class="umm-statbar-val">{{ data.followerCount.toLocaleString() }}</span>
              <span class="umm-statbar-lbl">被关注</span>
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

      <!-- ===== Doulists ===== -->
      <div v-if="data.doulistSection" class="umm-dash-section">
        <h2 class="umm-dash-head">
          📋 豆列
          <a v-if="data.doulistSection.totalUrl" :href="data.doulistSection.totalUrl" class="umm-dash-head-link" target="_blank">全部{{ data.doulistSection.totalCount }}</a>
        </h2>
        <div class="umm-doulist-grid">
          <a
            v-for="item in data.doulistSection.items.slice(0, 10)"
            :key="item.url"
            :href="item.url"
            class="umm-doulist-item"
            target="_blank"
          >
            <span class="umm-doulist-item-title">{{ item.title }}</span>
            <span class="umm-doulist-item-count">{{ item.itemCount }}</span>
          </a>
          <a
            v-if="data.doulistSection.items.length > 10"
            :href="data.doulistSection.totalUrl"
            class="umm-doulist-item umm-doulist-item--more"
            target="_blank"
          >更多…</a>
        </div>
      </div>

      <!-- ===== Reviews ===== -->
      <div v-if="data.reviews.length > 0" class="umm-dash-section">
        <h2 class="umm-dash-head">📝 评论</h2>
        <div class="umm-reviews-list">
          <article v-for="rev in data.reviews" :key="rev.id" class="umm-review-card">
            <div v-if="rev.posterUrl" class="umm-review-poster">
              <a :href="rev.subjectUrl" target="_blank">
                <img :src="rev.posterUrl" :alt="rev.subjectTitle" loading="lazy" />
              </a>
            </div>
            <div class="umm-review-body">
              <a :href="rev.url" class="umm-review-title" target="_blank">{{ rev.title }}</a>
              <div class="umm-review-meta">
                <a :href="rev.subjectUrl" target="_blank" class="umm-review-subject">{{ rev.subjectTitle }}</a>
                <span v-if="rev.rating > 0" class="umm-review-stars">{{ '★'.repeat(Math.floor(rev.rating)) }}{{ rev.rating % 1 >= 0.5 ? '½' : '' }}</span>
              </div>
              <p class="umm-review-excerpt">{{ rev.excerpt.slice(0, 200) }}{{ rev.excerpt.length > 200 ? '...' : '' }}</p>
            </div>
          </article>
        </div>
      </div>

      <!-- ===== Statuses ===== -->
      <div v-if="data.statuses.length > 0" class="umm-dash-section">
        <h2 class="umm-dash-head">📡 广播</h2>
        <div class="umm-statuses-list">
          <div v-for="st in data.statuses" :key="st.id" class="umm-status-item">
            <div class="umm-status-head">
              <span class="umm-status-action">{{ st.action }}</span>
              <a :href="st.targetUrl" class="umm-status-target" target="_blank">{{ st.targetTitle }}</a>
              <span v-if="parseInt(st.rating) > 0" class="umm-status-stars">{{ '★'.repeat(Math.floor(parseInt(st.rating))) }}{{ parseInt(st.rating) % 1 >= 0.5 ? '½' : '' }}</span>
            </div>
            <p v-if="st.content" class="umm-status-content">{{ st.content }}</p>
            <div class="umm-status-footer">
              <a :href="st.timeUrl" class="umm-status-time" target="_blank">{{ st.time }}</a>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Following ===== -->
      <div v-if="data.friendSection && data.friendSection.items.length > 0" class="umm-dash-section">
        <h2 class="umm-dash-head">
          👥 关注
          <a v-if="data.friendSection.totalUrl" :href="data.friendSection.totalUrl" class="umm-dash-head-link" target="_blank">成员{{ data.friendSection.totalCount }}</a>
        </h2>
        <div class="umm-friend-grid">
          <a
            v-for="person in data.friendSection.items.slice(0, 12)"
            :key="person.url"
            :href="person.url"
            class="umm-friend-card"
            target="_blank"
          >
            <div
              class="umm-friend-avatar"
              :style="{ backgroundImage: `url(${person.avatarUrl})` }"
            />
            <span class="umm-friend-name">{{ person.name }}</span>
          </a>
        </div>
      </div>

    </div>
  </UmmPageLayout>
</template>
