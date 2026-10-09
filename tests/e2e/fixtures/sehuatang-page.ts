/**
 * Sehuatang (Discuz-style) page builders for the real-browser e2e suite.
 *
 * WHY generated in TS instead of scraped .html files: the assertions key off
 * the row set (which AV id / TID lands in which adult store), so the fixture
 * and the spec must derive their expectations from ONE table of rows — same
 * reason tests/e2e/fixtures/pt-list-page.ts builds its 200 rows in code.
 * Shape mirrors the real forumdisplay/risk/index DOM contracts that
 * src/entrypoints/content/handlers/sehuatang-extract.ts and
 * src/scenario/sehuatang/{risk,home}-extract.ts actually query:
 *   - list:  #threadlisttableid > tbody[id^="normalthread_"] > tr > th a.s.xst
 *            (+ #pt .z / #thread_types / #pgt / #fd_page_bottom .pg for the
 *            control-rebuild layer, and a stickthread_ decoy the row selector
 *            must skip),
 *   - risk:  div.domain + a.enter-btn[href] (the double marker of
 *            isRiskGateDocument) + .down-content h3/p warning block,
 *   - index: #chart .chart + [id^="category_"].bm_c > table > td.fl_g cells.
 */

export type SehuatangWatchStore = 'jav_ids' | 'usav_ids' | 'sehuatang_ids';

export interface SehuatangRow {
  /** Discuz tbody id suffix (thread tid). */
  tid: string;
  title: string;
  /** AV id the extractor is expected to pull out of `title` (null → TID key). */
  avId: string | null;
  /** Store the watched record is seeded into (`undefined` → left unwatched). */
  watchStore?: SehuatangWatchStore;
  /** Decoy tbody prefix: 'stick' renders `stickthread_*`, skipped by the parser. */
  decoy?: 'sticky';
}

/**
 * Row table — one source of truth for both the HTML and the expectations.
 * `avId` values are the canonical normalizeAvId() output of the title prefix.
 */
export const SEHUATANG_ROWS: SehuatangRow[] = [
  { tid: '1001', title: 'SSIS-123 日系条目甲', avId: 'SSIS-123', watchStore: 'jav_ids' },
  {
    tid: '1002',
    title: 'BigTitsRound.23.06.10 欧美条目乙',
    avId: 'BIGTITSROUND.23.06.10',
    watchStore: 'usav_ids',
  },
  { tid: '1003', title: 'FC2-PPV-44580 混排条目丙', avId: 'FC2-PPV-44580', watchStore: 'jav_ids' },
  { tid: '1004', title: '无番号纯中文条目丁', avId: null, watchStore: 'sehuatang_ids' },
  { tid: '1005', title: 'MIDV-777 未看条目戊', avId: 'MIDV-777' },
  // Pinned (置顶) row: tbody id `stickthread_*` must never become a card.
  { tid: '1006', title: 'SSIS-999 置顶条目己', avId: 'SSIS-999', decoy: 'sticky' },
];

/** Rows the list parser must turn into cards (sticky decoy excluded). */
export const SEHUATANG_CARD_ROWS = SEHUATANG_ROWS.filter((row) => !row.decoy);

/** Rows pre-seeded as watched (any of the three adult stores). */
export const SEHUATANG_WATCHED_ROWS = SEHUATANG_ROWS.filter((row) => row.watchStore);

/** Store key for a seeded watched record (`{source}::{id}`, ADR-025 three-table split). */
export function sehuatangSeedKey(row: SehuatangRow): string {
  const id = row.avId ?? `TID-${row.tid}`;
  return `sehuatang::${id}`;
}

function threadRow(row: SehuatangRow): string {
  const tbodyId = row.decoy === 'sticky' ? `stickthread_${row.tid}` : `normalthread_${row.tid}`;
  return `
    <tbody id="${tbodyId}">
      <tr>
        <th class="tc"><span class="xs2">0</span></th>
        <th class="ti cl">
          <a href="thread-${row.tid}-1-1.html" class="s xst">${row.title}</a>
          <em class="xi1">new</em>
        </th>
        <td class="by">
          <cite><a href="space-uid-77.html"> uploader</a></cite>
          <em><span><span title="2026-09-20 08:00">9 天前</span></span></em>
        </td>
        <td class="num"><em><a>12</a></em><em><a>345</a></em></td>
      </tr>
    </tbody>`;
}

