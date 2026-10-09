import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StoreRecord, UrlIdentity } from '@/types';
import type { DetailData } from '@/scenario/douban/pages/detail/types';
import { UrlResolverBuilder } from '@/libraries/identity';

/**
 * Detail-page record reading behavior lock.
 *
 * Two seams, both pinned against a `chrome.runtime.sendMessage` stub so the
 * positive read paths are exercised rather than only their degradation:
 *  - `loadRecord` — the single-key read behind the detail card itself;
 *  - `loadRecordMapForIds` — the targeted batch read behind a recommendation
 *    grid, whose defining constraint is that an empty id list must never fall
 *    through to the full-store scan (`loadRecordEntries` without ids walks
 *    every record on the page's mount path).
 *
 * `extractDetailData` is asserted to make zero message traffic: badges are
 * derived at render from the live map (see umm-rec-section.spec.ts), so any
 * DB read reappearing inside the extraction layer is a regression to the
 * mount-time snapshot defect this contract replaced.
 *
 * Wire payloads are typed `unknown` on purpose: they model the message
 * boundary, where a legacy row may miss `status` entirely.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Anchor window before the dynamic imports below (dompurify binds it at load).
defineGlobal(
  'window',
  new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://movie.douban.com/' })
    .window,
);

type LoaderModule = typeof import('@/scenario/douban/pages/detail/record-loader');
let loaderPromise: Promise<LoaderModule> | null = null;
function loadLoader(): Promise<LoaderModule> {
  loaderPromise ??= import('@/scenario/douban/pages/detail/record-loader');
  return loaderPromise;
}

type DataModule = typeof import('@/scenario/douban/pages/detail/detail-data');
let dataPromise: Promise<DataModule> | null = null;
function loadData(): Promise<DataModule> {
  dataPromise ??= import('@/scenario/douban/pages/detail/detail-data');
  return dataPromise;
}

type MapModule = typeof import('@/scenario/douban/shared/load-record-map');
let mapPromise: Promise<MapModule> | null = null;
function loadMap(): Promise<MapModule> {
  mapPromise ??= import('@/scenario/douban/shared/load-record-map');
  return mapPromise;
}

function domAt(file: string, url: string): Document {
  const html = fs.readFileSync(path.resolve(HERE, '../fixtures/douban', file), 'utf-8');
  const dom = new JSDOM(html, { url });
  defineGlobal('document', dom.window.document);
  defineGlobal('location', dom.window.location);
  defineGlobal('Node', dom.window.Node);
  return dom.window.document;
}

const MOVIE = 'detail-movie.html';
const MOVIE_URL = 'https://movie.douban.com/subject/1292052/';

interface SentMessage {
  type: string;
  payload: unknown;
}

interface StubOptions {
  /** Faithful store: only requested keys are answered. */
  available?: Record<string, unknown>;
  /** Raw DB_GET_BULK response — for malformed-wire cases a real store cannot produce. */
  entries?: unknown[];
  failWith?: string;
  throwOnSend?: boolean;
}

/** Install a chrome.runtime stub answering DB_GET / DB_GET_BULK; captures traffic. */
function installStoreStub(opts: StubOptions = {}): { sent: SentMessage[] } {
  const sent: SentMessage[] = [];
  const chromeStub = {
    runtime: {
      id: 'test-extension',
      lastError: undefined,
      sendMessage: (msg: SentMessage, cb?: (res: unknown) => void) => {
        sent.push(msg);
        if (opts.throwOnSend) throw new Error('Extension context invalidated.');
        if (opts.failWith) {
          cb?.({ success: false, error: opts.failWith });
          return;
        }
        const payload = msg.payload as { storeName?: string; key?: string; keys?: string[] };
        if (msg.type === 'DB_GET') {
          const key = payload.key ?? '';
          cb?.({ success: true, record: opts.available?.[key] ?? null });
          return;
        }
        if (msg.type === 'DB_GET_BULK') {
          if (opts.entries) {
            cb?.({ success: true, entries: opts.entries });
            return;
          }
          const entries = (payload.keys ?? [])
            .filter((key) => opts.available && key in opts.available)
            .map((key) => ({ key, record: opts.available?.[key] }));
          cb?.({ success: true, entries });
          return;
        }
        cb?.({ success: true });
      },
      onMessage: { addListener: () => {} },
    },
  };
  defineGlobal('chrome', chromeStub);
  return { sent };
}

function clearStoreStub(): void {
  defineGlobal('chrome', undefined);
}

test.afterEach(() => {
  clearStoreStub();
});

function makeIdentity(type: string, providerId: string): UrlIdentity {
  return {
    platform: 'douban',
    type,
    providerId,
    url: `https://movie.douban.com/subject/${providerId}/`,
  };
}

function makeRecord(overrides: Partial<StoreRecord> = {}): StoreRecord {
  return {
    url: 'https://movie.douban.com/subject/1291544/',
    status: 2,
    rating: 8,
    comment: '',
    updatedAt: '2026-09-01T00:00:00.000Z',
    linkedIds: {},
    ...overrides,
  };
}

