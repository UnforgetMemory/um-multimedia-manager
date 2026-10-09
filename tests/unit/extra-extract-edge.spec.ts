import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * extra-extract fallback/edge behavior lock (X11-F).
 *
 * Complements tests/unit/extra-extract.spec.ts (happy paths) with the branches
 * reachable only from degenerate markup: name-less celebrity li, isBook gating
 * of the #authors fallback, rec items without a link label or poster, comments
 * without info/allstar, pattern-2 TOC, whitespace-collapsing blockquotes and
 * `.count` strings whose rating token repeats.
 *
 * Fixture: tests/fixtures/douban/detail-extra-edge.html. dompurify binds
 * `window` at module load → window installed before the dynamic import.
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

type ExtraExtractModule = typeof import('@/scenario/douban/pages/detail/extra-extract');
let modPromise: Promise<ExtraExtractModule> | null = null;
function load(): Promise<ExtraExtractModule> {
  modPromise ??= import('@/scenario/douban/pages/detail/extra-extract');
  return modPromise;
}

const EDGE = 'detail-extra-edge.html';
const EDGE_URL = 'https://movie.douban.com/subject/25954475/';

function domAt(url = EDGE_URL): Document {
  const dom = new JSDOM(fixtureHtml(EDGE), { url });
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('Node', dom.window.Node);
  return dom.window.document;
}

test.describe('extractCelebrities — 空条目与 isBook 门控', () => {
  test('无 .name a 的 celebrity 仍产出空条目；role 两端 trim、内部空白留存', async () => {
    const doc = domAt();
    const role = doc.querySelector('.celebrity .role');
    if (role) role.textContent = ' 饰 提力昂\n· 联合执行制片 ';
    const { extractCelebrities } = await load();
    const c = extractCelebrities(false, false);

    expect(c.celebHeadingKey).toBe('douban.detail.celeb_cast');
    expect(c.celebItems.length).toBe(2);
    expect(c.celebItems[0]).toEqual({
      name: '彼特·丁拉基',
      role: '饰 提力昂\n· 联合执行制片',
      avatar: 'https://img9.doubanio.com/view/celebrity/m/public/p77.jpg',
      link: 'https://movie.douban.com/celebrity/1770760/',
    });
    expect(c.celebItems[1]).toEqual({ name: '', role: '配乐', avatar: '', link: '' });
  });

  test('人数标签括号内空格不被剥离', async () => {
    domAt();
    const { extractCelebrities } = await load();
    // trim 只作用在整段文本两端，剥括号后内部空格留存
    expect(extractCelebrities(false, false).celebCount).toBe(' 1,024 ');
  });

  test('#authors 回落受 isBook 门控：isBook=false 时即使 #authors 存在也返回空', async () => {
    const doc = domAt();
    doc.querySelector('#celebrities')?.remove();
    const { extractCelebrities } = await load();

    expect(extractCelebrities(false, false).celebItems).toEqual([]);
  });

  test('isBook 回落：.fake 排除、无 href 的 .name 走空 link、无 .name 条目仍产出', async () => {
    const doc = domAt();
    doc.querySelector('#celebrities')?.remove();
    const { extractCelebrities } = await load();
    const c = extractCelebrities(false, true);

    expect(c.celebItems.length).toBe(2);
    expect(c.celebItems[0]).toEqual({
      name: '赫尔曼·黑塞',
      role: '作者',
      avatar: 'https://img3.doubanio.com/f/author/m/public/hesse.jpg',
      link: 'https://book.douban.com/author/1044528/',
    });
    expect(c.celebItems[1]).toEqual({
      name: '无 href 译者',
      role: '译者',
      avatar: '',
      link: '',
    });
    // celebCount 只从 #celebrities 读，#authors 分支恒空
    expect(c.celebCount).toBe('');
  });
});

