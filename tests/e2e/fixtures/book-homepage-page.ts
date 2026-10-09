/**
 * Local mock of book.douban.com homepage (X9-C e2e).
 *
 * DOM contract mirrors what
 * src/scenario/douban/pages/book-homepage/book-homepage-extract.ts parses:
 *  - `.section.books-express .list-express li`
 *  - `li .cover a` → href `/subject/{id}/` (subject id source)
 *  - `li .info .title a[title]`, `li .info .author`,
 *    `li .more-meta p .year`, `li .more-meta p .publisher`
 *
 * Used by the broadcast live-refresh spec: cards mount with 未读 badges, an
 * external DB write makes useRecordCache re-read and flip the badge to 想读
 * without a page reload. Self-contained, no subresources, no scripts.
 */

export interface BookFixture {
  subjectId: string;
  title: string;
  author: string;
}

const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ' +
  'AAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export const E2E_BOOKS: BookFixture[] = [
  { subjectId: '35428741', title: 'E2E 图书甲', author: '作者甲' },
  { subjectId: '30217636', title: 'E2E 图书乙', author: '作者乙' },
];

function expressLi(book: BookFixture): string {
  return `
    <li>
      <div class="cover">
        <a href="https://book.douban.com/subject/${book.subjectId}/"><img src="${PIXEL_PNG}" width="64" alt="${book.title}"></a>
      </div>
      <div class="info">
        <h3 class="title"><a title="${book.title}">${book.title}</a></h3>
        <p class="author">[E2E] ${book.author} 著</p>
        <div class="more-meta">
          <p><span class="year">2024-1</span><span class="publisher">E2E 出版社</span></p>
        </div>
      </div>
    </li>`;
}

export function doubanBookHomepageHtml(books: BookFixture[] = E2E_BOOKS): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>豆瓣读书 · E2E Mock</title>
  <link rel="icon" href="data:,">
  <style>body{font-family:sans-serif;margin:0}ul{list-style:none;padding:0}</style>
</head>
<body>
  <div id="db-nav"><a href="https://book.douban.com/">豆瓣读书</a></div>
  <div id="content">
    <div class="section books-express">
      <h2>新书速递</h2>
      <ul class="list-express">${books.map(expressLi).join('\n')}
      </ul>
    </div>
    <div class="section popular-books">
      <h2>每月热门图书榜</h2>
    </div>
  </div>
  <div id="footer"></div>
</body>
</html>`;
}