/** forumdisplay (thread list) document — early-entry shell + app.ts DOM guard both key off #threadlisttableid. */
export function sehuatangListHtml(rows: readonly SehuatangRow[] = SEHUATANG_ROWS): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>欧美原创 - 色花堂</title>
    <!-- host-page baseline sheet: a bare-selector rule the extension must never override -->
    <style>
      .host-marker { color: rgb(1, 2, 3); }
    </style>
  </head>
  <body id="nv_forum">
    <div id="wp">
      <div id="pt" class="bm cl">
        <div class="z">
          <a href="./" class="nvhm">色花堂</a> <em>›</em> <a href="forum-2-1.html">原创板块</a>
          <em>›</em> <a href="forum-9-1.html">欧美原创</a>
        </div>
      </div>
      <div id="thread_types" class="bm bmw tsbm cl">
        <div class="bm_c">
          <ul class="cl cs">
            <li class="xw1"><a href="forum-9-1.html">全部</a></li>
            <li><a href="forum-9-1.html?typeid=31">高清<span class="xg1 num"> (128)</span></a></li>
            <li><a href="forum-9-1.html?typeid=32">SD<span class="xg1 num"> (24)</span></a></li>
          </ul>
        </div>
      </div>
      <div id="pgt">
        <div class="pgs cl"><div class="pg y"><strong>1</strong><a href="forum-9-2.html">2</a></div></div>
      </div>
      <div class="bm">
        <div id="threadlisttableid" class="bm_c tl">
          <table cellspacing="0" cellpadding="0" summary="mergethread">
    ${rows.map(threadRow).join('\n')}
          </table>
        </div>
      </div>
      <div id="fd_page_bottom">
        <div class="pgs cl">
          <div class="pg">
            <strong>1</strong><a href="forum-9-2.html">2</a><a href="forum-9-3.html">3</a>
            <a class="nxt" href="forum-9-2.html">下一页</a>
          </div>
        </div>
      </div>
      <p class="host-marker">host footnote that must keep its own colour</p>
    </div>
  </body>
</html>`;
}

/**
 * Risk-gate (age gate) document. `withListShell` embeds a FULL forumdisplay
 * body plus the risk double markers — the exact state that makes the priority
 * assertion meaningful: URL classifies as `forumdisplay`, the list DOM guard
 * would pass, yet the risk branch must win.
 */
export function sehuatangRiskHtml(opts: { withListShell?: boolean } = {}): string {
  const listPart = opts.withListShell
    ? `
      <div id="pt" class="bm cl"><div class="z"><a href="./">色花堂</a></div></div>
      <div id="thread_types"><ul class="cl cs"><li class="xw1"><a href="forum-9-1.html">全部</a></li></ul></div>
      <div id="threadlisttableid" class="bm_c tl">
        <table><tbody id="normalthread_1001"><tr>
          <th class="ti"><a href="thread-1001-1-1.html" class="s xst">SSIS-123 日系条目甲</a></th>
          <td class="by"><em><span>9 天前</span></em></td>
        </tr></tbody></table>
      </div>`
    : '';
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>色花堂</title></head>
  <body>
    <div style="display: none">为别人点一盏灯，照亮自己前行的路。</div>
    <div id="wp">
      <div class="uc-pz cmn">
        <div class="domain">SEHUATANG.NET</div>
        <a href="#" class="enter-btn"> 满18岁，请点此进入 </a>
        <a href="#" class="enter-btn"> If you are over 18，please click here </a>
        <div class="line"></div>
        <div class="row down-content">
          <h3>警告 / WARNING</h3>
          <p class="c_red">本物品內容可能令人反感；不可將本物品內容派發予年齡未滿 18 歲的人士。</p>
          <p>This article contains material which may offend and may not be distributed to a person under 18 years.</p>
        </div>
      </div>
      ${listPart}
    </div>
    <!-- site binding: the ONLY way through the gate (cookie write + reload) -->
    <script>
      window.__ummEnterClicks = 0;
      document.addEventListener('click', function (event) {
        var node = event.target;
        if (node && node.closest && node.closest('a.enter-btn')) window.__ummEnterClicks++;
      });
    </script>
  </body>
</html>`;
}

/**
 * Site index (pg_index) document — [id^="category_"] containers with td.fl_g
 * sub-forum cells (home-extract.ts contract) + #chart stats + #ct wrapper the
 * index app hides.
 *
 * WHY the 'SSIS-123' sub-forum: it duplicates a seeded watched AV id, so the
 * negative assertion (index navigation applies no dimming) has a live trigger
 * instead of resting on an empty store.
 */
