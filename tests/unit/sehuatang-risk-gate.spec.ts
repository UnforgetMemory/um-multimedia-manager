import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import { buildEnterButton } from '@/scenario/sehuatang/app-risk';

/**
 * Sehuatang risk-gate (age gate) rebuilt UI — the delegation rule (X54).
 *
 * The site's own JS binds `.enter-btn` clicks to "write the safeid cookie and
 * reload", which is the only way past the gate. Our overlay repaints the screen
 * but must hand the click back to the ORIGINAL anchor; the href fallback exists
 * only when that anchor is gone, and it must pass the same http(s) allowlist.
 * Both directions are silent failures if they drift: replaying the cookie logic
 * breaks on the next obfuscation change, and preferring navigation over
 * delegation leaves the user stuck on the gate with no error.
 */

const dom = new JSDOM(
  '<!doctype html><html><body><a class="enter-btn" href="#">I</a><a class="enter-btn" href="#">II</a></body></html>',
  { url: 'https://www.sehuatang.net/?mod=gate', pretendToBeVisual: true },
);

const HOME = 'https://www.sehuatang.net/?mod=gate';
const locationStub = { href: HOME } as unknown as Location;

defineGlobal('window', { location: locationStub } as unknown as Window & typeof globalThis);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('location', locationStub);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);
defineGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
defineGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));

function resetDom(): void {
  locationStub.href = HOME;
  dom.window.document.body.innerHTML =
    '<a class="enter-btn" href="#">I</a><a class="enter-btn" href="#">II</a>';
}

function clickedAnchors(): number[] {
  const hits: number[] = [];
  Array.from(dom.window.document.querySelectorAll('a.enter-btn')).forEach((anchor, index) => {
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      hits.push(index);
    });
  });
  return hits;
}

test('主/次按钮的类名按 index 区分，文案原样透传站点文本', () => {
  resetDom();
  const primary = buildEnterButton('我已滿18歲', 0, '?mod=gate');
  const secondary = buildEnterButton('返回上頁', 1, '?mod=gate');

  expect(primary.className).toContain('umm-sht-risk-enter--primary');
  expect(secondary.className).toContain('umm-sht-risk-enter--secondary');
  expect(primary.textContent).toBe('我已滿18歲');
  expect(primary.type).toBe('button');
});

test('原按钮存在时点击必须委托给它，绝不自行导航', () => {
  resetDom();
  const hits = clickedAnchors();
  const btn = buildEnterButton('enter', 1, 'https://www.sehuatang.net/?mod=fallback');

  btn.click();

  expect(hits, 'click must reach the site anchor at the same index').toEqual([1]);
  expect(locationStub.href, 'delegation must not also navigate').toBe(HOME);
});

test('原按钮缺失时才退化到 href 导航，并解析成绝对地址', () => {
  resetDom();
  dom.window.document.body.innerHTML = '<a class="enter-btn" href="#">only one</a>';
  const btn = buildEnterButton('enter', 3, '?mod=manual');

  btn.click();

  // Relative, site-declared href → absolutised against the current page. The
  // exact string matters less than the rule: it navigated to an absolute http(s)
  // URL derived from that href, not to the raw fragment.
  expect(locationStub.href).toBe(new URL('?mod=manual', HOME).href);
  expect(locationStub.href).toMatch(/^https:\/\/www\.sehuatang\.net\/\?mod=manual$/);
});

test('退化链接被伪造成非 http(s) scheme 时一律不导航', () => {
  resetDom();
  dom.window.document.body.innerHTML = '';
  const btn = buildEnterButton('enter', 0, 'javascript:alert(1)');

  btn.click();

  expect(locationStub.href).toBe(HOME);
});

test('站点没给兜底链接（空串）时也不导航', () => {
  resetDom();
  dom.window.document.body.innerHTML = '';
  const btn = buildEnterButton('enter', 0, '');

  btn.click();

  expect(locationStub.href).toBe(HOME);
});
