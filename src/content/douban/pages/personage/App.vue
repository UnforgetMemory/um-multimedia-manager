<script setup lang="ts">
import { ref, computed } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmMediaCard } from '@/content/douban/components/UmmMediaCard'
import type { PersonagePageData } from './personage-data'

const props = defineProps<{ data: PersonagePageData }>()
const d = props.data

const bioExpanded = ref(false)
const showAllAwards = ref(false)

const displayAwards = computed(() =>
  showAllAwards.value ? d.awards : d.awards.slice(0, 5),
)

const hasMoreAwards = computed(() => d.awards.length > 5)

function toggleBio(): void {
  bioExpanded.value = !bioExpanded.value
}

function toggleAwards(): void {
  showAllAwards.value = !showAllAwards.value
}

function openUrl(url: string): void {
  if (url) window.open(url, '_blank')
}
</script>

<template>
  <UmmPageLayout type="movie">
    <div class="umm-personage-root">
      <!-- Empty state -->
      <div v-if="!d.name" class="umm-personage-empty">
        未找到影人信息
      </div>
      <template v-else>
        <!-- Profile header -->
        <div class="umm-profile-header">
          <div
            class="umm-profile-avatar"
            :style="{ backgroundImage: `url(${d.avatar})` }"
          />
          <div class="umm-profile-info">
            <h1 class="umm-profile-name">{{ d.name }}</h1>
            <ul v-if="d.properties.length" class="umm-profile-props">
              <li
                v-for="prop in d.properties"
                :key="prop.label"
                class="umm-profile-prop"
              >
                <span class="umm-profile-prop-label">{{ prop.label }}:</span>
                {{ prop.value }}
              </li>
            </ul>
          </div>
        </div>

        <!-- Biography -->
        <div v-if="d.biography" class="umm-section">
          <h2 class="umm-section-title">人物简介</h2>
          <p
            class="umm-bio-text"
            :class="{ 'umm-bio-text--expanded': bioExpanded }"
          >{{ d.biography }}</p>
          <button
            v-if="d.biography.length > 120"
            class="umm-bio-expand"
            @click="toggleBio"
          >{{ bioExpanded ? '(收起)' : '(展开)' }}</button>
        </div>

        <!-- Photos -->
        <div v-if="d.photos.length" class="umm-section">
          <h2 class="umm-section-title">图片</h2>
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
            获奖情况
            <span class="umm-photos-count">（共 {{ d.awards.length }} 项）</span>
          </h2>
          <ul class="umm-awards-list">
            <li
              v-for="(award, i) in displayAwards"
              :key="i"
              class="umm-award-item"
            >
              <span class="umm-award-year">{{ award.year }}</span>
              <a
                :href="award.awardUrl"
                class="umm-award-name"
                @click.prevent="openUrl(award.awardUrl)"
              >{{ award.awardName }}</a>
              <span class="umm-award-status">{{ award.status }}</span>
              <a
                v-if="award.workName"
                :href="award.workUrl"
                class="umm-award-work"
                @click.prevent="openUrl(award.workUrl)"
              >{{ award.workName }}</a>
            </li>
          </ul>
          <button
            v-if="hasMoreAwards"
            class="umm-bio-expand"
            @click="toggleAwards"
          >{{ showAllAwards ? '(收起)' : `(查看全部 ${d.awards.length} 项)` }}</button>
        </div>

        <!-- Recent works -->
        <div v-if="d.recentWorks.length" class="umm-section">
          <h2 class="umm-section-title">最近的 {{ d.recentWorks.length }} 部作品</h2>
          <div class="umm-works-grid">
            <UmmMediaCard
              v-for="(work, i) in d.recentWorks"
              :key="i"
              mode="grid"
              :poster-url="work.poster"
              :title="work.title"
              :href="work.url"
              :rating="work.rating"
            />
          </div>
        </div>

        <!-- Popular works -->
        <div v-if="d.popularWorks.length" class="umm-section">
          <h2 class="umm-section-title">收藏人数最多的 {{ d.popularWorks.length }} 部作品</h2>
          <div class="umm-works-grid">
            <UmmMediaCard
              v-for="(work, i) in d.popularWorks"
              :key="i"
              mode="grid"
              :poster-url="work.poster"
              :title="work.title"
              :href="work.url"
              :rating="work.rating"
            />
          </div>
          <button
            v-if="d.moreWorksUrl"
            class="umm-personage-btn"
            @click="openUrl(d.moreWorksUrl)"
          >更多影视作品{{ d.moreWorksCount ? ' ' + d.moreWorksCount : '' }} →</button>
        </div>

        <!-- Unreleased works -->
        <div v-if="d.unreleasedWorks.length" class="umm-section">
          <h2 class="umm-section-title">未上映作品</h2>
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
          <button
            v-if="d.moreWorksUrl"
            class="umm-personage-btn"
            @click="openUrl(d.moreWorksUrl)"
          >更多影视作品{{ d.moreWorksCount ? ' ' + d.moreWorksCount : '' }} →</button>
        </div>

        <!-- Partners -->
        <div v-if="d.partners.length" class="umm-section">
          <h2 class="umm-section-title">合作过的人物（{{ d.partners.length }} 人）</h2>
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
                <div class="umm-partner-count">合作 {{ partner.workCount }} 部</div>
              </div>
            </a>
          </div>
        </div>
      </template>
    </div>
  </UmmPageLayout>
</template>