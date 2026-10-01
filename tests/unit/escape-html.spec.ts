import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import { escapeHtml } from '@/libraries/utils/escape-html';

/**
 * escapeHtml — the XSS boundary for every content-script string interpolated
 * into host-page HTML. Contracts pinned here:
 * 1. exactly the five HTML special characters are escaped (& < > " ');
 * 2. '&' is replaced FIRST, so entities produced for the other characters are
 *    never re-escaped ('&<' must yield '&amp;&lt;', not '&amp;amp;lt;');
 * 3. escaped output inserted into text nodes AND double-quoted attributes can
 *    never spawn elements (jsdom round-trip with live attack payloads).
 */

test.describe('escapeHtml character contract', () => {
  test('escapes each special character to its canonical entity', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  test('replaces & first: adjacent & and < produce exactly one entity layer', () => {
    // If '<' were escaped before '&', this would yield '&amp;amp;lt;'.
    expect(escapeHtml('&<')).toBe('&amp;&lt;');
    // Pre-existing entities must gain only one &amp; prefix, never cascade.
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  test('escapes every occurrence (global, not first-match)', () => {
    expect(escapeHtml('<a><b>')).toBe('&lt;a&gt;&lt;b&gt;');
    expect(escapeHtml('a"b"c"d')).toBe('a&quot;b&quot;c&quot;d');
    expect(escapeHtml("it's's")).toBe('it&#39;s&#39;s');
  });

  test('mixed payload maps character-by-character', () => {
    expect(escapeHtml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f');
  });

  test('backtick is deliberately NOT escaped (no meaning in HTML text/attr)', () => {
    // Pinning this so a future "escape more chars" change is a conscious,
    // reviewed decision rather than silent drift.
    expect(escapeHtml('`x`')).toBe('`x`');
    expect(escapeHtml('/\\=;')).toBe('/\\=;');
  });

  test('benign input passes through unchanged', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml('Inception (2010)')).toBe('Inception (2010)');
    expect(escapeHtml('盗梦空间')).toBe('盗梦空间');
  });
});

test.describe('escapeHtml XSS round-trip (jsdom)', () => {
  const attacks = [
    '</script><script>alert(1)</script>',
    '"><img src=x onerror=alert(1)>',
    "'><svg/onload=alert(1)>",
    '" autofocus onfocus="alert(1)',
    '">&lt;script&gt;already-escaped&lt;/script&gt;',
  ];

  for (const payload of attacks) {
    test(`payload cannot spawn elements in text or attribute context: ${payload.slice(0, 24)}`, () => {
      const dom = new JSDOM('<!doctype html><html><body></body></html>');
      const doc = dom.window.document;
      const escaped = escapeHtml(payload);

      // Text-node context.
      const textHost = doc.createElement('div');
      textHost.innerHTML = `<span>${escaped}</span>`;
      expect(textHost.querySelector('script, img, svg')).toBeNull();
      expect(textHost.textContent).toBe(payload);

      // Double-quoted attribute context.
      const attrHost = doc.createElement('div');
      attrHost.innerHTML = `<a title="${escaped}">x</a>`;
      const anchor = attrHost.querySelector('a');
      expect(anchor).not.toBeNull();
      expect(anchor?.getAttribute('title')).toBe(payload);
      expect(attrHost.querySelector('img, svg, script')).toBeNull();
    });
  }
});
