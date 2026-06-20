<script setup lang="ts">
import { computed } from 'vue'
import { useBadge } from '../composables/useBadge'

interface Props {
  posterUrl: string
  title: string
  href: string
  rate: string
  starNum?: string
  intro?: string
  badgeStatus: number
  badgeRating: number
  episodes?: string
}

const props = withDefaults(defineProps<Props>(), {
  starNum: '00',
  intro: '',
  episodes: undefined,
})

const starCount = computed(() => {
  const num = parseInt(props.starNum)
  if (isNaN(num) || num === 0) return 0
  return Math.round(num / 10)
})

const { badgeText, badgeClass } = useBadge(
  () => props.badgeStatus,
  () => props.badgeRating,
)
</script>

<template>
  <a :href="href" class="umm-card" :title="intro || undefined">
    <div class="umm-card-cover">
      <img :src="posterUrl" :alt="title" class="umm-card-img" loading="lazy">
      <div v-if="episodes" class="umm-episodes">{{ episodes }}</div>
    </div>
    <div class="umm-card-title">{{ title }}</div>
    <div class="umm-card-rating">
      <span v-if="starCount > 0" class="umm-card-star">{{ '★'.repeat(starCount) }}</span>
      <span v-if="rate">{{ rate }}</span>
      <span v-else class="umm-card-no-rating">暂无评分</span>
    </div>
    <span class="umm-badge umm-badge--inline" :class="badgeClass">{{ badgeText }}</span>
  </a>
</template>
