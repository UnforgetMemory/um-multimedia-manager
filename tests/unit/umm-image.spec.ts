import { test, expect } from '@playwright/test';
import { defineGlobal } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';

/**
 * UmmImage + UmmImageWrapper — poster renderer with shimmer placeholder.
 * Contracts pinned (from the component's own header comment):
 * 1. the <img> is ALWAYS in the DOM with no display:none (hidden imgs never
 *    fire load events in some engines — the documented reliability choice);
 * 2. the shimmer overlay sits on top (position:absolute, z-index) UNTIL
 *    onLoad OR onError fires, then it is removed via conditional render while
 *    the img stays;
 * 3. loading attribute: lazy by default, eager only via the eager prop;
 * 4. container is a div unless href is given → then an anchor with
 *    target=_blank rel="noopener noreferrer";
 * 5. aspectRatio is applied to the container only when provided;
 * 6. wrapper is a pure pass-through: identical DOM, and the inner
 *    'umm-image-img' default survives the undefined class spread.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);

type ImageProps = {
  src: string;
  alt: string;
  class?: string;
  aspectRatio?: string;
  eager?: boolean;
  href?: string;
};

let instances: { app: import('vue').App; container: HTMLElement }[] = [];

async function render(
  component: 'image' | 'wrapper',
  props: ImageProps,
): Promise<{ container: HTMLElement; vue: typeof import('vue') }> {
  const vue = await import('vue');
  const imageMod = await import('@/scenario/douban/components/umm-image');
  const wrapperMod = await import('@/scenario/douban/components/umm-image-wrapper');
  const raw = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(raw);
  const container = raw as unknown as HTMLElement;
  const app = vue.createApp({
    render: () =>
      component === 'image'
        ? vue.h(imageMod.UmmImage, props)
        : vue.h(wrapperMod.UmmImageWrapper, props),
  });
  app.mount(container);
  instances.push({ app, container });
  return { container, vue };
}

test.afterEach(() => {
  for (const { app, container } of instances) {
    app.unmount();
    container.remove();
  }
  instances = [];
});

function imgOf(container: HTMLElement): HTMLImageElement {
  const img = container.querySelector('img');
  if (!img) throw new Error('no <img> rendered');
  return img as HTMLImageElement;
}

test.describe('UmmImage structure', () => {
  test('renders img + shimmer side by side inside a positioned container', async () => {
    const { container } = await render('image', { src: 'https://img/x.jpg', alt: '海报' });
    const root = container.firstElementChild;
    expect(root?.classList.contains('umm-image-container')).toBe(true);
    expect(root?.tagName).toBe('DIV');
    expect(imgOf(container)).not.toBeNull();
    const shimmer = container.querySelector('.umm-img-shimmer');
    expect(shimmer).not.toBeNull();
    // img must be visible in DOM (never display:none) for load-event reliability.
    expect(imgOf(container).style.display).toBe('block');
    expect(imgOf(container).getAttribute('style') ?? '').not.toContain('display: none');
  });

  test('img carries src/alt/default class and lazy loading by default', async () => {
    const { container } = await render('image', { src: 'https://img/x.jpg', alt: '海报' });
    const img = imgOf(container);
    expect(img.getAttribute('src')).toBe('https://img/x.jpg');
    expect(img.getAttribute('alt')).toBe('海报');
    expect(img.classList.contains('umm-image-img')).toBe(true);
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.style.objectFit).toBe('cover');
  });

  test('eager prop switches loading to eager; class prop overrides default', async () => {
    const { container } = await render('image', {
      src: 'https://img/x.jpg',
      alt: 'a',
      eager: true,
      class: 'custom-img',
    });
    const img = imgOf(container);
    expect(img.getAttribute('loading')).toBe('eager');
    expect(img.classList.contains('custom-img')).toBe(true);
    expect(img.classList.contains('umm-image-img')).toBe(false);
  });

  test('aspectRatio lands on the container only when provided', async () => {
    const withRatio = await render('image', {
      src: 'x',
      alt: 'a',
      aspectRatio: '2/3',
    });
    expect(
      withRatio.container.querySelector('.umm-image-container')?.getAttribute('style'),
    ).toContain('aspect-ratio');

    const withoutRatio = await render('image', { src: 'x', alt: 'a' });
    expect(
      withoutRatio.container.querySelector('.umm-image-container')?.getAttribute('style') ?? '',
    ).not.toContain('aspect-ratio');
  });

  test('href turns the container into a safe external anchor', async () => {
    const { container } = await render('image', {
      src: 'x',
      alt: 'a',
      href: 'https://movie.douban.com/subject/1/',
    });
    const root = container.firstElementChild;
    expect(root?.tagName).toBe('A');
    expect(root?.getAttribute('href')).toBe('https://movie.douban.com/subject/1/');
    expect(root?.getAttribute('target')).toBe('_blank');
    expect(root?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(root?.classList.contains('umm-image-container')).toBe(true);
  });
});

test.describe('UmmImage shimmer lifecycle', () => {
  test('load event removes the shimmer but keeps the img', async () => {
    const { container, vue } = await render('image', { src: 'x', alt: 'a' });
    expect(container.querySelector('.umm-img-shimmer')).not.toBeNull();
    imgOf(container).dispatchEvent(new dom.window.Event('load'));
    await vue.nextTick();
    expect(container.querySelector('.umm-img-shimmer')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
  });

  test('error event also retires the shimmer (broken poster must not flash forever)', async () => {
    const { container, vue } = await render('image', { src: 'bad', alt: 'a' });
    imgOf(container).dispatchEvent(new dom.window.Event('error'));
    await vue.nextTick();
    expect(container.querySelector('.umm-img-shimmer')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
  });
});

test.describe('UmmImageWrapper', () => {
  test('is a pass-through: same DOM as UmmImage for identical props', async () => {
    const direct = await render('image', { src: 'x', alt: 'a', aspectRatio: '2/3', eager: true });
    const wrapped = await render('wrapper', {
      src: 'x',
      alt: 'a',
      aspectRatio: '2/3',
      eager: true,
    });
    expect(wrapped.container.firstElementChild?.outerHTML).toBe(
      direct.container.firstElementChild?.outerHTML,
    );
  });

  test('undefined class spread still lands on the inner umm-image-img default', async () => {
    const wrapped = await render('wrapper', { src: 'x', alt: 'a' });
    expect(imgOf(wrapped.container).classList.contains('umm-image-img')).toBe(true);
  });

  test('wrapper forwards href into an anchor container', async () => {
    const wrapped = await render('wrapper', { src: 'x', alt: 'a', href: 'https://douban.com/' });
    expect(wrapped.container.firstElementChild?.tagName).toBe('A');
  });
});
