import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import { buildThemedDialog } from '@/entrypoints/content/ui/doulist-dialog';
import type { DoulistDialogOptions } from '@/entrypoints/content/ui/doulist-dialog';
import type { DoulistItem, SubjectInfo } from '@/entrypoints/content/ui/doulist-api';
import type { UrlIdentity } from '@/types';

/**
 * X9-B render-scheduling contract for the doulist replacement dialog:
 * 1. search keystrokes collapse into ONE trailing debounced pass (the tbody is
 *    untouched synchronously; only the final query materialises after the window);
 * 2. click-triggered re-renders stay immediate (discrete user action);
 * 3. small/medium lists attach via a single DocumentFragment (no pending frames);
 * 4. lists over the chunk threshold write one chunk per frame via an injected
 *    scheduler, and a new render cancels the in-flight chunked pass.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://movie.douban.com/',
  pretendToBeVisual: true,
});

defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);

const doc = dom.window.document;

const identity: UrlIdentity = {
  platform: 'douban',
  type: 'movie',
  providerId: '1234567',
  url: 'https://movie.douban.com/subject/1234567/',
};

const subject: SubjectInfo = {
  subjectId: '1234567',
  cat: '1002',
  kind: 'movie',
  url: identity.url,
  ck: 'testck',
};

function makeItems(count: number, prefix = 'list'): DoulistItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    name: `${prefix} ${i}`,
    count: `${i} 项`,
    is_collected: false,
    is_private: false,
  }));
}

/** Injectable synchronous frame clock (same contract as dom-chunk.spec). */
function makeClock() {
  const queue: (() => void)[] = [];
  return {
    schedule: (task: () => void) => {
      queue.push(task);
      return () => {
        const i = queue.indexOf(task);
        if (i >= 0) queue.splice(i, 1);
      };
    },
    tick: () => {
      const task = queue.shift();
      task?.();
    },
    pendingFrames: () => queue.length,
    drain: () => {
      while (queue.length > 0) {
        queue.shift()!();
      }
    },
  };
}

function mount(
  items: DoulistItem[],
  options: DoulistDialogOptions,
): {
  tbody: HTMLTableSectionElement;
  search: HTMLInputElement;
  overlay: HTMLElement;
  refresh: (newItems: DoulistItem[]) => void;
} {
  const dialog = buildThemedDialog({ items, subject, comment: '' }, identity, options);
  doc.body.appendChild(dialog.overlay);
  const tbody = dialog.overlay.querySelector('tbody');
  const search = dialog.overlay.querySelector<HTMLInputElement>('input[placeholder^="搜索"]');
  if (!tbody || !search) throw new Error('dialog fixture missing tbody/search input');
  return { tbody, search, overlay: dialog.overlay, refresh: dialog.refresh };
}

function rowNames(tbody: HTMLTableSectionElement): string[] {
  return Array.from(tbody.querySelectorAll('tr td:nth-child(3)')).map((td) => td.textContent ?? '');
}

function fireInput(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test.describe('doulist-dialog render scheduling (X9-B)', () => {
  test('repeated keystrokes collapse to one trailing debounced pass', async () => {
    const clock = makeClock();
    const { tbody, search, overlay } = mount(makeItems(10), {
      searchDebounceMs: 20,
      schedule: clock.schedule,
    });
    expect(rowNames(tbody)).toHaveLength(10);

    fireInput(search, 'l');
    fireInput(search, 'li');
    fireInput(search, 'list 3');
    // Synchronously: no intermediate re-render happened (still the pre-keystroke pass).
    expect(rowNames(tbody)).toHaveLength(10);
    expect(clock.pendingFrames()).toBe(0);

    await wait(80);
    // Exactly one pass, for the final query only — intermediates never rendered.
    expect(rowNames(tbody)).toEqual(['list 3']);
    overlay.remove();
  });

  test('click-triggered re-render stays immediate (not debounced)', () => {
    const clock = makeClock();
    const { tbody, overlay } = mount(makeItems(4), {
      searchDebounceMs: 50,
      schedule: clock.schedule,
    });
    const firstRow = tbody.querySelector('tr');
    if (!firstRow) throw new Error('fixture row missing');
    firstRow.click();
    // Immediate rebuild: the clicked row is re-created with the selection outline.
    const updated = tbody.querySelector('tr');
    expect(updated).not.toBe(firstRow);
    expect(updated?.style.outline).not.toBe('');
    overlay.remove();
  });

  test('medium list (<= threshold) attaches via single fragment, zero scheduled frames', () => {
    const clock = makeClock();
    const { tbody, overlay } = mount(makeItems(40), {
      chunkThreshold: 50,
      chunkSize: 10,
      schedule: clock.schedule,
    });
    // All 40 rows land synchronously (one fragment attach), nothing deferred to frames.
    expect(rowNames(tbody)).toHaveLength(40);
    expect(clock.pendingFrames()).toBe(0);
    overlay.remove();
  });

  test('large list (> threshold) writes one chunk per injected frame', () => {
    const clock = makeClock();
    const { tbody, overlay } = mount(makeItems(120), {
      chunkThreshold: 50,
      chunkSize: 25,
      schedule: clock.schedule,
    });
    // First chunk is synchronous, the rest one frame each.
    expect(rowNames(tbody)).toHaveLength(25);
    expect(clock.pendingFrames()).toBe(1);
    clock.tick();
    expect(rowNames(tbody)).toHaveLength(50);
    clock.tick();
    expect(rowNames(tbody)).toHaveLength(75);
    clock.tick();
    expect(rowNames(tbody)).toHaveLength(100);
    clock.tick();
    expect(rowNames(tbody)).toHaveLength(120);
    expect(clock.pendingFrames()).toBe(0);
    overlay.remove();
  });

  test('a new render cancels the in-flight chunked pass (no stale appends)', () => {
    const clock = makeClock();
    const { tbody, overlay, refresh } = mount(makeItems(120), {
      chunkThreshold: 50,
      chunkSize: 25,
      schedule: clock.schedule,
    });
    clock.tick(); // pass A advances to 50 rows with one pending frame
    expect(rowNames(tbody)).toHaveLength(50);
    expect(clock.pendingFrames()).toBe(1);

    // Pass B starts while A is mid-flight: A's pending frame must be dropped,
    // leaving only B's own single scheduled frame in the queue.
    refresh(makeItems(120, 'other'));
    expect(clock.pendingFrames()).toBe(1);
    expect(rowNames(tbody)).toHaveLength(25); // B's synchronous first chunk

    clock.drain();
    const names = rowNames(tbody);
    expect(names).toHaveLength(120);
    // Every row belongs to pass B — a stale A write would duplicate or leak 'list' names.
    expect(names.every((n) => n.startsWith('other '))).toBe(true);
    expect(new Set(names).size).toBe(120);
    overlay.remove();
  });
});
