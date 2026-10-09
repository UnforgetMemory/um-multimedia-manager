/**
 * Local mock of a NexusPHP PT torrents list page (X13 e2e).
 *
 * DOM contract mirrors what src/entrypoints/content/enhancers/pt/config/sites.ts
 * parses for `audiences.me`:
 *  - rowSelector `tbody > tr` (also the dimmer's waitForElement target)
 *  - extractIdsFromRowLinks: `a[href*="douban.com/subject/"]` → /subject/(\d+)/
 *    and `a[href*="imdb.com/title/"]` → /title/(tt\d+)/
 *  - skipRowSelector `td.colhead` — deliberately never emitted.
 *
 * 200 rows are generated programmatically (jank budget needs a real bulk).
 * Self-contained: no subresources, no scripts.
 */

export interface PtSubject {
  /** Row index; doubles as details.php?id= (unused by the direct-ID path). */
  id: number;
  name: string;
  doubanId?: string;
  imdbId?: string;
}

/**
 * Layout: rows 0..20 carry douban subject links (0..19 prewatched, 20 is the
 * live-re-dim target), rows 21..30 carry IMDb links (all prewatched),
 * the remaining 169 rows are neutral (must never dim).
 */
export function makeE2ePtSubjects(): PtSubject[] {
  const subjects: PtSubject[] = [];
  for (let i = 0; i < 200; i++) {
    const subject: PtSubject = { id: i, name: `E2E Torrent ${String(i).padStart(3, '0')}` };
    if (i <= 20) subject.doubanId = String(2700000 + i);
    else if (i <= 30) subject.imdbId = `tt${String(1000000 + i)}`;
    subjects.push(subject);
  }
  return subjects;
}

export const PT_DOUBAN_WATCHED_ROWS = 20; // ids 0..19
export const PT_IMDB_WATCHED_ROWS = 10; // ids 21..30

function rowHtml(s: PtSubject): string {
  const doubanLink = s.doubanId
    ? `<a href="https://movie.douban.com/subject/${s.doubanId}/">[豆瓣]</a>`
    : '';
  const imdbLink = s.imdbId ? `<a href="https://www.imdb.com/title/${s.imdbId}/">[IMDb]</a>` : '';
  return `
    <tr id="torrent-row-${s.id}">
      <td class="rowname"><a href="/details.php?id=${s.id}">${s.name}</a>${doubanLink}${imdbLink}</td>
      <td class="row2">${String((s.id % 50) + 10)}GB</td>
    </tr>`;
}

export function nexusPhpTorrentsPageHtml(subjects: PtSubject[]): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>PT 列表 · E2E Mock</title>
  <link rel="icon" href="data:,">
  <style>body{font-family:sans-serif;margin:0}table{border-collapse:collapse;width:100%}</style>
</head>
<body>
  <div id="top-nav"><a href="/index.php">E2E PT</a></div>
  <h1>最新种子</h1>
  <table class="torrents">
    <tbody id="torrents-body">${subjects.map(rowHtml).join('\n')}
    </tbody>
  </table>
  <div id="footer"></div>
</body>
</html>`;
}
