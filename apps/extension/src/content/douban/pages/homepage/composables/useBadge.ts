import { computed } from 'vue'

export function useBadge(status: () => number, rating: () => number) {
  const badgeText = computed(() => {
    if (status() === 2) {
      return rating() > 0 ? `${rating()}` : '✓'
    }
    if (status() === 3) return '▶'
    if (status() === 1) return '☆'
    return '○'
  })

  const badgeClass = computed(() => {
    if (status() === 2) return 'umm-badge--done'
    if (status() === 3) return 'umm-badge--doing'
    if (status() === 1) return 'umm-badge--wish'
    return 'umm-badge--none'
  })

  return { badgeText, badgeClass }
}
