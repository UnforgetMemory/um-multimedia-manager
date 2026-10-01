import { test, expect } from '@playwright/test';
import { extractImdbIdFromText } from '@/libraries/utils/imdb-id';

/**
 * extractImdbIdFromText — IMDb tt-id recognition for search normalization.
 * Contracts pinned: the three supported shapes (full link / "IMDb:" label /
 * bare id), link > label > bare precedence, case-insensitive input with
 * lowercase output, the 5-digit minimum for label/bare forms (guards tt123
 * false positives) vs the permissive `tt\d+` form inside real links.
 */

test.describe('full imdb.com links', () => {
  test('canonical subject URL', () => {
    expect(extractImdbIdFromText('https://www.imdb.com/title/tt0111161/')).toBe('tt0111161');
    expect(extractImdbIdFromText('http://imdb.com/title/tt0111161')).toBe('tt0111161');
    expect(extractImdbIdFromText('见 https://www.imdb.com/title/tt0111161/?ref_=nv 链接')).toBe(
      'tt0111161',
    );
  });

  test('link id is lowercased', () => {
    expect(extractImdbIdFromText('https://IMDB.COM/title/TT0111161/')).toBe('tt0111161');
  });

  test('link form accepts short ids (host URL is trusted input)', () => {
    // IMDB_LINK_RE is tt\d+ — the 5-digit floor applies only to label/bare.
    expect(extractImdbIdFromText('imdb.com/title/tt123/')).toBe('tt123');
  });
});

test.describe('label form', () => {
  test('half-width and full-width colons, spacing variants', () => {
    expect(extractImdbIdFromText('IMDb: tt0111161')).toBe('tt0111161');
    expect(extractImdbIdFromText('IMDb：tt0111161')).toBe('tt0111161');
    expect(extractImdbIdFromText('imdb:tt0111161')).toBe('tt0111161');
    expect(extractImdbIdFromText('IMDb  :  tt0111161')).toBe('tt0111161');
  });

  test('colon is optional', () => {
    expect(extractImdbIdFromText('IMDb tt0111161')).toBe('tt0111161');
  });

  test('label id is lowercased', () => {
    expect(extractImdbIdFromText('IMDB: TT0111161')).toBe('tt0111161');
  });

  test('label form enforces the 5-digit minimum', () => {
    expect(extractImdbIdFromText('IMDb: tt1234')).toBeNull();
  });
});

test.describe('bare id form', () => {
  test('standalone tt-id with 5+ digits', () => {
    expect(extractImdbIdFromText('tt0111161')).toBe('tt0111161');
    expect(extractImdbIdFromText('编号 tt12345 请核对')).toBe('tt12345');
    expect(extractImdbIdFromText('TT0111161')).toBe('tt0111161');
  });

  test('under 5 digits is rejected (false-positive guard)', () => {
    expect(extractImdbIdFromText('tt123')).toBeNull();
    expect(extractImdbIdFromText('tt1234')).toBeNull();
  });

  test('word boundaries keep ids embedded in longer tokens out', () => {
    expect(extractImdbIdFromText('xxtt0111161')).toBeNull();
    expect(extractImdbIdFromText('tt0111161abc')).toBeNull();
  });

  test('long ids pass (open-ended digit run)', () => {
    expect(extractImdbIdFromText('tt12345678')).toBe('tt12345678');
  });
});

test.describe('precedence and negatives', () => {
  test('link wins over bare id elsewhere in the text', () => {
    expect(extractImdbIdFromText('tt9999999 对比 https://www.imdb.com/title/tt0111161/')).toBe(
      'tt0111161',
    );
  });

  test('label wins over a later bare id', () => {
    // LABEL_RE scans from its own anchor; first match overall is the label.
    expect(extractImdbIdFromText('IMDb: tt1111111 aka tt2222222')).toBe('tt1111111');
  });

  test('first occurrence is returned', () => {
    expect(extractImdbIdFromText('tt1111111 tt2222222')).toBe('tt1111111');
  });

  test('absent input yields null', () => {
    expect(extractImdbIdFromText('')).toBeNull();
    expect(extractImdbIdFromText('盗梦空间 Inception')).toBeNull();
    expect(extractImdbIdFromText('tt')).toBeNull();
    expect(extractImdbIdFromText('ttabcd12345')).toBeNull();
  });
});
