/**
 * Interest-marking bar (想看/在看/已看) with star rating, tags, and comment dialog.
 * Emits `save` with tab, stars, tags, and comment for the parent to submit.
 */
import { defineComponent, h, ref } from 'vue'

const RATING_LABELS = ['', '很差', '较差', '还行', '推荐', '力荐'] as const

export const UmmInterestBar = defineComponent({
  name: 'UmmInterestBar',
  props: {
    status: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    myTags: { type: Array as () => string[], default: () => [] },
    savedTags: { type: Array as () => string[], default: () => [] },
    hasDo: { type: Boolean, default: false },
    comment: { type: String, default: '' },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' },
    type: { type: String as () => 'movie' | 'music' | 'book', default: 'movie' },
  },
  emits: ['save'],
  setup(props, { emit }) {
    const open = ref(false)
    const tab = ref<'wish' | 'do' | 'collect' | null>(null)
    const stars = ref(0)
    const selectedTags = ref(new Set<string>())
    const newTagText = ref('')
    const inputComment = ref('')

    function openDialog(): void {
      if (props.loading) return
      // Map Douban status enums to dialog tabs: 3=do, 1=wish, 2=collect
      tab.value = props.status > 0
    ? (props.status === 3 ? 'do' : props.status === 1 ? 'wish' : 'collect')
    : null
      stars.value = props.rating
      selectedTags.value = new Set(props.savedTags)
      newTagText.value = ''
      inputComment.value = props.comment
      open.value = true
    }

    function close(): void {
      open.value = false
    }

    function toggleTag(tag: string): void {
      const s = new Set(selectedTags.value)
      if (s.has(tag)) s.delete(tag)
      else s.add(tag)
      selectedTags.value = s
    }

    function addNewTag(): void {
      const t = newTagText.value.trim()
      if (!t) return
      const s = new Set(selectedTags.value)
      s.add(t)
      selectedTags.value = s
      newTagText.value = ''
    }

    function handleSave(): void {
      if (props.loading || !tab.value) return
      const tagsStr = Array.from(selectedTags.value).join(' ')
      emit('save', tab.value, stars.value, tagsStr, inputComment.value.trim())
      close()
    }

    function cls(...parts: Array<string | false | null | undefined>): string {
      return parts.filter(Boolean).join(' ')
    }

    return () => {
      const L = props.type === 'music'
        ? { wish: '想听', do: '在听', collect: '已听', mark: '标记' }
        : props.type === 'book'
        ? { wish: '想读', do: '在读', collect: '已读', mark: '标记' }
        : { wish: '想看', do: '在看', collect: '已看', mark: '标记' }
      const btnLabel = props.status === 1 ? L.wish : props.status === 3 ? L.do : props.status === 2 ? L.collect : L.mark
      const showRating = props.rating > 0 && (props.status === 2 || props.status === 3)
      const children: ReturnType<typeof h>[] = []

      children.push(
        h('button', {
          class: cls('umm-mark-btn', props.status > 0 && 'umm-mark-btn--active'),
          disabled: props.loading,
          onClick: openDialog,
        }, [btnLabel]),
      )
      if (showRating) {
        children.push(
          h('div', { class: 'umm-mark-score' }, [
            h('span', { class: 'umm-mark-score-num' }, String(props.rating * 2)),
            h('span', { class: 'umm-mark-score-unit' }, '/10'),
          ]),
        )
      }

      if (open.value) {
        const dc: ReturnType<typeof h>[] = []

        const pickerRow: ReturnType<typeof h>[] = [
          h('button', {
            class: cls('umm-dialog-pick', tab.value === 'wish' && 'umm-dialog-pick--active'),
            onClick: () => { tab.value = 'wish' },
            type: 'button',
          }, L.wish),
        ]
        if (props.hasDo) {
          pickerRow.push(h('span', { class: 'umm-dialog-sep' }))
          pickerRow.push(h('button', {
            class: cls('umm-dialog-pick', tab.value === 'do' && 'umm-dialog-pick--active'),
            onClick: () => { tab.value = 'do' },
            type: 'button',
          }, L.do))
        }
        pickerRow.push(
          h('span', { class: 'umm-dialog-sep' }),
          h('button', {
            class: cls('umm-dialog-pick', tab.value === 'collect' && 'umm-dialog-pick--active'),
            onClick: () => { tab.value = 'collect' },
            type: 'button',
          }, L.collect),
        )
        dc.push(h('div', { class: 'umm-dialog-pickrow' }, pickerRow))

        if (tab.value === 'collect' || tab.value === 'do') {
          const sc: ReturnType<typeof h>[] = []
          for (let i = 1; i <= 5; i++) {
            sc.push(
              h('button', {
                class: cls('umm-star', i <= stars.value && 'umm-star--filled'),
                onClick: () => { stars.value = i },
                type: 'button',
              }, ''),
            )
          }
          const lbl = stars.value >= 1 && stars.value <= 5 ? RATING_LABELS[stars.value] : '评分'
          sc.push(h('span', { class: 'umm-star-label' }, lbl))
          dc.push(h('div', { class: 'umm-dialog-stars' }, sc))
        }

        const tagSection: ReturnType<typeof h>[] = []

        if (props.myTags.length > 0) {
          const chips: ReturnType<typeof h>[] = []
          for (const t of props.myTags) {
            const active = selectedTags.value.has(t)
            chips.push(
              h('button', {
                class: cls('umm-tag-chip', active && 'umm-tag-chip--active'),
                onClick: () => toggleTag(t),
                type: 'button',
              }, active ? `${t} ✓` : `+ ${t}`),
            )
          }
          tagSection.push(h('div', { class: 'umm-tag-suggest' }, chips))
        }

        if (selectedTags.value.size > 0) {
          const chips: ReturnType<typeof h>[] = []
          for (const t of selectedTags.value) {
            chips.push(
              h('span', { class: 'umm-tag-selected' }, [
                h('span', null, t),
                h('button', {
                  class: 'umm-tag-remove',
                  onClick: () => toggleTag(t),
                  type: 'button',
                }, '✕'),
              ]),
            )
          }
          tagSection.push(h('div', { class: 'umm-tag-list' }, chips))
        }

        tagSection.push(
          h('div', { class: 'umm-tag-add' }, [
            h('input', {
              class: 'umm-dialog-input',
              placeholder: '自定义标签',
              value: newTagText.value,
              disabled: props.loading,
              onKeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); addNewTag() } },
              onInput: (e: Event) => { newTagText.value = (e.target as HTMLInputElement).value },
            }),
            h('button', {
              class: 'umm-tag-add-btn',
              disabled: !newTagText.value.trim() || props.loading,
              onClick: addNewTag,
              type: 'button',
            }, '添加'),
          ]),
        )

        dc.push(h('div', { class: 'umm-dialog-tags' }, tagSection))

        dc.push(
          h('textarea', {
            class: 'umm-dialog-textarea',
            placeholder: '写点评论…',
            maxlength: 350,
            rows: 3,
            value: inputComment.value,
            disabled: props.loading,
            onInput: (e: Event) => { inputComment.value = (e.target as HTMLTextAreaElement).value },
          }),
          h('div', { class: 'umm-dialog-charcount' }, `${inputComment.value.length}/350`),
        )

        if (props.error) {
          dc.push(h('div', { class: 'umm-dialog-error' }, props.error))
        }

        const saveDisabled = props.loading || !tab.value
        dc.push(
          h('div', { class: 'umm-dialog-btns' }, [
            h('button', {
              class: 'umm-dialog-save',
              disabled: saveDisabled,
              onClick: handleSave,
            }, props.loading ? '保存中…' : '保存'),
            h('button', {
              class: 'umm-dialog-cancel',
              disabled: props.loading,
              onClick: close,
            }, '取消'),
          ]),
        )

        children.push(
          h('div', { class: 'umm-dialog-overlay', onClick: close }),
          h('div', { class: 'umm-dialog-panel' }, [
            h('div', { class: 'umm-dialog-header' }, [
              h('span', { class: 'umm-dialog-title' }, '标记'),
              h('button', { class: 'umm-dialog-close', onClick: close }, '✕'),
            ]),
            h('div', { class: 'umm-dialog-body' }, dc),
          ]),
        )
      }

      return h('div', { class: 'umm-interest-bar' }, children)
    }
  },
})