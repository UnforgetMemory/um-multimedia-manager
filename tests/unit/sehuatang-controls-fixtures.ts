import { JSDOM } from 'jsdom';

/**
 * sehuatang-controls 拆分 specs 的共享夹具（自 sehuatang-controls.spec.ts 抽出）。
 *
 * 夹具结构来自 .localref/高清中文字幕 - 98堂[原色花堂] - Powered by Discuz!.html
 * （#fd_page_top/#fd_page_bottom 的 .pg 分页块），仅做必要裁剪。
 */

export const BASE_URL = 'https://www.sehuatang.net/forum-103-1.html';

export function pgHtml(opts: {
  current: number;
  withPrev?: boolean;
  withNext?: boolean;
  withTotalTitle?: boolean;
}): string {
  const prev = opts.withPrev
    ? '<a href="https://www.sehuatang.net/forum-103-1.html" class="prev">上一页</a>'
    : '';
  const next = opts.withNext
    ? '<a href="https://www.sehuatang.net/forum-103-2.html" class="nxt">下一页</a>'
    : '';
  const titleSpan =
    opts.withTotalTitle === false ? '' : '<span title="共 1495 页"> / 1495 页</span>';
  const links = [2, 3, 4, 5, 6, 7, 8, 9, 10]
    .map((n) => `<a href="https://www.sehuatang.net/forum-103-${n}.html">${n}</a>`)
    .join('');
  const last = '<a href="https://www.sehuatang.net/forum-103-1495.html" class="last">... 1495</a>';
  const label = `<label><input type="text" name="custompage" class="px" size="2" title="输入页码，按回车快速跳转" value="${opts.current}" onkeydown="if(event.keyCode==13) {window.location='forum.php?mod=forumdisplay&amp;fid=103&amp;page='+this.value;; doane(event);}">${titleSpan}</label>`;
  return `<div class="pg">${prev}<strong>${opts.current}</strong>${links}${last}${label}${next}</div>`;
}

export function pgFromHtml(html: string): Element | null {
  const dom = new JSDOM(`<body>${html}</body>`, { url: BASE_URL });
  return dom.window.document.querySelector('.pg');
}

export const PAGE1_PG = pgHtml({ current: 1, withNext: true });
