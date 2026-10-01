import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * detail-extract 核心 DOM 提取单元测试（X11-1 行为锁定）。
 *
 * 夹具：detail-movie.html / detail-music.html / detail-book.html（合成豆瓣形态）。
 * 模块读取全局 document/location（内容脚本风格），且经 DOMPurify 清洗 HTML —
 * dompurify 在「模块加载时」绑定 window，故先装全局 window，再动态 import
 * （precedent: game-detail-data.spec.ts）。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

function fixtureHtml(name: string): string {
  return fs.readFileSync(path.resolve(HERE, '../fixtures/douban', name), 'utf-8');
}

// Node 24 exposes some browser globals as getter-only; redefine instead of assign.
// Anchor window for dompurify's load-time binding (fixture DOMs replace it per test).
defineGlobal(
  'window',
  new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://movie.douban.com/' })
    .window,
);

type DetailExtractModule = typeof import('@/scenario/douban/pages/detail/detail-extract');
let modPromise: Promise<DetailExtractModule> | null = null;
function load(): Promise<DetailExtractModule> {
  modPromise ??= import('@/scenario/douban/pages/detail/detail-extract');
  return modPromise;
}

function domAt(file: string, url: string): Document {
  const dom = new JSDOM(fixtureHtml(file), { url });
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('Node', dom.window.Node);
  return dom.window.document;
}

const MOVIE = 'detail-movie.html';
const MOVIE_URL = 'https://movie.douban.com/subject/1292052/';
const MUSIC = 'detail-music.html';
const MUSIC_URL = 'https://music.douban.com/subject/1422007/';
const BOOK = 'detail-book.html';
const BOOK_URL = 'https://book.douban.com/subject/26973406/';

test.describe('extractCoreMetadata — 标题/年份/副标题/原名/身份', () => {
  test('电影页：v:itemreviewed + .year + 身份解析，无 h2.subtitle 时 subtitle 空串', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractCoreMetadata } = await load();
    const meta = extractCoreMetadata();

    expect(meta.identity).toEqual({
      platform: 'douban',
      type: 'movie',
      providerId: '1292052',
      url: MOVIE_URL,
    });
    expect(meta.title).toBe('肖申克的救赎');
    expect(meta.year).toBe('1994');
    expect(meta.subtitle).toBe('');
    expect(meta.isMusic).toBe(false);
    expect(meta.isBook).toBe(false);
    // 豆瓣电影页惯用「又名:」标签；提取器只认 原名/原作名 → 兜底空串
    expect(meta.originalTitle).toBe('');
  });

  test('电影页插入「原名:」行后 originalTitle 被解析', async () => {
    const doc = domAt(MOVIE, MOVIE_URL);
    doc
      .querySelector('#info')
      ?.insertAdjacentHTML('beforeend', '<br><span class="pl">原名:</span> 月黑风高');
    const { extractCoreMetadata } = await load();
    expect(extractCoreMetadata().originalTitle).toBe('月黑风高');
  });

  test('图书页：h1 property 属性直写（无内嵌 span）走 textContent 兜底；原作名解析', async () => {
    domAt(BOOK, BOOK_URL);
    const { extractCoreMetadata } = await load();
    const meta = extractCoreMetadata();

    expect(meta.identity).toEqual({
      platform: 'douban',
      type: 'book',
      providerId: '26973406',
      url: BOOK_URL,
    });
    expect(meta.isBook).toBe(true);
    expect(meta.isMusic).toBe(false);
    expect(meta.title).toBe('德米安：彷徨少年时');
    expect(meta.year).toBe('');
    expect(meta.subtitle).toBe('赫尔曼·黑塞');
    expect(meta.originalTitle).toBe('Demian');
  });

  test('音乐页：isMusic 标志由 host 推断', async () => {
    domAt(MUSIC, MUSIC_URL);
    const { extractCoreMetadata } = await load();
    const meta = extractCoreMetadata();

    expect(meta.isMusic).toBe(true);
    expect(meta.isBook).toBe(false);
    expect(meta.title).toBe('Wish You Were Here');
    expect(meta.subtitle).toBe('Pink Floyd');
  });
});

