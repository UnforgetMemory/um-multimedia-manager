import { defineComponent, h, type PropType } from 'vue';
import type { StoreRecord } from '@/types';
import { useRecordCache, type RecordCacheDeps } from '../shared/composables/use-record-cache';
import { UmmMediaCard } from './umm-media-card';

/** The recommendation fields this section renders — a subset of each page's rec item type. */
export interface RecSectionItem {
  title: string;
  poster: string;
  link: string;
  subjectId: string;
  /** Subject average score; only shown when `showScore` is set. */
  rating?: string;
}

type RecMediaType = 'movie' | 'music' | 'book' | 'game';

/**
 * Grid of "喜欢的人也喜欢" style recommendations, shared by the detail and
 * game-detail overlays.
 *
 * Badges are *derived* from the live record map on every render — never written
 * back into the extracted rows — so an external write, status change or delete
 * repaints the card in the same document (ADR-015). `recordMap` seeds the first
 * paint from the mount-time batch read.
 */
export const UmmRecSection = defineComponent({
  name: 'UmmRecSection',
  props: {
    items: { type: Array as PropType<RecSectionItem[]>, required: true },
    /** Badge label vocabulary (已看/已听/已读/玩过). */
    mediaType: { type: String as PropType<RecMediaType>, required: true },
    /** `{type}::` prefix of the douban_records keys the badges resolve against. */
    recordPrefix: { type: String, required: true },
    heading: { type: String, required: true },
    recordMap: {
      type: Object as PropType<Map<string, StoreRecord> | undefined>,
      default: undefined,
    },
    /** Douban shows the subject score on film/music/book cards, not on games. */
    showScore: { type: Boolean, default: true },
    /** Bus/DB seam override — production pages leave it undefined (see useRecordCache). */
    cacheDeps: {
      type: Object as PropType<RecordCacheDeps | undefined>,
      default: undefined,
    },
  },
  setup(props) {
    const { records } = useRecordCache(
      props.recordPrefix,
      () => props.items.map((item) => item.subjectId).filter((id) => id.length > 0),
      props.recordMap ?? new Map<string, StoreRecord>(),
      props.cacheDeps,
    );

    return () => {
      if (props.items.length === 0) return null;
      return h('div', { class: 'umm-rec-card' }, [
        h('h3', { class: 'umm-rec-heading' }, props.heading),
        h(
          'div',
          { class: 'umm-rec-grid' },
          props.items.map((item) => {
            const rec = records.value.get(item.subjectId);
            return h(UmmMediaCard, {
              // Stable key: including the status here would remount the card to
              // fake a refresh instead of deriving one.
              key: item.subjectId || item.link,
              mode: 'grid' as const,
              posterUrl: item.poster,
              title: item.title,
              href: item.link,
              badgeStatus: rec?.status ?? 0,
              badgeRating: rec?.rating ?? 0,
              rating: props.showScore ? (item.rating ?? '') : '',
              type: props.mediaType,
            });
          }),
        ),
      ]);
    };
  },
});
