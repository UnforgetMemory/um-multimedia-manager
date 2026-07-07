<script setup lang="ts">
import { UmmMediaCard } from '@/content/douban/components/UmmMediaCard'

interface Props {
  posterUrl: string
  title: string
  href: string
  rate: string
  intro?: string
  badgeStatus: number
  badgeRating: number
  episodes?: string
  type?: 'movie' | 'music'
}

const props = defineProps<Props>()

const cardProps = {
  posterUrl: props.posterUrl,
  title: props.title,
  href: props.href,
  rating: props.rate,
  intro: props.intro || '',
  badgeStatus: props.badgeStatus,
  badgeRating: props.badgeRating,
  episodes: props.episodes || '',
  type: props.type || 'movie',
}
</script>

<template>
  <UmmMediaCard mode="scroll" v-bind="cardProps" />
</template>