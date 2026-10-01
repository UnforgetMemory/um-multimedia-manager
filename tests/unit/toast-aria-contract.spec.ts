import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toastAria } from '@/libraries/toast-aria';

/**
 * Toast a11y contract (ADR-026 requirement 5) — the type → role/aria-live table
 * has ONE source, and all three toast renderers must consume it instead of
 * carrying their own mapping. Consumer checks are source-fixture style
 * (precedent: spa-toast-a11y.spec.ts) since these modules run in different
 * runtimes (Vue SPA / Shadow DOM / injected SW function).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.resolve(HERE, '../../', rel), 'utf8');

test.describe('toast-aria contract table', () => {
  test('error interrupts, everything else announces politely', () => {
    expect(toastAria('error')).toEqual({ role: 'alert', live: 'assertive' });
    expect(toastAria('success')).toEqual({ role: 'status', live: 'polite' });
    expect(toastAria('info')).toEqual({ role: 'status', live: 'polite' });
    expect(toastAria('loading')).toEqual({ role: 'status', live: 'polite' });
  });

  test('unknown type degrades to the polite pair', () => {
    expect(toastAria('nonsense')).toEqual({ role: 'status', live: 'polite' });
  });
});

test.describe('toast consumers reference the single source', () => {
  const consumers = [
    'src/feature/ToastContainer.vue',
    'src/entrypoints/content/utils/toast.ts',
    'src/entrypoints/background/handlers/toast.ts',
  ];

  for (const file of consumers) {
    test(`${file} imports @/libraries/toast-aria`, () => {
      expect(read(file)).toContain('@/libraries/toast-aria');
    });
  }

  test('no consumer keeps its own role/aria-live literal mapping', () => {
    for (const file of consumers) {
      const src = read(file);
      expect(src, file).not.toContain("'assertive' : 'polite'");
      expect(src, file).not.toContain("'alert' : 'status'");
    }
    // the two DOM sites previously hardcoded role=alert for every type
    expect(read('src/entrypoints/content/utils/toast.ts')).not.toContain(
      "setAttribute('role', 'alert')",
    );
    expect(read('src/entrypoints/background/handlers/toast.ts')).not.toContain(
      "setAttribute('role', 'alert')",
    );
  });
});
