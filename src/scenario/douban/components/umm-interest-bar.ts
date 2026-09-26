/**
 * Interest-marking bar (想看/在看/已看) with star rating, tags, and comment dialog.
 * Emits `save` with tab, stars, tags, and comment for the parent to submit.
 *
 * 对话框可访问性（P-D）：role=dialog + aria-modal + aria-labelledby；Escape 关闭；
 * Tab/Shift+Tab 在面板内循环（焦点陷阱，document 捕获阶段监听——键盘事件为
 * composed，Shadow DOM 内也可达）；打开聚焦首个可聚焦控件，关闭焦点归还触发按钮。
 * 与 Sehuatang 菜单（entrypoints/content/handlers/sehuatang-menu.ts）有意各留一份
 * 陷阱实现：当前仅 2 个消费方，未达「第三处消费证据」提取门槛。
 */
import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import type { MediaType } from '../shared/status-labels';
import { interestBarLabels } from '../shared/status-labels';
import { t } from '../shared/legacy-bridge';

const RATING_LABELS = ['', '很差', '较差', '还行', '推荐', '力荐'] as const;

/** 面板内可聚焦控件（与 sehuatang-menu 焦点陷阱同一选择器基准） */
const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

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

    function panelFocusables(): HTMLElement[] {
      if (!panelEl.value) return [];
      return Array.from(panelEl.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    }

    /**
     * 捕获阶段 keydown：Escape 关闭 + Tab 焦点陷阱。
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
      if (e.key !== 'Tab') return;
      const panel = panelEl.value;
      if (!panel) return;
      const focusables = panelFocusables();
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const root = panel.getRootNode() as Document | ShadowRoot;
      const active = root.activeElement;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
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
      panelFocusables()[0]?.focus();
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
          const lbl = stars.value >= 1 && stars.value <= 5 ? RATING_LABELS[stars.value] : '评分';
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
              placeholder: '自定义标签',
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
              '添加',
            ),
          ]),
        );

        dc.push(h('div', { class: 'umm-dialog-tags' }, tagSection));

        dc.push(
          h('textarea', {
            class: 'umm-dialog-textarea',
            placeholder: '写点评论…',
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
              props.loading ? '保存中…' : '保存',
            ),
            h(
              'button',
              {
                class: 'umm-dialog-cancel',
                disabled: props.loading,
                onClick: close,
              },
              '取消',
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
              role: 'dialog',
              'aria-modal': 'true',
              'aria-labelledby': titleId,
            },
            [
              h('div', { class: 'umm-dialog-header' }, [
                h('span', { class: 'umm-dialog-title', id: titleId }, '标记'),
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
