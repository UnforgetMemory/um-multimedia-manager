import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regression lock for requirement 2 (function consolidation) + requirement 5
 * (interaction feedback).
 *
 * SFCs cannot be compiled by this runner (precedent: spa-toast-a11y.spec.ts),
 * so the contracts are asserted on source fixtures:
 * 1. LinkedTab / RatingTab take debouncing only from the shared composable —
 *    their private copies are deleted;
 * 2. a failed query must reach the SPA toast (common.loadFailed + errorMessage)
 *    and no silent `catch {` swallow remains;
 * 3. every sehuatang degradation catch keeps a warnLog diagnostic.
 * The end-to-end failure signal is covered by the real use-toast case below.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = (rel: string): string => fs.readFileSync(path.resolve(HERE, '../../src', rel), 'utf8');

const LINKED = SRC('entrypoints/options/tabs/LinkedTab.vue');
const RATING = SRC('entrypoints/options/tabs/RatingTab.vue');
/**
 * The Sehuatang list-page entry is app.ts plus its `app-*` collaborators
 * (app-header-stats / app-notify / app-trailing-writers …). Read them as a set:
 * pinning only app.ts meant a plain god-file split — which moves code without
 * changing behaviour — read as "the guarantee was deleted". Deriving the list
 * from the directory keeps the assertion alive through any further split.
 */
const SHT_DIR = 'scenario/sehuatang';
const SHT_ENTRY_FILES = fs
  .readdirSync(path.resolve(HERE, '../../src', SHT_DIR))
  .filter((f) => f === 'app.ts' || /^app-[a-z-]+\.ts$/.test(f))
  .sort();
const SHT_APP = SHT_ENTRY_FILES.map((f) => SRC(`${SHT_DIR}/${f}`)).join('\n');

test.describe('options query boxes share one debounce source', () => {
  test('both tabs import the composable and instantiate it', () => {
    for (const tab of [LINKED, RATING]) {
      expect(tab).toContain("from '@/feature/composables/use-debounced-query'");
      expect(tab).toContain('useDebouncedQuery(');
    }
  });

  test('the private debouncedQuery copies are gone', () => {
    for (const tab of [LINKED, RATING]) {
      expect(tab).not.toMatch(/function debouncedQuery/);
      expect(tab).not.toContain('setTimeout(');
      expect(tab).not.toContain('clearTimeout(');
      expect(tab).not.toMatch(/let \w*[Tt]imer\w*:/);
    }
  });

  test('unmount cleanup is delegated to the composable, not hand-rolled per tab', () => {
    for (const tab of [LINKED, RATING]) {
      expect(tab).not.toContain('onUnmounted');
    }
    const composable = SRC('feature/composables/use-debounced-query.ts');
    expect(composable).toContain('onUnmounted(dispose)');
    expect(composable).toContain('export const DEBOUNCED_QUERY_DELAY_MS = 500');
  });
});

test.describe('query failure surfaces to the user', () => {
  test('both tabs report a failed query through the SPA toast', () => {
    for (const tab of [LINKED, RATING]) {
      expect(tab).toContain("toast.error(t('common.loadFailed'), errorMessage(error))");
      expect(tab).toContain("from '@/feature/composables/use-toast'");
      expect(tab).toContain("from '@/libraries/utils/error-message'");
    }
  });

  test('no silent catch blocks remain in the tabs or the sehuatang entry', () => {
    for (const file of [LINKED, RATING]) {
      expect(file).not.toMatch(/}\s*catch\s*\{/);
    }
    expect(SHT_APP).not.toMatch(/\.catch\(\(\)\s*=>/);
    // Pin the contract (a warn that forwards the error for this subsystem),
    // not the exact sentence — the degradation wording has already changed once.
    // The diagnostic routes through the logger (warnLog) per the AGENTS.md
    // diagnostic-exit rule; the gate tracks the route, not the raw console call.
    expect(SHT_APP).toMatch(
      /warnLog\(\s*'\[UMM\] Sehuatang global stats read failed[^']*:',\s*error\s*\)/,
    );
  });

  test('wired like the tabs, a rejecting query pushes a visible error toast', async () => {
    const { useToast } = await import('@/feature/composables/use-toast');
    const { useDebouncedQuery } = await import('@/feature/composables/use-debounced-query');
    const { errorMessage } = await import('@/libraries/utils/error-message');

    const toast = useToast();
    const before = toast.toasts.value.length;
    const { run } = useDebouncedQuery(
      async () => {
        throw new Error('indexeddb unavailable');
      },
      {
        delay: 10,
        onError: (error: unknown) => toast.error('common.loadFailed', errorMessage(error)),
      },
    );
    run();
    await new Promise((resolve) => setTimeout(resolve, 80));

    const errors = toast.toasts.value.slice(before).filter((t) => t.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('indexeddb unavailable');
  });
});
