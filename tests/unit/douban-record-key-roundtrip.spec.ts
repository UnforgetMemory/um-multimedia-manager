import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import type { StoreRecord } from '@/types';
import type { Domain } from '@/libraries/config';
import { candidateRecordKeys, doubanRecordType } from '@/scenario/douban/shared/subject-keys';
import { UrlResolverBuilder } from '@/libraries/identity';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * Douban record-key round-trip contract (producer ↔ reader).
 *
 * Douban hosts TV subjects under movie.douban.com/subject/N, and
 * Identity.fromUrl never yields type 'tv' for douban — so every douban page
 * reads/writes `movie::<id>`. The Options tabs (RatingTab save, LinkedTab
 * query) build their key from the user-selected domain; before
 * doubanRecordType narrowed that domain, a 'tv' pick stored `tv::<id>` rows
 * invisible to detail/overlay reads yet exported verbatim ("recorded but the
 * page says unwatched" + half-duplicated subjects).
 *
 * These tests drive the real decision function used by both tabs, the real
 * identity resolver used by every douban page, and the real detail reader
 * (record-loader.loadRecord) through a chrome.runtime message stub
 * (precedent: detail-record-loader.spec.ts).
 */

const ID = '25954475';
const MOVIE_URL = `https://movie.douban.com/subject/${ID}/`;

/** Page the user views for a domain — where the saved record must be found. */
const PAGE_URLS: Record<Domain, string> = {
  movie: MOVIE_URL,
  tv: MOVIE_URL, // douban TV has no dedicated host; same movie-host page
  video: MOVIE_URL, // not a real douban medium — must fall onto movie::
  music: `https://music.douban.com/subject/${ID}/`,
  book: `https://book.douban.com/subject/${ID}/`,
  game: `https://www.douban.com/game/${ID}/`,
};

const EXPECTED_TYPE: Array<[Domain, Domain]> = [
  ['movie', 'movie'],
  ['tv', 'movie'],
  ['video', 'movie'],
  ['music', 'music'],
  ['book', 'book'],
  ['game', 'game'],
];

function makeRecord(): StoreRecord {
  return {
    url: MOVIE_URL,
    status: 2,
    rating: 8,
    comment: '',
    updatedAt: '2026-09-01T00:00:00.000Z',
    linkedIds: {},
  };
}

// Anchor window before the dynamic record-loader import (precedent:
// detail-record-loader.spec.ts — engine/database modules bind DOM globals).
defineGlobal(
  'window',
  new JSDOM('<!doctype html><html><body></body></html>', { url: MOVIE_URL }).window,
);

type LoaderModule = typeof import('@/scenario/douban/pages/detail/record-loader');
function loadLoader(): Promise<LoaderModule> {
  return import('@/scenario/douban/pages/detail/record-loader');
}

/** Minimal DB_GET stub answering from an in-memory key→record map. */
function installStoreStub(available: Record<string, unknown>): void {
  defineGlobal('chrome', {
    runtime: {
      id: 'test-extension',
      lastError: undefined,
      sendMessage: (
        msg: { type: string; payload: { key?: string } },
        cb?: (res: unknown) => void,
      ) => {
        if (msg.type === 'DB_GET') {
          cb?.({ success: true, record: available[msg.payload.key ?? ''] ?? null });
          return;
        }
        cb?.({ success: true });
      },
      onMessage: { addListener: () => {} },
    },
  });
}

test.describe('doubanRecordType — every selectable domain round-trips', () => {
  for (const [domain, want] of EXPECTED_TYPE) {
    test(`${domain} → storage type '${want}'`, () => {
      expect(doubanRecordType(domain)).toBe(want);
    });
  }

  for (const [domain] of EXPECTED_TYPE) {
    test(`${domain} save key equals the identity key of its page`, () => {
      const savedKey = `${doubanRecordType(domain)}::${ID}`;
      const identity = UrlResolverBuilder.fromUrl(PAGE_URLS[domain]);
      expect(identity).not.toBeNull();
      expect(savedKey).toBe(`${identity!.type}::${identity!.providerId}`);
    });
  }
});

test.describe('detail reader sees what the options tabs save', () => {
  test.afterEach(() => {
    defineGlobal('chrome', undefined);
  });

  test('tv-domain save is findable by the detail-page read (the orphan case)', async () => {
    const savedKey = `${doubanRecordType('tv')}::${ID}`;
    const record = makeRecord();
    installStoreStub({ [savedKey]: record });
    const { loadRecord } = await loadLoader();

    // Exactly what the movie.douban.com/subject overlay resolves and reads.
    const identity = UrlResolverBuilder.fromUrl(MOVIE_URL);
    expect(await loadRecord(identity!)).toEqual(record);
  });

  test('legacy tv:: rows stay half-visible: list readers see them, detail reader does not', async () => {
    // Characterises pre-fix data (no producer writes tv:: anymore): the
    // twin-aware list helper (subject-keys) resolves it, the single-key
    // detail read misses it — the inconsistency the migration proposal
    // (awaiting user approval) must resolve.
    const record = makeRecord();
    installStoreStub({ [`tv::${ID}`]: record });
    const { loadRecord } = await loadLoader();

    expect(await loadRecord(UrlResolverBuilder.fromUrl(MOVIE_URL)!)).toBeNull();
    expect(candidateRecordKeys(ID, MOVIE_URL)).toEqual([`movie::${ID}`, `tv::${ID}`]);
  });
});
