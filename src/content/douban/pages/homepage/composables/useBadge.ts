import { computed } from 'vue'

export function useBadge(status: () => number, rating: () => number) {
  const badgeText = computed(() => {
    if (status() === 2) {
      return rating() > 0 ? `${rating()}` : '✓'
    }
    return '○'
  })

  const badgeClass = computed(() => {
    return status() === 2 ? 'umm-badge--done' : 'umm-badge--none'
  })

  return { badgeText, badgeClass }
}
