<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmInterestBar } from '@/content/douban/components/UmmInterestBar'
import { UmmMediaCard } from '@/content/douban/components/UmmMediaCard'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import { useInterest } from '@/content/douban/pages/detail/composables/useInterest'
import { onCrossPlatformSave } from '@/content/douban/pages/detail/composables/useCrossPlatformSync'
import { Store } from '@/features/database'
import type { GameDetailData } from './GameDetailData'

const props = defineProps<{ data: GameDetailData }>()
const d = props.data

const record = ref<{ status: number; rating: number } | null>(null)

const interested = useInterest(
  () => d.identity.providerId,
  d.initialStatus === 1 ? 'wish' : d.initialStatus === 3 ? 'do' : d.initialStatus === 2 ? 'collect' : null,
  d.initialRating,
  '/j/ilmen/thing',
)

function updateRecord(newRecord: { status: number; rating: number } | null) {
  record.value = newRecord
}

async function onInterestSave(interest: 'wish' | 'do' | 'collect', stars: number, tags: string, comment: string) {
  const ok = await interested.submitInterest(interest, stars || undefined, tags || undefined, comment || undefined)
  if (!ok) return
  const newStatus = interest === 'collect' ? 2 : interest === 'do' ? 3 : 1
  const newRating = stars * 2
  record.value = { status: newStatus, rating: newRating }
  const identity = { provider: 'douban' as const, type: 'game', providerId: d.identity.providerId, url: window.location.href }
  await onCrossPlatformSave({ identity, interest, stars, comment, newStatus, newRating })
}

onMounted(() => {
  interested.fetchInterest().then(() => {
    // Fallback: if API didn't return comment, use DOM-extracted value
    if (!interested.currentComment.value && d.collectionComment) {
      interested.currentComment.value = d.collectionComment
    }
    if (interested.interestStatus.value === 'collect') {
      import('@/entrypoints/content/neodb-push').then(({ injectNeoDBPushButtons: inject }) => {
        Store.dbGet('douban_records', `${d.identity.type}::${d.identity.providerId}`).then(rec => {
          inject(
            { provider: 'douban', type: d.identity.type, providerId: d.identity.providerId, url: window.location.href },
            rec,
          )
        })
      })
    }
  })
})

const starClass = computed(() => d.bigstarNum ? `bigstar bigstar${d.bigstarNum}` : '')

function ratingBarWidth(pct: string): string {
  return `${parseFloat(pct.replace('%', '')) || 0}%`
}

function metaToChips(html: string): string {
  const leading = html.match(/^(<[^>]+>)+/)
  const trailing = html.match(/(<\/[^>]+>)+$/)
  const prefix = leading?.[0] ?? ''
  const suffix = trailing?.[0] ?? ''
  let core = html
  if (prefix) core = core.slice(prefix.length)
  if (suffix && core.endsWith(suffix)) core = core.slice(0, -suffix.length)

  let result = ''
  let inTag = false
  let i = 0
  while (i < core.length) {
    const ch = core[i]
    if (ch === '<') { inTag = true; result += ch; i++; continue }
    if (inTag) { result += ch; if (ch === '>') inTag = false; i++; continue }
    if (ch === '/' && i > 0 && i < core.length - 1 && /\s/.test(core[i - 1]) && /\s/.test(core[i + 1])) {
      result = result.replace(/\s+$/, '')
      let j = i + 2
      while (j < core.length && /\s/.test(core[j])) j++
      while (j < core.length && core[j] === '<') {
        const closeEnd = core.indexOf('>', j)
        if (closeEnd === -1) break
        const tag = core.slice(j, closeEnd + 1)
        if (tag.startsWith('</')) {
          result += tag
          j = closeEnd + 1
          while (j < core.length && /\s/.test(core[j])) j++
        } else { break }
      }
      result += '</span><span class="umm-meta-chip">'
      i = j
      continue
    }
    result += ch
    i++
  }
  result = result.replace(/<a(?=\s)(?![^>]*\btarget=)/g, '<a target="_blank" rel="noopener noreferrer"')
  return prefix + '<span class="umm-meta-chip">' + result + '</span>' + suffix
}

defineExpose({ updateRecord })

function openLink(url: string): void {
  window.open(url, '_blank')
}
</script>