test.describe('extractPhotos — 无链接条目与计数解析', () => {
  test('video/img 两类无外层 <a> → link 空串；计数从 h2 .pl 解析', async () => {
    domAt();
    const { extractPhotos } = await load();
    const p = extractPhotos();

    expect(p.photoItems.length).toBe(2);
    expect(p.photoItems[0]).toEqual({
      src: 'https://img1.doubanio.com/f/movie/x1y2z3/img/trailer/trailer-poster-9.jpg',
      link: '',
      isVideo: true,
    });
    expect(p.photoItems[1]).toEqual({
      src: 'https://img2.doubanio.com/view/photo/x/public/p1234567890.jpg',
      link: '',
      isVideo: false,
    });
    expect(p.trailerCount).toBe('12');
    expect(p.photoCount).toBe('88');
  });

  test('h2 内无 .pl → 两个计数均为空串（条目仍解析）', async () => {
    const doc = domAt();
    doc.querySelector('#related-pic h2 .pl')?.remove();
    const { extractPhotos } = await load();
    const p = extractPhotos();

    expect(p.trailerCount).toBe('');
    expect(p.photoCount).toBe('');
    expect(p.photoItems.length).toBe(2);
  });
});

test.describe('extractRecItemsDom — 容器缺失与标题回落', () => {
  test('无 .recommendations-bd/.content 时直接在 #recommendations 上取 dl；链接空文本回落 img.alt', async () => {
    domAt();
    const { extractRecItemsDom } = await load();
    const items = extractRecItemsDom();

    expect(items.length).toBe(2);
    expect(items[0]).toEqual({
      title: '霸王别姬',
      poster: 'https://img3.doubanio.com/view/photo/x/public/p453706299.jpg',
      rating: '9.6',
      link: 'https://movie.douban.com/subject/1291544/',
      subjectId: '1291544',
    });
    // 无 dt img → poster 空串；无 .subject-rate → rating 空串
    expect(items[1]).toEqual({
      title: '阿飞正传',
      poster: '',
      rating: '',
      link: 'https://movie.douban.com/subject/1292937/',
      subjectId: '1292937',
    });
  });

  test('link 文本与 alt 皆空 → title 空串（条目仍产出，subjectId 由 href 决定）', async () => {
    const doc = domAt();
    doc.querySelector('#recommendations dt img')?.setAttribute('alt', '');
    const { extractRecItemsDom } = await load();
    const items = extractRecItemsDom();

    expect(items[0]?.title).toBe('');
    expect(items[0]?.subjectId).toBe('1291544');
  });
});

test.describe('extractShortComments — 跳过条件与数值兜底', () => {
  test('无 .comment-info 的条目被跳过；无 allstar → rating 0', async () => {
    domAt();
    const { extractShortComments } = await load();
    const items = extractShortComments();

    expect(items.length).toBe(3);
    expect(items[0]).toEqual({
      user: '无星级用户',
      userLink: 'https://www.douban.com/people/no-star/',
      avatar: '',
      rating: 0,
      content: '没有 allstar 类名 → rating 0。',
      time: '',
      votes: 0,
    });
  });

  test('空白正文条目仍产出（content 空串）', async () => {
    domAt();
    const { extractShortComments } = await load();
    const blank = extractShortComments()[1];

    expect(blank?.user).toBe('空正文用户');
    expect(blank?.content).toBe('');
    expect(blank?.rating).toBe(5);
  });

  test('votes "1.2k" → parseInt 前缀截断为 1；跨行正文只 trim 两端不压缩', async () => {
    const doc = domAt();
    const body = doc.querySelector('.comment-item[data-cid="e4"] .short');
    if (body) body.textContent = ' 首行\n次行 ';
    const { extractShortComments } = await load();
    const k = extractShortComments()[2];

    expect(k?.votes).toBe(1);
    expect(k?.rating).toBe(1);
    expect(k?.content).toBe('首行\n次行');
    expect(k?.time).toBe('2019-11-11');
  });

  test('评论区整体缺失 → 空数组', async () => {
    const doc = domAt();
    doc.querySelector('#comments-section')?.remove();
    const { extractShortComments } = await load();
    expect(extractShortComments()).toEqual([]);
  });
});

