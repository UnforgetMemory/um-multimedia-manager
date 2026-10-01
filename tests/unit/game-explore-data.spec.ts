import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGameExploreData } from '@/scenario/douban/pages/game-explore/game-explore-data';

/**
 * game-explore-data behavior lock (www.douban.com/game/explore overlay).
 *
 * parseGameExploreData tries four strategies in order; each is pinned here:
 *   1. window.GlobalData direct access
 *   2. inline-script `GlobalData['key'] = json;` parsing
 *      (tests/fixtures/douban/game-explore-script.html)
 *   3. CSP bridge injection (no-ops under JSDOM — scripts never execute)
 *   4. DOM fallback on .game-list / .game-filters
 *      (tests/fixtures/douban/game-explore-dom.html)
 * URL params override filter checked-state and sorter, so the mount URL
 * is part of the fixture contract.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_FIXTURE = path.resolve(HERE, '../fixtures/douban/game-explore-script.html');
const DOM_FIXTURE = path.resolve(HERE, '../fixtures/douban/game-explore-dom.html');

function mountFile(file: string, url: string): JSDOM {
  const html = fs.readFileSync(file, 'utf-8');
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  return dom;
}

function mountBlank(url: string): void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url,
    runScripts: 'outside-only',
  });
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
}

const EXPLORE_URL = 'https://www.douban.com/game/explore';

test.describe('strategy 1 — window.GlobalData direct', () => {
  test('pre-hydrated GlobalData object wins over script parsing and DOM', async () => {
    const dom = mountFile(DOM_FIXTURE, `${EXPLORE_URL}?genres=1`);
    const win = dom.window as unknown as Record<string, unknown>;
    win['GlobalData'] = {
      results: [{ id: '1', title: '直接注入的游戏', url: 'https://www.douban.com/game/1/' }],
      pagination: { nextPage: null, hasMore: false },
      searcher: { keyword: 'k' },
      sorter: { value: 'time' },
    };

    const data = await parseGameExploreData();
    expect(data).toBeDefined();
    expect(data?.items.length).toBe(1);
    const item = data?.items[0];
    expect(item?.id).toBe(1);
    expect(item?.title).toBe('直接注入的游戏');
    // missing optional fields normalize to safe defaults
    expect(item?.genres).toEqual([]);
    expect(item?.review).toBeNull();
    expect(item?.nRatings).toBe(0);
    expect(data?.searcher).toEqual({ keyword: 'k' });
    // no URL sort param → raw sorter value kept
    expect(data?.sorter).toEqual({ value: 'time' });
  });
});

test.describe("strategy 2 — inline script GlobalData['key'] parsing", () => {
  const URL_WITH_PARAMS = `${EXPLORE_URL}?genres=1&platforms=94&sort=hot`;

  test('results/filters/pagination/searcher/sorter extracted from script text', async () => {
    mountFile(SCRIPT_FIXTURE, URL_WITH_PARAMS);
    const data = await parseGameExploreData();
    expect(data).toBeDefined();

    expect(data?.items.length).toBe(2);
    const first = data?.items[0];
    expect(first?.id).toBe(35752877);
    expect(first?.title).toBe('塞尔达传说：王国之泪');
    expect(first?.rating).toBe('9.6');
    expect(first?.star).toBe('50');
    expect(first?.genres).toEqual(['游戏', '动作冒险']);
    expect(first?.platforms).toEqual(['Switch', 'PC']);
    expect(first?.nRatings).toBe(15670);
    expect(first?.review).toEqual({
      content: '教科书级的开放世界设计',
      author: '机核',
    });

    const second = data?.items[1];
    expect(second?.review).toBeNull();
    expect(second?.nRatings).toBe(8901); // numeric string coerced
    expect(second?.platforms).toEqual(['PS4', 'XBOX', 'PC']);
    expect(second?.genres).toEqual(['游戏', '动作冒险', '沙盒']);

    expect(data?.pagination).toEqual({ nextPage: '2', hasMore: true });
    expect(data?.searcher).toEqual({ keyword: '王国之泪' });
    // URL sort=hot overrides the script-side sorter value 'time'
    expect(data?.sorter).toEqual({ value: 'hot' });
  });

  test('URL params override raw checked flags; unique resets when no selection', async () => {
    mountFile(SCRIPT_FIXTURE, URL_WITH_PARAMS);
    const data = await parseGameExploreData();
    const flags = (name: string) =>
      (data?.filters.find((f) => f.name === name)?.options ?? []).map(
        (o) => `${o.text}:${o.checked}`,
      );

    expect(flags('genres')).toEqual(['全部:false', '动作冒险:true', '角色扮演:false']);
    expect(flags('platforms')).toEqual(['全部:false', 'Switch:true', 'PS5:false']);

    // no filter params at all → only unique "全部" options checked
    mountFile(SCRIPT_FIXTURE, `${EXPLORE_URL}?sort=hot`);
    const bare = await parseGameExploreData();
    const bareFlags = (name: string) =>
      (bare?.filters.find((f) => f.name === name)?.options ?? []).map(
        (o) => `${o.text}:${o.checked}`,
      );
    expect(bareFlags('genres')).toEqual(['全部:true', '动作冒险:false', '角色扮演:false']);
    expect(bareFlags('platforms')).toEqual(['全部:true', 'Switch:false', 'PS5:false']);
  });

  test('edge: non-JSON values (function call, undefined literal) are skipped safely', async () => {
    mountFile(SCRIPT_FIXTURE, URL_WITH_PARAMS);
    const data = await parseGameExploreData();
    // uploader = initUploader() / token = undefined must not poison the result
    expect(Object.keys(data ?? {})).toEqual([
      'items',
      'pagination',
      'filters',
      'searcher',
      'sorter',
    ]);
    expect(data?.items.length).toBe(2);
  });
});

test.describe('strategy 4 — DOM fallback (.game-list / .game-filters)', () => {
  const DOM_URL = `${EXPLORE_URL}?genres=7&q=zelda`;

  test('cards parsed from server-rendered list incl. lazy covers', async () => {
    mountFile(DOM_FIXTURE, DOM_URL);
    const data = await parseGameExploreData();
    expect(data).toBeDefined();

    // 5 rendered li → no-poster and non-numeric-href rows skipped
    expect(data?.items.map((i) => i.id)).toEqual([35752877, 27011570, 30161557]);

    const first = data?.items[0];
    expect(first?.title).toBe('塞尔达传说：王国之泪');
    expect(first?.url).toBe('https://www.douban.com/game/35752877/');
    expect(first?.cover).toBe(
      'https://img9.doubanio.com/view/game_photo/l_cover/public/p35752877.jpg',
    );
    expect(first?.star).toBe('50');
    expect(first?.rating).toBe('9.6');
    expect(first?.nRatings).toBe(15670);
    expect(first?.genres).toEqual(['游戏', '动作冒险']);
    expect(first?.platforms).toEqual(['Switch', 'PC']);
    expect(first?.review).toEqual({ content: '教科书级的开放世界设计', author: '机核' });

    // data-original lazy cover; review without `--author` marker
    const second = data?.items[1];
    expect(second?.cover).toBe(
      'https://img2.doubanio.com/view/game_photo/l_cover/public/p27011570.jpg',
    );
    expect(second?.review).toEqual({ content: '值得细细品味的西部史诗', author: '' });

    // data-src lazy cover; no ratings block → empty star/rating, nRatings 0
    const third = data?.items[2];
    expect(third?.cover).toBe(
      'https://img3.doubanio.com/view/game_photo/l_cover/public/p30161557.jpg',
    );
    expect(third?.star).toBe('');
    expect(third?.rating).toBe('');
    expect(third?.nRatings).toBe(0);
    expect(third?.review).toBeNull();

    expect(data?.pagination).toEqual({ nextPage: null, hasMore: false });
    expect(data?.searcher).toEqual({ keyword: 'zelda' });
    // no sort param → checked radio value 'rating' kept
    expect(data?.sorter).toEqual({ value: 'rating' });
  });

  test('filters from fieldsets with URL override beating DOM checked attrs', async () => {
    mountFile(DOM_FIXTURE, DOM_URL);
    const data = await parseGameExploreData();
    expect(data?.filters.length).toBe(2);

    const genres = data?.filters.find((f) => f.name === 'genres');
    expect(genres?.text).toBe('风格');
    // fixture marks 动作 checked, URL selects 冒险 → URL wins
    const flags = (genres?.options ?? []).map((o) => `${o.text}:${o.checked}`);
    expect(flags).toEqual(['全部:false', '动作:false', '冒险:true']);

    const platforms = data?.filters.find((f) => f.name === 'platforms');
    expect(platforms?.text).toBe('主机平台');
    // platforms param absent → unique 全部 checked, Switch false
    const pFlags = (platforms?.options ?? []).map((o) => `${o.text}:${o.checked}`);
    expect(pFlags).toEqual(['全部:true', 'Switch:false']);
  });

  test('edge: .game-list empty → no fallback data, resolve undefined', async () => {
    const dom = mountFile(DOM_FIXTURE, DOM_URL);
    dom.window.document.querySelectorAll('.game-list li').forEach((li) => li.remove());
    expect(await parseGameExploreData()).toBeUndefined();
  });
});

test.describe('total miss — no data anywhere', () => {
  test('blank explore page → undefined', async () => {
    mountBlank(`${EXPLORE_URL}?page=1`);
    expect(await parseGameExploreData()).toBeUndefined();
  });
});
