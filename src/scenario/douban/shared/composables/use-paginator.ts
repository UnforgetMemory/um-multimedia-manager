/**
 * usePaginator — shared pagination logic for Douban list/collect pages.
 *
 * Consolidates the copy-pasted currentPage / totalPages / onPageChange /
 * isSafeDoubanUrl quartet that existed in 6+ page App.vue files
 * (music-collect, book-collect, game-collect, user-media, book-authors,
 * user-celebrities, doulists).
 *
 * @param pageLinks  — paginator links from the page data ({ label, url, current })
 * @param prevPageUrl / nextPageUrl — adjacent page URLs from page data
 */
import { computed } from 'vue';

interface PageLink {
  label: string;
  url?: string;
  current?: boolean;
}

/** Validate URL is a same-origin Douban link before programmatic navigation */
export function isSafeDoubanUrl(url: string): boolean {
  return /^https?:\/\/([a-z0-9-]+\.)*douban\.com\//.test(url);
}

export function usePaginator(
  pageLinks: () => PageLink[],
  prevPageUrl: () => string | undefined,
  nextPageUrl: () => string | undefined,
) {
  /** Derive the current page number from paginator link */
  const currentPage = computed(() => {
    const current = pageLinks().find((p) => p.current);
    if (!current) return 1;
    const n = parseInt(current.label, 10);
    return isNaN(n) ? 1 : n;
  });

  /** Derive total page count from the last paginator link label */
  const totalPages = computed(() => {
    const links = pageLinks();
    if (links.length === 0) return 1;
    const last = links[links.length - 1]?.label;
    if (last === undefined) return 1;
    const n = parseInt(last, 10);
    return isNaN(n) ? 1 : n;
  });

  /** Navigate to the URL for the requested page */
  function onPageChange(page: number): void {
    const link = pageLinks().find((p) => p.label === String(page));
    if (link?.url) {
      if (isSafeDoubanUrl(link.url)) window.location.href = link.url;
      return;
    }
    const adjacent =
      page < currentPage.value
        ? prevPageUrl()
        : page > currentPage.value
          ? nextPageUrl()
          : undefined;
    if (adjacent && isSafeDoubanUrl(adjacent)) window.location.href = adjacent;
  }

  return { currentPage, totalPages, onPageChange };
}
