import { defineComponent, h } from 'vue'
import UmmDynamicIsland from '@/content/douban/components/UmmDynamicIsland.vue'

/**
 * UmmPageLayout — unified page template for all Douban pages.
 *
 * Provides header (UmmDynamicIsland) / content (default slot) / footer structure.
 * Footer is an empty placeholder, ready for future cross-cutting features.
 *
 * Props forwarded to UmmDynamicIsland:
 * - type: 'movie' | 'music' (default 'movie')
 * - newTab: boolean (default true)
 * - initialQuery: string (default '')
 */
export const UmmPageLayout = defineComponent({
  name: 'UmmPageLayout',
  props: {
    type: { type: String as () => 'movie' | 'music', default: 'movie' },
    newTab: { type: Boolean, default: true },
    initialQuery: { type: String, default: '' },
  },
  setup(props, { slots }) {
    return () => {
      const header = h('header', { class: 'umm-layout-header' }, [
        h(UmmDynamicIsland, {
          type: props.type,
          newTab: props.newTab,
          initialQuery: props.initialQuery,
        }),
      ])

      const content = h('main', { class: 'umm-layout-content' }, [
        slots.default?.(),
      ])

      const children: ReturnType<typeof h>[] = [header, content]

      if (slots.footer) {
        children.push(h('footer', { class: 'umm-layout-footer' }, slots.footer()))
      } else {
        children.push(h('footer', { class: 'umm-layout-footer' }))
      }

      return h('div', { class: 'umm-layout' }, children)
    }
  },
})