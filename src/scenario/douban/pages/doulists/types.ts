export type DoulistCategory = 'movie' | 'music' | 'book' | 'thing_place' | 'other';

export function parseCategory(cls: string): DoulistCategory {
  if (cls.includes('doulist-movie')) return 'movie';
  if (cls.includes('doulist-music')) return 'music';
  if (cls.includes('doulist-book')) return 'book';
  if (cls.includes('doulist-thing_place')) return 'thing_place';
  return 'other';
}

/** 分类徽标文案的 i18n 键（X108：数据层发键，渲染层解析）。 */
export const CATEGORY_LABEL_KEYS: Record<DoulistCategory, string> = {
  movie: 'douban.dl.cat_movie',
  music: 'douban.dl.cat_music',
  book: 'douban.dl.cat_book',
  thing_place: 'douban.dl.cat_thing_place',
  other: 'douban.dl.cat_other',
};

export interface DoulistItem {
  id: string;
  title: string;
  coverUrl: string;
  itemCount: number;
  /** Items the user has already watched (from "看过 X/Y部") */
  watchedCount: number;
  updateTime: string;
  followerCount: number;
  url: string;
  /** Optional intro/description text */
  intro: string;
  /** Category derived from the doulist-category-icon class */
  category: DoulistCategory;
}

/** A category tab in the xbar — e.g. 豆列(62), 片单(52), 书单(2) */
export interface XbarCategory {
  label: string;
  url: string;
  count: number;
  current: boolean;
}

export interface DoulistsPageData {
  userId: string;
  displayName: string;
  avatarUrl: string;
  navLinks: { label: string; url: string }[];
  createdCount: number;
  createdUrl: string;
  collectedCount: number;
  collectedUrl: string;
  activeTab: 'created' | 'collected';
  xbarCategories: XbarCategory[];
  items: DoulistItem[];
  pageLinks: { label: string; url: string; current: boolean }[];
  prevPageUrl: string;
  nextPageUrl: string;
}
