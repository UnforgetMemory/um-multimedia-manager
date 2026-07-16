import { defineComponent, h, type PropType } from 'vue'
import { UmmImageWrapper } from './UmmImageWrapper'
import { UmmStatusBadgeWrapper } from './UmmStatusBadgeWrapper'
import { UmmRating } from './UmmRating'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'

export const UmmMediaCard = defineComponent({
  name: 'UmmMediaCard',
  props: {
    mode: { type: String as PropType<'grid' | 'scroll'>, required: true },
    posterUrl: { type: String, required: true },
    title: { type: String, required: true },
    href: { type: String, default: '' },
    author: { type: String, default: '' },
    badgeStatus: { type: Number, default: 0 },
    badgeRating: { type: Number, default: 0 },
    rating: { type: String, default: '' },
    episodes: { type: String, default: '' },
    intro: { type: String, default: '' },
    type: { type: String as PropType<'movie' | 'music' | 'book' | 'game'>, default: 'movie' },
  },
  setup(props) {
    const handleClick = () => {
      if (props.mode === 'grid' && props.href) {
        window.open(props.href, '_blank')
      }
    }

    const badgeVariant = props.mode === 'grid' ? 'small' : 'inline'
    const cardAspect = props.type === 'music' ? ASPECT_RATIO.SQUARE : ASPECT_RATIO.POSTER

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
              type: props.type,
            }),
            h('div', { class: 'umm-rec-cover' }, [
              h(UmmImageWrapper, {
                src: props.posterUrl,
                alt: props.title,
                aspectRatio: cardAspect,
              }),
            ]),
h('span', { class: 'umm-rec-title' }, props.title),
      props.author
        ? h('span', { class: 'umm-rec-author' }, props.author)
        : null,
      h(UmmRating, {
              score: props.rating || undefined,
            }),
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
            type: props.type,
          }),
          h('div', { class: 'umm-card-cover' }, [
            h(UmmImageWrapper, {
              src: props.posterUrl,
              alt: props.title,
              eager: true,
              aspectRatio: cardAspect,
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
