import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractGameCollectData } from '@/scenario/douban/pages/game-collect/game-collect-data';
import type { GameCollectData } from '@/scenario/douban/pages/game-collect/types';

/**
 * game-collect 数据提取单元测试（X11-2 覆盖波）。
 *
 * 夹具 tests/fixtures/douban/game-collect.html 复刻 www.douban.com/people/{uid}/games 的
 * .game-list .common-item 契约：占位封面归零、.desc 首个非空文本节点作平台、
 * .rating-star 类名原样作评分标记、.content 里 .desc → .user-operation 之间的短评。
 * 该页与其他 collect 页不同：subType 由 .tabs a.on 优先于 URL 参数决定，
 * total 由 .paginator .count 优先于 h1 「(N)」决定。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../fixtures/douban/game-collect.html');
const COLLECT_URL = 'https://www.douban.com/people/unforgetmemory/games?action=collect&start=0';

/** The extractor reads ambient `document`/`location` (content-script contract). */
function mountFixture(url: string): Document {
  const dom = new JSDOM(fs.readFileSync(FIXTURE, 'utf-8'), { url, runScripts: 'outside-only' });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('Node', dom.window.Node);
  defineGlobal('Element', dom.window.Element);
  defineGlobal('HTMLElement', dom.window.HTMLElement);
  return dom.window.document as unknown as Document;
}

