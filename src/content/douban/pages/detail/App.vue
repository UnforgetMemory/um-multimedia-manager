<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmMediaCard } from '@/content/douban/components/UmmMediaCard'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmInterestBar } from '@/content/douban/components/UmmInterestBar'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import { useInterest } from '@/content/douban/pages/detail/composables/useInterest'
import { onCrossPlatformSave, syncNeoDBOnLoad } from '@/content/douban/pages/detail/composables/useCrossPlatformSync'
import { Store } from '@/features/database'
import type { DetailData } from './detail-data'

const props = defineProps<{ detailData: DetailData }>()
const d = props.detailData




const sortedAwards = computed(() => {
  return [...d.awardItems].sort((a, b) => {
    if (a.isNomination === b.isNomination) return 0
    return a.isNomination ? 1 : -1
  })
})

const artistName = computed(() => {
  if (!d.isMusic) return ''
  const performerRow = d.metaRows.find(r => r.label === '表演者')
  if (!performerRow) return ''
  const div = document.createElement('div')
  div.innerHTML = performerRow.html
  return div.textContent?.replace(/\s*\/\s*/g, ' / ').trim() || ''
})

const record = ref<{ status: number; rating: number } | null>(d.record ? { status: d.record.status, rating: d.record.rating } : null)

const mediaType = computed(() => d.isBook ? 'book' : d.isMusic ? 'music' : 'movie')

/** Scan DOM for native interest status (fallback when d.record is null) */
function detectStatusFromDom(): 'wish' | 'do' | 'collect' | null {
  const el = document.getElementById('interest_sect_level')
  if (!el) return null
  const text = el.textContent ?? ''
  if (/我听过|我读过/.test(text)) return 'collect'
  if (/我在听|我在读/.test(text)) return 'do'
  if (/我想听|我想读/.test(text)) return 'wish'
  return null
}

/** Extract rating from native DOM */
function detectRatingFromDom(): number {
  const input = document.getElementById('n_rating') as HTMLInputElement | null
  if (!input) return 0
  const v = parseInt(input.value, 10)
  return v >= 1 && v <= 5 ? v : 0
}

const initialStatus: 'wish' | 'do' | 'collect' | null =
  d.record?.status === 1 ? 'wish'
  : d.record?.status === 3 ? 'do'
  : d.record?.status === 2 ? 'collect'
  : detectStatusFromDom()
const initialRating: number =
  d.record?.status && d.record?.rating ? d.record.rating
  : detectRatingFromDom()
const interested = useInterest(() => d.identity.providerId, initialStatus, initialRating)

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
    // Companion NeoDB sync check for existing watched records
    const identity = { provider: 'douban' as const, type: d.identity.type, providerId: d.identity.providerId, url: window.location.href }
    syncNeoDBOnLoad(identity, record.value).catch(e =>
      console.warn('[UMM] NeoDB on-load check failed:', e)
    )
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

  const newStatus = interest === 'collect' ? 2 : interest === 'do' ? 3 : 1
  const newRating = stars * 2
  updateRecord({ status: newStatus, rating: newRating })

  const identity = { provider: 'douban' as const, type: d.identity.type, providerId: d.identity.providerId, url: window.location.href }
  await onCrossPlatformSave({ identity, interest, stars, comment, newStatus, newRating })
}

const starClass = computed(() => d.bigstarNum ? `bigstar bigstar${d.bigstarNum}` : '')

function formatRatingBarPct(pct: string): string {
  return pct
}

