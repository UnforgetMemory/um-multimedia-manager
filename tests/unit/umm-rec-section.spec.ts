import { test, expect } from '@playwright/test';
// Rendered copy comes from the content i18n dictionaries, whose locale is module-level
// shared state per worker — expectations resolve the same label getters the badge uses
// (statusBadgeLabels → t()) instead of hardcoding Chinese, so a worker that already
// switched to en-US/zh-TW cannot fail this file on string drift.
import { t } from '@/entrypoints/content/i18n';
import { statusBadgeLabels } from '@/scenario/douban/shared/status-labels';
import { defineGlobal } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import type { StoreRecord } from '@/types';
import type { RecordCacheDeps } from '@/scenario/douban/shared/composables/use-record-cache';
import type { RecordEvent } from '@/scenario/douban/shared/composables/use-record-refresh';
import type { RecSectionItem } from '@/scenario/douban/components/umm-rec-section';

/**
 * UmmRecSection — the recommendation grid behind the detail and game-detail
 * overlays. Contracts pinned:
 * 1. the mount-time `recordMap` seed decides the first paint and costs no read
 *    (an unseeded grid can only be filled by a later broadcast, which would
 *    leave every badge "none" on the first frame);
 * 2. the badge is *derived* from the record map at render: status → variant +
 *    media-type label, the personal rating only comes from the record, and the
 *    item's own average score stays on the separate rating element;
 * 3. an external write/delete repaints the SAME card element (stable key, map
 *    read inside the render function) — the mount-time snapshot defect this
 *    section replaced could only change by remounting the overlay;
 * 4. reload traffic is targeted: only `douban_records` events whose key hits a
 *    visible subject read, and the subscription is released at unmount.
 *
 * The bus/DB seam is injected (`cacheDeps`) rather than stubbed globally: the
 * event-bus module latches its listener to whichever spec first calls
 * `initEventBus`, so a shared-worker run would silently hand the broadcast to
 * another file's stub.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);

type SectionModule = typeof import('@/scenario/douban/components/umm-rec-section');
let sectionPromise: Promise<SectionModule> | null = null;
function loadSection(): Promise<SectionModule> {
  sectionPromise ??= import('@/scenario/douban/components/umm-rec-section');
  return sectionPromise;
}

type VueModule = typeof import('vue');
let vuePromise: Promise<VueModule> | null = null;
function loadVue(): Promise<VueModule> {
  vuePromise ??= import('vue');
  return vuePromise;
}

function rec(overrides: Partial<StoreRecord> = {}): StoreRecord {
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

function item(subjectId: string, overrides: Partial<RecSectionItem> = {}): RecSectionItem {
  return {
    title: `标题 ${subjectId}`,
    poster: `https://img9.doubanio.com/view/photo/x/public/p${subjectId}.jpg`,
    rating: '9.6',
    link: `https://movie.douban.com/subject/${subjectId}/`,
    subjectId,
    ...overrides,
  };
}

interface BusHandle {
  deps: RecordCacheDeps;
  /** loadEntries invocations, in order — empty means "no DB traffic". */
  calls: Array<{ prefix?: string; ids?: string[] }>;
  emit: (event: RecordEvent, data: unknown) => void;
  /** What the next reload resolves to (models the store's evolving content). */
  setNext: (map: Map<string, StoreRecord>) => void;
  subscribed: () => RecordEvent[];
}

/** In-process bus + store, mirroring useRecordCache's real event contract. */
function createBus(initial: Map<string, StoreRecord> = new Map<string, StoreRecord>()): BusHandle {
  let next = initial;
  const calls: Array<{ prefix?: string; ids?: string[] }> = [];
  const handlers = new Map<RecordEvent, (data: unknown) => void>();
  const deps: RecordCacheDeps = {
    subscribe: (event, handler) => {
      handlers.set(event, handler);
      return () => {
        if (handlers.get(event) === handler) handlers.delete(event);
      };
    },
    loadEntries: async (prefix, ids) => {
      calls.push({ prefix, ids });
      return next;
    },
    // Zero-delay timer: these cases pin "which key shapes trigger a reload",
    // not the storm-coalescing window (that lives in record-cache.spec with the
    // real 300ms timer). A non-zero delay would make `settled()` race the
    // debounce and turn "each shape fires" into a flake.
    timer: {
      setTimeout: (cb) => {
        queueMicrotask(cb);
        return 0;
      },
      clearTimeout: () => {},
    },
  };
  return {
    deps,
    calls,
    subscribed: () => [...handlers.keys()],
    setNext: (map) => {
      next = map;
    },
    emit: (event, data) => {
      handlers.get(event)?.(data);
    },
  };
}

