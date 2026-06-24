<script setup lang="ts">
import { ref, computed } from 'vue'
import { normalizeSearchQuery } from '@/utils/search-normalizer'
import { Utils } from '@/utils'

interface RatingBar {
  label: string
  pct: string
}

interface MetaRow {
  label: string
  html: string
}

interface DetailData {
  identity: { type: string; providerId: string }
  title: string
  originalTitle: string
  year: string
  posterSrc: string
  posterAlt: string
  posterLink: string
  ratingNum: string
  ratingPeople: string
  bigstarNum: string
  ratingBars: RatingBar[]
  betterThan: string[]
  metaRows: MetaRow[]
  synopsisHeading: string
  synopsisHtml: string
  celebHeading: string
  celebItems: { name: string; role: string; avatar: string; link: string }[]
  awardItems: { festival: string; category: string; nominee: string; nomineeLink: string; isNomination: boolean }[]
  photoItems: { src: string; link: string; isVideo: boolean }[]
  recItems: { title: string; poster: string; rating: string; link: string; subjectId: string; isDone: boolean }[]
  rankNo: string
  rankText: string
  rankHref: string
  isMusic: boolean
  record: { status: number; rating: number } | null
}

const props = defineProps<{ detailData: DetailData }>()
const d = props.detailData

const sortedAwards = computed(() => {
  return [...d.awardItems].sort((a, b) => {
    if (a.isNomination === b.isNomination) return 0
    return a.isNomination ? 1 : -1
  })
})

const currentType = ref<'movie' | 'music'>(d.isMusic ? 'music' : 'movie')
const searchQuery = ref('')
const isSearching = ref(false)
const record = ref(d.record)

function updateRecord(newRecord: { status: number; rating: number } | null) {
  record.value = newRecord
}

const statusLabel = computed(() => {
  if (record.value?.status === 2) return '已看过'
  return '未标记'
})

const statusRating = computed(() => {
  if (record.value?.rating && record.value.rating > 0) {
    return `${Utils.formatRating10(record.value.rating)}/10`
  }
  return ''
})

const starClass = computed(() => d.bigstarNum ? `bigstar bigstar${d.bigstarNum}` : '')

const PLACEHOLDERS: Record<'movie' | 'music', string> = {
  movie: '搜索电影、电视剧、影人',
  music: '搜索音乐、歌手、专辑',
}

const CATS: Record<'movie' | 'music', string> = { movie: '1002', music: '1003' }

function setType(type: 'movie' | 'music') {
  currentType.value = type
}

function handleSearch() {
  const raw = searchQuery.value.trim()
  if (!raw || isSearching.value) return
  const normalized = normalizeSearchQuery(raw)
  if (!normalized) return
  isSearching.value = true
  const cat = CATS[currentType.value]
  const url = `https://search.douban.com/${currentType.value}/subject_search?search_text=${encodeURIComponent(normalized)}&cat=${cat}`
  window.open(url, '_blank', 'noopener,noreferrer')
  setTimeout(() => { isSearching.value = false }, 800)
}

function formatRatingBarPct(pct: string): string {
  return pct
}

function ratingBarWidth(pct: string): string {
  return `${parseFloat(pct.replace('%', '')) || 0}%`
}

defineExpose({ updateRecord })
</script>

