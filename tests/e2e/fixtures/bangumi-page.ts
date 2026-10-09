/**
 * Bangumi (bangumi.tv) browse-list page builder for the legacy e2e pipeline.
 *
 * DOM contract source: src/entrypoints/content/handlers/bangumi-list-extract.ts
 * (`<ul id="browserItemList" class="browserFull browser-list">` +
 * `<li id="item_{subjectId}" class="item …">` with an `.inner` injection
 * anchor). Shape mirrors .localref/bangumi/pages/anime_browser.html.
 */

export interface BangumiListItem {
  subjectId: string;
  title: string;
  /** Seeded status in bangumi_records (`{type}::{providerId}`); null → no record. */
  status: number | null;
  rating: number;
  /** Decoy: non-numeric li id must never be marked. */
  decoyId?: string;
}

/** Keys on bangumi.tv are `tv::{subjectId}` for anime (bangumiTypePrefix). */
export const BANGUMI_LIST_ITEMS: BangumiListItem[] = [
  { subjectId: '545465', title: '已看条目甲', status: 2, rating: 8 },
  { subjectId: '301234', title: '想看条目乙', status: 1, rating: 0 },
  { subjectId: '222333', title: '在看条目丙', status: 3, rating: 6.5 },
  { subjectId: '110122', title: '无记录条目丁', status: null, rating: 0 },
  { subjectId: '', title: '结构异常条目戊', status: null, rating: 0, decoyId: 'item_not_a_number' },
];

export function bangumiBrowserListHtml(items: readonly BangumiListItem[] = BANGUMI_LIST_ITEMS) {
  const rows = items.map((item) => {
    const liId = item.decoyId ?? `item_${item.subjectId}`;
    const href = item.decoyId ? '/subject/0/' : `/subject/${item.subjectId}/`;
    return `
      <li id="${liId}" class="item odd clearit">
        <div class="inner">
          <span class="play"><a href="${href}ep">剧集列表</a></span>
          <a class="tip" href="${href}"><img src="/images/cropped.png" width="48" height="48" alt="" /></a>
          <div class="info">
            <h3><a class="a" href="${href}">${item.title}</a></h3>
            <p class="avg-rating"><strong>7.8</strong></p>
          </div>
        </div>
      </li>`;
  });
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>动画浏览 - Bangumi</title></head>
  <body>
    <div id="headerSubject" class="menu">
      <ul><li><a href="/anime">动画</a></li><li><a href="/anime/browser">浏览</a></li></ul>
    </div>
    <div class="leftSec">
      <div class="section">
        <ul id="browserItemList" class="browserFull browser-list">
${rows.join('\n')}
        </ul>
      </div>
    </div>
  </body>
</html>`;
}
