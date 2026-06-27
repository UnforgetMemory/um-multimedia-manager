import { defineComponent, h, type PropType } from 'vue'
import { UmmImage } from './UmmImage'

export const UmmImageWrapper = defineComponent({
  name: 'UmmImageWrapper',
  props: {
    src: { type: String, required: true },
    alt: { type: String, required: true },
    class: { type: String, default: undefined },
    aspectRatio: { type: String, default: undefined },
    eager: { type: Boolean as PropType<boolean>, default: false },
    href: { type: String, default: undefined },
  },
  setup(props) {
    return () => h(UmmImage, { ...props })
  },
})