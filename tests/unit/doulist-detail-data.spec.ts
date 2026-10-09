import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDoulistDetailData } from '@/scenario/douban/pages/doulist-detail/doulist-detail-data';

/**
 * doulist-detail 数据提取单元测试（X11-5a 行为锁定）。
 *
 * 夹具 doulist-detail.html 复刻 www.douban.com/doulist/{id}/ 的真实 DOM 形态
 * （模块直接读取全局 document/location，故先安装 JSDOM 全局，
 * precedent: doulist-dialog-render.spec.ts）。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.resolve(HERE, '../fixtures/douban/doulist-detail.html'), 'utf-8');

const BASE_URL = 'https://www.douban.com/doulist/1500001/';

// Node 24 exposes some browser globals as getter-only; redefine instead of assign.
function domAt(url: string): Document {
  const dom = new JSDOM(HTML, { url, runScripts: 'outside-only' });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  return dom.window.document;
}

type PageData = NonNullable<ReturnType<typeof extractDoulistDetailData>>;

test.describe('doulist-detail 头部信息', () => {
  test('标题/封面/创建者/时间/简介', () => {
    domAt(BASE_URL);
    const data = extractDoulistDetailData();
    expect(data).not.toBeNull();
    const d = data as PageData;

    expect(d.id).toBe('1500001');
    expect(d.title).toBe('犯罪类型片精选');
    expect(d.coverUrl).toBe('https://img1.doubanio.com/cpms/doulist/cover_1500001_big.jpg');
    expect(d.creator).toEqual({
      id: 'moviefan001',
      name: '电影狂热者',
      location: '杭州',
      avatarUrl: 'https://img2.doubanio.com/icon/u100000-1.jpg',
    });
    // "2019-04-12 创建 · 2025-11-03 更新" → 前后段时间戳（含 "·" 分隔清洗）
    expect(d.createdTime).toBe('2019-04-12');
    expect(d.updatedTime).toBe('2025-11-03');
    expect(d.description).toBe('精选华语与好莱坞犯罪类型片，按年代排序，持续更新。');
  });

  test('#doulist-info 缺失 → 头部字段全部回落空串（文档化兜底）', () => {
    const doc = domAt(BASE_URL);
    doc.querySelector('#doulist-info')?.remove();
    doc.querySelector('h1')?.remove();
    const d = extractDoulistDetailData() as PageData;
    expect(d.title).toBe('');
    expect(d.coverUrl).toBe('');
    expect(d.creator).toEqual({ id: '', name: '', location: '', avatarUrl: '' });
    expect(d.createdTime).toBe('');
    expect(d.updatedTime).toBe('');
    expect(d.description).toBe('');
    // id 来自 URL，与 DOM 无关
    expect(d.id).toBe('1500001');
  });
});

test.describe('doulist-detail 筛选标签与计数', () => {
  test('.doulist-filter 三档：相对链接补全域名 + active + count', () => {
    domAt(BASE_URL);
    const d = extractDoulistDetailData() as PageData;
    expect(d.filters).toEqual([
      { label: '全部', count: 35, url: 'https://www.douban.com/doulist/1500001/', active: true },
      {
        label: '我没看过的',
        count: 12,
        url: 'https://www.douban.com/doulist/1500001/?type=unwatched',
        active: false,
      },
      {
        label: '我看过的',
        count: 23,
        url: 'https://www.douban.com/doulist/1500001/?type=watched',
        active: false,
      },
    ]);
    // 总数取 active 标签的 count
    expect(d.totalCount).toBe(35);
  });

  test('无 active 时回落第一个有 count 的标签；筛选缺失 → count 0', () => {
    const doc = domAt(BASE_URL);
    doc.querySelectorAll('.doulist-filter a').forEach((a) => a.classList.remove('active'));
    const d1 = extractDoulistDetailData() as PageData;
    expect(d1.totalCount).toBe(35);

    const doc2 = domAt(BASE_URL);
    doc2.querySelector('.doulist-filter')?.remove();
    const d2 = extractDoulistDetailData() as PageData;
    expect(d2.filters).toEqual([]);
    expect(d2.totalCount).toBe(0);
  });
});

test.describe('doulist-detail 条目提取', () => {
  test('条目 1（电影）：data-id/cate + 评分人数 + <br> 摘要五字段', () => {
    domAt(BASE_URL);
    const d = extractDoulistDetailData() as PageData;
    // 广告条目（无 id 无链接）被跳过 → 3 条
    expect(d.items.length).toBe(3);

    const hanZhan = d.items[0];
    expect(hanZhan).toBeDefined();
    expect(hanZhan?.subjectId).toBe('6011813');
    expect(hanZhan?.title).toBe('寒战 寒戰');
    expect(hanZhan?.subjectUrl).toBe('https://movie.douban.com/subject/6011813/');
    expect(hanZhan?.posterUrl).toBe(
      'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p2936200101.jpg',
    );
    expect(hanZhan?.rating).toBe(8.1);
    expect(hanZhan?.ratingCount).toBe(431872);
    expect(hanZhan?.director).toBe('梁乐民 / 陆剑青');
    expect(hanZhan?.actors).toBe('郭富城 / 梁家辉 / 李治廷');
    expect(hanZhan?.genres).toBe('剧情 / 动作 / 犯罪');
    expect(hanZhan?.region).toBe('中国香港/中国大陆');
    expect(hanZhan?.year).toBe('2012');
    expect(hanZhan?.source).toBe('来自：豆瓣电影');
    expect(hanZhan?.category).toBe('1002');
    expect(hanZhan?.hasVideo).toBe(false);
  });

  test('条目 2（音乐）：无 data-id 从 /subject/ URL 推导 id；逗号人数；音乐字段映射', () => {
    domAt(BASE_URL);
    const d = extractDoulistDetailData() as PageData;
    const fanTeXi = d.items[1];
    expect(fanTeXi?.subjectId).toBe('1078062');
    expect(fanTeXi?.title).toBe('范特西');
    // 作者: → director、表演者: → actors、流派: → genres（模块注释声明的映射）
    expect(fanTeXi?.director).toBe('周杰伦');
    expect(fanTeXi?.actors).toBe('周杰伦');
    expect(fanTeXi?.genres).toBe('流行');
    expect(fanTeXi?.year).toBe('2001');
    expect(fanTeXi?.rating).toBe(9.4);
    expect(fanTeXi?.ratingCount).toBe(120540);
    expect(fanTeXi?.hasVideo).toBe(true);
    // 无 data-cate 且 add-btn 无 data-id → category 空串
    expect(fanTeXi?.category).toBe('');
    // 无 source 元素
    expect(fanTeXi?.source).toBe('');
  });

  test('条目 3（书）：无评分段 → rating/ratingCount 归 0（无评分边界）', () => {
    domAt(BASE_URL);
    const d = extractDoulistDetailData() as PageData;
    const book = d.items[2];
    expect(book?.subjectId).toBe('36185161');
    expect(book?.rating).toBe(0);
    expect(book?.ratingCount).toBe(0);
    expect(book?.director).toBe('马伯庸');
    expect(book?.source).toBe('来自：豆瓣图书');
    expect(book?.genres).toBe('');
    expect(book?.year).toBe('');
  });
});

test.describe('doulist-detail 分页与整体兜底', () => {
  test('paginator：thispage data-total-page + 下一页绝对 URL', () => {
    domAt(BASE_URL);
    const d = extractDoulistDetailData() as PageData;
    expect(d.paginator).toEqual({
      currentPage: 1,
      totalPages: 2,
      prevUrl: '',
      nextUrl: 'https://www.douban.com/doulist/1500001/?start=30',
      pages: [
        { label: '1', url: '', current: true },
        { label: '2', url: 'https://www.douban.com/doulist/1500001/?start=30', current: false },
      ],
    });
  });

  test('.paginator 缺失 → 富契约回落 1/1 空页（文档化兜底）', () => {
    const doc = domAt(BASE_URL);
    doc.querySelector('.paginator')?.remove();
    const d = extractDoulistDetailData() as PageData;
    expect(d.paginator).toEqual({
      currentPage: 1,
      totalPages: 1,
      prevUrl: '',
      nextUrl: '',
      pages: [],
    });
  });

  test('URL 不含 /doulist/{id} → null', () => {
    domAt('https://www.douban.com/people/1234567/doulists');
    expect(extractDoulistDetailData()).toBeNull();
  });
});
