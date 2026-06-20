<script setup lang="ts">
import { onMounted, watch } from 'vue'
import type { StoreRecord } from '@/types'
import { Utils } from '@/utils'

const props = defineProps<{
  records: Map<string, StoreRecord>
}>()

function enhanceReviews(): void {
  document.querySelectorAll('#reviews .review').forEach(review => {
    if ((review as HTMLElement).dataset.ummRebuilt) return
    ;(review as HTMLElement).dataset.ummRebuilt = 'true'

    const movieLink = review.querySelector('.review-hd a')
    if (!movieLink) return
    const href = (movieLink as HTMLAnchorElement).href || movieLink.getAttribute('href')
    if (!href) return
    const match = href.match(/\/subject\/(\d+)/)
    if (!match) return

    const record = props.records.get(match[1])
    const status = record?.status ?? 0
    const userRating = record?.rating ?? 0

    const meta = review.querySelector('.review-meta')
    if (!meta) return

    const isDone = status === 2
    const label = isDone ? '✅' : '⏳'
    const ratingText = userRating > 0 ? ` ${Utils.formatRating10(userRating)}/10` : ''
    const statusAttr = isDone ? 'done' : 'none'

    const badge = document.createElement('span')
    badge.className = 'umm-search-badge'
    badge.dataset.status = statusAttr
    badge.textContent = `${label}${ratingText}`
    meta.insertAdjacentElement('afterend', badge)
  })
}

onMounted(() => {
  enhanceReviews()
})

watch(() => props.records, enhanceReviews, { deep: false })
</script>

<template>
  <!-- Side-effect component: enhances existing Douban #reviews .review items with UMM status badges -->
</template>