test.describe('game-collect 数据提取', () => {
  test('玩过列表：外壳 + 三条游戏字段', () => {
    mountFixture(COLLECT_URL);
    const data = extractGameCollectData() as GameCollectData;

    expect(data).not.toBeNull();
    expect(data.subType).toBe('collect');
    expect(data.userId).toBe('unforgetmemory');
    expect(data.displayName).toBe('UnforgetMemory');
    expect(data.avatarUrl).toBe('https://img3.doubanio.com/icon/u150361821-2.jpg');
    expect(data.navLinks.map((l) => l.label)).toEqual(['玩过 23', '想玩 11', '在玩 2']);
    expect(data.total).toBe(23);
    expect(data.currentPage).toBe('1');
    expect(data.pageLinks).toEqual([{ label: '1', url: '', current: true }]);
    expect(data.prevPageUrl).toBe(
      'https://www.douban.com/people/unforgetmemory/games?action=collect&start=0',
    );
    expect(data.nextPageUrl).toBe(
      'https://www.douban.com/people/unforgetmemory/games?action=collect&start=30',
    );

    // 侧栏推荐位不在 .game-list 下
    expect(data.items.map((i) => i.subjectId)).toEqual(['35762065', '30393103', '27195640']);

    const zelda = data.items[0]!;
    expect(zelda.title).toBe('塞尔达传说：王国之泪');
    expect(zelda.url).toBe('https://www.douban.com/game/35762065/');
    expect(zelda.posterUrl).toBe('https://img1.doubanio.com/view/game/s/public/p35762065.jpg');
    expect(zelda.rating).toBe('allstar50');
    expect(zelda.date).toBe('2024-02-18');
    expect(zelda.platforms).toBe('Nintendo Switch / 2023-05-12 发行');
    expect(zelda.comment).toBe('120 小时通关，究极手依然玩不转。');
  });

  test('占位封面 game_normal.png → posterUrl 归零；平台取 .desc 首个非空文本节点', () => {
    mountFixture(COLLECT_URL);
    const data = extractGameCollectData() as GameCollectData;

    const bg3 = data.items[1]!;
    expect(bg3.title).toBe('博德之门3');
    expect(bg3.posterUrl).toBe('');
    // <span class="pl">平台：</span>PS5 → 标签节点跳过，取 PS5
    expect(bg3.platforms).toBe('PS5');
    expect(bg3.rating).toBe('allstar40');
    // .desc 与 .user-operation 相邻，中间无短评节点
    expect(bg3.comment).toBe('');
  });

  test('只标记条目：无评分/日期/短评/平台时全部回落空串', () => {
    mountFixture(COLLECT_URL);
    const data = extractGameCollectData() as GameCollectData;

    const shisan = data.items[2]!;
    expect(shisan.title).toBe('十三机兵防卫圈');
    expect(shisan.rating).toBe('');
    expect(shisan.date).toBe('');
    expect(shisan.comment).toBe('');
    expect(shisan.platforms).toBe('');
    expect(shisan.posterUrl).toBe('https://img9.doubanio.com/view/game/s/public/p27199846.jpg');
  });

  test('subType 判定：.tabs a.on 优先于 URL 参数', () => {
    // URL 说 wish、当前高亮 tab 说 collect → 以 DOM 高亮为准
    mountFixture('https://www.douban.com/people/unforgetmemory/games?action=wish');
    expect(extractGameCollectData()?.subType).toBe('collect');
  });

  test('subType 判定：无高亮 tab 时回落到 URL 参数', () => {
    for (const [action, expected] of [
      ['wish', 'wish'],
      ['do', 'do'],
      ['collect', 'collect'],
    ] as const) {
      const doc = mountFixture(
        `https://www.douban.com/people/unforgetmemory/games?action=${action}`,
      );
      doc.querySelector('.tabs a.on')?.classList.remove('on');
      expect(extractGameCollectData()?.subType).toBe(expected);
    }
  });

  test('subType 判定：URL 与高亮 tab 相互矛盾时以 tab 为准', () => {
    const doc = mountFixture('https://www.douban.com/people/unforgetmemory/games?action=wish');
    const tabs = doc.querySelectorAll('.tabs a');
    const collectTab = tabs[0];
    const doTab = tabs[2];
    collectTab?.classList.remove('on');
    doTab?.classList.add('on');
    expect(extractGameCollectData()?.subType).toBe('do');
  });

  test('total 回落链：.paginator .count 缺失 → h1 「(N)」', () => {
    const doc = mountFixture(COLLECT_URL);
    doc.querySelector('.paginator .count')?.remove();
    expect(extractGameCollectData()?.total).toBe(23);
  });

  test('两处计数皆缺失 → total 0（不阻断渲染）', () => {
    const doc = mountFixture(COLLECT_URL);
    doc.querySelector('.paginator .count')?.remove();
    const h1 = doc.querySelector('#db-usr-profile h1');
    if (h1) h1.textContent = 'UnforgetMemory的游戏记录';
    const data = extractGameCollectData() as GameCollectData;

    expect(data.total).toBe(0);
    expect(data.items).toHaveLength(3);
  });

  test('用户栏缺失：avatarUrl 空、displayName 回落 userId、navLinks 空', () => {
    const doc = mountFixture(COLLECT_URL);
    doc.querySelector('#db-usr-profile .pic img')?.remove();
    doc.querySelectorAll('#db-usr-profile .info ul li a').forEach((a) => a.remove());
    const data = extractGameCollectData() as GameCollectData;

    expect(data.avatarUrl).toBe('');
    expect(data.displayName).toBe('unforgetmemory');
    expect(data.navLinks).toEqual([]);
  });

  test('无 .paginator → currentPage 空串、pageLinks/前后页 URL 为空', () => {
    const doc = mountFixture(COLLECT_URL);
    doc.querySelector('.paginator')?.remove();
    const data = extractGameCollectData() as GameCollectData;

    expect(data.currentPage).toBe('');
    expect(data.pageLinks).toEqual([]);
    expect(data.prevPageUrl).toBe('');
    expect(data.nextPageUrl).toBe('');
  });

  test('空游戏架 → 合法空结果（本页提取器不做 items/total 互斥校验）', () => {
    const doc = mountFixture(COLLECT_URL);
    doc.querySelectorAll('.game-list .common-item').forEach((el) => el.remove());
    doc.querySelector('.paginator .count')?.remove();
    const data = extractGameCollectData() as GameCollectData;

    expect(data).not.toBeNull();
    expect(data.items).toEqual([]);
    expect(data.total).toBe(23); // 仍来自 h1 「(N)」回落
  });
});
