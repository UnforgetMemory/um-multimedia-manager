import { test, expect } from '@playwright/test';
// Rendered copy comes from the content i18n dictionaries, whose locale is module-level
// shared state per worker — expectations go through the same t() instead of pinning Chinese.
import { t } from '@/entrypoints/content/i18n';
import { defineGlobal } from './helpers/global-sandbox';
import { releaseMounted, trackMounted } from './helpers/release-mounted-apps';
import { JSDOM } from 'jsdom';

/**
 * UmmMediaCard — recommended/scrolling card with two structurally different
 * modes (grid = div + click-navigation; scroll = real <a> with native nav).
 * Contracts pinned:
 * 1. grid root is div.umm-rec-item with pointer cursor; scroll root is
 *    a.umm-card carrying href + target=_blank + rel="noopener noreferrer"
 *    (XSS/`tabnabbing` guard) and intro→title tooltip;
 * 2. badge variant mapping grid→small, scroll→inline (single source in card);
 * 3. cover aspect mapping music→1 (SQUARE), else 2/3 (POSTER) — reaches the
 *    image container through UmmImageWrapper;
 * 4. conditional children: author span only when non-empty, episodes div only
 *    in scroll mode when non-empty, empty rating falls back to 暂无评分;
 * 5. click behavior: grid opens href via window.open(href,'_blank'); grid
 *    without href is inert; scroll mode attaches no JS click handler at all.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);

interface CardProps {
  mode: 'grid' | 'scroll';
  posterUrl: string;
  title: string;
  href?: string;
  author?: string;
  badgeStatus?: number;
  badgeRating?: number;
  rating?: string;
  episodes?: string;
  intro?: string;
  type?: 'movie' | 'music' | 'book' | 'game';
}

async function renderCard(props: CardProps): Promise<HTMLElement> {
  const vue = await import('vue');
  const { UmmMediaCard } = await import('@/scenario/douban/components/umm-media-card');
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  const app = vue.createApp({ render: () => vue.h(UmmMediaCard, props) });
  app.mount(container);
  trackMounted(app, container);
  const root = container.firstElementChild;
  if (!root) throw new Error('card rendered nothing');
  return root as unknown as HTMLElement;
}

test.afterEach(releaseMounted);

/** Minimal complete props; tests override what they care about. */
function cardProps(overrides: Partial<CardProps> = {}): CardProps {
  return { mode: 'grid', posterUrl: 'https://img/p.jpg', title: '标题', ...overrides };
}

let opened: string[][] = [];
test.beforeEach(() => {
  opened = [];
  Object.defineProperty(dom.window, 'open', {
    configurable: true,
    value: (...args: unknown[]) => {
      opened.push(args.map(String));
      return null;
    },
  });
});

