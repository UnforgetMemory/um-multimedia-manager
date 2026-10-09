import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * extra-extract 补充 DOM 提取单元测试（X11-1 行为锁定）。
 *
 * 夹具：detail-movie.html / detail-music.html / detail-book.html。
 * 模块读取全局 document 并经 DOMPurify 清洗 → 与 detail-extract.spec 相同：
 * 先装全局 window 再动态 import（dompurify 在模块加载时绑定 window）。
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

test.describe('extractCelebrities — 演职员/创作者', () => {
  test('电影页：#celebrities .celebrity 头像 url() 剥离 + 人数括号剥离', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractCelebrities } = await load();
    const c = extractCelebrities(false, false);

    expect(c.celebHeadingKey).toBe('douban.detail.celeb_cast');
    expect(c.celebCount).toBe('53');
    expect(c.celebItems.length).toBe(3);
    expect(c.celebItems[0]).toEqual({
      name: '弗兰克·德拉邦特',
      role: '导演',
      avatar: 'https://img9.doubanio.com/view/celebrity/s_ratio_celebrity/public/p251.jpg',
      link: 'https://movie.douban.com/celebrity/1047973/',
    });
    // 名称尾随空格被 trim；单引号包裹的 url() 同样被剥离
    expect(c.celebItems[1]?.name).toBe('蒂姆·罗宾斯');
    expect(c.celebItems[1]?.role).toBe('饰 Andy Dufresne');
    expect(c.celebItems[1]?.avatar).toBe(
      'https://img2.doubanio.com/view/celebrity/s_ratio_celebrity/public/p5606.jpg',
    );
    // 缺 role / avatar 的成员走空串兜底
    expect(c.celebItems[2]).toEqual({
      name: '罗杰·狄金斯',
      role: '',
      avatar: '',
      link: 'https://movie.douban.com/celebrity/1004728/',
    });
  });

  test('音乐页：heading 表演者（isMusic 由调用方传入）', async () => {
    domAt(MUSIC, MUSIC_URL);
    const { extractCelebrities } = await load();
    const c = extractCelebrities(true, false);

    expect(c.celebHeadingKey).toBe('douban.detail.celeb_performer');
    expect(c.celebCount).toBe('12');
    expect(c.celebItems.map((i) => i.name)).toEqual(['Pink Floyd', '大卫·吉尔莫']);
  });

  test('图书页：无 #celebrities 时回落 #authors，.fake 推广项排除', async () => {
    domAt(BOOK, BOOK_URL);
    const { extractCelebrities } = await load();
    const c = extractCelebrities(false, true);

    expect(c.celebHeadingKey).toBe('douban.detail.celeb_creator');
    expect(c.celebItems.length).toBe(2);
    expect(c.celebItems[0]).toEqual({
      name: '赫尔曼·黑塞',
      role: '作者',
      avatar:
        'https://img3.doubanio.com/f/author/legacy/2b14445630cc64891c64464445564c5f/o/hesse.jpg',
      link: 'https://book.douban.com/author/1044528/',
    });
    expect(c.celebItems[1]?.role).toBe('译者');
    // 无 #celebrities → celebCount 只从 #celebrities 读取 → 空串
    expect(c.celebCount).toBe('');
  });

  test('全部模块缺失（电影页删除 #celebrities 且非书）→ 空数组', async () => {
    const doc = domAt(MOVIE, MOVIE_URL);
    doc.querySelector('#celebrities')?.remove();
    const { extractCelebrities } = await load();
    const c = extractCelebrities(false, false);

    expect(c.celebItems).toEqual([]);
    expect(c.celebCount).toBe('');
  });
});

