import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM, type DOMWindow } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPhotosPageData } from '@/scenario/douban/pages/photos/photos-data';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * photos-data behavior lock (X11-G).
 *
 * Fixture tests/fixtures/douban/photos-gallery.html carries BOTH page shapes
 * (/photos single-type gallery + /all_photos summary); the extractor branches
 * on location.pathname, so each test mounts the same file at a different URL.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

function fixtureHtml(name: string): string {
  return fs.readFileSync(path.resolve(HERE, '../fixtures/douban', name), 'utf-8');
}

function mount(url: string): Document {
  const dom: DOMWindow = new JSDOM(fixtureHtml('photos-gallery.html'), { url }).window;
  defineGlobal('window', dom);
  defineGlobal('document', dom.document);
  defineGlobal('location', dom.location);
  defineGlobal('Node', dom.Node);
  return dom.document;
}

const PHOTOS_S = 'https://movie.douban.com/subject/1292052/photos?type=S';
const ALL = 'https://movie.douban.com/subject/1292052/all_photos';

test.describe('/photos 单类型图集分支', () => {
  test('happy path: 标题/照片项/分页/筛选 tab/URL 类型一次锁定', () => {
    mount(PHOTOS_S);
    const data = extractPhotosPageData();
    if (!data) throw new Error('gallery must not extract to null');

    expect(data.title).toBe('肖申克的救赎的剧照');
    expect(data.photoType).toBe('S');

    // 第 3 项无封面（src '' 跳过），第 4 项无 data-id（选择器排除）→ 仅剩 2 项
    expect(data.photos).toEqual([
      {
        id: '2924970668',
        // s_ratio_poster → /x/（upgradeDoubanImageSrc 单一真源）
        src: 'https://img1.doubanio.com/view/photo/x/public/p2924970668.jpg',
        link: 'https://movie.douban.com/photo/2924970668/',
        caption: '安迪与瑞德在屋顶',
        commentCount: '5',
      },
      {
        id: '1896369053',
        // 懒加载占位 data: → data-src 兜底；normal/ 路径不命中任何升级规则，原样保留
        src: 'https://img2.doubanio.com/view/photo/normal/s1896369053.jpg',
        link: 'https://movie.douban.com/photo/1896369053/',
        caption: '海报 A2',
        commentCount: '',
      },
    ]);

    expect(data.pageInfo).toEqual({
      currentPage: 2,
      totalPages: 18, // .thispage[data-total-page]
      totalCount: 320, // .count 首个数字
      prevUrl: 'https://movie.douban.com/subject/1292052/photos?type=S&start=0',
      nextUrl: 'https://movie.douban.com/subject/1292052/photos?type=S&start=36',
    });

    // li.up（回到顶部）跳过；span.cur 视为当前项且 url 为空串
    expect(data.filterTabs).toEqual([
      {
        label: '海报(13)',
        url: 'https://movie.douban.com/subject/1292052/photos?type=R',
        isCurrent: false,
      },
      { label: '剧照(320)', url: '', isCurrent: true },
      {
        label: '壁纸(4)',
        url: 'https://movie.douban.com/subject/1292052/photos?type=W',
        isCurrent: false,
      },
    ]);
    expect(data.subFilters).toEqual([
      {
        label: '全部',
        url: 'https://movie.douban.com/subject/1292052/all_photos',
        isCurrent: false,
      },
      {
        label: '时间排序',
        url: 'https://movie.douban.com/subject/1292052/photos?type=S&sortby=time',
        isCurrent: false,
      },
    ]);
    // 单类型分支固定不抽侧栏（现状锁定）
    expect(data.sidebarLinks).toEqual([]);
  });

  test('只读宿主：抽取后原生评论链接仍在（禁止破坏性 .remove()）', () => {
    const doc = mount(PHOTOS_S);
    const sel = 'ul[class*="poster-col"] .name a';
    const before = doc.querySelectorAll(sel).length;
    extractPhotosPageData();
    // 抽取不得改写宿主 DOM：caption 用克隆剥离评论链接，原生 `<a>` 必须原样保留。
    expect(doc.querySelectorAll(sel).length).toBe(before);
    expect(before).toBeGreaterThan(0);
  });

  test('photoType：非法 type=X 与缺省均回落 R；W 原样透传', () => {
    mount('https://movie.douban.com/subject/1292052/photos?type=X');
    expect(extractPhotosPageData()?.photoType).toBe('R');
    mount('https://movie.douban.com/subject/1292052/photos');
    expect(extractPhotosPageData()?.photoType).toBe('R');
    mount('https://movie.douban.com/subject/1292052/photos?type=W');
    expect(extractPhotosPageData()?.photoType).toBe('W');
  });

  test('无 .paginator → totalCount 回退实际照片数，分页字段给默认值', () => {
    const doc = mount(PHOTOS_S);
    doc.querySelector('.paginator')?.remove();
    const data = extractPhotosPageData();
    expect(data?.pageInfo).toEqual({
      currentPage: 1,
      totalPages: 1,
      totalCount: 2, // photos.length 兜底
      prevUrl: '',
      nextUrl: '',
    });
  });

  test('paginator 存在但无 .count → totalCount 同样回退 photos.length', () => {
    const doc = mount(PHOTOS_S);
    doc.querySelector('.paginator .count')?.remove();
    expect(extractPhotosPageData()?.pageInfo.totalCount).toBe(2);
  });

  test('缺 #photos_filter → 两级筛选均空数组（页数据仍成立）', () => {
    const doc = mount(PHOTOS_S);
    doc.querySelector('#photos_filter')?.remove();
    const data = extractPhotosPageData();
    expect(data).not.toBeNull();
    expect(data?.filterTabs).toEqual([]);
    expect(data?.subFilters).toEqual([]);
  });

  test('缺 #content h1 → title 空串而非 null', () => {
    const doc = mount(PHOTOS_S);
    doc.querySelector('#content h1')?.remove();
    expect(extractPhotosPageData()?.title).toBe('');
  });

  test('非 all_photos 且无 poster-col 图集 → null（挂载守卫）', () => {
    const doc = mount(PHOTOS_S);
    doc.querySelector('ul[class*="poster-col"]')?.remove();
    expect(extractPhotosPageData()).toBeNull();
  });
});

