<script setup lang="ts">
import { openExternalUrl } from '@/libraries/utils/safe-url';
import type { StoreRecord } from '@/types';
import { ref, computed } from 'vue';
import { UmmPageLayout } from '@/scenario/douban/components/umm-page-layout';
import { t } from '../../shared/legacy-bridge';
import { UmmMediaCard } from '@/scenario/douban/components/umm-media-card';
import { useRecordCache } from '../../shared/composables/use-record-cache';
import { subjectIdFromUrl } from '../../shared/subject-keys';
import type { PersonagePageData, WorkItem } from './personage-data';

const props = defineProps<{
  data: PersonagePageData;
  recordMap?: Map<string, StoreRecord>;
}>();
const d = props.data;

const bioExpanded = ref(false);
const showAllAwards = ref(false);

const displayAwards = computed(() => (showAllAwards.value ? d.awards : d.awards.slice(0, 5)));

const hasMoreAwards = computed(() => d.awards.length > 5);

// Seeded from the mount-time batch read, then live-refreshed by record events.
const { records } = useRecordCache(
  'movie',
  () =>
    [...d.recentWorks, ...d.popularWorks]
      .map((work) => subjectIdFromUrl(work.url))
      .filter((id): id is string => Boolean(id)),
  props.recordMap ?? new Map<string, StoreRecord>(),
);

interface WorkWithBadge extends WorkItem {
  badgeStatus: number;
  badgeRating: number;
}

/** Badges are derived, never written back into the extracted data. */
function withBadges(works: WorkItem[]): WorkWithBadge[] {
  return works.map((work) => {
    const rec = records.value.get(subjectIdFromUrl(work.url) ?? '');
    return { ...work, badgeStatus: rec?.status ?? 0, badgeRating: rec?.rating ?? 0 };
  });
}

const recentWorks = computed(() => withBadges(d.recentWorks));
const popularWorks = computed(() => withBadges(d.popularWorks));

function toggleBio(): void {
  bioExpanded.value = !bioExpanded.value;
}

function toggleAwards(): void {
  showAllAwards.value = !showAllAwards.value;
}

function openUrl(url: string): void {
  if (url) openExternalUrl(url);
}
</script>