test.describe('extractPhotos — 剧照/预告片缩略区', () => {
  test('电影页：video 背景图与 img 双分支 + isVideo 标志 + 计数', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractPhotos } = await load();
    const p = extractPhotos();

    expect(p.photoItems.length).toBe(2);
    expect(p.photoItems[0]).toEqual({
      src: 'https://img1.doubanio.com/f/movie/a1b2c3d4/img/trailer/trailer-video-1.jpg',
      link: 'https://movie.douban.com/subject/1292052/trailer/',
      isVideo: true,
    });
    // 普通 img 分支经 upgradeDoubanImageSrc 升级 s_ratio_poster → x
    expect(p.photoItems[1]).toEqual({
      src: 'https://img1.doubanio.com/view/photo/x/public/p2924970668.jpg',
      link: 'https://movie.douban.com/subject/1292052/photos/',
      isVideo: false,
    });
    expect(p.trailerCount).toBe('13');
    expect(p.photoCount).toBe('54');
  });

  test('无 #related-pic 模块 → 空数组 + 空计数', async () => {
    domAt(MUSIC, MUSIC_URL);
    const { extractPhotos } = await load();
    expect(extractPhotos()).toEqual({ photoItems: [], photoCount: '', trailerCount: '' });
  });

  test('计数文本无数字（如带括号 图片(54)）→ 计数为空串（格式疑点已上报）', async () => {
    const doc = domAt(MOVIE, MOVIE_URL);
    const pl = doc.querySelector('#related-pic h2 .pl');
    if (pl) pl.textContent = '预告片(13) · 图片(54)';
    const { extractPhotos } = await load();
    const p = extractPhotos();

    // /预告片(\d+)/ 与 /图片(\d+)/ 不容忍数字前的括号；真实页面格式待线上验证，
    // 若为括号形态则计数恒空 —— 已在波次报告中作为疑点上报。
    expect(p.trailerCount).toBe('');
    expect(p.photoCount).toBe('');
  });
});

test.describe('extractRecItemsDom — 热门推荐（仅 DOM）', () => {
  test('电影页：#recommendations 2 条有效，推广位（无 subject 链接）跳过', async () => {
    domAt(MOVIE, MOVIE_URL);
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
    expect(items[1]?.title).toBe('阿飞正传');
    expect(items[1]?.subjectId).toBe('1292937');
  });

  test('音乐页：#db-rec-section 容器回落（.content 选择）', async () => {
    domAt(MUSIC, MUSIC_URL);
    const { extractRecItemsDom } = await load();
    const items = extractRecItemsDom();

    expect(items.length).toBe(2);
    expect(items[0]?.title).toBe('The Dark Side of the Moon');
    expect(items[0]?.poster).toBe('https://img3.doubanio.com/view/subject/x/public/s1439863.jpg');
    expect(items[1]?.subjectId).toBe('1461334');
  });

  test('无推荐容器（图书夹具）→ 空数组', async () => {
    domAt(BOOK, BOOK_URL);
    const { extractRecItemsDom } = await load();
    expect(extractRecItemsDom()).toEqual([]);
  });
});

test.describe('extractShortComments — 短评', () => {
  test('电影页：allstar 星级数字解析 + 非数字票数兜底 0 + 缺正文项跳过', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractShortComments } = await load();
    const items = extractShortComments();

    expect(items.length).toBe(2);
    expect(items[0]).toEqual({
      user: '蓝眼镜',
      userLink: 'https://www.douban.com/people/blueglass/',
      avatar: 'https://img2.doubanio.com/icon/u3636247-1.jpg',
      rating: 5,
      content: '希望是美好的事物，也许是世上最美好的事物。',
      time: '2005-07-29',
      votes: 2038,
    });
    // allstar30 → 3；'没用' → parseInt NaN → 0；时间空白被 trim
    expect(items[1]?.rating).toBe(3);
    expect(items[1]?.votes).toBe(0);
    expect(items[1]?.time).toBe('2010-01-03');
  });

  test('半星短评 allstar45 → 4.5：与页面族 parseRating 约定一致（现行 allstar(\\d)0 丢半星）', async () => {
    const doc = domAt(MOVIE, MOVIE_URL);
    const star = doc.querySelector(
      '#comments-section .comment-item[data-cid="c1001"] [class*="allstar"]',
    );
    if (!star) throw new Error('fixture must expose a star class');
    star.className = 'allstar45';
    const { extractShortComments } = await load();
    const items = extractShortComments();

    // /allstar(\d)0/ 需尾随 0，遇 'allstar45' 不匹配 → 现行返回 0（丢评分）；
    // 修复走 shared parseRating(/allstar(\d+)/÷10) → 4.5。
    expect(items[0]?.rating).toBe(4.5);
  });

  test('侧栏 #comments-section 之外的 comment-item 不被提取', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractShortComments } = await load();
    const items = extractShortComments();

    expect(items.some((i) => i.content.includes('侧栏'))).toBe(false);
  });

  test('无评论区 → 空数组', async () => {
    domAt(MUSIC, MUSIC_URL);
    const { extractShortComments } = await load();
    expect(extractShortComments()).toEqual([]);
  });
});

