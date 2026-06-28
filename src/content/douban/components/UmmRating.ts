import { defineComponent, h } from 'vue'

/**
 * UmmRating — unified compact rating display for Douban cards.
 *
 * Renders score with theme-adaptive gold tiers, optional review count.
 * Score thresholds: 5+ → gold-low, 7+ → gold-mid, 8+ → gold-high, else neutral.
 *
 * Props:
 * - score: optional string (e.g. "7.2")
 * - count: optional number (e.g. 1234)
 */
export const UmmRating = defineComponent({
  name: 'UmmRating',
  props: {
    score: { type: String, default: undefined },
    count: { type: Number, default: undefined },
  },
  setup(props) {
    function getTier(scoreStr: string | undefined): string | null {
      if (scoreStr === undefined) return null
      const n = parseFloat(scoreStr)
      if (isNaN(n) || n === 0) return null
      if (n >= 8) return 'umm-rating--gold-high'
      if (n >= 7) return 'umm-rating--gold-mid'
      if (n >= 5) return 'umm-rating--gold-low'
      return null
    }

    return () => {
      const children: ReturnType<typeof h>[] = []

      if (props.score !== undefined) {
        const tier = getTier(props.score)
        children.push(
          h('span', {
            class: tier ? `umm-rating-score ${tier}` : 'umm-rating-score',
          }, props.score),
        )
      }

      if (props.count !== undefined && props.count > 0) {
        children.push(h('span', { class: 'umm-rating-count' }, `(${props.count})`))
      }

      if (props.score === undefined) {
        children.push(h('span', { class: 'umm-rating-na' }, '暂无评分'))
      }

      return h('span', { class: 'umm-rating' }, children)
    }
  },
})