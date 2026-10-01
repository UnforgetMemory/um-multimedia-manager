import { test, expect } from '@playwright/test';
import { defineGlobal } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import type { AdultAvId, StoreRecord } from '@/types';

/**
 * use-stats — the popup/options counters aggregator.
 * Contracts pinned:
 * 1. per-type buckets (movie/tv/music/book/game) count exclusively;
 * 2. provider buckets (bilibili/youtube) count ADDITIVELY alongside type
 *    buckets (a bilibili movie lands in BOTH), and other providers do not
 *    spawn a platform counter — bangumi mirrors douban by media type (documented);
 * 3. total = records + adult-AV items; jav = items.length;
 * 4. unknown types inflate total but no bucket;
 * 5. reactivity: stats is a computed over the injected getters — replacing the
 *    getter's ref value refreshes counts without re-creating the composable.
 * Vue's runtime-dom captures `document` at module-init, hence lazy imports.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);

type VueModule = typeof import('vue');
type StatsModule = typeof import('@/feature/composables/use-stats');

let vue: VueModule | undefined;
let mod: StatsModule | undefined;

async function load(): Promise<{ vue: VueModule; mod: StatsModule }> {
  if (!vue || !mod) {
    vue = await import('vue');
    mod = await import('@/feature/composables/use-stats');
  }
  return { vue, mod };
}

function rec(overrides: Partial<StoreRecord> & { type: string; provider?: string }): {
  type: string;
  provider?: string;
  url: string;
  status: number;
  rating: number;
  updatedAt: string;
  linkedIds: Record<string, string>;
} {
  const { type, provider, ...rest } = overrides;
  return {
    type,
    provider,
    url: 'https://example.com/1',
    status: 2,
    rating: 8,
    updatedAt: '2026-01-01T00:00:00.000Z',
    linkedIds: {},
    ...rest,
  };
}

function adult(id: string): AdultAvId {
  return { source: 'javdb', id, url: `https://www.javdb.com/?q=${id}`, rating: 0, updatedAt: '' };
}

test.describe('useStats', () => {
  test('empty inputs → all-zero counters', async () => {
    const { mod: m } = await load();
    const { stats } = m.useStats(
      () => [],
      () => [],
    );
    expect(stats.value).toEqual({
      total: 0,
      movie: 0,
      tv: 0,
      music: 0,
      book: 0,
      game: 0,
      jav: 0,
      bilibili: 0,
      youtube: 0,
    });
  });

  test('type buckets count each MediaTypeId exclusively', async () => {
    const { mod: m } = await load();
    const { stats } = m.useStats(
      () => [
        rec({ type: 'movie' }),
        rec({ type: 'movie' }),
        rec({ type: 'tv' }),
        rec({ type: 'music' }),
        rec({ type: 'book' }),
        rec({ type: 'game' }),
      ],
      () => [],
    );
    expect(stats.value.movie).toBe(2);
    expect(stats.value.tv).toBe(1);
    expect(stats.value.music).toBe(1);
    expect(stats.value.book).toBe(1);
    expect(stats.value.game).toBe(1);
    expect(stats.value.total).toBe(6);
  });

  test('bilibili/youtube providers count alongside (not instead of) type buckets', async () => {
    const { mod: m } = await load();
    const { stats } = m.useStats(
      () => [
        rec({ type: 'movie', provider: 'bilibili' }),
        rec({ type: 'tv', provider: 'youtube' }),
        rec({ type: 'movie', provider: 'douban' }),
        rec({ type: 'movie', provider: 'bangumi' }),
      ],
      () => [],
    );
    expect(stats.value.bilibili).toBe(1);
    expect(stats.value.youtube).toBe(1);
    // Douban/bangumi add NO platform counter — bangumi mirrors douban by type.
    expect(stats.value.movie).toBe(3);
    expect(stats.value.tv).toBe(1);
    expect(stats.value.total).toBe(4);
  });

  test('adult-AV items join the total and the jav bucket only', async () => {
    const { mod: m } = await load();
    const { stats } = m.useStats(
      () => [rec({ type: 'movie' })],
      () => [adult('ABC-123'), adult('DEF-456')],
    );
    expect(stats.value.jav).toBe(2);
    expect(stats.value.total).toBe(3); // 1 record + 2 adult ids
    expect(stats.value.movie).toBe(1);
  });

  test('unknown type inflates total but no bucket', async () => {
    const { mod: m } = await load();
    const { stats } = m.useStats(
      () => [rec({ type: 'theater' })],
      () => [],
    );
    expect(stats.value.total).toBe(1);
    expect(stats.value.movie + stats.value.tv + stats.value.music + stats.value.book).toBe(0);
  });

  test('stats recomputes when the getters swap their source data', async () => {
    const { vue: v, mod: m } = await load();
    const records = v.ref([rec({ type: 'movie' })]);
    const adults = v.ref<AdultAvId[]>([]);
    const { stats } = m.useStats(
      () => records.value,
      () => adults.value,
    );
    expect(stats.value.total).toBe(1);

    records.value = [rec({ type: 'tv' }), rec({ type: 'tv' })];
    adults.value = [adult('XXX-001')];
    expect(stats.value.total).toBe(3);
    expect(stats.value.movie).toBe(0);
    expect(stats.value.tv).toBe(2);
    expect(stats.value.jav).toBe(1);
  });
});
