import { ref, defineComponent, h } from 'vue'

/**
 * UmmImage — image renderer with shimmer loading overlay.
 *
 * Renders an <img> always visible in DOM (no display:none) so the browser
 * fires load events reliably. A position:absolute shimmer sits on top via
 * z-index until onLoad/onError fires, then gets removed via conditional render.
 */
export const UmmImage = defineComponent({
  name: 'UmmImage',
  props: {
    src: { type: String, required: true },
    alt: { type: String, required: true },
    class: { type: String, default: 'umm-image-img' },
    aspectRatio: { type: String, default: undefined },
    eager: { type: Boolean, default: false },
    href: { type: String, default: undefined },
  },
  setup(props) {
    const loaded = ref(false)

    return () => {
      const img = h('img', {
        src: props.src,
        alt: props.alt,
        class: props.class,
        loading: props.eager ? 'eager' : 'lazy',
        style: {
          width: '100%',
          height: '100%',
          objectFit: 'cover' as const,
          display: 'block',
        },
        onLoad: () => { loaded.value = true },
        onError: () => { loaded.value = true },
      })

      const shimmer = loaded.value
        ? null
        : h('div', {
            class: 'umm-img-shimmer',
            style: {
              position: 'absolute',
              inset: '0',
              zIndex: '1',
            },
          })

      const containerStyle: Record<string, string> = {
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'inherit',
        width: '100%',
      }
      if (props.aspectRatio) {
        containerStyle.aspectRatio = props.aspectRatio
      }

      const content = [img, shimmer].filter(Boolean)

      if (props.href) {
        return h('a', {
          href: props.href,
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'umm-image-container',
          style: containerStyle,
        }, content)
      }

      return h('div', {
        class: 'umm-image-container',
        style: containerStyle,
      }, content)
    }
  },
})