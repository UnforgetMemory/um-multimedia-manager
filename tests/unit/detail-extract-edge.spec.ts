import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * detail-extract fallback/edge behavior lock (X11-F).
 *
 * Complements tests/unit/detail-extract.spec.ts (happy paths) with the
 * branches it cannot reach: the #wrapper > h1 title variant, element-first
 * `.pl` labels, hidden full-synopsis span, digit-concatenating bigstar classes,
 * empty-label rating items, XSS payloads inside #info and the null-identity
 * seam the module hides behind a non-null assertion.
 *
 * Fixture: tests/fixtures/douban/detail-edge.html (tv-ambiguous subject served
 * from movie.douban.com). dompurify binds `window` at module load → global
 * window is installed before the dynamic import (precedent:
 * detail-extract.spec.ts / game-detail-data.spec.ts).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

function fixtureHtml(name: string): string {
  return fs.readFileSync(path.resolve(HERE, '../fixtures/douban', name), 'utf-8');
}

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

const EDGE = 'detail-edge.html';
const EDGE_URL = 'https://movie.douban.com/subject/25954475/';

function domAt(file: string, url: string): Document {
  const dom = new JSDOM(fixtureHtml(file), { url });
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('Node', dom.window.Node);
  return dom.window.document;
}

test.describe('extractCoreMetadata — h1 兜底、年份剥离、身份规范化', () => {
  test('#wrapper > h1 变体：无 v:itemreviewed → 整段 h1 文本兜底，year 空串', async () => {
    domAt(EDGE, EDGE_URL);
    const { extractCoreMetadata } = await load();
    const meta = extractCoreMetadata();

    expect(meta.title).toBe('权力的游戏 第一季 （2011）');
    expect(meta.year).toBe('');
    expect(meta.subtitle).toBe('');
    expect(meta.isMusic).toBe(false);
    expect(meta.isBook).toBe(false);
  });

  test('.year 节点存在时：ASCII 括号剥离，全角括号原样保留', async () => {
    const doc = domAt(EDGE, EDGE_URL);
    const h1 = doc.querySelector('#wrapper > h1');
    if (!h1) throw new Error('fixture must expose #wrapper > h1');
    h1.innerHTML = '权力的游戏 第一季 <span class="year">（2011）</span>';
    const { extractCoreMetadata } = await load();
    expect(extractCoreMetadata().year).toBe('（2011）');

    h1.innerHTML = '权力的游戏 第一季 <span class="year">(2011)</span>';
    expect(extractCoreMetadata().year).toBe('2011');
  });

  test('movie 域名上的剧集：identity.type 恒为 movie（tv 歧义交给 subject-keys 双键）', async () => {
    domAt(EDGE, EDGE_URL);
    const { extractCoreMetadata } = await load();
    const meta = extractCoreMetadata();

    expect(meta.identity).toEqual({
      platform: 'douban',
      type: 'movie',
      providerId: '25954475',
      url: EDGE_URL,
    });
  });

  test('身份规范化：query/hash 剥离 + 尾斜杠补全，媒体域按 host 判定', async () => {
    domAt(EDGE, 'https://music.douban.com/subject/1422007?tag=%E9%9F%B3%E4%B9%90#top');
    const { extractCoreMetadata } = await load();
    const meta = extractCoreMetadata();

    expect(meta.identity).toEqual({
      platform: 'douban',
      type: 'music',
      providerId: '1422007',
      url: 'https://music.douban.com/subject/1422007/',
    });
    expect(meta.isMusic).toBe(true);
  });

  test('不可识别 URL → identity 为 null 且不抛（模块的 ! 断言与可空返回相悖）', async () => {
    domAt(EDGE, 'https://www.douban.com/topic/1234567/');
    const { extractCoreMetadata } = await load();
    const meta = extractCoreMetadata();

    expect(meta.identity).toBeNull();
    expect(meta.isMusic).toBe(false);
    expect(meta.title).toBe('权力的游戏 第一季 （2011）');
  });

  test('无 原名/原作名 行 → originalTitle 空串', async () => {
    domAt(EDGE, EDGE_URL);
    const { extractCoreMetadata } = await load();
    expect(extractCoreMetadata().originalTitle).toBe('');
  });

  test('原名行冒号在 span 之外 → 永不剥离（detail-extract.ts:52 parentElement 取自已移除节点）', async () => {
    const doc = domAt(EDGE, EDGE_URL);
    doc
      .querySelector('#info')
      ?.insertAdjacentHTML('beforeend', '<br><span class="pl">原名</span>:<span>冰与火之歌</span>');
    const { extractCoreMetadata } = await load();
    // 清理循环的 /^:\s*$/ 分支是死代码：pl.remove() 之后 pl.parentElement 恒为 null，
    // 因此标签外的冒号一定残留；已作为疑点上报，此处锁现状。
    expect(extractCoreMetadata().originalTitle).toBe(':冰与火之歌');
  });

  test('原作名行全角冒号同样残留在值首', async () => {
    const doc = domAt(EDGE, EDGE_URL);
    doc
      .querySelector('#info')
      ?.insertAdjacentHTML('beforeend', '<br><span class="pl">原作名</span>：Demian');
    const { extractCoreMetadata } = await load();
    expect(extractCoreMetadata().originalTitle).toBe('：Demian');
  });

  test('原名冒号写在 span 内部 → 随标签一并移除', async () => {
    const doc = domAt(EDGE, EDGE_URL);
    doc
      .querySelector('#info')
      ?.insertAdjacentHTML('beforeend', '<br><span class="pl">原名:</span> 冰与火之歌');
    const { extractCoreMetadata } = await load();
    expect(extractCoreMetadata().originalTitle).toBe('冰与火之歌');
  });

  test('#info 缺失 → originalTitle 空串（其余字段不受影响）', async () => {
    const doc = domAt(EDGE, EDGE_URL);
    doc.querySelector('#info')?.remove();
    const { extractCoreMetadata } = await load();
    const meta = extractCoreMetadata();

    expect(meta.originalTitle).toBe('');
    expect(meta.title).toBe('权力的游戏 第一季 （2011）');
  });
});

