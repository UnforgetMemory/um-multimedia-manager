/**
 * Local mock of a classic douban movie-subject detail page (X9-C e2e).
 *
 * The DOM contract mirrors what src/scenario/douban/pages/detail/detail-extract.ts
 * actually parses (verified against detail-extract.ts, not invented):
 *  - `#content h1` with `[property="v:itemreviewed"]` + `.year`
 *  - `h2.subtitle`
 *  - `#mainpic img` / `#mainpic a`
 *  - `.rating_num`, `.rating_people span`, `.bigstar` class
 *  - `.ratings-on-weight .item` with `.starstop` + `.rating_per`
 *  - `#info` rows split by `<br>` with `span.pl` labels
 *  - `#content > .grid-16-8.clearfix > .article > .related-info [property="v:summary"]`
 *  - hidden `input[name="ck"]` (CSRF token read by use-interest getCk())
 *  - `#interest_sect_level` without any 我看过/我在看 marker (neutral status)
 *
 * Self-contained: poster is a 1x1 data-URI PNG, no subresources, no scripts.
 */

export interface MovieDetailFixtureOptions {
  subjectId: string;
  title: string;
}

/** 1x1 transparent PNG — poster placeholder so no image request leaves the mock. */
const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ' +
  'AAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export function doubanMovieDetailHtml(opts: MovieDetailFixtureOptions): string {
  const { subjectId, title } = opts;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link rel="icon" href="data:,">
  <style>body{font-family:sans-serif;margin:0}#wrapper{max-width:960px;margin:0 auto}</style>
</head>
<body>
  <div id="db-top-nav" class="nav hide-anime"><a href="/">豆瓣</a><a href="/movie/">电影</a></div>
  <div id="wrapper">
    <div id="content">
      <h1><span property="v:itemreviewed">${title}</span> <span class="year">(2024)</span></h1>
      <h2 class="subtitle">(E2E Mock Subject)</h2>
      <div class="grid-16-8 clearfix">
        <div class="article">
          <div class="subjectblock">
            <div id="mainpic" class="aspect-hd">
              <a href="https://movie.douban.com/subject/${subjectId}/photos"><img src="${PIXEL_PNG}" width="140" alt="${title}"></a>
            </div>
            <div class="info">
              <div class="rating_wrap clearbox">
                <div class="rating_logo">豆瓣评分</div>
                <strong class="rating_num property" property="v:average">8.2</strong>
                <span class="rating-star-tall"><span class="allstar40 rating-stars" title="推荐"></span><span class="bigstar bigstar40"></span></span>
                <div class="rating_people"><span property="v:votes">12345</span> 人评价</div>
              </div>
              <div class="ratings_wrap">
                <div class="ratings-on-weight">
                  <div class="item"><span class="starstop starstop5">力荐</span><span class="rating_per">38.2%</span></div>
                  <div class="item"><span class="starstop starstop4">推荐</span><span class="rating_per">45.1%</span></div>
                  <div class="item"><span class="starstop starstop3">还行</span><span class="rating_per">12.4%</span></div>
                  <div class="item"><span class="starstop starstop2">较差</span><span class="rating_per">2.8%</span></div>
                  <div class="item"><span class="starstop starstop1">很差</span><span class="rating_per">1.5%</span></div>
                </div>
                <div class="rating_betterthan">好于 <a href="https://movie.douban.com/top250">98% 的剧情片</a></div>
              </div>
              <div id="interest_sectl">
                <div id="interest_sect_level">
                  <a class="j" href="#">我要看</a>&nbsp;|&nbsp;<a href="#">我看过的片单</a>
                </div>
              </div>
              <div id="info">
                <span class="pl">导演</span>:&nbsp;&nbsp;<a href="/search/movie?q=%E5%AF%BC%E6%BC%94%E7%94%B2" rel="tag">导演甲</a><br>
                <span class="pl">主演</span>:&nbsp;&nbsp;<a href="/search/movie?q=%E6%BC%94%E5%91%98%E4%B9%99" rel="tag">演员乙</a> / <a href="/search/movie?q=%E6%BC%94%E5%91%98%E4%B8%99" rel="tag">演员丙</a><br>
                <span class="pl">编剧</span>:&nbsp;&nbsp;<a href="/search/movie?q=%E7%BC%96%E5%89%A7%E4%B8%81" rel="tag">编剧丁</a><br>
                <span class="pl">原名</span>:&nbsp;&nbsp;E2E Original Title<br>
                <span class="pl">类型</span>:&nbsp;&nbsp;剧情 / 科幻<br>
                <span class="pl">制片国家/地区</span>:&nbsp;&nbsp;中国大陆<br>
                <span class="pl">语言</span>:&nbsp;&nbsp;汉语普通话<br>
                <span class="pl">上映日期</span>:&nbsp;&nbsp;2024-01-01(中国大陆)<br>
                <span class="pl">片长</span>:&nbsp;&nbsp;120分钟<br>
                <span class="pl">IMDb</span>:&nbsp;&nbsp;tt1234567<br>
              </div>
            </div>
          </div>
          <div class="related-info">
            <div class="title-h2"><h2>剧情简介 · · · · · ·</h2></div>
            <div class="indent">
              <blockquote class="q">
                <span property="v:summary" class="short">这是供端到端测试使用的本地模拟剧情简介，页面完全离线、不含站点脚本。</span>
              </blockquote>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <form id="interest_form" style="display:none" action="/j/subject/${subjectId}/interest;?ck=e2e-ck-token" method="post">
    <input type="hidden" name="ck" value="e2e-ck-token">
    <input type="hidden" id="n_rating" name="rating" value="0">
    <input type="radio" value="do" name="interest">
  </form>
  <div id="footer"></div>
</body>
</html>`;
}

/** URL of the mocked subject page — stays on movie.douban.com so content scripts inject. */
export function movieDetailUrl(subjectId: string): string {
  return `https://movie.douban.com/subject/${subjectId}/`;
}
