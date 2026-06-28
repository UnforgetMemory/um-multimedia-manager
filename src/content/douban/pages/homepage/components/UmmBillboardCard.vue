<script setup lang="ts">
import { computed } from 'vue'
import { UmmStatusBadgeWrapper } from '@/content/douban/components/UmmStatusBadgeWrapper'

interface Props {
  order: string
  title: string
  href: string
  badgeStatus: number
  badgeRating: number
}

const props = defineProps<Props>()

const orderNum = computed(() => parseInt(props.order))
const rankClass = computed(() => {
  const n = orderNum.value
  if (n === 1) return 'umm-billboard-order--gold'
  if (n === 2) return 'umm-billboard-order--silver'
  if (n === 3) return 'umm-billboard-order--bronze'
  return ''
})
</script>

<template>
  <a :href="href" class="umm-billboard-card" :class="rankClass ? `umm-billboard-card--${orderNum === 1 ? 'gold' : orderNum === 2 ? 'silver' : 'bronze'}` : ''">
    <span class="umm-billboard-order" :class="rankClass">{{ order }}</span>
    <span class="umm-billboard-title">{{ title }}</span>
    <UmmStatusBadgeWrapper
      :status="badgeStatus"
      :rating="badgeRating"
      variant="small"
    />
  </a>
</template>