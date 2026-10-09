<script setup lang="ts">
import { computed } from 'vue';
import { UmmMediaCard } from '@/scenario/douban/components/umm-media-card';

interface Props {
  posterUrl: string;
  title: string;
  href: string;
  rate: string;
  intro?: string;
  badgeStatus: number;
  badgeRating: number;
  episodes?: string;
  author?: string;
  type?: 'movie' | 'music' | 'book';
  mode?: 'scroll' | 'grid';
}

const props = defineProps<Props>();

// computed, not a plain object: a snapshot here means the card never sees an
// updated badge, and the only way the row would refresh was the parent
// re-creating it (which is what a state-derived `:key` used to do).
const cardProps = computed(() => ({
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
}));
</script>

<template vapor>
  <UmmMediaCard v-bind="cardProps" />
</template>