<template>
  <UmmPageLayout type="game">
    <div class="umm-detail-root">
      <div class="umm-detail-grid">
        <div class="umm-detail-title-block">
          <div class="umm-detail-title-row">
            <h1 class="umm-detail-title">{{ d.title }}</h1>
          </div>
          <div id="umm-interest-actions">
            <UmmInterestBar
              :status="interested.interestStatus.value === 'wish' ? 1 : interested.interestStatus.value === 'do' ? 3 : interested.interestStatus.value === 'collect' ? 2 : 0"
              :rating="interested.currentRating.value"
              :myTags="interested.myTags.value"
              :savedTags="interested.savedTags.value"
              :comment="interested.currentComment.value"
              :hasDo="interested.hasDo.value"
              :loading="interested.loading.value"
              :error="interested.error.value"
              type="game"
              @save="onInterestSave"
            />
            <div v-if="interested.currentComment.value" class="umm-my-comment">
              <span class="umm-my-comment-label">我的短评：</span>
              <span class="umm-my-comment-text">{{ interested.currentComment.value }}</span>
            </div>
          </div>
        </div>

        <div class="umm-detail-left">
          <div v-if="d.posterSrc" class="umm-poster">
            <UmmImageWrapper :src="d.posterSrc" :alt="d.title" :aspect-ratio="ASPECT_RATIO.POSTER" eager />
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
            <div v-if="d.ratingBars.length" class="umm-rating-bars">
              <div v-for="(bar, i) in d.ratingBars" :key="i" class="umm-bar-row">
                <span class="umm-bar-label">{{ bar.label.replace(/星/g, '') }}星</span>
                <div class="umm-bar-track"><div class="umm-bar-fill" :style="{ width: ratingBarWidth(bar.pct) }"></div></div>
                <span class="umm-bar-pct">{{ bar.pct }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="umm-detail-body">
          <div v-if="d.metaRows.length" class="umm-meta-card">
            <div v-for="(row, i) in d.metaRows" :key="i" class="umm-meta-row">
              <span class="umm-meta-label">{{ row.label }}</span>
              <span class="umm-meta-value" v-html="metaToChips(row.html)"></span>
            </div>
          </div>

          <div v-if="d.synopsisHtml" class="umm-synopsis-card">
            <h3 class="umm-synopsis-heading">简介</h3>
            <div class="umm-synopsis-text" v-html="d.synopsisHtml"></div>
          </div>

          <div class="umm-actions">
            <div id="umm-neodb-actions"></div>
            <button class="umm-dl-trigger">+ 添加到豆列</button>
          </div>
        </div>
      </div>

      <div v-if="d.galleryItems.length" class="umm-photo-card">
        <h3 class="umm-photo-heading">媒体</h3>
        <div class="umm-photo-grid">
          <div v-for="(item, i) in d.galleryItems" :key="i" class="umm-photo-item" @click="openLink(item.link)">
            <UmmImageWrapper :src="item.src" :alt="item.title || ''" :aspect-ratio="ASPECT_RATIO.WIDE" />
            <span v-if="item.isVideo" class="umm-photo-badge">▶ {{ item.tag || '预告片' }}</span>
            <span v-if="!item.isVideo" class="umm-photo-badge">图片</span>
          </div>
        </div>
      </div>

      <div v-if="d.recItems.length" class="umm-rec-card">
        <h3 class="umm-rec-heading">推荐</h3>
        <div class="umm-rec-grid">
          <UmmMediaCard
            v-for="r in d.recItems"
            :key="r.subjectId || r.link"
            mode="grid"
            :poster-url="r.poster"
            :title="r.title"
            :href="r.link"
            :badge-status="r.recStatus || 0"
            :badge-rating="r.personalRating || 0"
            rating=""
            type="game"
          />
        </div>
      </div>

      <div v-if="d.shortComments.length" class="umm-comment-card">
        <h3 class="umm-comment-heading">热门短评</h3>
        <div class="umm-comment-list">
          <div v-for="(c, i) in d.shortComments" :key="i" class="umm-comment-item">
            <div class="umm-comment-meta">
              <a v-if="c.userLink" :href="c.userLink" target="_blank" rel="noopener noreferrer" class="umm-comment-user">{{ c.user }}</a>
              <span v-else class="umm-comment-user">{{ c.user }}</span>
              <span class="umm-comment-stars">
                <span v-for="s in 5" :key="s" class="umm-comment-star" :class="{ 'umm-comment-star--on': s <= c.rating }">★</span>
              </span>
              <span v-if="c.platform" class="umm-comment-platform">{{ c.platform }}</span>
              <span v-if="c.votes > 0" class="umm-comment-up">{{ c.votes }} 有用</span>
            </div>
            <p class="umm-comment-text">{{ c.content }}</p>
            <span class="umm-comment-time">{{ c.time }}</span>
          </div>
        </div>
      </div>
    </div>
  </UmmPageLayout>
</template>
