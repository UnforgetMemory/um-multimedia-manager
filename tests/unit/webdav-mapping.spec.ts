import { test, expect } from '@playwright/test';
import {
  hashKeyToFilename,
  normalizeRemoteMetaPayload,
  normalizeUrl,
  stripUrlCredentials,
} from '@/provider/webdav/mapping';

/**
 * WebDAV pure seam (mapping.ts) — direct unit tests for the rules the
 * provider split exposed: URL normalization, credential stripping for logs,
 * store-key → filename hashing, and meta.json old→new format normalization.
 * No fetch involved anywhere here — that is the payoff of the seam.
 */

test.describe('normalizeUrl', () => {
  test('trims whitespace and strips trailing slashes', () => {
    expect(normalizeUrl('  https://x.example/dav/  ')).toBe('https://x.example/dav');
    expect(normalizeUrl('https://x.example/dav///')).toBe('https://x.example/dav');
    expect(normalizeUrl('https://x.example')).toBe('https://x.example');
  });
});

test.describe('stripUrlCredentials', () => {
  test('removes userinfo from parseable URLs', () => {
    expect(stripUrlCredentials('https://user:pw@example.com/dav')).toBe('https://example.com/dav');
  });

  test('falls back to prefix regex for unparseable URLs', () => {
    // Space in the host makes URL() throw; the regex path still strips.
    expect(stripUrlCredentials('http://user:pw@ex ample')).toBe('http://ex ample');
  });

  test('leaves credential-free URLs untouched', () => {
    expect(stripUrlCredentials('https://example.com/dav')).toBe('https://example.com/dav');
  });
});

test.describe('hashKeyToFilename', () => {
  test('produces a deterministic 16-char lowercase hex name', async () => {
    const a = await hashKeyToFilename('movie:douban');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(await hashKeyToFilename('movie:douban')).toBe(a);
  });

  test('distinct keys map to distinct filenames', async () => {
    expect(await hashKeyToFilename('movie:douban')).not.toBe(await hashKeyToFilename('movie:imdb'));
  });
});

test.describe('normalizeRemoteMetaPayload', () => {
  test('passes through new-format datasets unchanged', () => {
    const raw = {
      datasets: [{ key: 'k', hash: 'h', updatedAt: 'u', recordCount: 3, dataVersion: 2 }],
    };
    const meta = normalizeRemoteMetaPayload(raw);
    expect(meta.datasets[0]).toEqual({
      key: 'k',
      hash: 'h',
      updatedAt: 'u',
      recordCount: 3,
      dataVersion: 2,
    });
  });

  test('maps old format (timestamp/version) to new fields', () => {
    const raw = { datasets: [{ key: 'k', timestamp: 'old-ts', version: 5 }] };
    const meta = normalizeRemoteMetaPayload(raw);
    expect(meta.datasets[0]).toEqual({
      key: 'k',
      hash: 'unknown',
      updatedAt: 'old-ts',
      recordCount: 0,
      dataVersion: 5,
    });
  });

  test('prefers new fields over old ones', () => {
    const raw = {
      datasets: [{ updatedAt: 'new', timestamp: 'old', dataVersion: 1, version: 9 }],
    };
    const meta = normalizeRemoteMetaPayload(raw);
    expect(meta.datasets[0]?.updatedAt).toBe('new');
    expect(meta.datasets[0]?.dataVersion).toBe(1);
  });

  test('dataVersion 0 survives the nullish fallback (never coerced to 1)', () => {
    const raw = { datasets: [{ dataVersion: 0 }] };
    const meta = normalizeRemoteMetaPayload(raw);
    expect(meta.datasets[0]?.dataVersion).toBe(0);
  });

  test('payload without datasets passes through untouched', () => {
    const raw = { schema: 'umm-webdav-meta' };
    const meta = normalizeRemoteMetaPayload(raw);
    expect(meta).toBe(raw);
  });
});
