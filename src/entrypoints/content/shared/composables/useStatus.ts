import { computed, type MaybeRefOrGetter, toValue } from 'vue'

export type StatusType = 'done' | 'none' | 'wish'

/**
 * Derive display type/text from Douban badge status.
 * Accepts MaybeRefOrGetter so callers can pass raw values or refs.
 *
 * badgeStatus: 2=watched, 1=want-to-watch, else=not-watched
 */
export function useStatus(
  badgeStatus: MaybeRefOrGetter<number>,
  badgeRating?: MaybeRefOrGetter<number>,
) {
  const statusType = computed<StatusType>(() => {
    const s = toValue(badgeStatus)
    if (s === 2) return 'done'
    if (s === 1) return 'wish'
    return 'none'
  })

  const statusText = computed(() => {
    const rating = toValue(badgeRating)
    if (statusType.value === 'done') {
      return rating ? `已看 ${rating}` : '已看'
    }
    if (statusType.value === 'wish') return '想看'
    return '未看'
  })

  return { statusType, statusText }
}
