import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Settings-tab save-race locks.
 *
 * The SFCs are not compilable by this runner (precedent:
 * options-query-feedback.spec.ts), so the contracts are asserted on source
 * fixtures:
 * 1. SettingsTab must give each watched source its own debounce slot — one
 *    shared timer lets the second toggle cancel the first pending save;
 * 2. SettingsTab unmount must flush pending saves instead of dropping them;
 * 3. WebDAVTab's cross-tab storage sync must apply per-field with a typeof
 *    check behind a re-entrancy window — a blind object reassign with
 *    `as string` casts clobbers in-progress edits and lets non-string
 *    values through to `.startsWith`.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = (rel: string): string => fs.readFileSync(path.resolve(HERE, '../../src', rel), 'utf8');

const SETTINGS = SRC('entrypoints/options/tabs/SettingsTab.vue');
const WEBDAV = SRC('entrypoints/options/tabs/sync/WebDAVTab.vue');

test.describe('SettingsTab per-source debounce', () => {
  test('no single shared timer variable remains', () => {
    expect(SETTINGS).not.toMatch(/let debounceTimer\b/);
  });

  test('each watcher saves through its own named debounce slot', () => {
    expect(SETTINGS).toContain("debouncedSave('autoSync'");
    expect(SETTINGS).toContain("debouncedSave('debug'");
  });

  test('pending slot replacement clears the older timer', () => {
    // per-key slot bookkeeping: the clear happens before the new set
    const fn = SETTINGS.slice(SETTINGS.indexOf('function debouncedSave'));
    expect(fn).toContain('clearTimeout');
  });

  test('unmount flushes pending saves', () => {
    const unmounted = SETTINGS.slice(SETTINGS.indexOf('onUnmounted('));
    expect(unmounted).toContain('flushPendingSaves');
    const flush = SETTINGS.slice(SETTINGS.indexOf('function flushPendingSaves'));
    expect(flush).toContain('clearTimeout');
    // the flush must actually run the pending fn, not just clear timers
    expect(flush).toMatch(/pendingSaves\.(get|take)/);
  });
});

test.describe('WebDAVTab cross-tab sync guard', () => {
  test('applies incoming values through a typeof check', () => {
    expect(WEBDAV).toContain("typeof v === 'string' ? v : ''");
  });

  test('no blind `as string` casts remain in the storage sync handler', () => {
    expect(WEBDAV).not.toContain('as string');
  });

  test('uses the re-entrancy window pattern from SettingsTab', () => {
    expect(WEBDAV).toContain('syncCount');
    expect(WEBDAV).toContain('nextTick');
  });

  test('saveConfig keeps its https pre-check intact', () => {
    expect(WEBDAV).toContain(".url.startsWith('https://')");
  });
});
