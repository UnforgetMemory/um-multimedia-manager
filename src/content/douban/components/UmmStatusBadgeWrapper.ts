import { defineComponent, h, type PropType } from 'vue'
import { UmmStatusBadge } from './UmmStatusBadge'

export const UmmStatusBadgeWrapper = defineComponent({
  name: 'UmmStatusBadgeWrapper',
  props: {
    status: { type: Number, required: true },
    rating: { type: Number, default: undefined },
    variant: { type: String as PropType<'default' | 'small' | 'inline'>, default: 'default' },
  },
  setup(props) {
    return () => h(UmmStatusBadge, { ...props })
  },
})