test.describe('extractPosterRating — 空值与多 token 类名', () => {
  test('alt 空串 + 跨行 rating_num 被 trim + bigstar 单数字段', async () => {
    domAt(EDGE, EDGE_URL);
    const { extractPosterRating } = await load();
    const r = extractPosterRating();

    expect(r.posterAlt).toBe('');
    expect(r.ratingNum).toBe('9.5');
    expect(r.ratingPeople).toBe('102938');
    expect(r.bigstarNum).toBe('45');
  });

  test('bigstar 类名含多个数字 → 数字被拼接（非取首个档位）', async () => {
    const doc = domAt(EDGE, EDGE_URL);
    const star = doc.querySelector('.bigstar');
    if (!star) throw new Error('fixture must expose .bigstar');
    star.className = 'bigstar bigstar20 v2';
    const { extractPosterRating } = await load();

    expect(extractPosterRating().bigstarNum).toBe('202');
  });

  test('有 #mainpic a 无 img → posterSrc/posterAlt 空串，posterLink 仍解析', async () => {
    const doc = domAt(EDGE, EDGE_URL);
    doc.querySelector('#mainpic img')?.remove();
    const { extractPosterRating } = await load();
    const r = extractPosterRating();

    expect(r.posterSrc).toBe('');
    expect(r.posterAlt).toBe('');
    expect(r.posterLink).toBe('https://movie.douban.com/subject/25954475/photos');
  });

  test('非 douban CDN 图源原样返回（升级函数只改写已知尺寸段）', async () => {
    const doc = domAt(EDGE, EDGE_URL);
    const img = doc.querySelector('#mainpic img');
    if (!img) throw new Error('fixture must expose #mainpic img');
    img.setAttribute('src', 'https://cdn.example.org/static/poster.jpg');
    const { extractPosterRating } = await load();

    expect(extractPosterRating().posterSrc).toBe('https://cdn.example.org/static/poster.jpg');
  });
});