<template>
  <div class="umm-detail-root">
    <div class="umm-pill-wrap">
      <div class="umm-pill-inner">
        <button class="umm-pill-btn" :class="{ 'umm-pill-btn--active': currentType === 'movie' }" @click="setType('movie')">电影</button>
        <button class="umm-pill-btn" :class="{ 'umm-pill-btn--active': currentType === 'music' }" @click="setType('music')">音乐</button>
        <form class="umm-search-bar" @submit.prevent="handleSearch">
          <input v-model="searchQuery" type="search" class="umm-search-input" :placeholder="PLACEHOLDERS[currentType]" :aria-label="currentType === 'movie' ? '搜索豆瓣电影' : '搜索豆瓣音乐'" autocomplete="off">
          <button type="submit" class="umm-search-submit" aria-label="搜索">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </button>
        </form>
      </div>
    </div>

    <div class="umm-detail-grid">
      <div class="umm-detail-title-block">
        <div v-if="statusLabel" class="umm-status-chip" :data-status="record?.status === 2 ? 'done' : 'none'">
          <span>{{ statusLabel }}</span>
          <span v-if="statusRating">{{ statusRating }}</span>
        </div>
        <div class="umm-detail-title-row">
          <h1 class="umm-detail-title">{{ d.title }}</h1>
          <div class="umm-detail-subtitle">
            <span v-if="d.originalTitle" class="umm-detail-original">{{ d.originalTitle }}</span>
            <span v-if="d.year" class="umm-detail-year">{{ d.year }}</span>
          </div>
        </div>
      </div>

      <div class="umm-detail-left">
        <div v-if="d.posterSrc" class="umm-poster">
          <a v-if="d.posterLink" :href="d.posterLink" target="_blank"><img :src="d.posterSrc" :alt="d.posterAlt"></a>
          <img v-else :src="d.posterSrc" :alt="d.posterAlt">
        </div>

        <div v-if="d.ratingNum" class="umm-rating-card">
          <div class="umm-rating-score-section">
            <span class="umm-rating-score">{{ d.ratingNum }}</span>
            <div class="umm-rating-meta">
              <span class="umm-rating-stars">
                <span v-if="starClass" :class="starClass"></span>
              </span>
              <span v-if="d.ratingPeople" class="umm-rating-people">{{ d.ratingPeople }}人评价</span>
            </div>
          </div>
          <div v-if="d.betterThan.length" class="umm-rating-better">
            好于 <template v-for="(t, i) in d.betterThan" :key="i"><span v-if="i > 0"> / </span><span>{{ t }}</span></template>
          </div>
          <div v-if="d.ratingBars.length" class="umm-rating-bars">
            <div v-for="(bar, i) in d.ratingBars" :key="i" class="umm-bar-row">
              <span class="umm-bar-label">{{ bar.label.replace(/星/g, '') }}星</span>
              <div class="umm-bar-track"><div class="umm-bar-fill" :style="{ width: ratingBarWidth(bar.pct) }"></div></div>
              <span class="umm-bar-pct">{{ formatRatingBarPct(bar.pct) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="umm-detail-body">
        <div v-if="d.metaRows.length" class="umm-meta-card">
          <div v-for="(row, i) in d.metaRows" :key="i" class="umm-meta-row">
            <span class="umm-meta-label">{{ row.label }}</span>
            <span class="umm-meta-value" v-html="row.html"></span>
          </div>
        </div>

        <div v-if="d.rankNo || d.rankText" class="umm-meta-card">
          <div class="umm-meta-row">
            <span class="umm-meta-label">排行榜</span>
            <span class="umm-meta-value">
              <a v-if="d.rankHref" :href="d.rankHref" target="_blank">{{ d.rankNo }} {{ d.rankText }}</a>
              <template v-else>{{ d.rankNo }} {{ d.rankText }}</template>
            </span>
          </div>
        </div>

        <div v-if="d.synopsisHtml" class="umm-synopsis-card">
          <h3 class="umm-synopsis-heading">{{ d.synopsisHeading }}</h3>
          <div class="umm-synopsis-text" v-html="d.synopsisHtml"></div>
        </div>

        <div class="umm-actions">
          <div id="umm-neodb-actions"></div>
          <div id="umm-interest-actions"></div>
          <button class="umm-dl-trigger">+ 添加到片单</button>
        </div>
      </div>
    </div>

    <div v-if="sortedAwards.length" class="umm-award-card">
      <h3 class="umm-award-heading">获奖情况</h3>
      <div class="umm-award-list">
        <div v-for="(a, i) in sortedAwards" :key="i" class="umm-award-item">
          <div class="umm-award-badge" :class="{ 'umm-award-badge--nom': a.isNomination }">{{ a.isNomination ? '提名' : '获奖' }}</div>
          <div class="umm-award-info">
            <span class="umm-award-festival">{{ a.festival }}</span>
            <span class="umm-award-category">{{ a.category }}</span>
            <span v-if="a.nominee" class="umm-award-nominee">
              <a v-if="a.nomineeLink" :href="a.nomineeLink" target="_blank" class="umm-award-link">{{ a.nominee }}</a>
              <template v-else>{{ a.nominee }}</template>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="d.celebItems.length" class="umm-celeb-card">
      <h3 class="umm-celeb-heading">{{ d.celebHeading }}</h3>
      <div class="umm-celeb-grid">
        <a v-for="(c, i) in d.celebItems" :key="i" :href="c.link" target="_blank" class="umm-celeb-item">
          <div class="umm-celeb-avatar" :style="c.avatar ? { backgroundImage: `url(${c.avatar})` } : {}"></div>
          <div class="umm-celeb-info">
            <span class="umm-celeb-name">{{ c.name }}</span>
            <span class="umm-celeb-role">{{ c.role }}</span>
          </div>
        </a>
      </div>
    </div>

    <div v-if="d.photoItems.length" class="umm-photo-card">
      <h3 class="umm-photo-heading">视频和图片</h3>
      <div class="umm-photo-grid">
        <a v-for="(p, i) in d.photoItems" :key="i" :href="p.link" target="_blank" class="umm-photo-item">
          <img :src="p.src" :alt="p.isVideo ? '预告片' : '剧照'" class="umm-photo-img">
          <span v-if="p.isVideo" class="umm-photo-badge">预告片</span>
        </a>
      </div>
    </div>

    <div v-if="d.recItems.length" class="umm-rec-card">
      <h3 class="umm-rec-heading">喜欢这部电影的人也喜欢</h3>
      <div class="umm-rec-grid">
        <div v-for="(r, i) in d.recItems" :key="i" class="umm-rec-cell">
          <div class="umm-rec-bar" :class="r.isDone ? 'umm-rec-bar--seen' : 'umm-rec-bar--new'">
            <span v-if="r.isDone && r.rating" class="umm-rec-bar-text">看过 {{ r.rating }}</span>
            <span v-else class="umm-rec-bar-text">未看</span>
          </div>
          <a :href="r.link" target="_blank" class="umm-rec-item">
            <img :src="r.poster" :alt="r.title" class="umm-rec-poster">
            <div class="umm-rec-info">
              <span class="umm-rec-title">{{ r.title }}</span>
              <span class="umm-rec-rating">{{ r.rating }}</span>
            </div>
          </a>
        </div>
      </div>
    </div>
  </div>
</template>