test.describe('grid mode', () => {
  test('root is a clickable div with badge/cover/title/rating skeleton', async () => {
    const root = await renderCard(
      cardProps({ badgeStatus: 2, badgeRating: 8, author: '导演', href: 'https://d/1' }),
    );
    expect(root.tagName).toBe('DIV');
    expect(root.classList.contains('umm-rec-item')).toBe(true);
    expect(root.getAttribute('style') ?? '').toContain('cursor: pointer');

    const kids = Array.from(root.children);
    expect(kids.map((k) => k.className)).toEqual([
      'umm-status umm-status--small umm-status--done',
      'umm-rec-cover',
      'umm-rec-title',
      'umm-rec-author',
      'umm-rating',
    ]);
    expect(root.querySelector('.umm-rec-title')?.textContent).toBe('标题');
    expect(root.querySelector('.umm-rec-author')?.textContent).toBe('导演');
    expect(root.querySelector('.umm-status')?.textContent).toBe('已看 8');
  });

  test('empty author omits the author row entirely', async () => {
    const root = await renderCard(cardProps({ author: '' }));
    expect(root.querySelector('.umm-rec-author')).toBeNull();
    expect(root.querySelectorAll(':scope > *')).toHaveLength(4);
  });

  test('empty rating falls back to the 暂无评分 placeholder', async () => {
    const root = await renderCard(cardProps({ rating: '' }));
    expect(root.querySelector('.umm-rating')?.textContent).toContain(t('common.rating_unknown'));
    const rated = await renderCard(cardProps({ rating: '8.5' }));
    expect(rated.querySelector('.umm-rating-score')?.textContent).toBe('8.5');
  });

  test('poster image is lazy and uses the POSTER aspect by default', async () => {
    const root = await renderCard(cardProps({ type: 'movie' }));
    const img = root.querySelector('img');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('alt')).toBe('标题');
    expect(root.querySelector('.umm-image-container')?.getAttribute('style') ?? '').toContain(
      'aspect-ratio: 2/3',
    );
  });

  test('music cards switch the cover to the SQUARE aspect', async () => {
    const root = await renderCard(cardProps({ type: 'music' }));
    expect(root.querySelector('img')).not.toBeNull();
    const container = root.querySelector('.umm-image-container');
    expect(container?.getAttribute('style') ?? '').toContain('aspect-ratio: 1');
  });

  test('click with href opens it in a new tab; click without href is inert', async () => {
    const linked = await renderCard(cardProps({ href: 'https://movie.douban.com/subject/1/' }));
    linked.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    expect(opened).toEqual([['https://movie.douban.com/subject/1/', '_blank']]);

    const unlinked = await renderCard(cardProps({ href: '' }));
    unlinked.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    expect(opened).toEqual([['https://movie.douban.com/subject/1/', '_blank']]); // no new call
  });
});

test.describe('scroll mode', () => {
  test('root is a real safe anchor; intro becomes the title tooltip', async () => {
    const root = await renderCard(
      cardProps({
        mode: 'scroll',
        href: 'https://d/2',
        intro: '剧情简介',
        badgeStatus: 1,
      }),
    );
    expect(root.tagName).toBe('A');
    expect(root.classList.contains('umm-card')).toBe(true);
    expect(root.getAttribute('href')).toBe('https://d/2');
    expect(root.getAttribute('target')).toBe('_blank');
    expect(root.getAttribute('rel')).toBe('noopener noreferrer');
    expect(root.getAttribute('title')).toBe('剧情简介');
    // Badge variant flips from small (grid) to inline (scroll).
    expect(root.querySelector('.umm-status')?.className).toBe(
      'umm-status umm-status--inline umm-status--wish',
    );
  });

  test('no intro → no title attribute', async () => {
    const root = await renderCard(cardProps({ mode: 'scroll', intro: '' }));
    expect(root.hasAttribute('title')).toBe(false);
  });

  test('scroll poster is eager-loaded (above-the-fold strip)', async () => {
    const root = await renderCard(cardProps({ mode: 'scroll' }));
    expect(root.querySelector('img')?.getAttribute('loading')).toBe('eager');
  });

  test('episodes overlay renders only when provided', async () => {
    const withEps = await renderCard(cardProps({ mode: 'scroll', episodes: '全12话' }));
    expect(withEps.querySelector('.umm-episodes')?.textContent).toBe('全12话');
    const withoutEps = await renderCard(cardProps({ mode: 'scroll', episodes: '' }));
    expect(withoutEps.querySelector('.umm-episodes')).toBeNull();
  });

  test('rating element gets the card-specific class; layout order is badge/cover/title/rating', async () => {
    const root = await renderCard(cardProps({ mode: 'scroll', rating: '7.2' }));
    const rating = root.querySelector('.umm-rating');
    expect(rating?.classList.contains('umm-card-rating')).toBe(true);
    const kids = Array.from(root.children).map((k) => k.className);
    expect(kids).toEqual([
      'umm-status umm-status--inline umm-status--none',
      'umm-card-cover',
      'umm-card-title',
      'umm-rating umm-card-rating',
    ]);
    expect(root.querySelector('.umm-card-title')?.textContent).toBe('标题');
  });

  test('scroll mode never calls window.open (native anchor navigation only)', async () => {
    const root = await renderCard(cardProps({ mode: 'scroll', href: 'https://d/3' }));
    root.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    expect(opened).toEqual([]);
  });
});
