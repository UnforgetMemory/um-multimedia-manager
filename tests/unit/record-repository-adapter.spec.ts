import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import {
  RecordRepositoryAdapter,
  type DbAdapterForRepo,
} from '@/engine/database/record-repository-adapter';
import type { IRecordRepository } from '@/domain/record/i-record-repository';
import { StoreRecord } from '@/domain/record/store-record';
import type { StoreRecordSnapshot } from '@/domain/record/store-record';
import {
  handleDbSyncPageRecord,
  type DbHandlerContext,
} from '@/entrypoints/background/handlers/db';
import { CacheManager } from '@/engine/cache/cache-manager';
import { DataScheduler } from '@/engine/data-scheduler/data-scheduler';
import { RecordService } from '@/domain/record/record-service';
import type { MediaDatabase } from '@/engine/database/models';
import type { MessagePayloadMap } from '@/types';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * X12-A coverage wave — record-repository-adapter.ts (IRecordRepository → IndexedDB bridge).
 *
 * The adapter takes its database through the `DbAdapterForRepo` seam, so these specs drive it
 * with a recording fake: every assertion is about the store name, the derived
 * `{type}::{providerId}` key and the serialized payload handed down, plus how a stored snapshot
 * is rebuilt into a StoreRecord. IndexedDB itself is deliberately absent — migration, caching
 * and version stamping belong to the store layer (see record-store.spec.ts).
 */

const KEY = 'movie::1292052';
const DOUBAN = 'https://movie.douban.com/subject/1292052/';

interface Call {
  readonly store: string;
  readonly key: string;
}

class RecordingDb implements DbAdapterForRepo {
  readonly reads: Call[] = [];
  readonly writes: (Call & { snapshot: StoreRecordSnapshot })[] = [];
  private readonly rows = new Map<string, StoreRecordSnapshot>();

  seed(store: string, key: string, snapshot: StoreRecordSnapshot): void {
    this.rows.set(`${store}|${key}`, snapshot);
  }

  get(store: string, key: string): Promise<StoreRecordSnapshot | null> {
    this.reads.push({ store, key });
    return Promise.resolve(this.rows.get(`${store}|${key}`) ?? null);
  }

  put(store: string, key: string, snapshot: StoreRecordSnapshot): Promise<void> {
    this.writes.push({ store, key, snapshot });
    this.rows.set(`${store}|${key}`, snapshot);
    return Promise.resolve();
  }
}

function snap(url: string, over: Partial<StoreRecordSnapshot> = {}): StoreRecordSnapshot {
  return {
    url,
    status: 2,
    rating: 8,
    updatedAt: '2026-01-01T00:00:00.000Z',
    linkedIds: {},
    ...over,
  };
}

function rec(url: string, over: Partial<StoreRecordSnapshot> = {}): StoreRecord {
  return StoreRecord.fromSnapshot(snap(url, over));
}

/** Narrow a repository read. The null branch is a test-failure path, never a case of its own. */
function requireRecord(found: StoreRecord | null): StoreRecord {
  if (!found) throw new Error('findByKey returned null');
  return found;
}

function readStores(db: RecordingDb): string[] {
  return db.reads.map((call) => call.store);
}

function writtenSnapshot(db: RecordingDb): StoreRecordSnapshot {
  const last = db.writes.at(-1);
  if (!last) throw new Error('the adapter wrote nothing');
  return last.snapshot;
}

test.describe('store name normalization', () => {
  test('a short platform name gains the _records suffix on the read path', async () => {
    const db = new RecordingDb();
    db.seed('douban_records', KEY, snap(DOUBAN));
    const repo = new RecordRepositoryAdapter(db);

    const found = requireRecord(await repo.findByKey('douban', KEY));

    expect(found.url).toBe(DOUBAN);
    expect(db.reads).toEqual([{ store: 'douban_records', key: KEY }]);
  });

  test('both spellings of one platform address the same row', async () => {
    const db = new RecordingDb();
    db.seed('douban_records', KEY, snap(DOUBAN));
    const repo = new RecordRepositoryAdapter(db);

    await repo.findByKey('douban', KEY);
    await repo.findByKey('douban_records', KEY);

    expect(readStores(db)).toEqual(['douban_records', 'douban_records']);
  });

  test('only jav_ids and ttl_cache escape the suffix', async () => {
    // The escape list predates ADR-025: usav_ids / sehuatang_ids / pt_id_cache became
    // non-_records stores later and never joined it, so those spellings still resolve to a
    // store name that does not exist in the schema. Pinned so any extension of the list is
    // a deliberate, visible change instead of a silent rewrite of these expectations.
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);

    await repo.findByKey('jav_ids', 'javdb::SSIS-001');
    await repo.findByKey('ttl_cache', 'any');
    await repo.findByKey('usav_ids', 'usav::x');
    await repo.findByKey('sehuatang_ids', 'sehuatang::TID::1');
    await repo.findByKey('pt_id_cache', 'https://hdhome.org/details.php?id=1');
    await repo.findByKey('pt_sites', 'anything');

    expect(readStores(db)).toEqual([
      'jav_ids',
      'ttl_cache',
      'usav_ids_records',
      'sehuatang_ids_records',
      'pt_id_cache_records',
      'pt_sites_records',
    ]);
  });

  test('the write path normalizes exactly like the read path', async () => {
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);

    await repo.save('douban', rec(DOUBAN));
    const roundTrip = await repo.findByKey('douban', KEY);

    expect(db.writes.map((call) => call.store)).toEqual(['douban_records']);
    expect(readStores(db)).toEqual(['douban_records']);
    requireRecord(roundTrip);
  });
});