interface MountOptions {
  items?: RecSectionItem[];
  mediaType?: 'movie' | 'music' | 'book' | 'game';
  recordPrefix?: string;
  heading?: string;
  recordMap?: Map<string, StoreRecord>;
  showScore?: boolean;
  bus?: BusHandle;
}

interface Mounted {
  root: HTMLElement;
  cards: () => HTMLElement[];
  badge: (index: number) => Element | null;
  unmount: () => void;
}

async function mount(options: MountOptions = {}): Promise<Mounted> {
  const vue = await loadVue();
  const { UmmRecSection } = await loadSection();
  const bus = options.bus ?? createBus();
  const props = {
    items: options.items ?? [item('1291544'), item('1292937')],
    mediaType: options.mediaType ?? ('movie' as const),
    recordPrefix: options.recordPrefix ?? 'movie',
    heading: options.heading ?? '推荐',
    recordMap: options.recordMap,
    showScore: options.showScore,
    cacheDeps: bus.deps,
  };
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  const app = vue.createApp({ render: () => vue.h(UmmRecSection, props) });
  app.mount(container);
  const root = container.firstElementChild;
  if (!root) throw new Error('section rendered nothing');
  return {
    root: root as HTMLElement,
    cards: () => Array.from(root.querySelectorAll<HTMLElement>('.umm-rec-item')),
    badge: (index) => root.querySelectorAll('.umm-status')[index] ?? null,
    unmount: () => {
      app.unmount();
      container.remove();
    },
  };
}

/** Wait for the broadcast → reload → repaint chain to settle. */
async function settled(): Promise<void> {
  const vue = await loadVue();
  await vue.nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await vue.nextTick();
}

function statusClass(badge: Element | null): string {
  return Array.from(badge?.classList ?? [])
    .filter((c) => c.startsWith('umm-status--'))
    .join(' ');
}

/** Label vocabulary the badge composes from — same getters, same currentLocale. */
const movieLabels = statusBadgeLabels.movie;
const gameLabels = statusBadgeLabels.game;