function metaToChips(html: string, label?: string): string {
  // 提取首尾包裹标签（如 <span class="attrs">...</span>）避免分割后错位
  const leading = html.match(/^(<[^>]+>)+/)
  const trailing = html.match(/(<\/[^>]+>)+$/)
  const prefix = leading?.[0] ?? ''
  const suffix = trailing?.[0] ?? ''
  let core = html
  if (prefix) core = core.slice(prefix.length)
  if (suffix && core.endsWith(suffix)) core = core.slice(0, -suffix.length)

  // 字符级扫描：仅在非标签文本中替换 " / " 为 chip 边界
  let result = ''
  let inTag = false
  let i = 0
  while (i < core.length) {
    const ch = core[i]
    if (ch === '<') { inTag = true; result += ch; i++; continue }
    if (inTag) { result += ch; if (ch === '>') inTag = false; i++; continue }
    if (ch === '/' && i > 0 && i < core.length - 1 && /\s/.test(core[i - 1]) && /\s/.test(core[i + 1])) {
      result = result.replace(/\s+$/, '')       // 削掉 / 前的空格
      let j = i + 2
      while (j < core.length && /\s/.test(core[j])) j++ // 跳过 / 后的空格
      // 跳过紧随其后的闭合标签（如 </span>），避免产生空 chip
      while (j < core.length && core[j] === '<') {
        const closeEnd = core.indexOf('>', j)
        if (closeEnd === -1) break
        const tag = core.slice(j, closeEnd + 1)
        if (tag.startsWith('</')) {
          result += tag // 将闭合标签放在前一个 chip 中
          j = closeEnd + 1
          while (j < core.length && /\s/.test(core[j])) j++
        } else {
          break
        }
      }
      result += '</span><span class="umm-meta-chip">'
      i = j
      continue
    }
    result += ch
    i++
  }
  // Add target="_blank" to all <a> tags that lack it
  result = result.replace(/<a(?=\s)(?![^>]*\btarget=)/g, '<a target="_blank" rel="noopener noreferrer"')
  // Wrap plain IMDb text IDs (tt1234567) into clickable links
  const trimmed = result.trim()
  if (label === 'IMDb' && /^tt\d+$/.test(trimmed)) {
    result = `<a href="https://www.imdb.com/title/${trimmed}/" target="_blank" rel="noopener noreferrer">${trimmed}</a>`
  }
  return prefix + '<span class="umm-meta-chip">' + result + '</span>' + suffix
}

function ratingBarWidth(pct: string): string {
  return `${parseFloat(pct.replace('%', '')) || 0}%`
}

/** Open external link in new tab — replaces bare <a target="_blank"> */
function openLink(url: string): void {
  window.open(url, '_blank')
}

defineExpose({ updateRecord })
</script>