<template vapor>
  <UmmPageLayout type="movie">
    <div class="umm-personage-root">
      <!-- Empty state -->
      <div v-if="!d.name" class="umm-personage-empty">{{ t('douban.pg.empty') }}</div>
      <template v-else>
        <!-- Profile header -->
        <div class="umm-profile-header">
          <div class="umm-profile-avatar" :style="{ backgroundImage: `url(${d.avatar})` }" />
          <div class="umm-profile-info">
            <h1 class="umm-profile-name">{{ d.name }}</h1>
            <ul v-if="d.properties.length" class="umm-profile-props">
              <li v-for="prop in d.properties" :key="prop.label" class="umm-profile-prop">
                <span class="umm-profile-prop-label">{{ prop.label }}:</span>
                {{ prop.value }}
              </li>
            </ul>
          </div>
        </div>

        <!-- Biography -->
        <div v-if="d.biography" class="umm-section">
          <h2 class="umm-section-title">{{ t('douban.pg.bio') }}</h2>
          <p class="umm-bio-text" :class="{ 'umm-bio-text--expanded': bioExpanded }">
            {{ d.biography }}
          </p>
          <button v-if="d.biography.length > 120" class="umm-bio-expand" @click="toggleBio">
            {{ bioExpanded ? t('Collapse') : t('Expand') }}
          </button>
        </div>

        <!-- Photos -->
        <div v-if="d.photos.length" class="umm-section">
          <h2 class="umm-section-title">{{ t('douban.image_word') }}</h2>
          <div class="umm-photo-strip">
            <div
              v-for="(photo, i) in d.photos"
              :key="i"
              class="umm-photo-thumb"
              :style="{ backgroundImage: `url(${photo})` }"
              @click="openUrl(photo)"
            />
          </div>
        </div>

        <!-- Awards -->
        <div v-if="d.awards.length" class="umm-section">
          <h2 class="umm-section-title">
            {{ t('douban.detail.awards') }}
            <span class="umm-photos-count">{{
              t('douban.pg.awards_count', { count: d.awards.length })
            }}</span>
          </h2>
          <ul class="umm-awards-list">
            <li v-for="(award, i) in displayAwards" :key="i" class="umm-award-item">
              <span class="umm-award-year">{{ award.year }}</span>
              <a
                :href="award.awardUrl"
                class="umm-award-name"
                @click.prevent="openUrl(award.awardUrl)"
                >{{ award.awardName }}</a
              >
              <span class="umm-award-status">{{ award.status }}</span>
              <a
                v-if="award.workName"
                :href="award.workUrl"
                class="umm-award-work"
                @click.prevent="openUrl(award.workUrl)"
                >{{ award.workName }}</a
              >
            </li>
          </ul>
          <button v-if="hasMoreAwards" class="umm-bio-expand" @click="toggleAwards">
            {{ showAllAwards ? t('Collapse') : t('View All Awards', { count: d.awards.length }) }}
          </button>
        </div>

        <!-- Recent works -->
        <div v-if="recentWorks.length" class="umm-section">
          <h2 class="umm-section-title">
            {{ t('douban.pg.recent_works', { count: recentWorks.length }) }}
          </h2>
          <div class="umm-works-grid">
            <UmmMediaCard
              v-for="(work, i) in recentWorks"
              :key="i"
              mode="grid"
              :poster-url="work.poster"
              :title="work.title"
              :href="work.url"
              :rating="work.rating"
              :badge-status="work.badgeStatus"
              :badge-rating="work.badgeRating"
            />
          </div>
        </div>

        <!-- Popular works -->
        <div v-if="popularWorks.length" class="umm-section">
          <h2 class="umm-section-title">
            {{ t('douban.pg.popular_works', { count: popularWorks.length }) }}
          </h2>
          <div class="umm-works-grid">
            <UmmMediaCard
              v-for="(work, i) in popularWorks"
              :key="i"
              mode="grid"
              :poster-url="work.poster"
              :title="work.title"
              :href="work.url"
              :rating="work.rating"
              :badge-status="work.badgeStatus"
              :badge-rating="work.badgeRating"
            />
          </div>
          <button
            v-if="d.morePopularUrl"
            class="umm-personage-btn"
            @click="openUrl(d.morePopularUrl)"
          >
            {{ t('douban.pg.more_works')
            }}{{ d.morePopularCount ? ' ' + d.morePopularCount : '' }} →
          </button>
        </div>

        <!-- Unreleased works -->
        <div v-if="d.unreleasedWorks.length" class="umm-section">
          <h2 class="umm-section-title">{{ t('douban.pg.upcoming') }}</h2>
          <div class="umm-unreleased-grid">
            <a
              v-for="(work, i) in d.unreleasedWorks"
              :key="i"
              :href="work.url"
              class="umm-unreleased-item"
              @click.prevent="openUrl(work.url)"
            >
              <span class="umm-unreleased-title">{{ work.title }}</span>
              <span v-if="work.year" class="umm-unreleased-year">{{ work.year }}</span>
            </a>
          </div>
          <button v-if="d.moreWorksUrl" class="umm-personage-btn" @click="openUrl(d.moreWorksUrl)">
            {{ t('douban.pg.more_works') }}{{ d.moreWorksCount ? ' ' + d.moreWorksCount : '' }} →
          </button>
        </div>

        <!-- Partners -->
        <div v-if="d.partners.length" class="umm-section">
          <h2 class="umm-section-title">
            {{ t('douban.pg.partners', { count: d.partners.length }) }}
          </h2>
          <div class="umm-partners-grid">
            <a
              v-for="(partner, i) in d.partners"
              :key="i"
              :href="partner.url"
              class="umm-partner-card"
              @click.prevent="openUrl(partner.url)"
            >
              <div
                class="umm-partner-cover"
                :style="{ backgroundImage: `url(${partner.avatar})` }"
              />
              <div class="umm-partner-body">
                <div class="umm-partner-name">{{ partner.name }}</div>
                <div class="umm-partner-count">
                  {{ t('douban.pg.partner_works', { count: partner.workCount }) }}
                </div>
              </div>
            </a>
          </div>
        </div>
      </template>
    </div>
  </UmmPageLayout>
</template>