test.describe('findByKey — snapshot to domain reconstruction', () => {
  test('a missing row resolves to null without inventing one', async () => {
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);

    expect(await repo.findByKey('douban', KEY)).toBeNull();
    expect(db.writes).toEqual([]);
  });

  test('stored values come back as domain value objects', async () => {
    const db = new RecordingDb();
    db.seed(
      'douban_records',
      KEY,
      snap(DOUBAN, { comment: 'great', linkedIds: { imdb: 'movie::tt1375666' } }),
    );
    const repo = new RecordRepositoryAdapter(db);

    const found = requireRecord(await repo.findByKey('douban', KEY));

    expect(found).toBeInstanceOf(StoreRecord);
    expect(found.status.code).toBe(2);
    expect(found.rating.value).toBe(8);
    expect(found.comment).toBe('great');
    expect(found.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(found.linkedIds).toEqual({ imdb: 'movie::tt1375666' });
    expect(found.isWatched).toBe(true);
  });

  test('concurrency versions are passed through, never stamped or bumped', async () => {
    const db = new RecordingDb();
    db.seed('douban_records', KEY, snap(DOUBAN, { schemaVersion: 1, recordVersion: 7 }));
    const repo = new RecordRepositoryAdapter(db);

    const found = requireRecord(await repo.findByKey('douban', KEY));

    expect(found.schemaVersion).toBe(1);
    expect(found.recordVersion).toBe(7);
  });

  test('a status outside 0..3 degrades to none instead of throwing', async () => {
    // fromSnapshot uses Status.fromCode, which only recognises 0..3 — a corrupt row must not
    // break the read path.
    const db = new RecordingDb();
    db.seed('douban_records', KEY, snap(DOUBAN, { status: 99 }));
    const repo = new RecordRepositoryAdapter(db);

    const found = requireRecord(await repo.findByKey('douban', KEY));

    expect(found.status.code).toBe(0);
    expect(found.isWatched).toBe(false);
  });

  test('an off-scale rating degrades to unrated', async () => {
    const db = new RecordingDb();
    db.seed('douban_records', 'movie::1', snap(DOUBAN, { rating: 7.3 }));
    db.seed('douban_records', 'movie::2', snap(DOUBAN, { rating: 11 }));
    const repo = new RecordRepositoryAdapter(db);

    expect(requireRecord(await repo.findByKey('douban', 'movie::1')).rating.value).toBe(0);
    expect(requireRecord(await repo.findByKey('douban', 'movie::2')).rating.value).toBe(0);
  });

  test('linkedIds is a frozen copy, so the stored row stays untouched', async () => {
    const stored = snap(DOUBAN, { linkedIds: { imdb: KEY } });
    const db = new RecordingDb();
    db.seed('douban_records', KEY, stored);
    const repo = new RecordRepositoryAdapter(db);

    const found = requireRecord(await repo.findByKey('douban', KEY));

    expect(found.linkedIds).not.toBe(stored.linkedIds);
    expect(Object.isFrozen(found.linkedIds)).toBe(true);
    expect(Object.isFrozen(stored.linkedIds)).toBe(false);
  });

  test('the read key is forwarded verbatim — reads never re-derive it', async () => {
    const db = new RecordingDb();
    db.seed('douban_records', KEY, snap(DOUBAN));
    const repo = new RecordRepositoryAdapter(db);

    expect(await repo.findByKey('douban', '1292052')).toBeNull();

    expect(db.reads).toEqual([{ store: 'douban_records', key: '1292052' }]);
  });

  test('reading migrates nothing — the adapter writes only when told to', async () => {
    const db = new RecordingDb();
    db.seed('douban_records', KEY, snap(DOUBAN, { schemaVersion: 1 }));
    const repo = new RecordRepositoryAdapter(db);

    await repo.findByKey('douban', KEY);
    await repo.findByKey('douban', KEY);

    expect(db.writes).toEqual([]);
    expect(db.reads).toHaveLength(2);
  });

  test('usable through the domain repository interface', async () => {
    const db = new RecordingDb();
    db.seed('douban_records', KEY, snap(DOUBAN));
    const repo: IRecordRepository = new RecordRepositoryAdapter(db);

    expect(requireRecord(await repo.findByKey('douban', KEY)).url).toBe(DOUBAN);
  });
});

