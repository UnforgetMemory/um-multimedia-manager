<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { t } from '@/entrypoints/content/i18n'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmStatusBadgeWrapper } from '@/content/douban/components/UmmStatusBadgeWrapper'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmInterestBar } from '@/content/douban/components/UmmInterestBar'
import { useInterest } from '@/content/douban/pages/detail/composables/useInterest'
import { Store } from '@/features/database'
import { injectNeoDBPushButtons } from '@/entrypoints/content/neodb-push'
import { extractCrossPlatformLinks } from '@/entrypoints/content/handlers/douban-scanner'
import { FloatingToast } from '@/entrypoints/content/utils/toast'
import { safeSendMessage } from '@/utils/context'
import type { StoreRecord } from '@/types'
import type { DetailData } from './detail-data'

const props = defineProps<{ detailData: DetailData }>()
const d = props.detailData




const sortedAwards = computed(() => {
  return [...d.awardItems].sort((a, b) => {
    if (a.isNomination === b.isNomination) return 0
    return a.isNomination ? 1 : -1
  })
})

const record = ref<{ status: number; rating: number } | null>(d.record ? { status: d.record.status, rating: d.record.rating } : null)
const interested = useInterest(() => d.identity.providerId)

onMounted(() => {
  interested.fetchInterest().then(() => {
    // Trigger NeoDB injection once Vue app is mounted and interest is fetched
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

// Sync interest status changes back to local record
watch(interested.interestStatus, (val) => {
  if (val === 'collect') {
    record.value = { ...(record.value || { status: 0, rating: 0 }), status: 2 }
  } else if (val === 'wish') {
    record.value = { ...(record.value || { status: 0, rating: 0 }), status: 1 }
  } else if (val === null) {
    // keep current record unchanged
  }
})

watch(interested.currentRating, (val) => {
  if (record.value && val > 0) {
    record.value = { ...record.value, rating: val * 2 }
  }
})

function updateRecord(newRecord: { status: number; rating: number } | null) {
  record.value = newRecord
}

async function onInterestSave(interest: 'wish' | 'do' | 'collect', stars: number, tags: string, comment: string) {
  const ok = await interested.submitInterest(interest, stars || undefined, tags || undefined, comment || undefined)
  if (!ok) return

  const newStatus = interest === 'collect' ? 2 : 1
  const newRating = stars * 2
  updateRecord({ status: newStatus, rating: newRating })

  // Persist to local DB with linkedIds preserved
  const key = `${d.identity.type}::${d.identity.providerId}`
  const existing = await Store.dbGet('douban_records', key)
  const isNew = !existing
  const record: StoreRecord = {
    url: window.location.href,
    status: newStatus,
    rating: newRating,
    comment: comment || existing?.comment || '',
    updatedAt: new Date().toISOString(),
    linkedIds: existing?.linkedIds ?? {},
  }
  await Store.dbPut('douban_records', key, record)

  // Show save toast
  if (isNew) {
    FloatingToast.info('UMM', interest === 'collect' || interest === 'do' ? t('sync.douban_auto') : t('sync.status_updated'))
  } else {
    const isRatingChanged = newRating !== (existing?.rating || 0)
    const isCommentChanged = (comment || '') !== (existing?.comment || '')
    if (isRatingChanged) FloatingToast.info('UMM', t('sync.rating_updated', { rating: newRating }))
    if (isCommentChanged) FloatingToast.info('UMM', t('sync.comment_updated'))
    if (!isRatingChanged && !isCommentChanged) FloatingToast.info('UMM', t('sync.status_updated'))
  }

  // Cross-platform sync (IMDb / TMDB) — scan page DOM for links
  const identity = { provider: 'douban' as const, type: d.identity.type, providerId: d.identity.providerId, url: window.location.href }
  const mergedLinks = extractCrossPlatformLinks(identity, existing?.linkedIds)
  if (JSON.stringify(mergedLinks) !== JSON.stringify(existing?.linkedIds)) {
    record.linkedIds = mergedLinks
    await Store.dbPut('douban_records', key, record)
    let syncedCount = 0
    for (const [platform, linkKey] of Object.entries({ imdb: mergedLinks.imdb, tmdb: mergedLinks.tmdb })) {
      if (!linkKey) continue
      const [, pid] = linkKey.split('::')
      const targetStore = `${platform}_records`
      const existingTarget = await Store.dbGet(targetStore, linkKey)
      if (!existingTarget || existingTarget.status !== newStatus) {
        await Store.dbPut(targetStore, linkKey, {
          url: `${platform === 'imdb' ? 'https://www.imdb.com/title/' : 'https://www.themoviedb.org/movie/'}${pid}/`,
          status: newStatus,
          rating: newRating,
          comment: comment || '',
          updatedAt: new Date().toISOString(),
          linkedIds: { ...(existingTarget?.linkedIds || {}), douban: key },
        } as StoreRecord)
        syncedCount++
      }
    }
    if (syncedCount > 0) {
      FloatingToast.info('UMM', t('sync.platform_link', { platform: 'IMDb/TMDB' }))
    }
  }

  // NeoDB auto-sync: push when no existing NeoDB ID and configured
  if (interest === 'collect' || interest === 'do') {
    const hasNeoDBId = existing?.linkedIds?.neodb
    if (!hasNeoDBId) {
      try {
        const settings = await Store.getSettings()
        if (settings.autoSyncNeoDB && settings.neodbToken) {
          const syncResponse = await safeSendMessage({
            type: 'NEODB_PUSH_RATING',
            payload: {
              record: {
                providerId: d.identity.providerId,
                rating: newRating,
                status: newStatus,
                type: d.identity.type,
                provider: 'douban',
                comment: comment || '',
              },
            },
          }, { timeout: 10000 })
          if (syncResponse?.success) {
            FloatingToast.info('UMM', t('sync.neodb_auto_ok'))
          } else {
            FloatingToast.error('UMM', t('sync.neodb_auto_failed'))
          }
        }
      } catch (e) {
        console.warn('[UMM] NeoDB auto-sync failed:', e)
        FloatingToast.error('UMM', t('sync.neodb_auto_failed_err'))
      }
    }
  }

  // Refresh NeoDB buttons with updated record
  try {
    const updated = await Store.dbGet('douban_records', key)
    injectNeoDBPushButtons(
      { provider: 'douban', type: d.identity.type, providerId: d.identity.providerId, url: window.location.href },
      updated,
    )
  } catch { /* non-critical */ }
}

const starClass = computed(() => d.bigstarNum ? `bigstar bigstar${d.bigstarNum}` : '')

function formatRatingBarPct(pct: string): string {
  return pct
}

function ratingBarWidth(pct: string): string {
  return `${parseFloat(pct.replace('%', '')) || 0}%`
}

defineExpose({ updateRecord })
</script>

<template>
  <UmmPageLayout :type="d.isMusic ? 'music' : 'movie'">
    <div class="umm-detail-root">

    <div class="umm-detail-grid">
        <div class="umm-detail-title-block">
          <div class="umm-detail-title-row">
            <h1 class="umm-detail-title">{{ d.title }}</h1>
            <div class="umm-detail-subtitle">
              <span v-if="d.originalTitle" class="umm-detail-original">{{ d.originalTitle }}</span>
              <span v-if="d.year" class="umm-detail-year">{{ d.year }}</span>
            </div>
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
          <a v-if="d.posterLink" :href="d.posterLink" target="_blank" rel="noopener noreferrer">
            <UmmImageWrapper :src="d.posterSrc" :alt="d.posterAlt" aspect-ratio="2/3" eager />
          </a>
          <UmmImageWrapper v-else :src="d.posterSrc" :alt="d.posterAlt" aspect-ratio="2/3" eager />
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
              <a v-if="d.rankHref" :href="d.rankHref" target="_blank" rel="noopener noreferrer">{{ d.rankNo }} {{ d.rankText }}</a>
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
                  <h3 class="umm-celeb-heading">
              {{ d.celebHeading }}
              <span v-if="d.celebCount" class="umm-section-link">(<a :href="`/subject/${d.identity.providerId}/celebrities`" target="_blank">{{ d.celebCount }}</a>)</span>
            </h3>
      <div class="umm-celeb-grid">
        <a v-for="(c, i) in d.celebItems" :key="i" :href="c.link" target="_blank" class="umm-celeb-item">
          <UmmImageWrapper :src="c.avatar" :alt="c.name" aspect-ratio="2/3" />
          <div class="umm-celeb-info">
            <span class="umm-celeb-name">{{ c.name }}</span>
            <span class="umm-celeb-role">{{ c.role }}</span>
          </div>
        </a>
      </div>
    </div>

    <div v-if="d.photoItems.length" class="umm-photo-card">
                  <h3 class="umm-photo-heading">
              剧照
              <span class="umm-section-link">(
                <a v-if="d.trailerCount" :href="`/subject/${d.identity.providerId}/trailer#trailer`" target="_blank">预告片{{ d.trailerCount }}</a>
                <template v-if="d.trailerCount && d.photoCount">&nbsp;|&nbsp;</template>
                <a v-if="d.photoCount" :href="`/subject/${d.identity.providerId}/all_photos`" target="_blank">图片{{ d.photoCount }}</a>
                <template v-if="d.photoCount">&nbsp;·&nbsp;</template>
                <a :href="`/subject/${d.identity.providerId}/mupload`" target="_blank">添加</a>
              )</span>
            </h3>
      <div class="umm-photo-grid">
        <a v-for="(p, i) in d.photoItems" :key="i" :href="p.link" target="_blank" class="umm-photo-item">
          <UmmImageWrapper :src="p.src" :alt="p.isVideo ? '预告片' : '剧照'" aspect-ratio="16/9" />
          <span v-if="p.isVideo" class="umm-photo-badge">预告片</span>
        </a>
      </div>
    </div>

    <div v-if="d.recItems.length" class="umm-rec-card">
      <h3 class="umm-rec-heading">推荐</h3>
      <div class="umm-rec-grid">
        <div v-for="(r, i) in d.recItems" :key="i" class="umm-rec-cell">
          <a :href="r.link" target="_blank" class="umm-rec-item">
            <UmmStatusBadgeWrapper :status="r.isDone ? 2 : 0" :rating="Number(r.rating)" variant="small" />
            <div class="umm-rec-cover">
              <UmmImageWrapper :src="r.poster" :alt="r.title" aspect-ratio="2/3" />
            </div>
            <span class="umm-rec-title">{{ r.title }}</span>
            <span class="umm-rec-rating">{{ r.rating || t('common.rating_unknown') }}</span>
          </a>
        </div>
      </div>
    </div>

    <div v-if="d.shortComments.length" class="umm-comment-card">
      <h3 class="umm-comment-heading">热门短评</h3>
      <div class="umm-comment-list">
        <div v-for="(c, i) in d.shortComments" :key="i" class="umm-comment-item">
          <div class="umm-comment-meta">
            <a :href="c.userLink" target="_blank" class="umm-comment-user">{{ c.user }}</a>
            <span class="umm-comment-stars"><span v-for="s in 5" :key="s" class="umm-comment-star" :class="{ 'umm-comment-star--on': s <= c.rating }">★</span></span>
            <span class="umm-comment-up">{{ c.votes > 0 ? c.votes + ' 有用' : '' }}</span>
          </div>
          <p class="umm-comment-text">{{ c.content }}</p>
          <span class="umm-comment-time">{{ c.time }}</span>
        </div>
      </div>
    </div>
  </div>
  </UmmPageLayout>
</template>