test.describe('extractRatingBars / extractBetterThan — 空文本过滤', () => {
  test('空白 starstop 标签的档位被跳过；缺 .rating_per 时 pct 空串', async () => {
    domAt(EDGE, EDGE_URL);
    const { extractRatingBars } = await load();
    expect(extractRatingBars(false)).toEqual([
      { label: '力荐', pct: '52.1%' },
      { label: '很差', pct: '' },
    ]);
  });

  test('isBook=true 但主路径已有结果 → 不触发 #interest_sectl 兜底', async () => {
    domAt(EDGE, EDGE_URL);
    const { extractRatingBars } = await load();

    expect(extractRatingBars(true)).toEqual([
      { label: '力荐', pct: '52.1%' },
      { label: '很差', pct: '' },
    ]);
  });

  test('好于：仅空白文本的链接被跳过', async () => {
    domAt(EDGE, EDGE_URL);
    const { extractBetterThan } = await load();
    expect(extractBetterThan()).toEqual(['好于 95% 的美剧']);
  });
});

test.describe('extractMetaRows — 元素标签、多值 attrs、XSS、分隔符', () => {
  test('.pl 首子节点为元素 → label 取 textContent，被提升的标签链接同时留在 html 中', async () => {
    domAt(EDGE, EDGE_URL);
    const { extractMetaRows } = await load();
    const rows = extractMetaRows();
    const director = rows.find((r) => r.label === '导演');

    expect(rows.map((r) => r.label)).toEqual(['导演', '主演', '配乐', '又名', '单字段行']);
    expect(director?.html).toContain('导演:');
    expect(director?.html).toContain('汤姆·霍伯');
  });

  test('多值 attrs：三位主演与 / 分隔符原样保留', async () => {
    domAt(EDGE, EDGE_URL);
    const { extractMetaRows } = await load();
    const cast = extractMetaRows().find((r) => r.label === '主演');

    expect(cast?.html).toContain('基特·哈灵顿');
    expect(cast?.html).toContain('艾米莉亚·克拉克');
    expect(cast?.html).toContain('彼特·丁拉基');
    expect(cast?.html).toMatch(/\/\s*<a/);
  });

  test('XSS 行：onerror 与 script 被清洗，可见文本保留', async () => {
    domAt(EDGE, EDGE_URL);
    const { extractMetaRows } = await load();
    const score = extractMetaRows().find((r) => r.label === '配乐');

    expect(score?.html).toContain('拉民·贾瓦迪');
    expect(score?.html).not.toContain('onerror');
    expect(score?.html).not.toContain('script');
    expect(score?.html).not.toContain('__xss_flag');
  });

  test('| 分隔值保留；空行跳过；仅标签行的 html 为空串', async () => {
    domAt(EDGE, EDGE_URL);
    const { extractMetaRows } = await load();
    const rows = extractMetaRows();

    expect(rows.find((r) => r.label === '又名')?.html).toBe('| 冰与火之歌 | 权游');
    expect(rows.find((r) => r.label === '又名')?.label).toBe('又名');
    expect(rows.at(-1)).toEqual({ label: '单字段行', html: '' });
    expect(rows.length).toBe(5);
  });
});

