import { test, expect } from '@playwright/test';
import { defineGlobal } from './helpers/global-sandbox';
import { liveMountCount, releaseMounted, trackMounted } from './helpers/release-mounted-apps';
import { JSDOM } from 'jsdom';

/**
 * UmmStatusBadge + wrapper — Douban overlay status pill (plain-TS Vue
 * render components, output lives inside a Shadow DOM host in production).
 * Contracts pinned:
 * 1. status-code → shape mapping: 2=done / 3=doing / 1=wish / anything-else=none;
 * 2. the class triple `umm-status umm-status--{variant} umm-status--{statusType}`
 *    and the data-attr observability surface (data-umm-status-raw keeps the
 *    ORIGINAL code, data-umm-type the derived shape);
 * 3. label families per media type from statusBadgeLabels — game 'done' is
 *    '玩过' (status-labels Decision-1);
 * 4. done + rating collapses into `${done} ${rating}` text, but the
 *    data-umm-rating attribute is keyed off `!== undefined` — rating=0 keeps
 *    the attribute while the text drops it (documented quirk of the falsy test);
 * 5. the wrapper only supplies defaults (variant=default, type=movie,
 *    no rating) and forwards everything else — byte-identical DOM.
 * X4 adjudication: the five same-name badge shapes across the app are
 * deliberately separate structures; this spec pins THIS one only.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);

type VueModule = typeof import('vue');
type BadgeModule = typeof import('@/scenario/douban/components/umm-status-badge');
type WrapperModule = typeof import('@/scenario/douban/components/umm-status-badge-wrapper');

let vue: VueModule | undefined;
let badge: BadgeModule | undefined;
let wrapper: WrapperModule | undefined;

async function load(): Promise<{
  vue: VueModule;
  badge: BadgeModule;
  wrapper: WrapperModule;
}> {
  if (!vue) vue = await import('vue');
  if (!badge) badge = await import('@/scenario/douban/components/umm-status-badge');
  if (!wrapper) wrapper = await import('@/scenario/douban/components/umm-status-badge-wrapper');
  return { vue, badge, wrapper };
}

interface BadgeProps {
  status: number;
  rating?: number;
  variant?: 'default' | 'small' | 'inline';
  type?: 'movie' | 'music' | 'book' | 'game';
}

async function renderBadge(
  component: 'badge' | 'wrapper',
  props: BadgeProps,
): Promise<HTMLElement> {
  const { vue: v, badge: b, wrapper: w } = await load();
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  const render =
    component === 'badge'
      ? () => v.h(b.UmmStatusBadge, props)
      : () => v.h(w.UmmStatusBadgeWrapper, props);
  const app = v.createApp({ render });
  app.mount(container);
  trackMounted(app, container);
  const el = container.querySelector('span');
  if (!el) throw new Error('badge rendered no <span>');
  return el as unknown as HTMLElement;
}

test.afterEach(releaseMounted);

test.describe('UmmStatusBadge status mapping', () => {
  test('codes 2/3/1 derive done/doing/wish; anything else derives none', async () => {
    const cases: ReadonlyArray<readonly [number, string]> = [
      [2, 'done'],
      [3, 'doing'],
      [1, 'wish'],
      [0, 'none'],
      [4, 'none'],
      [-1, 'none'],
      [99, 'none'],
    ];
    for (const [code, shape] of cases) {
      const el = await renderBadge('badge', { status: code });
      expect(el.className, `status ${code}`).toBe(
        `umm-status umm-status--default umm-status--${shape}`,
      );
      expect(el.getAttribute('data-umm-type')).toBe(shape);
      expect(el.getAttribute('data-umm-status-raw')).toBe(String(code));
    }
  });

  test('movie labels: done/wish/none/doing texts', async () => {
    const texts: ReadonlyArray<readonly [number, string]> = [
      [2, '已看'],
      [3, '在看'],
      [1, '想看'],
      [0, '未看'],
    ];
    for (const [code, text] of texts) {
      const el = await renderBadge('badge', { status: code, type: 'movie' });
      expect(el.textContent).toBe(text);
    }
  });

  test('media-type label families stay distinct; game done is 玩过 (Decision-1)', async () => {
    const expected: Readonly<Record<string, readonly [string, string, string, string]>> = {
      music: ['已听', '在听', '想听', '未听'],
      book: ['已读', '在读', '想读', '未读'],
      game: ['玩过', '在玩', '想玩', '未玩'],
    };
    for (const [type, [done, doing, wish, none]] of Object.entries(expected)) {
      const t = type as 'music' | 'book' | 'game';
      expect((await renderBadge('badge', { status: 2, type: t })).textContent).toBe(done);
      expect((await renderBadge('badge', { status: 3, type: t })).textContent).toBe(doing);
      expect((await renderBadge('badge', { status: 1, type: t })).textContent).toBe(wish);
      expect((await renderBadge('badge', { status: 0, type: t })).textContent).toBe(none);
    }
  });

  test('type omitted falls back to the movie family', async () => {
    const el = await renderBadge('badge', { status: 2 });
    expect(el.textContent).toBe('已看');
  });
});

test.describe('UmmStatusBadge rating surface', () => {
  test('done with rating renders `${label} ${rating}` plus data attr', async () => {
    const el = await renderBadge('badge', { status: 2, rating: 8 });
    expect(el.textContent).toBe('已看 8');
    expect(el.getAttribute('data-umm-rating')).toBe('8');
  });

  test('rating on non-done shapes is attr-only — text is the plain label', async () => {
    const el = await renderBadge('badge', { status: 1, rating: 5 });
    expect(el.textContent).toBe('想看');
    expect(el.getAttribute('data-umm-rating')).toBe('5');
  });

  test('rating=0: attr present (undefined-check) but text omits it (falsy-check)', async () => {
    // Documents the deliberate two-gates asymmetry; both are observable.
    const el = await renderBadge('badge', { status: 2, rating: 0 });
    expect(el.getAttribute('data-umm-rating')).toBe('0');
    expect(el.textContent).toBe('已看');
  });

  test('no rating → no data-umm-rating attribute at all', async () => {
    const el = await renderBadge('badge', { status: 2 });
    expect(el.hasAttribute('data-umm-rating')).toBe(false);
  });
});

test.describe('UmmStatusBadge variants', () => {
  test('default / small / inline each carry their modifier class', async () => {
    for (const variant of ['default', 'small', 'inline'] as const) {
      const el = await renderBadge('badge', { status: 2, variant });
      expect(el.className).toContain(`umm-status--${variant}`);
    }
  });

  test('variant omitted → default modifier', async () => {
    const el = await renderBadge('badge', { status: 2 });
    expect(el.className).toContain('umm-status--default');
  });
});

test.describe('UmmStatusBadgeWrapper', () => {
  test('wrapper defaults (no variant/type/rating) render the badge default shape', async () => {
    const el = await renderBadge('wrapper', { status: 2 });
    // A broken spread (e.g. dropping `status`) would surface as --none here.
    expect(el.className).toBe('umm-status umm-status--default umm-status--done');
    expect(el.textContent).toBe('已看');
    expect(el.getAttribute('data-umm-type')).toBe('done');
    expect(el.hasAttribute('data-umm-rating')).toBe(false);
  });

  test('explicit props produce byte-identical DOM through wrapper and direct use', async () => {
    const props: BadgeProps = { status: 2, rating: 9, variant: 'inline', type: 'book' };
    const direct = await renderBadge('badge', props);
    const wrapped = await renderBadge('wrapper', props);
    expect(wrapped.outerHTML).toBe(direct.outerHTML);
  });
});

// `fullyParallel` lets one worker run several cases of this file back to back,
// so leftover DOM nodes are not a reliable witness across cases. The registry
// count is: a case must leave zero live mounts behind, and releasing takes the
// container with it.
test('释放后不留活体 app，容器随卸载移走', async () => {
  expect(liveMountCount()).toBe(0);
  const before = dom.window.document.body.childElementCount;

  await renderBadge('badge', { status: 2 });
  expect(liveMountCount()).toBe(1);
  expect(dom.window.document.body.childElementCount).toBe(before + 1);

  releaseMounted();
  expect(liveMountCount()).toBe(0);
  expect(dom.window.document.body.childElementCount).toBe(before);
});
