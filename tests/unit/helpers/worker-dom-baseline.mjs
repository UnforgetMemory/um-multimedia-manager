/**
 * Worker-scoped DOM baseline, preloaded through NODE_OPTIONS before any spec
 * module is evaluated (see playwright.config.ts).
 *
 * Node-side vendor modules capture DOM globals at import time — Vue's
 * runtime-dom binds `doc = typeof document !== 'undefined' ? document : null`
 * once, and Playwright shares one module registry across every spec file in a
 * worker. So whichever file happens to trigger the first `import('vue')` decides
 * that capture for the whole worker: without a baseline the binding is null and
 * unrelated mounting specs fail purely from file-to-worker assignment.
 *
 * Only the keys the mounting specs already stub are taken over; specs keep their
 * own JSDOM instances for parsing (jsdom accepts cross-document appendChild).
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://example.com/',
});

for (const key of [
  'window',
  'document',
  'navigator',
  'Node',
  'Element',
  'HTMLElement',
  'SVGElement',
  'DOMParser',
  'XMLSerializer',
]) {
  const value = dom.window[key];
  if (value === undefined) continue;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