test.describe('首帧种子与徽章派生', () => {
  test('recordMap 种子直接决定首帧，且挂载期零读取', async () => {
    const bus = createBus();
    const seed = new Map<string, StoreRecord>([
      ['1291544', rec({ status: 2, rating: 9 })],
      ['1292937', rec({ status: 1, rating: 0 })],
    ]);
    const m = await mount({ bus, recordMap: seed });

    expect(statusClass(m.badge(0))).toBe('umm-status--small umm-status--done');
    expect(m.badge(0)?.textContent).toBe(`${movieLabels.done} 9`);
    expect(statusClass(m.badge(1))).toBe('umm-status--small umm-status--wish');
    expect(m.badge(1)?.textContent).toBe(movieLabels.wish);
    expect(bus.calls).toEqual([]);
    expect(bus.subscribed().sort()).toEqual(['record:deleted', 'record:updated']);
    m.unmount();
  });

  test('种子键为裸 subjectId：整库键格式（`movie::id`）解析不到任何徽章', async () => {
    const m = await mount({
      recordMap: new Map<string, StoreRecord>([['movie::1291544', rec({ status: 2 })]]),
    });

    expect(statusClass(m.badge(0))).toBe('umm-status--small umm-status--none');
    m.unmount();
  });

  test('无记录的 id → none；status 0 记录同样落 none（派生在渲染层）', async () => {
    const seed = new Map<string, StoreRecord>([
      ['1291544', rec({ status: 0, rating: 9 })],
      ['1292937', { rating: 5 } as StoreRecord],
    ]);
    const m = await mount({ recordMap: seed });

    expect(statusClass(m.badge(0))).toBe('umm-status--small umm-status--none');
    expect(m.badge(0)?.textContent).toBe(movieLabels.none);
    expect(statusClass(m.badge(1))).toBe('umm-status--small umm-status--none');
    m.unmount();
  });

  test('status 3 → doing；status 2 且 rating 0 → 只有状态词，不带评分', async () => {
    const seed = new Map<string, StoreRecord>([
      ['1291544', rec({ status: 3, rating: 6 })],
      ['1292937', rec({ status: 2, rating: 0 })],
    ]);
    const m = await mount({ recordMap: seed });

    expect(statusClass(m.badge(0))).toBe('umm-status--small umm-status--doing');
    expect(m.badge(0)?.textContent).toBe(movieLabels.doing);
    expect(statusClass(m.badge(1))).toBe('umm-status--small umm-status--done');
    expect(m.badge(1)?.textContent).toBe(movieLabels.done);
    m.unmount();
  });

  test('个人评分只来自记录；条目均分走独立评分元素（两通道不串）', async () => {
    const m = await mount({
      items: [item('1291544', { rating: '9.6' })],
      recordMap: new Map<string, StoreRecord>([['1291544', rec({ status: 2, rating: 7 })]]),
    });

    expect(m.badge(0)?.textContent).toBe(`${movieLabels.done} 7`);
    expect(m.root.querySelector('.umm-rating-score')?.textContent).toBe('9.6');
    m.unmount();
  });

  test('mediaType 决定标签词表：game 用玩过/想玩/未玩', async () => {
    const seed = new Map<string, StoreRecord>([
      ['1291544', rec({ status: 2, rating: 0 })],
      ['1292937', rec({ status: 1 })],
    ]);
    const m = await mount({ mediaType: 'game', recordPrefix: 'game', recordMap: seed });

    expect(m.badge(0)?.textContent).toBe(gameLabels.done);
    expect(m.badge(1)?.textContent).toBe(gameLabels.wish);
    m.unmount();
  });

  test('showScore=false 隐去均分但不影响徽章（游戏卡无豆瓣评分）', async () => {
    const m = await mount({
      mediaType: 'game',
      recordPrefix: 'game',
      showScore: false,
      recordMap: new Map<string, StoreRecord>([['1291544', rec({ status: 2, rating: 8 })]]),
    });

    expect(m.badge(0)?.textContent).toBe(`${gameLabels.done} 8`);
    expect(m.root.querySelector('.umm-rating-score')).toBeNull();
    expect(m.root.querySelector('.umm-rating')?.textContent).toContain(t('common.rating_unknown'));
    m.unmount();
  });

  test('骨架：标题/海报/链接直连卡片，grid 卡片是可点击 div 而非 <a>', async () => {
    const m = await mount({ heading: '喜欢的人也喜欢' });

    expect(m.root.querySelector('.umm-rec-heading')?.textContent).toBe('喜欢的人也喜欢');
    const cards = m.cards();
    expect(cards.map((c) => c.querySelector('.umm-rec-title')?.textContent)).toEqual([
      '标题 1291544',
      '标题 1292937',
    ]);
    expect(cards[0]?.tagName).toBe('DIV');
    expect(cards[0]?.querySelector('a')).toBeNull();
    expect(cards[0]?.querySelector('img')?.getAttribute('loading')).toBe('lazy');
    m.unmount();
  });

  test('空 items → 整节不渲染（不留空标题壳）', async () => {
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const vue = await loadVue();
    const { UmmRecSection } = await loadSection();
    const app = vue.createApp({
      render: () =>
        vue.h(UmmRecSection, {
          items: [] as RecSectionItem[],
          mediaType: 'movie' as const,
          recordPrefix: 'movie',
          heading: '推荐',
          cacheDeps: createBus().deps,
        }),
    });
    app.mount(container);

    expect(container.textContent).toBe('');
    expect(container.querySelector('.umm-rec-grid')).toBeNull();
    app.unmount();
    container.remove();
  });

  test('生产形态（不注入 cacheDeps）：种子照常出徽章，装配不因总线环境而崩', async () => {
    // Whether the bus attaches depends on which spec in this worker first latched
    // `initEventBus`; a failed subscribe is the composable's own contract, so
    // here we only pin that the section still paints its seed.
    const prevWarn = console.warn;
    console.warn = () => {};
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const vue = await loadVue();
    const { UmmRecSection } = await loadSection();
    let app: { unmount: () => void } | null = null;
    try {
      const instance = vue.createApp({
        render: () =>
          vue.h(UmmRecSection, {
            items: [item('1291544')],
            mediaType: 'movie' as const,
            recordPrefix: 'movie',
            heading: '推荐',
            recordMap: new Map<string, StoreRecord>([['1291544', rec({ status: 2, rating: 9 })]]),
          }),
      });
      instance.mount(container);
      app = instance;

      expect(container.querySelector('.umm-status--done')?.textContent).toBe(
        `${movieLabels.done} 9`,
      );
      expect(container.querySelectorAll('.umm-rec-item')).toHaveLength(1);
    } finally {
      app?.unmount();
      container.remove();
      console.warn = prevWarn;
    }
  });
});

