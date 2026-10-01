<script setup lang="ts">
import { UmmPageLayout } from '@/scenario/douban/components/umm-page-layout';
import UmmStatBar from '@/scenario/douban/components/UmmStatBar.vue';
import { t } from '../../shared/legacy-bridge';
import type { UserProfileData } from './types';

defineProps<{
  data: UserProfileData;
}>();
</script>

<template vapor>
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
          <h1 class="umm-hero-name">
            {{ data.displayName || t('douban.user_fallback', { id: data.userId }) }}
          </h1>
          <p v-if="data.signature" class="umm-hero-sig">{{ data.signature }}</p>
          <div v-if="data.location || data.joinDate" class="umm-hero-meta">
            <span v-if="data.location" class="umm-hero-tag">📍 {{ data.location }}</span>
            <span v-if="data.joinDate" class="umm-hero-tag"
              >🗓️ {{ t('douban.up.joined', { date: data.joinDate }) }}</span
            >
          </div>
        </div>
      </div>

      <!-- ===== Stat Bars ===== -->
      <div class="umm-statbars">
        <UmmStatBar
          v-if="
            data.movieStats.watching > 0 ||
            data.movieStats.wish > 0 ||
            data.movieStats.collect > 0 ||
            data.movieStats.doulist > 0
          "
          :title="t('douban.stat.title_movie')"
          :items="[
            ...(data.movieStats.watching > 0
              ? [
                  {
                    label: t('douban.stat.movie_doing'),
                    value: data.movieStats.watching,
                    url: 'https://movie.douban.com/mine?status=do',
                  },
                ]
              : []),
            ...(data.movieStats.wish > 0
              ? [
                  {
                    label: t('douban.stat.movie_wish'),
                    value: data.movieStats.wish,
                    url: 'https://movie.douban.com/mine?status=wish',
                  },
                ]
              : []),
            ...(data.movieStats.collect > 0
              ? [
                  {
                    label: t('douban.stat.movie_done'),
                    value: data.movieStats.collect,
                    url: 'https://movie.douban.com/mine?status=collect',
                  },
                ]
              : []),
            ...(data.movieStats.doulist > 0
              ? [
                  {
                    label: t('douban.stat.movie_list'),
                    value: data.movieStats.doulist,
                    url: `https://www.douban.com/people/${data.userId}/subject_doulists/movie`,
                  },
                ]
              : []),
          ]"
        />

        <UmmStatBar
          v-if="data.musicStats.collect > 0"
          :title="t('douban.stat.title_music')"
          :items="[
            {
              label: t('douban.stat.music_done'),
              value: data.musicStats.collect,
              url: 'https://music.douban.com/mine?status=collect',
            },
          ]"
        />

        <UmmStatBar
          v-if="data.bookStats.wish > 0 || data.bookStats.collect > 0 || data.bookStats.doulist > 0"
          :title="t('douban.stat.title_book')"
          :items="[
            ...(data.bookStats.wish > 0
              ? [
                  {
                    label: t('douban.stat.book_wish'),
                    value: data.bookStats.wish,
                    url: 'https://book.douban.com/mine?status=wish',
                  },
                ]
              : []),
            ...(data.bookStats.collect > 0
              ? [
                  {
                    label: t('douban.stat.book_done'),
                    value: data.bookStats.collect,
                    url: 'https://book.douban.com/mine?status=collect',
                  },
                ]
              : []),
            ...(data.bookStats.doulist > 0
              ? [
                  {
                    label: t('douban.stat.book_list'),
                    value: data.bookStats.doulist,
                    url: `https://www.douban.com/people/${data.userId}/subject_doulists/book`,
                  },
                ]
              : []),
          ]"
        />

        <UmmStatBar
          v-if="data.gameStats.playing > 0 || data.gameStats.played > 0"
          :title="t('douban.stat.title_game')"
          :items="[
            ...(data.gameStats.playing > 0
              ? [
                  {
                    label: t('douban.stat.game_doing'),
                    value: data.gameStats.playing,
                    url: 'https://www.douban.com/game/36188787/',
                  },
                ]
              : []),
            ...(data.gameStats.played > 0
              ? [
                  {
                    label: t('douban.stat.game_done'),
                    value: data.gameStats.played,
                    url: `https://www.douban.com/people/${data.userId}/games?action=collect`,
                  },
                ]
              : []),
          ]"
        />

        <UmmStatBar
          v-if="data.reviewCount > 0 || data.followerCount > 0"
          :title="t('douban.stat.title_social')"
          :items="[
            ...(data.reviewCount > 0
              ? [
                  {
                    label: t('douban.stat.social_reviews'),
                    value: data.reviewCount,
                    url: `https://www.douban.com/people/${data.userId}/reviews`,
                  },
                ]
              : []),
            ...(data.followerCount > 0
              ? [
                  {
                    label: t('douban.stat.social_followers'),
                    value: data.followerCount,
                    url: `https://www.douban.com/people/${data.userId}/contacts`,
                  },
                ]
              : []),
          ]"
        />
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
          {{ t('douban.up.doulists') }}
          <a
            v-if="data.doulistSection.totalUrl"
            :href="data.doulistSection.totalUrl"
            class="umm-dash-head-link"
            target="_blank"
            >{{ t('douban.list.all_count', { count: data.doulistSection.totalCount }) }}</a
          >
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
            >{{ t('douban.up.more') }}</a
          >
        </div>
      </div>

      <!-- ===== Reviews ===== -->
      <div v-if="data.reviews.length > 0" class="umm-dash-section">
        <h2 class="umm-dash-head">{{ t('douban.up.reviews_head') }}</h2>
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
                <a :href="rev.subjectUrl" target="_blank" class="umm-review-subject">{{
                  rev.subjectTitle
                }}</a>
                <span v-if="rev.rating > 0" class="umm-review-stars"
                  >{{ '★'.repeat(Math.floor(rev.rating))
                  }}{{ rev.rating % 1 >= 0.5 ? '½' : '' }}</span
                >
              </div>
              <p class="umm-review-excerpt">
                {{ rev.excerpt.slice(0, 200) }}{{ rev.excerpt.length > 200 ? '...' : '' }}
              </p>
            </div>
          </article>
        </div>
      </div>

      <!-- ===== Statuses ===== -->
      <div v-if="data.statuses.length > 0" class="umm-dash-section">
        <h2 class="umm-dash-head">{{ t('douban.up.statuses') }}</h2>
        <div class="umm-statuses-list">
          <div v-for="st in data.statuses" :key="st.id" class="umm-status-item">
            <div class="umm-status-head">
              <span class="umm-status-action">{{ st.action }}</span>
              <a :href="st.targetUrl" class="umm-status-target" target="_blank">{{
                st.targetTitle
              }}</a>
              <span v-if="parseInt(st.rating) > 0" class="umm-status-stars"
                >{{ '★'.repeat(Math.floor(parseInt(st.rating)))
                }}{{ parseInt(st.rating) % 1 >= 0.5 ? '½' : '' }}</span
              >
            </div>
            <p v-if="st.content" class="umm-status-content">{{ st.content }}</p>
            <div class="umm-status-footer">
              <a :href="st.timeUrl" class="umm-status-time" target="_blank">{{ st.time }}</a>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Following ===== -->
      <div
        v-if="data.friendSection && data.friendSection.items.length > 0"
        class="umm-dash-section"
      >
        <h2 class="umm-dash-head">
          {{ t('douban.up.following') }}
          <a
            v-if="data.friendSection.totalUrl"
            :href="data.friendSection.totalUrl"
            class="umm-dash-head-link"
            target="_blank"
            >{{ t('douban.up.members_count', { count: data.friendSection.totalCount }) }}</a
          >
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