function bulkKeys(sent: SentMessage[]): string[] {
  const msg = sent.find((m) => m.type === 'DB_GET_BULK');
  const payload = msg?.payload as { keys?: string[] } | undefined;
  return payload?.keys ?? [];
}

test.describe('loadRecord — 键构造与降级 seam', () => {
  test('DB_GET 载荷 = { douban_records, `{type}::{providerId}` }，命中记录原样返回', async () => {
    const record = makeRecord({ status: 3, rating: 7 });
    const { sent } = installStoreStub({ available: { 'movie::25954475': record } });
    const { loadRecord } = await loadLoader();

    const got = await loadRecord(makeIdentity('movie', '25954475'));

    expect(got).toEqual(record);
    expect(sent).toEqual([
      {
        type: 'DB_GET',
        payload: { storeName: 'douban_records', key: 'movie::25954475' },
      },
    ]);
  });

  test('tv 身份只读 `tv::` 单键：同一 subject 的 movie:: 记录读不到', async () => {
    const { sent } = installStoreStub({
      available: { 'movie::25954475': makeRecord({ status: 2 }) },
    });
    const { loadRecord } = await loadLoader();

    expect(await loadRecord(makeIdentity('tv', '25954475'))).toBeNull();
    const payload = sent[0]?.payload as { key: string };
    expect(payload.key).toBe('tv::25954475');
  });

  test('剧集歧义消解：movie.douban.com/subject 恒解析为 movie 身份 → 详情页读写同键（缺陷不可复现）', async () => {
    // 详情页保存键 = `${identity.type}::${identity.providerId}`（App.vue:99）。
    // Identity.fromUrl 对 movie.douban.com/subject/N 恒返回 type=movie，
    // 故剧集也存于 movie::，loadRecord 读同一 movie:: —— 不存在 tv:: 孤儿。
    const tvIdentity = UrlResolverBuilder.fromUrl('https://movie.douban.com/subject/25954475/');
    expect(tvIdentity?.type).toBe('movie');
    const record = makeRecord({ status: 2, rating: 8 });
    installStoreStub({ available: { 'movie::25954475': record } });
    const { loadRecord } = await loadLoader();
    expect(await loadRecord(tvIdentity!)).toEqual(record);
  });

  test('请求键在库中不存在 → null（无记录与读失败同义）', async () => {
    installStoreStub({ available: {} });
    const { loadRecord } = await loadLoader();
    expect(await loadRecord(makeIdentity('movie', '1'))).toBeNull();
  });

  test('语义失败（success:false）→ null 且不上抛', async () => {
    installStoreStub({ failWith: 'no such store' });
    const { loadRecord } = await loadLoader();
    expect(await loadRecord(makeIdentity('book', '9'))).toBeNull();
  });

  test('sendMessage 同步抛错（上下文失效）→ null，异常被吞', async () => {
    installStoreStub({ throwOnSend: true });
    const { loadRecord } = await loadLoader();
    expect(await loadRecord(makeIdentity('movie', '9'))).toBeNull();
  });

  test('chrome 未注入 → null（内容脚本降级路径）', async () => {
    clearStoreStub();
    const { loadRecord } = await loadLoader();
    expect(await loadRecord(makeIdentity('movie', '9'))).toBeNull();
  });
});