export function sehuatangIndexHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>色花堂 - 首页</title></head>
  <body id="nv_forum">
    <div id="wp">
      <div id="pt" class="bm cl"><div class="z"><a href="./" class="nvhm">色花堂</a></div></div>
      <div id="ct" class="wp">
        <div id="chart" class="bm cl">
          <div class="chart">
            <span><em>128</em></span>|<span><em>246</em></span>|<span><em>3578万</em></span>|<span><em>69万</em></span>|<span><em>5821</em></span>
          </div>
        </div>
        <div class="bm">
          <div class="bm_h"><h2 class="xs2"><span>原创BT电影</span></h2></div>
          <div id="category_2" class="bm_c">
            <table cellspacing="0" cellpadding="0">
              <tbody>
                <tr>
                  <td class="fl_g" width="312">
                    <div class="fl_icn_g"><a href="forum-8-1.html"><img src="static/image/common/forum_new.gif" alt="国产原创" /></a></div>
                    <dl>
                      <dt><a href="forum-8-1.html" class="s xst">国产原创</a><em class="xw0 xi1"> (45)</em></dt>
                      <dd><em>主题: 1万</em><em>&nbsp;&nbsp;帖数: 247万</em></dd>
                      <dd>最后发表: <span title="2026-09-26 08:12">2 小时前</span></dd>
                    </dl>
                  </td>
                  <td class="fl_g" width="312">
                    <div class="fl_icn_g"><a href="forum-10-1.html"><img src="static/image/common/forum.gif" alt="SSIS-123" /></a></div>
                    <dl>
                      <dt><a href="forum-10-1.html" class="s xst">SSIS-123</a></dt>
                      <dd><em>主题: 77869</em><em>&nbsp;&nbsp;帖数: 15万</em></dd>
                      <dd>最后发表: <span title="2026-09-27 07:30">1 小时前</span></dd>
                    </dl>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="bm">
          <div class="bm_h"><h2 class="xs2">欧美BT剧集</h2></div>
          <div id="category_5" class="bm_c">
            <table cellspacing="0" cellpadding="0">
              <tbody>
                <tr>
                  <td class="fl_g" width="312">
                    <div class="fl_icn_g"><a href="forum-21-1.html"><img src="static/image/common/forum_new.gif" alt="美剧" /></a></div>
                    <dl>
                      <dt><a href="forum-21-1.html" class="s xst">美剧系列</a></dt>
                      <dd><em>主题: 5万</em><em>&nbsp;&nbsp;帖数: 80万</em></dd>
                      <dd>最后发表: <span title="2026-09-27 06:00">3 小时前</span></dd>
                    </dl>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * Wide synthetic index (X100's write-shape fixture).
 *
 * Same shell as `sehuatangIndexHtml` — `#chart` stats plus the `#ct` wrapper the
 * app hides — but carrying `count` category blocks × two sub-forum cells each.
 * Shape stays faithful to home-extract's contract
 * (`div#category_N.bm_c > table > tbody > tr > td.fl_g`); ids are offset (100+)
 * so they cannot collide with the real fixture's `category_2`/`category_5`, and
 * names are numbered so the expected order is DERIVABLE, not copied from the
 * markup.
 */
export function sehuatangIndexWideHtml(count: number): string {
  const cell = (fid: number, name: string): string => `
                  <td class="fl_g" width="312">
                    <div class="fl_icn_g"><a href="forum-${fid}-1.html"><img src="static/image/common/forum.gif" alt="${name}" /></a></div>
                    <dl>
                      <dt><a href="forum-${fid}-1.html" class="s xst">${name}</a></dt>
                      <dd><em>主题: 12</em><em>&nbsp;&nbsp;帖数: 34</em></dd>
                      <dd>最后发表: <span title="2026-09-27 07:30">1 小时前</span></dd>
                    </dl>
                  </td>`;
  const blocks: string[] = [];
  for (let i = 1; i <= count; i++) {
    blocks.push(`        <div class="bm">
          <div class="bm_h"><h2 class="xs2"><span>分区 ${i}</span></h2></div>
          <div id="category_${100 + i}" class="bm_c">
            <table cellspacing="0" cellpadding="0">
              <tbody>
                <tr>
                  ${cell(200 + i, `版A-${i}`)}
                  ${cell(400 + i, `版B-${i}`)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>`);
  }
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>色花堂 - 首页（宽版）</title></head>
  <body id="nv_forum">
    <div id="wp">
      <div id="pt" class="bm cl"><div class="z"><a href="./" class="nvhm">色花堂</a></div></div>
      <div id="ct" class="wp">
        <div id="chart" class="bm cl">
          <div class="chart">
            <span><em>128</em></span>|<span><em>246</em></span>|<span><em>3578万</em></span>|<span><em>69万</em></span>|<span><em>5821</em></span>
          </div>
        </div>
${blocks.join('\n')}
      </div>
    </div>
  </body>
</html>`;
}

/** Thread detail body the list overlay's lazy detail loader fetches per card. */
export function sehuatangThreadDetailHtml(opts: { coverUrl: string; magnet: string }): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><title>帖子详情</title></head>
  <body>
    <div id="postmessage_1" class="tattl">
      <ignore_js_op><img src="${opts.coverUrl}" zoomfile="${opts.coverUrl}" file="${opts.coverUrl}" alt="cover" /></ignore_js_op>
    </div>
    <script>
      document.getElementById("postmessage_1").className += " p_msg";
    </script>
    <div class="blockcode">
      <div>
        <ol>
          <li>${opts.magnet}</li>
        </ol>
      </div>
    </div>
  </body>
</html>`;
}
