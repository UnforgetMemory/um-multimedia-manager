/**
 * Interest-marking bar (想看/在看/已看) with star rating, tags, and comment dialog.
 * Emits `save` with tab, stars, tags, and comment for the parent to submit.
 *
 * 对话框可访问性走 `libraries/ui-contracts/dialog-aria` + `libraries/utils/focus-trap`
 * （与 sehuatang-menu / doulist-dialog 同一契约实现）——overlay 组件库合并波的
 * DOM 契约层统一。Escape 关闭；Tab/Shift+Tab 在面板内循环（document 捕获阶段
 * 监听——键盘事件为 composed，Shadow DOM 内也可达）。
 */
import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import type { MediaType } from '../shared/status-labels';
import { interestBarLabels } from '../shared/status-labels';
import { t } from '../shared/legacy-bridge';
import { dialogAriaAttrs } from '@/libraries/ui-contracts/dialog-aria';
import { focusFirst, handleTrapTabKey } from '@/libraries/utils/focus-trap';

const RATING_KEYS = [
  'douban.rating.1',
  'douban.rating.2',
  'douban.rating.3',
  'douban.rating.4',
  'douban.rating.5',
] as const;

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
    type: { type: String as () => 'movie' | 'music' | 'book' | 'game', default: 'movie' },
  },
  emits: ['save'],
  setup(props, { emit }) {
    const open = ref(false);
    const tab = ref<'wish' | 'do' | 'collect' | null>(null);
    const stars = ref(0);
    const selectedTags = ref(new Set<string>());
    const newTagText = ref('');
    const inputComment = ref('');

    // ── 对话框焦点管理（role=dialog 配套：初始焦点 / 焦点陷阱 / 焦点归还） ──
    const triggerEl = ref<HTMLElement | null>(null);
    const panelEl = ref<HTMLElement | null>(null);
    const titleId = useId();

    /**
     * 捕获阶段 keydown：Escape 关闭 + Tab 焦点陷阱（共享 `handleTrapTabKey`）。
     * 监听挂在 document 上——overlay 位于 Shadow DOM，键盘事件 composed 冒穿至
     * document；捕获阶段先于宿主页面自身监听器，可安全 stopPropagation。
     */
    function onDocumentKeydown(e: KeyboardEvent): void {
      if (!open.value) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      const panel = panelEl.value;
      if (!panel) return;
      handleTrapTabKey(e, panel);
    }

    onMounted(() => {
      document.addEventListener('keydown', onDocumentKeydown, true);
    });
    onBeforeUnmount(() => {
      document.removeEventListener('keydown', onDocumentKeydown, true);
    });

    watch(open, async (isOpen) => {
      if (!isOpen) return;
      await nextTick();
      focusFirst(panelEl.value!);
    });

    function openDialog(): void {
      if (props.loading) return;
      // Map Douban status enums to dialog tabs: 3=do, 1=wish, 2=collect
      tab.value =
        props.status > 0
          ? props.status === 3
            ? 'do'
            : props.status === 1
              ? 'wish'
              : 'collect'
          : null;
      stars.value = props.rating;
      selectedTags.value = new Set(props.savedTags);
      newTagText.value = '';
      inputComment.value = props.comment;
      open.value = true;
    }

    function close(): void {
      if (!open.value) return;
      open.value = false;
      triggerEl.value?.focus();
    }

    function toggleTag(tag: string): void {
      const s = new Set(selectedTags.value);
      if (s.has(tag)) s.delete(tag);
      else s.add(tag);
      selectedTags.value = s;
    }

    function addNewTag(): void {
      const t = newTagText.value.trim();
      if (!t) return;
      const s = new Set(selectedTags.value);
      s.add(t);
      selectedTags.value = s;
      newTagText.value = '';
    }

    function handleSave(): void {
      if (props.loading || !tab.value) return;
      const tagsStr = Array.from(selectedTags.value).join(' ');
      emit('save', tab.value, stars.value, tagsStr, inputComment.value.trim());
      close();
    }

    function cls(...parts: Array<string | false | null | undefined>): string {
      return parts.filter(Boolean).join(' ');
    }

    return () => {
      const L = interestBarLabels[(props.type as MediaType) ?? 'movie'];
      const btnLabel =
        props.status === 1
          ? L.wish
          : props.status === 3
            ? L.do
            : props.status === 2
              ? L.collect
              : L.mark;
      const showRating = props.rating > 0 && (props.status === 2 || props.status === 3);
      const children: ReturnType<typeof h>[] = [];

      children.push(
        h(
          'button',
          {
            ref: triggerEl,
            class: cls('umm-mark-btn', props.status > 0 && 'umm-mark-btn--active'),
            disabled: props.loading,
            onClick: openDialog,
          },
          [btnLabel],
        ),
      );
      if (showRating) {
        children.push(
          h('div', { class: 'umm-mark-score' }, [
            h('span', { class: 'umm-mark-score-num' }, String(props.rating * 2)),
            h('span', { class: 'umm-mark-score-unit' }, '/10'),
          ]),
        );
      }

      if (open.value) {
        const dc: ReturnType<typeof h>[] = [];

        const pickerRow: ReturnType<typeof h>[] = [
          h(
            'button',
            {
              class: cls('umm-dialog-pick', tab.value === 'wish' && 'umm-dialog-pick--active'),
              'data-umm-pick': 'wish',
              onClick: () => {
                tab.value = 'wish';
              },
              type: 'button',
            },
            L.wish,
          ),
        ];
        if (props.hasDo) {
          pickerRow.push(h('span', { class: 'umm-dialog-sep' }));
          pickerRow.push(
            h(
              'button',
              {
                class: cls('umm-dialog-pick', tab.value === 'do' && 'umm-dialog-pick--active'),
                'data-umm-pick': 'do',
                onClick: () => {
                  tab.value = 'do';
                },
                type: 'button',
              },
              L.do,
            ),
          );
        }
        pickerRow.push(
          h('span', { class: 'umm-dialog-sep' }),
          h(
            'button',
            {
              class: cls('umm-dialog-pick', tab.value === 'collect' && 'umm-dialog-pick--active'),
              'data-umm-pick': 'collect',
              onClick: () => {
                tab.value = 'collect';
              },
              type: 'button',
            },
            L.collect,
          ),
        );
        dc.push(h('div', { class: 'umm-dialog-pickrow' }, pickerRow));

        if (tab.value === 'collect' || tab.value === 'do') {
          const sc: ReturnType<typeof h>[] = [];
          for (let i = 1; i <= 5; i++) {
            sc.push(
              h(
                'button',
                {
                  class: cls('umm-star', i <= stars.value && 'umm-star--filled'),
                  onClick: () => {
                    stars.value = i;
                  },
                  type: 'button',
                },
                '',
              ),
            );
          }
          const key =
            stars.value >= 1 && stars.value <= 5 ? RATING_KEYS[stars.value - 1] : undefined;
          const lbl = t(key ?? 'douban.rating.none');
          sc.push(h('span', { class: 'umm-star-label' }, lbl));
          dc.push(h('div', { class: 'umm-dialog-stars' }, sc));
        }

        const tagSection: ReturnType<typeof h>[] = [];

        if (props.myTags.length > 0) {
          const chips: ReturnType<typeof h>[] = [];
          for (const t of props.myTags) {
            const active = selectedTags.value.has(t);
            chips.push(
              h(
                'button',
                {
                  class: cls('umm-tag-chip', active && 'umm-tag-chip--active'),
                  onClick: () => toggleTag(t),
                  type: 'button',
                },
                active ? `${t} ✓` : `+ ${t}`,
              ),
            );
          }
          tagSection.push(h('div', { class: 'umm-tag-suggest' }, chips));
        }

        if (selectedTags.value.size > 0) {
          const chips: ReturnType<typeof h>[] = [];
          for (const t of selectedTags.value) {
            chips.push(
              h('span', { class: 'umm-tag-selected' }, [
                h('span', null, t),
                h(
                  'button',
                  {
                    class: 'umm-tag-remove',
                    onClick: () => toggleTag(t),
                    type: 'button',
                  },
                  '✕',
                ),
              ]),
            );
          }
          tagSection.push(h('div', { class: 'umm-tag-list' }, chips));
        }

        tagSection.push(
          h('div', { class: 'umm-tag-add' }, [
            h('input', {
              class: 'umm-dialog-input',
              placeholder: t('Custom Tag Placeholder'),
              value: newTagText.value,
              disabled: props.loading,
              onKeydown: (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addNewTag();
                }
              },
              onInput: (e: Event) => {
                newTagText.value = (e.target as HTMLInputElement).value;
              },
            }),
            h(
              'button',
              {
                class: 'umm-tag-add-btn',
                disabled: !newTagText.value.trim() || props.loading,
                onClick: addNewTag,
                type: 'button',
              },
              t('douban.dialog.add'),
            ),
          ]),
        );

        dc.push(h('div', { class: 'umm-dialog-tags' }, tagSection));

        dc.push(
          h('textarea', {
            class: 'umm-dialog-textarea',
            placeholder: t('Write Comment Placeholder'),
            maxlength: 350,
            rows: 3,
            value: inputComment.value,
            disabled: props.loading,
            onInput: (e: Event) => {
              inputComment.value = (e.target as HTMLTextAreaElement).value;
            },
          }),
          h('div', { class: 'umm-dialog-charcount' }, `${inputComment.value.length}/350`),
        );

        if (props.error) {
          dc.push(h('div', { class: 'umm-dialog-error' }, props.error));
        }

        const saveDisabled = props.loading || !tab.value;
        dc.push(
          h('div', { class: 'umm-dialog-btns' }, [
            h(
              'button',
              {
                class: 'umm-dialog-save',
                disabled: saveDisabled,
                onClick: handleSave,
              },
              props.loading ? t('douban.dialog.saving') : t('douban.dialog.save'),
            ),
            h(
              'button',
              {
                class: 'umm-dialog-cancel',
                disabled: props.loading,
                onClick: close,
              },
              t('douban.dialog.cancel'),
            ),
          ]),
        );

        children.push(
          // 遮罩：纯装饰 + 指针点击关闭；键盘关闭路径为 Escape / 取消 / ✕。
          h('div', { class: 'umm-dialog-overlay', 'aria-hidden': 'true', onClick: close }),
          h(
            'div',
            {
              ref: panelEl,
              class: 'umm-dialog-panel',
              ...dialogAriaAttrs({ labelledBy: titleId }),
            },
            [
              h('div', { class: 'umm-dialog-header' }, [
                h('span', { class: 'umm-dialog-title', id: titleId }, t('douban.btn.mark')),
                h(
                  'button',
                  {
                    class: 'umm-dialog-close',
                    type: 'button',
                    'aria-label': t('Close'),
                    onClick: close,
                  },
                  '✕',
                ),
              ]),
              h('div', { class: 'umm-dialog-body' }, dc),
            ],
          ),
        );
      }

      return h('div', { class: 'umm-interest-bar' }, children);
    };
  },
});