test.describe('extractAuthorBio / extractTOC — 图书专属', () => {
  test('图书页作者简介：h2 定位 + 兄弟 .intro 清洗输出', async () => {
    domAt(BOOK, BOOK_URL);
    const { extractAuthorBio } = await load();
    const html = extractAuthorBio();

    expect(html).toContain('诺贝尔文学奖');
    expect(html).toContain('<p>');
  });

  test('非图书页无 作者简介 h2 → 空串', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractAuthorBio } = await load();
    expect(extractAuthorBio()).toBe('');
  });

  test('图书目录：优先 _full 完整版，展开全部/省略号行被过滤', async () => {
    domAt(BOOK, BOOK_URL);
    const { extractTOC } = await load();
    expect(extractTOC()).toEqual([
      '第一部 少年时代',
      '两个世界',
      '该隐',
      '第二部 该隐之后',
      '强尼',
      '第三部 萌芽',
    ]);
  });

  test('_full 缺失时回落 dir_ 短版，(更多) 截断标记被过滤', async () => {
    const doc = domAt(BOOK, BOOK_URL);
    doc.querySelector('#dir_3730858_full')?.remove();
    const { extractTOC } = await load();
    expect(extractTOC()).toEqual(['第一部 少年时代', '两个世界']);
  });

  test('无目录节点 → 空数组', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractTOC } = await load();
    expect(extractTOC()).toEqual([]);
  });
});

test.describe('extractTrackItems — 专辑曲目', () => {
  test('音乐页：data-track-order 前缀拼接，无 order 直接取文本', async () => {
    domAt(MUSIC, MUSIC_URL);
    const { extractTrackItems } = await load();
    expect(extractTrackItems()).toEqual([
      '1 Shine On You Crazy Diamond (Parts I-V)',
      '2 Welcome to the Machine',
      'Have a Cigar',
    ]);
  });

  test('电影页无曲目模块 → 空数组', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractTrackItems } = await load();
    expect(extractTrackItems()).toEqual([]);
  });
});

test.describe('extractBlockquotes — 原文摘录', () => {
  test('图书页：带 extra 条目解析用户/赞数/出处；无 extra 走空兜底；无 figure 跳过', async () => {
    domAt(BOOK, BOOK_URL);
    const { extractBlockquotes } = await load();
    const items = extractBlockquotes();

    expect(items.length).toBe(2);
    expect(items[0]?.text).toBe('“鸟要挣脱出壳。蛋就是世界。人要诞于世上，就得摧毁这个世界。”');
    expect(items[0]?.user).toBe('灵枢');
    expect(items[0]?.source).toBe('德米安：彷徨少年时');
    expect(items[0]?.votes).toBe(36);
    expect(items[1]).toEqual({
      text: '“对于每个人，他真正的职业在于：探求自身深处的声音。”',
      user: '',
      source: '',
      votes: 0,
    });
  });

  test('非图书页 → 空数组', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractBlockquotes } = await load();
    expect(extractBlockquotes()).toEqual([]);
  });
});

test.describe('extractEditions — 其他版本', () => {
  test('图书页：h2 后紧邻 ul 的 li.mb8 解析，评分/人数拆分，无 mb8 类跳过', async () => {
    domAt(BOOK, BOOK_URL);
    const { extractEditions } = await load();
    const items = extractEditions();

    expect(items.length).toBe(2);
    expect(items[0]).toEqual({
      title: '德米安：彷徨少年时 (2014)',
      link: 'https://book.douban.com/subject/26973406/',
      rating: '9.0',
      count: '2315人评价',
    });
    expect(items[1]?.rating).toBe('8.7');
  });

  test('h2 存在但兄弟节点不是 UL → 空数组', async () => {
    const doc = domAt(BOOK, BOOK_URL);
    const h2 = Array.from(doc.querySelectorAll('h2')).find((h) =>
      h.textContent?.includes('其他版本'),
    );
    h2?.nextElementSibling?.remove();
    const { extractEditions } = await load();
    expect(extractEditions()).toEqual([]);
  });

  test('电影页无 其他版本 h2 → 空数组', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { extractEditions } = await load();
    expect(extractEditions()).toEqual([]);
  });
});
