import { defineComponent, h } from 'vue'
import UmmDynamicIsland from '@/content/douban/components/UmmDynamicIsland.vue'

/**
 * UmmPageLayout — unified page template for all Douban pages.
 *
 * Provides header (UmmDynamicIsland) / content (default slot) / footer structure.
 * Default footer includes native Douban links + GitHub + version.
 * Override via footer slot for custom footer content.
 *
 * Props forwarded to UmmDynamicIsland:
 * - type: 'movie' | 'music' (default 'movie')
 * - newTab: boolean (default true)
 * - initialQuery: string (default '')
 */

function GitHubIcon() {
  return h('svg', { viewBox: '0 0 24 24', width: '18', height: '18', fill: 'currentColor' }, [
    h('path', { d: 'M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z' }),
  ])
}

export const UmmPageLayout = defineComponent({
  name: 'UmmPageLayout',
  props: {
    type: { type: String as () => 'movie' | 'music' | 'book' | 'game', default: 'movie' },
    newTab: { type: Boolean, default: true },
    initialQuery: { type: String, default: '' },
  },
  setup(props, { slots }) {
    const manifest = typeof chrome !== 'undefined' ? chrome.runtime?.getManifest?.() : undefined
    const version = (manifest && typeof manifest === 'object' ? manifest.version : undefined) || '4.7.0'

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

      const defaultFooter = [
        h('div', { class: 'umm-footer-main' }, [
          h('span', { class: 'umm-footer-copyright' },
            '© 2005－2026 douban.com, all rights reserved 北京豆网科技有限公司',
          ),
          h('span', { class: 'umm-footer-links' }, [
            h('a', { href: 'https://www.douban.com/about', target: '_blank' }, '关于豆瓣'),
            ' · ',
            h('a', { href: 'https://www.douban.com/jobs', target: '_blank' }, '在豆瓣工作'),
            ' · ',
            h('a', { href: 'https://www.douban.com/about?topic=contactus', target: '_blank' }, '联系我们'),
            ' · ',
            h('a', { href: 'https://www.douban.com/about/legal', target: '_blank' }, '法律声明'),
            ' · ',
            h('a', {
              href: `https://help.douban.com/?app=${props.type === 'game' ? 'main' : props.type === 'music' ? 'music' : props.type === 'book' ? 'book' : 'movie'}`,
              target: '_blank',
            }, '帮助中心'),
            ' · ',
            h('a', { href: 'https://www.douban.com/doubanapp/', target: '_blank' }, '移动应用'),
          ]),
        ]),
        h('div', { class: 'umm-footer-extra' }, [
          h('a', {
            href: 'https://github.com/UnforgetMemory/um-multimedia-manager',
            target: '_blank',
            class: 'umm-footer-github',
            'aria-label': 'GitHub repository',
          }, [GitHubIcon()]),
          h('span', { class: 'umm-footer-version' },
            `v${version} modify by UM`,
          ),
        ]),
      ]

      const footer = slots.footer
        ? h('footer', { class: 'umm-layout-footer' }, slots.footer())
        : h('footer', { class: 'umm-layout-footer' }, defaultFooter)

      return h('div', { class: 'umm-layout' }, [header, content, footer])
    }
  },
})
