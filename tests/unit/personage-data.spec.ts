import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPersonagePageData } from '@/scenario/douban/pages/personage/personage-data';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * personage（影人主页）数据提取单元测试（X11-5a 行为锁定）。
 *
 * 夹具 personage.html 复刻 www.douban.com/personage/{id}/ 的真实 DOM 形态；
 * 模块直接读取全局 document/location，故先把 JSDOM 装进全局
 * （precedent: doulist-dialog-render.spec.ts）。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.resolve(HERE, '../fixtures/douban/personage.html'), 'utf-8');

const BASE_URL = 'https://www.douban.com/personage/90000001/';

function domAt(url: string): Document {
  const dom = new JSDOM(HTML, { url, runScripts: 'outside-only' });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  return dom.window.document;
}

type PageData = NonNullable<ReturnType<typeof extractPersonagePageData>>;

test.describe('personage 基础信息', () => {
  test('id/姓名/头像/属性列表', () => {
    domAt(BASE_URL);
    const data = extractPersonagePageData();
    expect(data).not.toBeNull();
    const d = data as PageData;

    expect(d.personageId).toBe('90000001');
    expect(d.name).toBe('张明远');
    expect(d.avatar).toBe('https://img1.doubanio.com/icon/ra90000001-9.jpg');
    // label 去掉尾部冒号；缺 value 的 li（职业）跳过
    expect(d.properties).toEqual([
      { label: '性别', value: '男' },
      { label: '出生地', value: '中国,重庆' },
      { label: 'IMDb编号', value: 'nm1234567' },
    ]);
  });

  test('简介优先 og:description，空白折叠为单空格', () => {
    domAt(BASE_URL);
    const d = extractPersonagePageData() as PageData;
    expect(d.biography).toBe(
      '张明远，1975年出生于重庆， 中国内地导演、编剧。 2023年凭《长途跋涉》获金鸡奖最佳导演。',
    );
  });

  test('og:description 缺失 → 回落 .desc .content 截断段（文档化兜底）', () => {
    const doc = domAt(BASE_URL);
    doc.querySelector('meta[property="og:description"]')?.remove();
    const d = extractPersonagePageData() as PageData;
    expect(d.biography).toBe('张明远，1975年出生于重庆，中国内地导演、编剧。（完整简介见豆瓣）');
  });

  test('h1.subject-name 缺失 → null（非影人页兜底）', () => {
    const doc = domAt(BASE_URL);
    doc.querySelector('h1.subject-name')?.remove();
    expect(extractPersonagePageData()).toBeNull();
  });
});

test.describe('personage 图片与获奖', () => {
  test('照片：background-image url 解析（裸 URL 与带引号两种写法）', () => {
    domAt(BASE_URL);
    const d = extractPersonagePageData() as PageData;
    // 第三个 li 无 style → 跳过
    expect(d.photos).toEqual([
      'https://img1.doubanio.com/view/photo/albumpublic/pz90000001-1.jpg',
      'https://img2.doubanio.com/view/photo/albumpublic/pz90000001-2.jpg',
    ]);
  });

  test('获奖：年份 + 颁奖礼链接 + 状态（末个 span）+ 作品链接', () => {
    domAt(BASE_URL);
    const d = extractPersonagePageData() as PageData;
    // 第三条只有 1 个链接（不满足 ≥2 条）→ 跳过
    expect(d.awards.length).toBe(2);
    expect(d.awards[0]).toEqual({
      year: '2023',
      awardUrl: 'https://movie.douban.com/awards/jin36/',
      awardName: '第36届中国电影金鸡奖',
      status: '获奖',
      workUrl: 'https://movie.douban.com/subject/30010001/',
      workName: '《长途跋涉》',
    });
    expect(d.awards[1]?.status).toBe('提名');
    expect(d.awards[1]?.workName).toBe('《雾中灯塔》');
  });
});

test.describe('personage 作品区', () => {
  test('近期作品：标准双链接 li + img_wrap title 兜底 + 无标题跳过', () => {
    domAt(BASE_URL);
    const d = extractPersonagePageData() as PageData;
    // 第三个 li.creation 无任何链接 → 跳过
    expect(d.recentWorks.length).toBe(2);

    const first = d.recentWorks[0];
    expect(first?.title).toBe('长途跋涉');
    expect(first?.url).toBe('https://movie.douban.com/subject/30010001/');
    expect(first?.poster).toBe(
      'https://img1.doubanio.com/view/photo/s_ratio_poster/public/p30010001.jpg',
    );
    expect(first?.rating).toBe('8.7');
    expect(first?.year).toBe('2026');

    // 仅 img_wrap 单链接 → 从 img_wrap 的 title 属性兜底
    const second = d.recentWorks[1];
    expect(second?.title).toBe('雾中灯塔');
    expect(second?.rating).toBe('');
    expect(second?.year).toBe('2025');
  });

  test('热门作品来自 sortby-collect 区', () => {
    domAt(BASE_URL);
    const d = extractPersonagePageData() as PageData;
    expect(d.popularWorks.length).toBe(2);
    expect(d.popularWorks[1]?.title).toBe('雾中灯塔');
    expect(d.popularWorks[1]?.rating).toBe('7.9');
  });

  test('未上映作品：去掉年份括号；无 a 的 li 跳过（边界）', () => {
    domAt(BASE_URL);
    const d = extractPersonagePageData() as PageData;
    expect(d.unreleasedWorks.length).toBe(1);
    expect(d.unreleasedWorks[0]).toEqual({
      title: '沙漠巴士',
      url: 'https://movie.douban.com/subject/30010003/',
      poster: '',
      rating: '',
      year: '2027',
    });
  });

  test('更多作品链接与计数', () => {
    domAt(BASE_URL);
    const d = extractPersonagePageData() as PageData;
    expect(d.moreWorksUrl).toBe(
      'https://www.douban.com/personage/90000001/creations?sortby=time&format=pic',
    );
    expect(d.moreWorksCount).toBe('43');
  });
});

test.describe('personage 合作影人与空区兜底', () => {
  test('partners：姓名/链接/头像/合作数 (N)；缺头像 → avatar 空串（边界）', () => {
    domAt(BASE_URL);
    const d = extractPersonagePageData() as PageData;
    expect(d.partners).toEqual([
      {
        name: '李雪梅',
        url: 'https://www.douban.com/personage/90000002/',
        avatar: 'https://img3.doubanio.com/icon/ra90000002-9.jpg',
        workCount: 4,
      },
      {
        name: '王志强',
        url: 'https://www.douban.com/personage/90000003/',
        avatar: '',
        workCount: 2,
      },
    ]);
  });

  test('作品区/合作区整体缺失 → 各列表为空（文档化兜底）', () => {
    const doc = domAt(BASE_URL);
    doc.querySelector('#work-collections-sortby-time')?.remove();
    doc.querySelector('#work-collections-sortby-collect')?.remove();
    doc.querySelector('#partners')?.remove();
    const d = extractPersonagePageData() as PageData;
    expect(d.recentWorks).toEqual([]);
    expect(d.popularWorks).toEqual([]);
    expect(d.unreleasedWorks).toEqual([]);
    expect(d.moreWorksUrl).toBe('');
    expect(d.moreWorksCount).toBe('');
    expect(d.partners).toEqual([]);
    // 基础信息仍在
    expect(d.name).toBe('张明远');
  });
});