test.describe('extractSynopsis — 隐藏全文优先与书/影分支', () => {
  test('回退选择器被 h2 内的 .fold 抢占 → 返回截断标记而非简介正文（疑点已上报）', async () => {
    domAt(EDGE, EDGE_URL);
    const { extractSynopsis } = await load();
    const s = extractSynopsis(false, false);

    // detail-extract.ts:209 的 `span:not(.all.hidden)` 会命中文档中更早的
    // <span class="fold hide"> · · · · · ·</span>，导致 v:summary 缺失时
    // 抓到装饰文本；作为现状锁定，波次报告登记为疑点。
    expect(s.synopsisHeadingKey).toBe('douban.synopsis.movie');
    expect(s.synopsisHtml).toBe(' · · · · · ·');
  });

  test('移除 .fold 干扰节点后 → span.all.hidden 全文胜出，截断版 .short 被忽略', async () => {
    const doc = domAt(EDGE, EDGE_URL);
    doc.querySelector('.related-info .fold')?.remove();
    const { extractSynopsis } = await load();
    const s = extractSynopsis(false, false);

    expect(s.synopsisHtml).toContain('守夜人');
    expect(s.synopsisHtml).not.toContain('…');
  });

  test('related-info 内无任何 span → 空串', async () => {
    const doc = domAt(EDGE, EDGE_URL);
    const related = doc.querySelector('.related-info');
    if (!related) throw new Error('fixture must expose .related-info');
    related.innerHTML = '<h2>剧情简介</h2>';
    const { extractSynopsis } = await load();

    expect(extractSynopsis(false, false).synopsisHtml).toBe('');
  });

  test('结构门槛：.related-info 不在 article 直接子级链上 → 非书路径空串', async () => {
    const doc = domAt(EDGE, EDGE_URL);
    const related = doc.querySelector('.related-info');
    if (!related) throw new Error('fixture must expose .related-info');
    related.remove();
    doc.body.append(related);
    const { extractSynopsis } = await load();

    expect(extractSynopsis(false, false).synopsisHtml).toBe('');
  });

  test('isBook=true 时只读 #link-report .intro，related-info 内容被忽略 → 空串', async () => {
    domAt(EDGE, EDGE_URL);
    const { extractSynopsis } = await load();
    const s = extractSynopsis(false, true);

    expect(s.synopsisHeadingKey).toBe('douban.synopsis.book');
    expect(s.synopsisHtml).toBe('');
  });
});

test.describe('extractAwards — 空节庆跳过与无链接获奖人', () => {
  test('空 festival 的 ul 被跳过；无 <a> 的提名行走 textContent 兜底', async () => {
    domAt(EDGE, EDGE_URL);
    const { extractAwards } = await load();
    const awards = extractAwards();

    expect(awards.length).toBe(2);
    expect(awards[0]).toEqual({
      festival: '第69届黄金时段艾美奖',
      category: '剧情类最佳剧集(提名)',
      nominee: '权力的游戏 第一季',
      nomineeLink: 'https://movie.douban.com/subject/25954475/',
      isNomination: true,
    });
    expect(awards[1]).toEqual({
      festival: '第20届美国演员工会奖',
      category: '剧情类集体演出奖',
      nominee: '全体卡司',
      nomineeLink: '',
      isNomination: false,
    });
  });

  test('第一个 .mod 不含 ul.award → 空数组（模块只认第一个 .mod）', async () => {
    const doc = domAt(EDGE, EDGE_URL);
    doc.querySelector('ul.award')?.closest('.mod')?.remove();
    const { extractAwards } = await load();
    expect(extractAwards()).toEqual([]);
  });
});

test.describe('extractRank — 缺名次节点', () => {
  test('无 .rank-label-no → rankNo 空串，链接文本仍被 trim', async () => {
    domAt(EDGE, EDGE_URL);
    const { extractRank } = await load();
    expect(extractRank()).toEqual({
      rankNo: '',
      rankText: '豆瓣美剧榜',
      rankHref: 'https://movie.douban.com/tv/',
    });
  });

  test('.rank-label 缺失 → 三字段空串', async () => {
    const doc = domAt(EDGE, EDGE_URL);
    doc.querySelector('.rank-label')?.remove();
    const { extractRank } = await load();
    expect(extractRank()).toEqual({ rankNo: '', rankText: '', rankHref: '' });
  });
});
