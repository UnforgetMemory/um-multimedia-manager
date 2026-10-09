import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM, type DOMWindow } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractTrailerData } from '@/scenario/douban/pages/trailer/trailer-data';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * trailer-data 行为锁定单元测试（X11-1）。
 *
 * 夹具：trailer-list.html（/subject/{id}/trailer 列表）与
 * trailer-detail.html（/trailer/{id}/ 详情，同文件复用于 /video/{id}/）。
 * 模块无 dompurify 依赖，可静态 import；但 isDetail()/subject-id 提取读取
 * window.location，故每个用例连 window 一起重挂载。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

function fixtureHtml(name: string): string {
  return fs.readFileSync(path.resolve(HERE, '../fixtures/douban', name), 'utf-8');
}

function mount(file: string, url: string): Document {
  const dom: DOMWindow = new JSDOM(fixtureHtml(file), { url }).window;
  defineGlobal('window', dom);
  defineGlobal('document', dom.document);
  defineGlobal('location', dom.location);
  defineGlobal('Node', dom.Node);
  return dom.document;
}

const LIST = 'trailer-list.html';
const LIST_URL = 'https://movie.douban.com/subject/1292052/trailer';
const DETAIL = 'trailer-detail.html';
const TRAILER_URL = 'https://movie.douban.com/trailer/130123/';
const VIDEO_URL = 'https://movie.douban.com/video/200567/';

test.describe('trailer 列表页 — /subject/{id}/trailer', () => {
  test('页级字段：标题/subject 链接/URL 主体 id/非详情', () => {
    mount(LIST, LIST_URL);
    const data = extractTrailerData();
    if (!data) throw new Error('listing must not extract to null');

    expect(data.title).toBe('肖申克的救赎 预告片');
    expect(data.subjectTitle).toBe('肖申克的救赎');
    // pathname '/subject/1292052/trailer' 命中 /\/(\d+)\// 的 URL 主路径
    expect(data.subjectId).toBe('1292052');
    expect(data.isDetail).toBe(false);
    // detail-only 字段在列表分支固定为空串（设计如此）
    expect(data.videoUrl).toBe('');
    expect(data.date).toBe('');
    expect(data.description).toBe('');
  });

  test('预告片条目：data-src/src 双分支、small→medium 仅命中 /img/trailer/small/、无链接项跳过', () => {
    mount(LIST, LIST_URL);
    const items = extractTrailerData()?.items ?? [];

    // li3（无 a.pr-video）与 li4（无标题 p）被跳过；仅剩 2 trailer + 1 video_review
    expect(items.length).toBe(3);
    expect(items.map((i) => i.id)).toEqual(['130123', '130124', '200567']);

    expect(items[0]).toEqual({
      id: '130123',
      title: '《肖申克的救赎》先行预告片',
      // data-src 存在且含 /img/trailer/small/ → 升级 medium；href 相对 → 补域名前缀
      thumbnail: 'https://img1.doubanio.com/f/movie/img/trailer/medium/p130123.jpg',
      duration: '02:30',
      link: 'https://movie.douban.com/trailer/130123/',
      date: '2013-12-15',
      type: 'trailer',
      commentCount: '12',
    });
    expect(items[1]).toEqual({
      id: '130124',
      // 标题两侧空白被 trim
      title: '删减片段合集',
      // src-only 分支同样命中全局 replace('/img/trailer/small/')→medium（与宿主前缀无关）
      thumbnail: 'https://img1.doubanio.com/f/movie/img/trailer/medium/p130124.jpg',
      duration: '01:12',
      link: 'https://movie.douban.com/trailer/130124/',
      date: '2014-01-02',
      type: 'trailer',
      // trail-meta 无回应锚点 → 空串
      commentCount: '',
    });
  });

  test('视频评论条目：video-col3 布局、作者锚点、video/small 不升级', () => {
    mount(LIST, LIST_URL);
    const vr = extractTrailerData()?.items?.[2];

    expect(vr).toEqual({
      id: '200567',
      title: '深度解读《肖申克的救赎》',
      thumbnail: 'https://img1.doubanio.com/f/movie/img/video/small/v200567.jpg',
      duration: '12:05',
      link: 'https://movie.douban.com/video/200567/',
      date: '2021-05-03',
      type: 'video_review',
      author: '迷影笔记',
      commentCount: '8',
    });
  });

  test('URL 无数字段时回落 #content h1 subject 链接', () => {
    // 列表分支的 subjectId DOM 兜底路径；h1 链接 /subject/1292052/ 提取数字
    mount(LIST, 'https://movie.douban.com/trailers/latest');
    const data = extractTrailerData();

    expect(data?.subjectId).toBe('1292052');
    expect(data?.isDetail).toBe(false);
  });

  test('播放列表全部移除 → items 为空 → null（空页兜底）', () => {
    const doc = mount(LIST, LIST_URL);
    doc.querySelectorAll('ul.video-list > li, ul.video-col3 > li').forEach((li) => li.remove());
    expect(extractTrailerData()).toBeNull();
  });
});