<template>
  <UmmPageLayout :type="mediaType">
    <div class="umm-detail-root">

    <div class="umm-detail-grid">
        <div class="umm-detail-title-block">
          <div class="umm-detail-title-row">
            <h1 class="umm-detail-title">{{ d.title }}</h1>
            <h2 v-if="d.subtitle" class="umm-detail-subtitle">{{ d.subtitle }}</h2>
            <span v-if="artistName" class="umm-detail-artist">{{ artistName }}</span>
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
              :type="mediaType"
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
          <div v-if="d.posterLink" style="cursor:pointer" @click="openLink(d.posterLink)">
            <UmmImageWrapper :src="d.posterSrc" :alt="d.posterAlt" :aspect-ratio="mediaType === 'book' ? ASPECT_RATIO.POSTER : mediaType === 'music' ? ASPECT_RATIO.SQUARE : ASPECT_RATIO.POSTER" eager />
          </div>
          <UmmImageWrapper v-else :src="d.posterSrc" :alt="d.posterAlt" :aspect-ratio="mediaType === 'book' ? ASPECT_RATIO.POSTER : mediaType === 'music' ? ASPECT_RATIO.SQUARE : ASPECT_RATIO.POSTER" eager />
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
            <span class="umm-better-label">好于</span>
            <span v-for="t in d.betterThan" :key="t" class="umm-better-chip">{{ t }}</span>
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
            <span class="umm-meta-value" v-html="metaToChips(row.html, row.label)"></span>
          </div>
        </div>

        <div v-if="d.rankNo || d.rankText" class="umm-meta-card">
          <div class="umm-meta-row">
            <span class="umm-meta-label">排行榜</span>
            <span class="umm-meta-value">
              <span v-if="d.rankHref" class="umm-link" style="cursor:pointer" @click="openLink(d.rankHref)">{{ d.rankNo }} {{ d.rankText }}</span>
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
          <button class="umm-dl-trigger">{{ mediaType === 'book' ? '+ 添加到书单' : '+ 添加到片单' }}</button>
        </div>
      </div>
    </div>

    <div v-if="d.trackItems.length > 0" class="umm-track-card">
      <h3 class="umm-track-heading">曲目</h3>
      <ol class="umm-track-list">
        <li v-for="(track, i) in d.trackItems" :key="i" class="umm-track-item">{{ track }}</li>
      </ol>
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
              <span v-if="a.nomineeLink" class="umm-award-link" style="cursor:pointer" @click="openLink(a.nomineeLink)">{{ a.nominee }}</span>
              <template v-else>{{ a.nominee }}</template>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="d.celebItems.length" class="umm-celeb-card">
                  <h3 class="umm-celeb-heading">
              {{ d.celebHeading }}
              <span v-if="d.celebCount" class="umm-section-link">(<span style="cursor:pointer" @click="openLink(`/subject/${d.identity.providerId}/celebrities`)">{{ d.celebCount }}</span>)</span>
            </h3>
      <div class="umm-celeb-grid">
        <div v-for="(c, i) in d.celebItems" :key="i" class="umm-celeb-item" @click="openLink(c.link)">
          <UmmImageWrapper :src="c.avatar" :alt="c.name" :aspect-ratio="ASPECT_RATIO.POSTER" />
          <div class="umm-celeb-info">
            <span class="umm-celeb-name">{{ c.name }}</span>
            <span class="umm-celeb-role">{{ c.role }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Books: author bio, TOC, blockquotes, editions -->
    <div v-if="d.authorBioHtml" class="umm-author-bio-card">
      <h3 class="umm-synopsis-heading">作者简介</h3>
      <div class="umm-synopsis-text" v-html="d.authorBioHtml"></div>
    </div>

    <div v-if="d.tocItems.length" class="umm-toc-card">
      <h3 class="umm-toc-heading">目录</h3>
      <div class="umm-toc-list">
        <div v-for="(item, i) in d.tocItems" :key="i" class="umm-toc-item">{{ item }}</div>
      </div>
    </div>

    <div v-if="d.blockquoteItems.length" class="umm-blockquote-card">
      <h3 class="umm-blockquote-heading">原文摘录</h3>
      <div class="umm-blockquote-list">
        <div v-for="(bq, i) in d.blockquoteItems" :key="i" class="umm-blockquote-item">
          <div class="umm-blockquote-text">{{ bq.text }}</div>
          <div v-if="bq.source || bq.user" class="umm-blockquote-meta">
            <span v-if="bq.source" class="umm-blockquote-source">—— 引自 {{ bq.source }}</span>
            <span v-if="bq.user" class="umm-blockquote-user">— {{ bq.user }}</span>
            <span v-if="bq.votes" class="umm-blockquote-votes">{{ bq.votes }}赞</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="d.editionItems.length" class="umm-edition-card">
      <h3 class="umm-edition-heading">其他版本</h3>
      <div class="umm-edition-list">
        <div v-for="(ed, i) in d.editionItems" :key="i" class="umm-edition-item">
          <a :href="ed.link" target="_blank" class="umm-edition-link">{{ ed.title }}</a>
          <span class="umm-edition-meta">{{ ed.rating }} {{ ed.count }}</span>
        </div>
      </div>
    </div>

    <div v-if="d.photoItems.length" class="umm-photo-card">
                  <h3 class="umm-photo-heading">
              剧照
              <span class="umm-section-link">(
                <span v-if="d.trailerCount" style="cursor:pointer" @click="openLink(`/subject/${d.identity.providerId}/trailer#trailer`)">预告片{{ d.trailerCount }}</span>
                <template v-if="d.trailerCount && d.photoCount">&nbsp;|&nbsp;</template>
                <span v-if="d.photoCount" style="cursor:pointer" @click="openLink(`/subject/${d.identity.providerId}/all_photos`)">图片{{ d.photoCount }}</span>
              )</span>
            </h3>
      <div class="umm-photo-grid">
        <div v-for="(p, i) in d.photoItems" :key="i" class="umm-photo-item" @click="openLink(p.link)">
          <UmmImageWrapper :src="p.src" :alt="p.isVideo ? '预告片' : '剧照'" :aspect-ratio="ASPECT_RATIO.WIDE" />
          <span v-if="p.isVideo" class="umm-photo-badge">预告片</span>
        </div>
      </div>
    </div>

    <div v-if="d.recItems.length" class="umm-rec-card">
      <h3 class="umm-rec-heading">推荐</h3>
      <div class="umm-rec-grid">
        <UmmMediaCard
          v-for="r in d.recItems"
          :key="`${r.subjectId}-${r.recStatus}-${r.personalRating ?? Number(r.rating) ?? 0}`"
          mode="grid"
          :poster-url="r.poster"
          :title="r.title"
          :href="r.link"
          :badge-status="r.recStatus"
          :badge-rating="r.personalRating ?? Number(r.rating)"
          :rating="r.rating || ''"
          :type="mediaType"
        />
      </div>
    </div>

    <div v-if="d.shortComments.length" class="umm-comment-card">
      <h3 class="umm-comment-heading">热门短评</h3>
      <div class="umm-comment-list">
        <div v-for="(c, i) in d.shortComments" :key="i" class="umm-comment-item">
          <div class="umm-comment-meta">
            <span style="cursor:pointer" class="umm-comment-user" @click="openLink(c.userLink)">{{ c.user }}</span>
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
