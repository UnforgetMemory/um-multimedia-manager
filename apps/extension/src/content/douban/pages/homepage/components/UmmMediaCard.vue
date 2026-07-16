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
  author?: string
  type?: 'movie' | 'music' | 'book'
  mode?: 'scroll' | 'grid'
}

const props = defineProps<Props>()

const cardProps = {
  posterUrl: props.posterUrl,
  title: props.title,
  href: props.href,
  rating: props.rate,
  intro: props.intro || '',
  author: props.author || '',
  badgeStatus: props.badgeStatus,
  badgeRating: props.badgeRating,
  episodes: props.episodes || '',
  type: props.type || 'movie',
  mode: props.mode || 'scroll',
}
</script>

<template>
  <UmmMediaCard v-bind="cardProps" />
</template>
