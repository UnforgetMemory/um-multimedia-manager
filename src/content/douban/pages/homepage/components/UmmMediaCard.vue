<script setup lang="ts">
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { UmmStatusBadgeWrapper } from '@/content/douban/components/UmmStatusBadgeWrapper'
import { UmmRating } from '@/content/douban/components/UmmRating'

interface Props {
  posterUrl: string
  title: string
  href: string
  rate: string
  intro?: string
  badgeStatus: number
  badgeRating: number
  episodes?: string
}

defineProps<Props>()
</script>

<template>
  <a :href="href" class="umm-card" :title="intro || undefined">
    <UmmStatusBadgeWrapper
      :status="badgeStatus"
      :rating="badgeRating"
      variant="inline"
    />
    <div class="umm-card-cover">
      <UmmImageWrapper :src="posterUrl" :alt="title" eager />
      <div v-if="episodes" class="umm-episodes">{{ episodes }}</div>
    </div>
    <div class="umm-card-title">{{ title }}</div>
    <UmmRating
      :score="rate || undefined"
      class="umm-card-rating"
    />
  </a>
</template>