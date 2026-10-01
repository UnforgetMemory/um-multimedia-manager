import { test, expect } from '@playwright/test';
import {
  normalizeStoreRecordKey,
  normalizeVideoKey,
  adultAvIdFromKey,
  ADULT_AV_ID_INDEX,
  STORE_NAMES,
} from '@/engine/database/schema';

/**
 * X12-A coverage wave — schema.ts pure key helpers.
 *
 * Non-overlapping by construction: migration-keys.spec owns normalizeVideoKey
 * (5 canonical cases), watched-status.spec owns isWatchedStatus, and
 * contract-freeze.spec owns the store-group constants. What nothing tested
 * until now is normalizeStoreRecordKey (the WebDAV-restore/import gate) and
 * the adultAvIdFromKey suffix edge cases that the put-path matrices in
 * record-store.spec never feed a real store.
 */

test.describe('normalizeStoreRecordKey', () => {
  test('video stores delegate to normalizeVideoKey', () => {
    expect(normalizeStoreRecordKey(STORE_NAMES.BILIBILI, 'video::BV1xx')).toBe('movie::BV1xx');
    expect(normalizeStoreRecordKey(STORE_NAMES.BILIBILI, 'BV1xx')).toBe('movie::BV1xx');
    expect(normalizeStoreRecordKey(STORE_NAMES.YOUTUBE, 'video::dQw4w9WgXcQ')).toBe(
      'movie::dQw4w9WgXcQ',
    );
    expect(normalizeStoreRecordKey(STORE_NAMES.YOUTUBE, 'movie::already')).toBe('movie::already');
  });

  test('every non-video store is an identity map — even legacy video-shaped keys', () => {
    const untouched = [
      STORE_NAMES.DOUBAN,
      STORE_NAMES.IMDB,
      STORE_NAMES.NEODB,
      STORE_NAMES.TMDB,
      STORE_NAMES.BANGUMI,
      STORE_NAMES.JAV_IDS,
      STORE_NAMES.PT_ID_CACHE,
      STORE_NAMES.TTL_CACHE,
      'totally_unknown_store',
    ];
    for (const store of untouched) {
      expect(normalizeStoreRecordKey(store, 'video::BV1xx')).toBe('video::BV1xx');
      expect(normalizeStoreRecordKey(store, 'bare-key')).toBe('bare-key');
    }
  });
});

test.describe('adultAvIdFromKey (suffix semantics behind the v15 avId index)', () => {
  test('index name constant is the wire value the migration and write side share', () => {
    expect(ADULT_AV_ID_INDEX).toBe('avId');
  });

  test('suffix is everything after the FIRST :: and may itself contain ::', () => {
    expect(adultAvIdFromKey('javdb::SSIS-001')).toBe('SSIS-001');
    expect(adultAvIdFromKey('sehuatang::TID::3664524')).toBe('TID::3664524');
    expect(adultAvIdFromKey('a::b::c')).toBe('b::c');
  });

  test('bare keys return themselves; degenerate separator keys return the empty suffix', () => {
    expect(adultAvIdFromKey('SSIS-001')).toBe('SSIS-001');
    expect(adultAvIdFromKey('::')).toBe('');
    expect(adultAvIdFromKey('::x')).toBe('x');
    expect(adultAvIdFromKey('')).toBe('');
    // A trailing '::' means "empty suffix", NOT the whole key.
    expect(adultAvIdFromKey('src::')).toBe('');
  });

  test('agrees with normalizeVideoKey on the same boundary rule (first :: split)', () => {
    // Both helpers split on the first '::' only; video re-prefixes, avId strips.
    expect(adultAvIdFromKey(normalizeVideoKey('video::X'))).toBe('X');
    expect(adultAvIdFromKey(normalizeVideoKey('movie::Y'))).toBe('Y');
  });
});

test.describe('normalizeVideoKey edges beyond the migration-keys table', () => {
  test('the empty key normalizes to the bare movie prefix (never returns empty)', () => {
    expect(normalizeVideoKey('')).toBe('movie::');
  });

  test("'video::' with an empty suffix and nested colons keep the documented rule", () => {
    expect(normalizeVideoKey('video::')).toBe('movie::');
    expect(normalizeVideoKey('video::a::b')).toBe('movie::a::b');
    // Bare key containing '::' later? impossible — 'includes(::)' guards it.
    expect(normalizeVideoKey('tv::video::x')).toBe('tv::video::x');
  });
});
