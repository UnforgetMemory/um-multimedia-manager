<script setup lang="ts">
import { useStatus } from '@/entrypoints/content/shared/composables/useStatus'

interface Props {
  order: string
  title: string
  href: string
  badgeStatus: number
  badgeRating: number
}

const props = defineProps<Props>()
const { statusType, statusText } = useStatus(() => props.badgeStatus, () => props.badgeRating)
</script>

<template>
  <a :href="href" class="umm-billboard-card">
    <span class="umm-billboard-order">{{ order }}</span>
    <span class="umm-billboard-title">{{ title }}</span>
    <span class="umm-status umm-status--small" :class="`umm-status--${statusType}`">{{ statusText }}</span>
  </a>
</template>