test.describe('extractAuthorBio / extractTOC — 找到即中断与模式二', () => {
  test('作者简介 h2 命中但兄弟节点无 .intro → 空串且不再继续扫描', async () => {
    const doc = domAt();
    doc
      .querySelector('.indent')
      ?.insertAdjacentHTML('afterend', '<div class="indent"><div class="intro">第二段</div></div>');
    const { extractAuthorBio } = await load();

    expect(extractAuthorBio()).toBe('');
  });

  test('无 _full 时走 dir_ 下的 .all 全文，· · · 分隔行被过滤', async () => {
    domAt();
    const { extractTOC } = await load();
    expect(extractTOC()).toEqual(['第一部', '第二部', '附录用语']);
  });

  test('.all 也缺失时回落裸 dir_ 容器 → 取可见 .content 截断版', async () => {
    const doc = domAt();
    doc.querySelector('#dir_777888_short .all')?.remove();
    const { extractTOC } = await load();

    expect(extractTOC()).toEqual(['第一部', '第二部（截断）']);
  });

  test('无目录节点 → 空数组', async () => {
    const doc = domAt();
    doc.querySelector('#dir_777888_short')?.remove();
    const { extractTOC } = await load();
    expect(extractTOC()).toEqual([]);
  });
});

test.describe('extractTrackItems — 空白条目与嵌套标记拼接', () => {
  test('空白 li 跳过；data-track-order 前缀；嵌套 span 文本直接拼接（无分隔空格）', async () => {
    domAt();
    const { extractTrackItems } = await load();
    expect(extractTrackItems()).toEqual(['01 冬之来临03:12', '无编号曲']);
  });

  test('容器缺失 → 空数组', async () => {
    const doc = domAt();
    doc.querySelector('.track-list')?.remove();
    const { extractTrackItems } = await load();
    expect(extractTrackItems()).toEqual([]);
  });
});

test.describe('extractBlockquotes — extra 剔除与赞数格式', () => {
  test('正文连续空白压成单空格；extra 内容不进正文；"5 赞"（有空格）解析不到 → votes 0', async () => {
    const doc = domAt();
    const body = doc.querySelector('.blockquote-list figure .blockquote');
    if (body) body.textContent = '凛冬将至，\n\n  孤身不能死。';
    const { extractBlockquotes } = await load();
    const items = extractBlockquotes();

    expect(items.length).toBe(2);
    expect(items[0]).toEqual({
      text: '凛冬将至， 孤身不能死。',
      user: '凛冬',
      source: '冰与火之歌 卷一',
      votes: 0,
    });
  });

  test('数字紧贴「赞」时才计票；无 extra 的 figure 走 textContent，无 figure 的 li 跳过', async () => {
    const doc = domAt();
    const meta = doc.querySelector('.blockquote-meta');
    if (meta) meta.innerHTML = '<a class="author-name">凛冬</a>5赞';
    const { extractBlockquotes } = await load();
    const items = extractBlockquotes();

    expect(items[0]?.votes).toBe(5);
    expect(items[1]).toEqual({
      text: '没有 extra 的摘录。',
      user: '',
      source: '',
      votes: 0,
    });
  });

  test('摘录列表整体缺失 → 空数组', async () => {
    const doc = domAt();
    doc.querySelector('.blockquote-list')?.remove();
    const { extractBlockquotes } = await load();
    expect(extractBlockquotes()).toEqual([]);
  });
});

test.describe('extractEditions — 评分/人数拆分', () => {
  test('.count 无 span → rating 空串、count 取全文', async () => {
    domAt();
    const { extractEditions } = await load();
    const items = extractEditions();

    expect(items.length).toBe(2);
    expect(items[0]).toEqual({
      title: '德米安：彷徨少年时 (平装)',
      link: 'https://book.douban.com/subject/26973406/',
      rating: '',
      count: '2315人评价',
    });
  });

  test('count 文本中评分重复出现 → 只剥离首个，残留串带前导空格被 trim', async () => {
    domAt();
    const { extractEditions } = await load();
    const items = extractEditions();

    expect(items[1]).toEqual({
      title: '德米安：彷徨少年时 (精装)',
      link: 'https://book.douban.com/subject/10840982/',
      rating: '9.0',
      count: '9.0人评价',
    });
  });

  test('非 li.mb8 条目跳过；无 .meta a 的 mb8 条目不产出', async () => {
    const doc = domAt();
    const editionsUl = Array.from(doc.querySelectorAll('h2')).find((h2) =>
      h2.textContent?.includes('其他版本'),
    )?.nextElementSibling;
    editionsUl?.insertAdjacentHTML(
      'beforeend',
      '<li class="mb8"><div class="count">无链接</div></li>',
    );
    const { extractEditions } = await load();

    expect(extractEditions().length).toBe(2);
  });
});
