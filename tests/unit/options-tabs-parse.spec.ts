import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRecordInput } from '@/entrypoints/options/record-input-parser';

/**
 * Shared Options-tab parser (RatingTab + LinkedTab consumed to be two
 * diverged ~150-line copies; they are now one pure module).
 *
 * Parser-level cases pin the discriminated result shape — an unparseable
 * input must come back `valid: false`, which is what the tabs' save/query
 * guards key off. SFC-internal behavior (save guard, status labels, bulk
 * read) is asserted on source fixtures — precedent: options-query-feedback.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = (rel: string): string => fs.readFileSync(path.resolve(HERE, '../../src', rel), 'utf8');

const RATING = SRC('entrypoints/options/tabs/RatingTab.vue');
const LINKED = SRC('entrypoints/options/tabs/LinkedTab.vue');

const YT_ID = 'dQw4w9WgXcQ';

test.describe('parseRecordInput — discriminated result contract', () => {
  test('garbage input is valid:false, not a truthy pseudo-success', () => {
    const r = parseRecordInput('!!!not a real id!!!', 'douban', 'movie');
    expect(r.valid).toBe(false);
    if (r.valid) throw new Error('parse unexpectedly valid');
    expect(r.errorKey).toBe('validation.doubanFormat');
    // The echoed providerId is raw garbage — a caller writing it would poison the store
    expect(r.providerId).toBe('!!!not a real id!!!');
  });

  test('empty input fails with idRequired', () => {
    const r = parseRecordInput('   ', 'imdb', 'movie');
    expect(r.valid).toBe(false);
    if (r.valid) throw new Error('parse unexpectedly valid');
    expect(r.errorKey).toBe('validation.idRequired');
  });

  test('URL wins over the selected platform', () => {
    const r = parseRecordInput('https://www.imdb.com/title/tt1375666/', 'douban', 'music');
    expect(r.valid).toBe(true);
    if (!r.valid) throw new Error('parse unexpectedly invalid');
    expect(r.provider).toBe('imdb');
    expect(r.type).toBe('movie');
  });
});

test.describe('parseRecordInput — YouTube', () => {
  test('watch URL parses; canonical url has no slash inside the query value', () => {
    const r = parseRecordInput(`https://www.youtube.com/watch?v=${YT_ID}`, 'youtube', 'video');
    expect(r.valid).toBe(true);
    if (!r.valid) throw new Error('parse unexpectedly invalid');
    expect(r.providerId).toBe(YT_ID);
    expect(r.url).toBe(`https://www.youtube.com/watch?v=${YT_ID}`);
  });

  test('youtu.be short link parses', () => {
    const r = parseRecordInput(`https://youtu.be/${YT_ID}`, 'douban', 'movie');
    expect(r.valid).toBe(true);
    if (!r.valid) throw new Error('parse unexpectedly invalid');
    expect(r.provider).toBe('youtube');
    expect(r.providerId).toBe(YT_ID);
    expect(r.url).toBe(`https://www.youtube.com/watch?v=${YT_ID}`);
  });

  test('/shorts/ link parses', () => {
    const r = parseRecordInput(`https://www.youtube.com/shorts/${YT_ID}`, 'youtube', 'video');
    expect(r.valid).toBe(true);
    if (!r.valid) throw new Error('parse unexpectedly invalid');
    expect(r.providerId).toBe(YT_ID);
  });

  test('/embed/ link parses', () => {
    const r = parseRecordInput(`https://www.youtube.com/embed/${YT_ID}`, 'youtube', 'video');
    expect(r.valid).toBe(true);
    if (!r.valid) throw new Error('parse unexpectedly invalid');
    expect(r.providerId).toBe(YT_ID);
  });

  test('bare 11-char ID yields a clean canonical URL', () => {
    const r = parseRecordInput(YT_ID, 'youtube', 'video');
    expect(r.valid).toBe(true);
    if (!r.valid) throw new Error('parse unexpectedly invalid');
    expect(r.url).toBe(`https://www.youtube.com/watch?v=${YT_ID}`);
  });

  test('youtube URL with a bad ID fails with the youtube error key', () => {
    const r = parseRecordInput('https://www.youtube.com/watch?v=nope', 'youtube', 'video');
    expect(r.valid).toBe(false);
    if (r.valid) throw new Error('parse unexpectedly valid');
    expect(r.errorKey).toBe('validation.youtubeFormat');
  });

  test('bad bare bilibili ID no longer claims IMDb format', () => {
    const r = parseRecordInput('XX1xx411c7mD', 'bilibili', 'video');
    expect(r.valid).toBe(false);
    if (r.valid) throw new Error('parse unexpectedly valid');
    expect(r.errorKey).toBe('validation.bilibiliFormat');
  });

  test('bad bare youtube ID no longer claims IMDb format', () => {
    const r = parseRecordInput('toolongid12345678', 'youtube', 'video');
    expect(r.valid).toBe(false);
    if (r.valid) throw new Error('parse unexpectedly valid');
    expect(r.errorKey).toBe('validation.youtubeFormat');
  });
});

test.describe('parseRecordInput — Douban subdomain classification', () => {
  test('movie subject with a book-referencing query stays type movie', () => {
    const r = parseRecordInput(
      'https://movie.douban.com/subject/123/?from=book-list',
      'douban',
      'movie',
    );
    expect(r.valid).toBe(true);
    if (!r.valid) throw new Error('parse unexpectedly invalid');
    expect(r.type).toBe('movie');
    expect(r.providerId).toBe('123');
    expect(r.url).toBe('https://movie.douban.com/subject/123/');
  });

  test('book/music hosts classify by subdomain', () => {
    const book = parseRecordInput('https://book.douban.com/subject/123/', 'douban', 'movie');
    expect(book.valid && book.type).toBe('book');
    const music = parseRecordInput('https://music.douban.com/subject/456/', 'douban', 'movie');
    expect(music.valid && music.type).toBe('music');
    expect(music.valid && music.url).toBe('https://music.douban.com/subject/456/');
  });
});

test.describe('parseRecordInput — bare-ID normalization (unified for both tabs)', () => {
  test('numeric IMDb ID normalizes to tt-prefixed', () => {
    const r = parseRecordInput('123456', 'imdb', 'movie');
    expect(r.valid).toBe(true);
    if (!r.valid) throw new Error('parse unexpectedly invalid');
    expect(r.providerId).toBe('tt123456');
  });

  test('douban tv-domain selection clamps to the movie record type', () => {
    const r = parseRecordInput('25954475', 'douban', 'tv');
    expect(r.valid).toBe(true);
    if (!r.valid) throw new Error('parse unexpectedly invalid');
    expect(r.type).toBe('movie');
  });

  test('bangumi bare ID canonicalizes to tv type', () => {
    const r = parseRecordInput('164671', 'bangumi', 'movie');
    expect(r.valid).toBe(true);
    if (!r.valid) throw new Error('parse unexpectedly invalid');
    expect(r.type).toBe('tv');
    expect(r.url).toBe('https://bgm.tv/subject/164671/');
  });

  test('jav code embeds the selected source in the key', () => {
    const r = parseRecordInput('abp-123', 'jav_ids', 'movie', 'javdb');
    expect(r.valid).toBe(true);
    if (!r.valid) throw new Error('parse unexpectedly invalid');
    expect(r.providerId).toBe('javdb::ABP-123');
    expect(r.type).toBe('jav_ids');
  });

  test('non-jav input under jav_ids fails with the jav error key', () => {
    const r = parseRecordInput('hello world', 'jav_ids', 'movie');
    expect(r.valid).toBe(false);
    if (r.valid) throw new Error('parse unexpectedly valid');
    expect(r.errorKey).toBe('validation.javFormat');
  });
});

test.describe('tabs consume the shared parser and guard on valid', () => {
  test('both tabs import the parser; private parse chains are gone', () => {
    for (const tab of [RATING, LINKED]) {
      expect(tab).toContain("from '../record-input-parser'");
    }
    expect(RATING).not.toContain('function parseRatingInput');
    expect(RATING).not.toContain('function validateAndNormalizeProviderId');
    expect(LINKED).not.toContain('function parseLinkedInput');
  });

  test('saveRating rejects a valid:false parse before touching the DB', () => {
    const save = RATING.slice(RATING.indexOf('async function saveRating'));
    expect(save).toContain('if (!parsed.valid)');
    // the guard must precede the first db write
    expect(save.indexOf('if (!parsed.valid)')).toBeLessThan(save.indexOf('Store.dbPut'));
  });

  test('LinkedTab query path still refuses invalid parses', () => {
    const query = LINKED.slice(LINKED.indexOf('async function queryLinkedData'));
    expect(query).toContain('!parsed.valid');
  });

  test('wishlist status is labelled wish, not rating, in both tabs', () => {
    expect(RATING).toContain("1: t('common.wish')");
    expect(LINKED).toContain("1: t('common.wish')");
    expect(RATING).not.toContain("1: t('common.rating')");
    expect(LINKED).not.toContain("1: t('common.rating')");
  });

  test('LinkedTab reads linked records with a bulk call, not per-entry dbGet', () => {
    expect(LINKED).toContain('Store.dbGetBulk');
    const query = LINKED.slice(LINKED.indexOf('async function queryLinkedData'));
    // the only per-key dbGets left are the two single source-record reads;
    // no template-literal store name (the old per-linked-entry read) remains
    expect(query).not.toContain('Store.dbGet(`');
  });
});