test.describe('trailer 详情页 — /trailer/{id}/', () => {
  test('页级字段：isDetail/播放源/日期/简介；h1 同时给出 title 与 subjectTitle', () => {
    mount(DETAIL, TRAILER_URL);
    const data = extractTrailerData();
    if (!data) throw new Error('detail page must not extract to null');

    expect(data.isDetail).toBe(true);
    expect(data.title).toBe('肖申克的救赎 正式预告片');
    expect(data.subjectTitle).toBe('肖申克的救赎');
    // Suspected defect (reported): extractSubjectIdFromUrl matches /\/(\d+)\// on
    // '/trailer/130123/' and returns the VIDEO id as subjectId; the h1 DOM fallback
    // (which would give 1292052) is never reached. Locked as current behavior.
    expect(data.subjectId).toBe('130123');
    expect(data.videoUrl).toBe('https://awvs.doubanio.com/view/video/public/130123.mp4');
    // .trailer-info span 取首个文本 span（span.date），跳过尾部锚点
    expect(data.date).toBe('2013-12-15');
    expect(data.description).toBe(
      '1947年，银行家安迪被指控谋杀，进入了肖申克监狱——本片正式预告片。',
    );
  });

  test('播放列表：src/data-src 取图顺序 + trailer 分支升级 medium + 无链接项跳过', () => {
    mount(DETAIL, TRAILER_URL);
    const items = extractTrailerData()?.items ?? [];

    expect(items.length).toBe(2);
    expect(items[0]).toEqual({
      id: '130123',
      // Quirk (reported): detail branch reads title AND duration from the same
      // <strong> (trailer-data.ts:119-120 both select 'strong'), so duration
      // duplicates the combined "标题 (mm:ss)" text. No em element exists here.
      title: '《肖申克的救赎》正式预告片 (02:30)',
      duration: '《肖申克的救赎》正式预告片 (02:30)',
      thumbnail: 'https://img1.doubanio.com/f/movie/img/trailer/medium/p130123.jpg',
      link: 'https://movie.douban.com/trailer/130123/',
      date: '',
      type: 'trailer',
    });
    // 第二项无 src 属性 → getAttribute('src')||getAttribute('data-src') 走 data-src
    expect(items[1]?.thumbnail).toBe(
      'https://img1.doubanio.com/f/movie/img/trailer/medium/p130124.jpg',
    );
    expect(items[1]?.id).toBe('130124');
    expect(items[1]?.link).toBe('https://movie.douban.com/trailer/130124/');
  });

  test('同一夹具挂到 /video/200567/ → type 翻转 video_review 且不做 small→medium 替换', () => {
    mount(DETAIL, VIDEO_URL);
    const items = extractTrailerData()?.items ?? [];

    expect(items[0]?.type).toBe('video_review');
    // img src 指向 trailer/small/，但 video_review 分支跳过 replace（现状锁定）
    expect(items[0]?.thumbnail).toBe(
      'https://img1.doubanio.com/f/movie/img/trailer/small/p130123.jpg',
    );
    expect(items[1]?.thumbnail).toBe(
      'https://img1.doubanio.com/f/movie/img/trailer/small/p130124.jpg',
    );
  });

  test('#player 缺失时 videoUrl 回落 ld+json embedUrl', () => {
    const doc = mount(DETAIL, TRAILER_URL);
    doc.querySelector('#player')?.remove();
    expect(extractTrailerData()?.videoUrl).toBe('https://movie.douban.com/embed/trailer/130123/');
  });

  test('#player 与 ld+json 双缺失 → videoUrl 空串；损坏 JSON 不抛异常', () => {
    const doc = mount(DETAIL, TRAILER_URL);
    doc.querySelector('#player')?.remove();
    const script = doc.querySelector('script[type="application/ld+json"]');
    if (script) script.textContent = '{bad json';
    const data = extractTrailerData();
    if (!data) throw new Error('detail page must still extract');

    expect(data.videoUrl).toBe('');
  });

  test('ld+json 损坏但 #player 在 → 仍取 source.src', () => {
    const doc = mount(DETAIL, TRAILER_URL);
    const script = doc.querySelector('script[type="application/ld+json"]');
    if (script) script.textContent = '{bad json';
    expect(extractTrailerData()?.videoUrl).toBe(
      'https://awvs.doubanio.com/view/video/public/130123.mp4',
    );
  });
});