test.describe('extractPosterRating — 海报/评分/人数/bigstar', () => {
  test('电影页：s_ratio_poster 升级为 x；bigstar 类名提取数字', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractPosterRating } = await load();
    const r = extractPosterRating();

    expect(r.posterSrc).toBe('https://img9.doubanio.com/view/photo/x/public/p480988254.jpg');
    expect(r.posterAlt).toBe('肖申克的救赎');
    expect(r.posterLink).toBe('https://movie.douban.com/subject/1292052/photos');
    expect(r.ratingNum).toBe('9.7');
    expect(r.ratingPeople).toBe('2389412');
    expect(r.bigstarNum).toBe('10');
  });

  test('音乐页：/view/subject/s/ 单字符路径段升级为 /x/', async () => {
    domAt(MUSIC, MUSIC_URL);
    const { extractPosterRating } = await load();
    const r = extractPosterRating();

    expect(r.posterSrc).toBe('https://img1.doubanio.com/view/subject/x/public/s1437690.jpg');
    expect(r.ratingNum).toBe('9.4');
    expect(r.bigstarNum).toBe('45');
  });

  test('图书页：封面在 #cover_block 而非 #mainpic → posterSrc 空（疑点已上报）', async () => {
    domAt(BOOK, BOOK_URL);
    const { extractPosterRating } = await load();
    const r = extractPosterRating();

    // 现有选择器只认 #mainpic，图书页封面节点匹配不到；意图无注释佐证，先锁现状。
    expect(r.posterSrc).toBe('');
    expect(r.posterLink).toBe('');
    expect(r.ratingNum).toBe('9.0');
    expect(r.ratingPeople).toBe('23841');
    expect(r.bigstarNum).toBe('');
  });

  test('全部节点缺失 → 六字段均空串', async () => {
    const doc = domAt(MOVIE, MOVIE_URL);
    doc.querySelector('#mainpic')?.remove();
    doc.querySelector('.rating_num')?.remove();
    doc.querySelector('.rating_people')?.remove();
    doc.querySelector('.bigstar')?.remove();
    const { extractPosterRating } = await load();

    expect(extractPosterRating()).toEqual({
      posterSrc: '',
      posterAlt: '',
      posterLink: '',
      ratingNum: '',
      ratingPeople: '',
      bigstarNum: '',
    });
  });
});

test.describe('extractRatingBars — 评分分布', () => {
  test('电影页：.ratings-on-weight .item 主路径 5 档', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractRatingBars } = await load();
    const bars = extractRatingBars(false);

    expect(bars.map((b) => b.label)).toEqual(['力荐', '推荐', '还行', '较差', '很差']);
    expect(bars.map((b) => b.pct)).toEqual(['58.4%', '33.1%', '6.9%', '1.0%', '0.6%']);
  });

  test('图书页：主路径缺失 + isBook → #interest_sectl 星档兜底（相邻兄弟链）', async () => {
    domAt(BOOK, BOOK_URL);
    const { extractRatingBars } = await load();
    const bars = extractRatingBars(true);

    expect(bars.length).toBe(5);
    expect(bars[0]).toEqual({ label: '力荐', pct: '53.9%' });
    expect(bars[4]).toEqual({ label: '很差', pct: '1.0%' });
  });

  test('图书页但 isBook=false → 不触发兜底，返回空数组', async () => {
    domAt(BOOK, BOOK_URL);
    const { extractRatingBars } = await load();
    expect(extractRatingBars(false)).toEqual([]);
  });

  test('主路径删除后 → 空数组（无 interest_sectl 时兜底也空）', async () => {
    const doc = domAt(MOVIE, MOVIE_URL);
    doc.querySelector('.ratings-on-weight')?.remove();
    const { extractRatingBars } = await load();
    expect(extractRatingBars(false)).toEqual([]);
    expect(extractRatingBars(true)).toEqual([]);
  });
});

test.describe('extractBetterThan — 好于标签', () => {
  test('电影页：两条链接文本', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractBetterThan } = await load();
    expect(extractBetterThan()).toEqual(['98% 的剧情片', '97% 的犯罪片']);
  });

  test('图书页无该模块 → 空数组', async () => {
    domAt(BOOK, BOOK_URL);
    const { extractBetterThan } = await load();
    expect(extractBetterThan()).toEqual([]);
  });
});