test.describe('活态派生：外部写入免重载换徽章', () => {
  test('可见键写入 → 同一 DOM 节点重算徽章，并只发一次定向批量读', async () => {
    const bus = createBus();
    const m = await mount({ bus, recordMap: new Map<string, StoreRecord>() });
    const before = m.cards();
    expect(statusClass(m.badge(0))).toBe('umm-status--small umm-status--none');

    bus.setNext(new Map<string, StoreRecord>([['1291544', rec({ status: 1 })]]));
    bus.emit('record:updated', { storeName: 'douban_records', key: 'movie::1291544' });
    await settled();

    expect(statusClass(m.badge(0))).toBe('umm-status--small umm-status--wish');
    expect(m.badge(0)?.textContent).toBe(movieLabels.wish);
    // Same element objects ⇒ patched, not remounted: a remount could only show
    // fresh data by faking a first paint.
    expect(m.cards()[0]).toBe(before[0]);
    expect(m.cards()[1]).toBe(before[1]);
    expect(bus.calls).toEqual([{ prefix: 'movie', ids: ['1291544', '1292937'] }]);
    m.unmount();
  });

  test('删除事件走同一路径：徽章回到 none', async () => {
    const bus = createBus();
    const m = await mount({
      bus,
      recordMap: new Map<string, StoreRecord>([['1291544', rec({ status: 2, rating: 9 })]]),
    });
    expect(m.badge(0)?.textContent).toBe(`${movieLabels.done} 9`);

    bus.setNext(new Map<string, StoreRecord>());
    bus.emit('record:deleted', { storeName: 'douban_records', key: 'movie::1291544' });
    await settled();

    expect(statusClass(m.badge(0))).toBe('umm-status--small umm-status--none');
    m.unmount();
  });

  test('记录改评分 → 徽章评分随重读更新（评分不是挂载期快照）', async () => {
    const bus = createBus();
    const m = await mount({
      bus,
      recordMap: new Map<string, StoreRecord>([['1291544', rec({ status: 2, rating: 6 })]]),
    });

    bus.setNext(new Map<string, StoreRecord>([['1291544', rec({ status: 2, rating: 10 })]]));
    bus.emit('record:updated', { storeName: 'douban_records', key: 'movie::1291544' });
    await settled();

    expect(m.badge(0)?.textContent).toBe(`${movieLabels.done} 10`);
    m.unmount();
  });

  test('非 douban_records 库的事件不触发读取', async () => {
    const bus = createBus();
    const m = await mount({ bus, recordMap: new Map<string, StoreRecord>() });

    bus.emit('record:updated', { storeName: 'imdb_records', key: 'movie::1291544' });
    await settled();

    expect(bus.calls).toEqual([]);
    expect(statusClass(m.badge(0))).toBe('umm-status--small umm-status--none');
    m.unmount();
  });

  test('不可见键不触发读取；完整键、裸 id 键与 `*` 批量广播都触发', async () => {
    const bus = createBus();
    const m = await mount({ bus, recordMap: new Map<string, StoreRecord>() });

    bus.emit('record:updated', { storeName: 'douban_records', key: 'movie::777777' });
    await settled();
    expect(bus.calls).toEqual([]);

    // The grid's visible set is bare subject ids while the background broadcasts
    // `{type}::{id}` — both shapes, plus the `*` bulk marker, must resolve.
    bus.emit('record:updated', { storeName: 'douban_records', key: 'movie::1291544' });
    bus.emit('record:updated', { storeName: 'douban_records', key: '1292937' });
    bus.emit('record:updated', { storeName: 'douban_records', key: '*' });
    await settled();
    expect(bus.calls).toHaveLength(3);
    m.unmount();
  });

  test('recordPrefix 决定重读键前缀（game 网格只读 game::）', async () => {
    const bus = createBus();
    const m = await mount({ bus, recordPrefix: 'game', mediaType: 'game' });

    bus.emit('record:updated', { storeName: 'douban_records', key: 'game::1291544' });
    await settled();

    expect(bus.calls).toEqual([{ prefix: 'game', ids: ['1291544', '1292937'] }]);
    m.unmount();
  });

  test('unmount 释放订阅：后续广播不再产生读取', async () => {
    const bus = createBus();
    const m = await mount({ bus, recordMap: new Map<string, StoreRecord>() });
    m.unmount();

    expect(bus.subscribed()).toEqual([]);
    bus.emit('record:updated', { storeName: 'douban_records', key: 'movie::1291544' });
    await settled();
    expect(bus.calls).toEqual([]);
  });

  test('可见集为空（条目无 subjectId）→ 无键广播也只清状态，绝不退化为全表扫', async () => {
    const bus = createBus();
    const m = await mount({
      bus,
      items: [item(''), item('')],
      recordMap: new Map<string, StoreRecord>([['1291544', rec({ status: 2 })]]),
    });

    // A keyless broadcast means "bulk write happened" → the cache reloads, but
    // an explicit empty id list short-circuits to an empty map instead of the
    // dbGetAll full-store scan the same call would make without the guard.
    bus.emit('record:updated', { storeName: 'douban_records' });
    await settled();

    expect(bus.calls).toEqual([]);
    expect(statusClass(m.badge(0))).toBe('umm-status--small umm-status--none');
    m.unmount();
  });
});