test.describe('save — storage key derivation', () => {
  test('a canonical platform URL maps to {type}::{providerId}', async () => {
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);

    await repo.save('douban', rec(DOUBAN));

    expect(db.writes).toHaveLength(1);
    expect(db.writes[0]?.key).toBe(KEY);
  });

  test('URL noise does not move the key', async () => {
    // canonicalizeUrl strips query, hash and repeated slashes before the key is taken, so
    // every spelling of one subject collapses onto the same row.
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);

    await repo.save('douban', rec('https://movie.douban.com/subject/1292052/?sort=time#hdr'));
    await repo.save('douban', rec('https://movie.douban.com//subject//1292052'));
    await repo.save('douban', rec(DOUBAN));

    expect(db.writes.map((call) => call.key)).toEqual([KEY, KEY, KEY]);
  });

  test('provider ids are normalized per platform, not globally', async () => {
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);

    await repo.save('imdb', rec('https://www.imdb.com/title/TT1375666/'));
    await repo.save('bilibili', rec('https://www.bilibili.com/video/BV1xx411c7mD/'));

    expect(db.writes.map((call) => call.key)).toEqual(['movie::tt1375666', 'movie::BV1xx411c7mD']);
  });

  test('prefixed provider ids keep their prefix in the key', async () => {
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);

    await repo.save('tmdb', rec('https://www.themoviedb.org/tv/1399-game-of-thrones/'));
    await repo.save('neodb', rec('https://neodb.social/tv/season/abc-123/'));

    expect(db.writes.map((call) => call.key)).toEqual(['tv::show:1399', 'tv::season:abc-123']);
  });

  test('the key type is the media type, so non-movie pages fold into their own prefix', async () => {
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);

    await repo.save('douban', rec('https://music.douban.com/subject/25906455/'));
    await repo.save('douban', rec('https://www.douban.com/game/26329/'));
    await repo.save('douban', rec('https://www.douban.com/personage/10005026/'));

    expect(db.writes.map((call) => call.key)).toEqual([
      'music::25906455',
      'game::26329',
      'movie::10005026',
    ]);
  });

  test('the payload is a serialized snapshot, not the aggregate', async () => {
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);
    const record = rec(DOUBAN, { linkedIds: { imdb: 'movie::tt1375666' } });

    await repo.save('douban', record);

    const written = writtenSnapshot(db);
    expect(written).not.toBe(record);
    expect(written.status).toBe(2);
    expect(written.rating).toBe(8);
    expect(written.linkedIds).toEqual({ imdb: 'movie::tt1375666' });
    expect(written.linkedIds).not.toBe(record.linkedIds);
  });

  test('only the eight snapshot fields cross the boundary', async () => {
    // avId is a store-layer derived index field; the domain factory never produces it and the
    // adapter must not add it — the same set the read whitelist accepts.
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);

    await repo.save('douban', rec(DOUBAN));

    expect(Object.keys(writtenSnapshot(db)).sort()).toEqual([
      'comment',
      'linkedIds',
      'rating',
      'recordVersion',
      'schemaVersion',
      'status',
      'updatedAt',
      'url',
    ]);
    expect('avId' in writtenSnapshot(db)).toBe(false);
  });

  test('versions ride along untouched and no prior row is looked up', async () => {
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);

    await repo.save('douban', rec(DOUBAN, { schemaVersion: 2, recordVersion: 7 }));

    const written = writtenSnapshot(db);
    expect(written.schemaVersion).toBe(2);
    expect(written.recordVersion).toBe(7);
    expect(db.reads).toEqual([]);
  });

  test('saving the same record twice writes the same key twice', async () => {
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);
    const record = rec(DOUBAN);

    await repo.save('douban', record);
    await repo.save('douban', record);

    expect(db.writes.map((call) => call.key)).toEqual([KEY, KEY]);
  });

  test('a second spelling of the same item overwrites the first row', async () => {
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);

    await repo.save('douban', rec(DOUBAN, { comment: 'first' }));
    await repo.save(
      'douban',
      rec('https://movie.douban.com/subject/1292052/?greeting=hi', {
        comment: 'second',
      }),
    );

    expect(requireRecord(await repo.findByKey('douban', KEY)).comment).toBe('second');
  });
});