test.describe('extractMetaRows — #info 行解析', () => {
  test('电影页：6 行标签（冒号剥离）+ 链接 HTML 保留', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractMetaRows } = await load();
    const rows = extractMetaRows();

    expect(rows.map((r) => r.label)).toEqual(['导演', '编剧', '语言', '片长', '又名', 'IMDb编号']);
    expect(rows[0]?.html).toContain('弗兰克·德拉邦特');
    expect(rows[5]?.html).toBe('tt0111161');
  });

  test('电影页导演行：display:none 别名解除隐藏、more-attrs 链接被移除', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractMetaRows } = await load();
    const director = extractMetaRows()[0];

    expect(director?.html).toContain('罗杰·狄金斯');
    expect(director?.html).not.toContain('display');
    expect(director?.html).not.toContain('more-attrs');
    expect(director?.html).not.toContain('展开');
  });

  test('图书页：7 行，纯文本行不含标签', async () => {
    domAt(BOOK, BOOK_URL);
    const { extractMetaRows } = await load();
    const rows = extractMetaRows();

    expect(rows.length).toBe(7);
    expect(rows[0]?.label).toBe('作者');
    const orig = rows.find((r) => r.label === '原作名');
    expect(orig?.html).toBe('Demian');
  });

  test('#info 缺失 → 空数组', async () => {
    const doc = domAt(MOVIE, MOVIE_URL);
    doc.querySelector('#info')?.remove();
    const { extractMetaRows } = await load();
    expect(extractMetaRows()).toEqual([]);
  });
});

test.describe('extractSynopsis — 简介（含 DOMPurify 清洗）', () => {
  test('电影页：剧情简介 + v:summary', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractSynopsis } = await load();
    const s = extractSynopsis(false, false);

    expect(s.synopsisHeadingKey).toBe('douban.synopsis.movie');
    expect(s.synopsisHtml).toContain('银行家安迪');
  });

  test('音乐页：heading 简介 + v:des 选择器', async () => {
    domAt(MUSIC, MUSIC_URL);
    const { extractSynopsis } = await load();
    const s = extractSynopsis(true, false);

    expect(s.synopsisHeadingKey).toBe('douban.synopsis.short');
    expect(s.synopsisHtml).toContain('第九张录音室专辑');
  });

  test('图书页：heading 内容简介 + #link-report 两个 .intro 以换行拼接', async () => {
    domAt(BOOK, BOOK_URL);
    const { extractSynopsis } = await load();
    const s = extractSynopsis(false, true);

    expect(s.synopsisHeadingKey).toBe('douban.synopsis.book');
    expect(s.synopsisHtml).toContain('1919年出版的中篇小说');
    expect(s.synopsisHtml).toContain('两条路');
    expect(s.synopsisHtml).toContain('\n');
  });

  test('恶意标记被清洗：onerror/script 不进入输出', async () => {
    const doc = domAt(MOVIE, MOVIE_URL);
    const summary = doc.querySelector('[property="v:summary"]');
    if (summary) {
      summary.innerHTML += '<img src=x onerror="alert(1)"><script>alert(2)</scr' + 'ipt>';
    }
    const { extractSynopsis } = await load();
    const s = extractSynopsis(false, false);

    expect(s.synopsisHtml).not.toContain('onerror');
    expect(s.synopsisHtml).not.toContain('script');
    expect(s.synopsisHtml).toContain('希望是好事');
  });

  test('related-info 缺失 → 空串（文档默认值）', async () => {
    const doc = domAt(MOVIE, MOVIE_URL);
    doc.querySelector('.related-info')?.remove();
    const { extractSynopsis } = await load();
    expect(extractSynopsis(false, false).synopsisHtml).toBe('');
  });
});

test.describe('extractAwards — 获奖模块', () => {
  test('电影页：3 项 ul.award 中 2 项达标（≥2 li），提名标志与链接解析', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractAwards } = await load();
    const awards = extractAwards();

    expect(awards.length).toBe(2);
    expect(awards[0]).toEqual({
      festival: '第67届奥斯卡金像奖',
      category: '最佳导演(提名)',
      nominee: '弗兰克·德拉邦特',
      nomineeLink: 'https://movie.douban.com/celebrity/1047973/',
      isNomination: true,
    });
    // 2-li 奖项：无获奖人字段；1-li 奖项整条跳过
    expect(awards[1]).toEqual({
      festival: '第52届美国金球奖',
      category: '电影类-剧情类最佳影片',
      nominee: '',
      nomineeLink: '',
      isNomination: false,
    });
  });

  test('图书页（第一个 .mod 无 ul.award）→ 空数组', async () => {
    domAt(BOOK, BOOK_URL);
    const { extractAwards } = await load();
    expect(extractAwards()).toEqual([]);
  });
});

test.describe('extractRank — 榜单标签', () => {
  test('电影页：名次/链接文本（trim）/href', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractRank } = await load();

    expect(extractRank()).toEqual({
      rankNo: '1',
      rankText: '豆瓣电影Top250',
      rankHref: 'https://movie.douban.com/chart',
    });
  });

  test('音乐页无榜单节点 → 三字段空串', async () => {
    domAt(MUSIC, MUSIC_URL);
    const { extractRank } = await load();

    expect(extractRank()).toEqual({ rankNo: '', rankText: '', rankHref: '' });
  });
});
