/**
 * Bilibili homepage listing builder for the real-browser chunking test.
 *
 * DOM contract source: src/entrypoints/content/ui/bilibili-listing.ts —
 * root `.bili-feed4-layout` (LISTING_ROOT_SELECTORS, the MutationObserver
 * target) and `.bili-video-card` items whose `/video/BV…` anchor yields the
 * bvid (extractBvidFromCard). The cover node is a BADGE_ANCHOR_SELECTORS
 * member, so badges mount there.
 *
 * Deliberately NOT nested in `.upload-video-card` / `.list-video-item` /
 * `.video-list__item`: those shells would take the dim class instead of the
 * card (findDimShell's exclusive shell-XOR-card rule).
 */

export const BILIBILI_CARD_COUNT = 200;
/** First N cards get a seeded DONE record; the rest stay unmarked controls. */
export const BILIBILI_WATCHED_COUNT = 30;

export interface BiliCard {
  bvid: string;
  title: string;
  watched: boolean;
}

export function makeBiliCards(
  count = BILIBILI_CARD_COUNT,
  watched = BILIBILI_WATCHED_COUNT,
): BiliCard[] {
  return Array.from({ length: count }, (_, i) => ({
    // Canonical bvid shape the extractor accepts: BV + alnum run.
    bvid: `BV1e${String(i).padStart(9, '0')}`,
    title: `E2E 视频 ${i}`,
    watched: i < watched,
  }));
}

/** storeKey() in video-overlay-pure.ts: video platforms canonicalise to `movie::`. */
export function biliStoreKey(card: BiliCard): string {
  return `movie::${card.bvid}`;
}

export function bilibiliHomepageHtml(cards: readonly BiliCard[]): string {
  const items = cards
    .map(
      (card) => `
      <div class="bili-video-card" data-card-id="${card.bvid}">
        <div class="bili-video-card__wrap">
          <div class="bili-video-card__cover">
            <a class="bili-video-card__cover--shadow" href="/video/${card.bvid}/"></a>
          </div>
          <h3 class="bili-video-card__info--title"><a href="/video/${card.bvid}/">${card.title}</a></h3>
        </div>
      </div>`,
    )
    .join('');
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>哔哩哔哩 (゜-゜)つロ 干杯~-bilibili</title></head>
  <body>
    <div id="app">
      <div class="bili-feed4">
        <div class="bili-feed4-layout">
${items}
        </div>
      </div>
    </div>
  </body>
</html>`;
}
