import { defineComponent, h, type PropType } from 'vue'
import { UmmImageWrapper } from './UmmImageWrapper'
import { UmmStatusBadgeWrapper } from './UmmStatusBadgeWrapper'
import { UmmRating } from './UmmRating'

export const UmmMediaCard = defineComponent({
  name: 'UmmMediaCard',
  props: {
    mode: { type: String as PropType<'grid' | 'scroll'>, required: true },
    posterUrl: { type: String, required: true },
    title: { type: String, required: true },
    href: { type: String, default: '' },
    badgeStatus: { type: Number, default: 0 },
    badgeRating: { type: Number, default: 0 },
    rating: { type: String, default: '' },
    episodes: { type: String, default: '' },
    intro: { type: String, default: '' },
  },
  setup(props) {
    const handleClick = () => {
      if (props.mode === 'grid' && props.href) {
        window.open(props.href, '_blank')
      }
    }

    const badgeVariant = props.mode === 'grid' ? 'small' : 'inline'

    if (props.mode === 'grid') {
      return () =>
        h(
          'div',
          {
            class: 'umm-rec-item',
            onClick: handleClick,
            style: { cursor: 'pointer' },
          },
          [
            h(UmmStatusBadgeWrapper, {
              status: props.badgeStatus,
              rating: props.badgeRating,
              variant: badgeVariant,
            }),
            h('div', { class: 'umm-rec-cover' }, [
              h(UmmImageWrapper, {
                src: props.posterUrl,
                alt: props.title,
                aspectRatio: '2/3',
              }),
            ]),
            h('span', { class: 'umm-rec-title' }, props.title),
            h(
              'span',
              { class: 'umm-rec-rating' },
              props.rating || '暂无评分',
            ),
          ],
        )
    }

    // scroll mode
    return () =>
      h(
        'a',
        {
          href: props.href,
          class: 'umm-card',
          target: '_blank',
          rel: 'noopener noreferrer',
          title: props.intro || undefined,
        },
        [
          h(UmmStatusBadgeWrapper, {
            status: props.badgeStatus,
            rating: props.badgeRating,
            variant: badgeVariant,
          }),
          h('div', { class: 'umm-card-cover' }, [
            h(UmmImageWrapper, {
              src: props.posterUrl,
              alt: props.title,
              eager: true,
            }),
            props.episodes
              ? h('div', { class: 'umm-episodes' }, props.episodes)
              : null,
          ]),
          h('div', { class: 'umm-card-title' }, props.title),
          h(UmmRating, {
            score: props.rating || undefined,
            class: 'umm-card-rating',
          }),
        ],
      )
  },
})