test.describe('loadRecordMapForIds — 推荐位批量读，禁止全表扫描', () => {
  test('空 id 列表 → 空映射且零消息流量（不得退化为 DB_GET_ALL 全表扫）', async () => {
    const { sent } = installStoreStub({
      available: { 'movie::1': makeRecord(), 'movie::2': makeRecord() },
    });
    const { loadRecordMapForIds } = await loadMap();

    const map = await loadRecordMapForIds('movie', []);

    expect(map.size).toBe(0);
    expect(sent).toEqual([]);
  });

  test('全为空串 id → 同样零流量（空 section 不付费）', async () => {
    const { sent } = installStoreStub();
    const { loadRecordMapForIds } = await loadMap();

    expect((await loadRecordMapForIds('movie', ['', '', ''])).size).toBe(0);
    expect(sent).toEqual([]);
  });

  test('重复 id 去重、空串过滤 → 单次 DB_GET_BULK，键为 `{prefix}::{id}`', async () => {
    const { sent } = installStoreStub();
    const { loadRecordMapForIds } = await loadMap();

    await loadRecordMapForIds('movie', ['1291544', '1291544', '1292937', '']);

    expect(sent).toEqual([
      {
        type: 'DB_GET_BULK',
        payload: { storeName: 'douban_records', keys: ['movie::1291544', 'movie::1292937'] },
      },
    ]);
  });

  test('返回映射以裸 id 为键：卡片可直接 get(subjectId)（种子键格式与渲染层对齐）', async () => {
    const record = makeRecord({ status: 2, rating: 9 });
    installStoreStub({ available: { 'movie::1291544': record } });
    const { loadRecordMapForIds } = await loadMap();

    const map = await loadRecordMapForIds('movie', ['1291544']);

    expect(map.get('1291544')).toEqual(record);
    expect(map.has('movie::1291544')).toBe(false);
  });

  test('status 0 / 缺 status 的记录原样入表：过滤与派生属于渲染层', async () => {
    installStoreStub({
      available: {
        'movie::1291544': makeRecord({ status: 0, rating: 9 }),
        'movie::1292937': { rating: 5 },
      },
    });
    const { loadRecordMapForIds } = await loadMap();

    const map = await loadRecordMapForIds('movie', ['1291544', '1292937']);

    expect(map.size).toBe(2);
    expect(map.get('1291544')).toMatchObject({ status: 0 });
    expect(map.get('1292937')?.status).toBeUndefined();
  });

  test('批量键按传入 prefix 生成：movie 前缀读不到 tv:: 孪生记录（疑点已上报）', async () => {
    const { sent } = installStoreStub({
      available: { 'tv::25954475': makeRecord({ status: 2, rating: 8 }) },
    });
    const { loadRecordMapForIds } = await loadMap();

    const map = await loadRecordMapForIds('movie', ['25954475']);

    // subject-keys.ts asks for movie:: AND tv::; a grid asks for one key per
    // visible subject, so a tv-keyed record stays invisible on a movie page.
    expect(bulkKeys(sent)).toEqual(['movie::25954475']);
    expect(map.size).toBe(0);
  });

  test('畸形 entry：key 缺少 `{prefix}::` → 跳过而不入表', async () => {
    installStoreStub({ entries: [{ key: 'noid', record: makeRecord({ status: 3 }) }] });
    const { loadRecordMapForIds } = await loadMap();

    const map = await loadRecordMapForIds('movie', ['1291544']);

    expect(map.size).toBe(0);
  });

  test('单条 record 为 null 只影响该键：其余记录照常入表（旧批量读中断整批的缺陷不再复现）', async () => {
    const good = makeRecord({ status: 2, rating: 9 });
    installStoreStub({
      entries: [
        { key: 'movie::1291544', record: good },
        { key: 'movie::1292937', record: null },
      ],
    });
    const { loadRecordMapForIds } = await loadMap();

    const map = await loadRecordMapForIds('movie', ['1291544', '1292937']);

    expect(map.get('1291544')).toEqual(good);
    expect(map.get('1292937')).toBeNull();
  });

  test('批量读语义失败（success:false）→ 空映射且不上抛', async () => {
    installStoreStub({ failWith: 'db closed' });
    const { loadRecordMapForIds } = await loadMap();

    expect((await loadRecordMapForIds('movie', ['1291544'])).size).toBe(0);
  });

  test('sendMessage 同步抛错（上下文失效）→ 空映射', async () => {
    installStoreStub({ throwOnSend: true });
    const { loadRecordMapForIds } = await loadMap();

    expect((await loadRecordMapForIds('movie', ['1291544'])).size).toBe(0);
  });

  test('chrome 未注入 → 空映射（内容脚本降级路径）', async () => {
    clearStoreStub();
    const { loadRecordMapForIds } = await loadMap();

    expect((await loadRecordMapForIds('movie', ['1291544'])).size).toBe(0);
  });
});

test.describe('extractDetailData — 纯 DOM 提取（推荐位读取已移出）', () => {
  function requireData(d: DetailData | null): DetailData {
    if (!d) throw new Error('detail page must not extract to null');
    return d;
  }

  test('装配期间零消息流量：store 有记录也不影响提取结果', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { sent } = installStoreStub({
      available: { 'movie::1291544': makeRecord({ status: 2, rating: 9 }) },
    });
    const { extractDetailData } = await loadData();

    const d = requireData(await extractDetailData());

    expect(sent).toEqual([]);
    expect(d.recItems.map((r) => r.subjectId)).toEqual(['1291544', '1292937']);
    expect(d.record).toBeNull();
  });

  test('RecItem 形状 = 纯 DOM 字段：不再携带挂载期快照 recStatus/personalRating', async () => {
    domAt(MOVIE, MOVIE_URL);
    installStoreStub();
    const { extractDetailData } = await loadData();

    const d = requireData(await extractDetailData());

    expect(d.recItems[0]).toEqual({
      title: '霸王别姬',
      poster: 'https://img3.doubanio.com/view/photo/x/public/p453706299.jpg',
      rating: '9.6',
      link: 'https://movie.douban.com/subject/1291544/',
      subjectId: '1291544',
    });
    for (const item of d.recItems) {
      expect('recStatus' in item).toBe(false);
      expect('personalRating' in item).toBe(false);
    }
  });

  test('store 语义失败与整页装配无关：字段完整（读失败只影响徽章，不阻断页面）', async () => {
    domAt(MOVIE, MOVIE_URL);
    const { sent } = installStoreStub({ failWith: 'scheduler down' });
    const { extractDetailData } = await loadData();

    const d = requireData(await extractDetailData());

    expect(d.title).toBe('肖申克的救赎');
    expect(d.recItems.length).toBe(2);
    expect(sent).toEqual([]);
  });
});
