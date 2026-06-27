<script setup lang="ts">
import { computed, defineComponent, h } from 'vue'
import { useStatus } from '@/content/douban/composables/useStatus'
import { UmmImage } from '@/content/douban/components/UmmImage'

const UmmImageWrapper = defineComponent({
  props: ['src', 'alt', 'class', 'aspectRatio', 'eager', 'href'],
  setup(props) {
    return () => h(UmmImage, props)
  }
})

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

const { statusType, statusText } = useStatus(() => props.badgeStatus, () => props.badgeRating)

const starCount = computed(() => {
  const num = parseInt(props.starNum)
  if (isNaN(num) || num === 0) return 0
  return Math.round(num / 10)
})
</script>

<template>
  <a :href="href" class="umm-card" :title="intro || undefined">
    <div class="umm-card-cover">
      <UmmImageWrapper :src="posterUrl" :alt="title" eager />
      <div v-if="episodes" class="umm-episodes">{{ episodes }}</div>
    </div>
    <div class="umm-card-title">{{ title }}</div>
    <div class="umm-card-rating">
      <span v-if="starCount > 0" class="umm-card-star">{{ '★'.repeat(starCount) }}</span>
      <span v-if="rate">{{ rate }}</span>
      <span v-else class="umm-card-no-rating">暂无评分</span>
    </div>
    <span class="umm-status umm-status--inline" :class="`umm-status--${statusType}`">{{ statusText }}</span>
  </a>
</template>