test.describe('save — unresolvable urls', () => {
  test('an unknown host throws with the offending url and writes nothing', async () => {
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);

    await expect(repo.save('douban', rec('https://example.com/movie/12345/'))).rejects.toThrow(
      'Cannot resolve storage key for URL: https://example.com/movie/12345/',
    );
    expect(db.writes).toEqual([]);
  });

  test('an empty url throws as well', async () => {
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);

    await expect(repo.save('douban', rec(''))).rejects.toThrow(
      'Cannot resolve storage key for URL:',
    );
    expect(db.writes).toEqual([]);
  });

  test('a youtube watch url is unresolvable because canonicalization strips its id', async () => {
    // Documented dead path in Identity.fromUrl: the v= param is dropped before parsing, so
    // YouTube records can never be keyed through this adapter.
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);

    await expect(
      repo.save('youtube', rec('https://www.youtube.com/watch?v=dQw4w9WgXcQ')),
    ).rejects.toThrow(
      'Cannot resolve storage key for URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  test('a douban subject without a numeric id throws', async () => {
    const db = new RecordingDb();
    const repo = new RecordRepositoryAdapter(db);

    await expect(repo.save('douban', rec('https://movie.douban.com/subject/abc/'))).rejects.toThrow(
      'Cannot resolve storage key',
    );
  });
});

// ==================== Adjudication: non-_records store spellings ====================

test.describe('reachability of usav_ids / sehuatang_ids / pt_id_cache through the adapter', () => {
  /**
   * Claim (umreview wave 2): normalizeStore's escape list missing usav_ids /
   * sehuatang_ids / pt_id_cache mishandles those stores. The adapter has exactly ONE
   * production wiring (background.ts → RecordService), and its single entry,
   * handleDbSyncPageRecord, gates every platform through `isAllowedStore(`${platform
   * }_records`)`. No non-`*_records` spelling can therefore EVER reach normalizeStore —
   * the adult/cache stores are served by dedicated handlers straight against
   * MediaDatabase (adult-av.ts / pt-id-cache.ts), with different row shapes. Refuted:
   * adding them to the escape list would route id-store rows through StoreRecord
   * snapshot conversion, i.e. corrupt them.
   */
  function syncPayloadFor(platform: string): MessagePayloadMap['DB_SYNC_PAGE_RECORD'] {
    return {
      platform,
      key: KEY,
      record: snap(DOUBAN),
    } as unknown as MessagePayloadMap['DB_SYNC_PAGE_RECORD'];
  }

  test('the message boundary rejects every non-_records platform before the repository layer', async () => {
    const seen: string[] = [];
    const repo: IRecordRepository = {
      findByKey: async (store) => {
        seen.push(store);
        return null;
      },
      save: async (store) => {
        seen.push(store);
      },
    };
    const sent: unknown[] = [];
    // The sandbox helper restores chrome in afterAll, so no manual delete here.
    defineGlobal('chrome', { runtime: { sendMessage: (m: unknown) => sent.push(m) } });

    const ctx: DbHandlerContext = {
      db: {} as unknown as MediaDatabase,
      scheduler: new DataScheduler(new CacheManager()),
      recordService: new RecordService(repo),
    };

    for (const platform of ['usav_ids', 'sehuatang_ids', 'pt_id_cache', 'ttl_cache', 'jav_ids']) {
      const result = await handleDbSyncPageRecord(syncPayloadFor(platform), ctx);
      expect(result).toEqual({ success: false, error: 'Invalid platform' });
    }
    expect(seen).toEqual([]); // nothing reaches the adapter, normalized or otherwise

    // A genuine record platform passes and arrives as the SHORT name — the only
    // shape normalizeStore is ever asked about in production.
    const ok = await handleDbSyncPageRecord(syncPayloadFor('douban'), ctx);
    expect(ok.success).toBe(true);
    expect(seen).toEqual(['douban', 'douban']); // findByKey miss, then save
  });
});