test.describe('/all_photos 汇总分支', () => {
  test('happy path: pic-col5 抽图 + 固定分页 + 侧栏链接清洗', () => {
    mount(ALL);
    const data = extractPhotosPageData();
    if (!data) throw new Error('summary page must not extract to null');

    expect(data.title).toBe('肖申克的救赎的剧照');
    // 无 a / 无 img 的 li 与 li.more-pics 均被跳过 → 2 项
    expect(data.photos).toEqual([
      {
        id: '2924970668',
        src: 'https://img1.doubanio.com/view/photo/x/public/p2924970668.jpg',
        link: 'https://movie.douban.com/photo/2924970668/',
        caption: '',
        commentCount: '',
      },
      {
        id: '1896369053',
        // data-src 优先于（缺省的）img.src
        src: 'https://img2.doubanio.com/view/photo/x/public/p1896369053.jpg',
        link: 'https://movie.douban.com/photo/1896369053/',
        caption: '',
        commentCount: '',
      },
    ]);
    // photoId 从 /photo/{id}/ 链接反解；汇总页固定单页/类型 R/无筛选
    expect(data.pageInfo).toEqual({
      currentPage: 1,
      totalPages: 1,
      totalCount: 2,
      prevUrl: '',
      nextUrl: '',
    });
    expect(data.photoType).toBe('R');
    expect(data.filterTabs).toEqual([]);
    expect(data.subFilters).toEqual([]);

    // 侧栏：'> ' 前缀剥离、纯空白文本跳过、.mb30 也在选择器内
    expect(data.sidebarLinks).toEqual([
      { href: 'https://movie.douban.com/subject/1292052/', text: '返回电影页面' },
      { href: 'https://movie.douban.com/subject/1292052/trailer', text: '预告片 (13)' },
      { href: 'https://movie.douban.com/subject/1292052/celebrities', text: '演职员表' },
    ]);
  });

  test('all_photos 但缺 div.mod ul.pic-col5 → null（挂载守卫）', () => {
    const doc = mount(ALL);
    doc.querySelector('div.mod ul.pic-col5')?.remove();
    expect(extractPhotosPageData()).toBeNull();
  });

  test('链接不含 /photo/{id}/ 时 photoId 为空串但仍收项', () => {
    const doc = mount(ALL);
    const a = doc.querySelector('ul.pic-col5 li a');
    a?.setAttribute('href', 'https://movie.douban.com/subject/1292052/photos');
    const first = extractPhotosPageData()?.photos[0];
    expect(first?.id).toBe('');
    expect(first?.link).toBe('https://movie.douban.com/subject/1292052/photos');
  });
});
