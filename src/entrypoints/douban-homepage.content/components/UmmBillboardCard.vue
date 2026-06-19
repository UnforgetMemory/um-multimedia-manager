<script setup lang="ts">
import { useBadge } from '../composables/useBadge'

interface Props {
  order: string
  title: string
  href: string
  badgeStatus: number
  badgeRating: number
}

const props = defineProps<Props>()

const { badgeText, badgeClass } = useBadge(
  () => props.badgeStatus,
  () => props.badgeRating,
)
</script>

<template>
  <a :href="href" class="umm-billboard-card">
    <span class="umm-billboard-order">{{ order }}</span>
    <span class="umm-billboard-title">{{ title }}</span>
    <span class="umm-badge umm-badge--inline" :class="badgeClass">{{ badgeText }}</span>
  </a>
</template>
