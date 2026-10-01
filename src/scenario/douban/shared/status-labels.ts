/**
 * Centralized status → label mappings for Douban overlay UI.
 *
 * Two semantically distinct families (per ADR-009):
 * 1. interestBarLabels — interest-marking buttons (wish/do/collect/mark)
 * 2. statusBadgeLabels — status display badges (done/wish/none/doing)
 *
 * Decision-1: game done text is '玩过' (not '已玩') across both families — the
 * unit test on the zh-CN dictionary pins that value, so it can no longer drift.
 *
 * Values are resolved through the content i18n at ACCESS time (getters), not at
 * module load: the tables are consumed during render, and a module-scope
 * `t(...)` would freeze whatever locale happened to be resolved when this file
 * was first evaluated — the Options page changing language would then affect
 * every string except these.
 */

import { t } from './legacy-bridge';

export type MediaType = 'movie' | 'music' | 'book' | 'game';

/** Interest bar button labels (wish/do/collect/mark) */
export type InterestBarKey = 'wish' | 'do' | 'collect' | 'mark';
export type InterestBarLabels = Record<InterestBarKey, string>;

/** Status badge display labels (done/wish/none/doing) */
export type StatusBadgeKey = 'done' | 'wish' | 'none' | 'doing';
export type StatusBadgeLabels = Record<StatusBadgeKey, string>;

const key = (state: StatusBadgeKey, media: MediaType): string => `douban.status.${state}_${media}`;

/**
 * One key family serves both consumers: the bar's `collect` slot and the badge's
 * `done` state are the same verdict in Douban's own vocabulary, so giving them
 * separate keys would let the two drift apart in one language and read as two
 * different statuses for the same record.
 */
const labelsFor = (media: MediaType): InterestBarLabels & StatusBadgeLabels => ({
  get wish() {
    return t(key('wish', media));
  },
  get do() {
    return t(key('doing', media));
  },
  get doing() {
    return t(key('doing', media));
  },
  get collect() {
    return t(key('done', media));
  },
  get done() {
    return t(key('done', media));
  },
  get none() {
    return t(key('none', media));
  },
  get mark() {
    return t('douban.btn.mark');
  },
});

/** Interest bar labels per media type. Used in UmmInterestBar. */
export const interestBarLabels: Record<MediaType, InterestBarLabels> = {
  movie: labelsFor('movie'),
  music: labelsFor('music'),
  book: labelsFor('book'),
  game: labelsFor('game'),
};

/** Status badge labels per media type. Used in UmmStatusBadge and collect page titles. */
export const statusBadgeLabels: Record<MediaType, StatusBadgeLabels> = {
  movie: labelsFor('movie'),
  music: labelsFor('music'),
  book: labelsFor('book'),
  game: labelsFor('game'),
};
