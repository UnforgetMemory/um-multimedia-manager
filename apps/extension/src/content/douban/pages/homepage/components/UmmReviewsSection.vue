<script setup lang="ts">
import { onMounted, watch } from 'vue'
import type { StoreRecord } from '@/types'

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

    const statusType = status === 2 ? 'done' : status === 3 ? 'doing' : status === 1 ? 'wish' : 'none'
    const statusText = status === 2
      ? (userRating > 0 ? `已看 ${userRating}` : '已看')
      : status === 3 ? '在看'
      : status === 1 ? '想看'
      : '未看'

    const badge = document.createElement('span')
    badge.className = `umm-status umm-status--small umm-status--${statusType}`
    badge.textContent = statusText
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
