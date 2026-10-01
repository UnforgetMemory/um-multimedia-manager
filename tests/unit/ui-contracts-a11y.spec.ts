import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import {
  applyDialogAria,
  applyDialogTitleAria,
  applyStatusBadgeAria,
  dialogAriaAttrs,
  STATUS_BADGE_ARIA,
} from '@/libraries/ui-contracts/dialog-aria';
import {
  focusFirst,
  getFocusableElements,
  handleTrapTabKey,
  returnFocusIfLost,
} from '@/libraries/utils/focus-trap';

/**
 * Overlay ↔ SPA DOM contract layer (component-library merge wave).
 * These helpers are the light-DOM twin of reka-ui's dialog semantics — every
 * hand-built modal must produce the same AT surface.
 */

function dom(html: string) {
  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: 'https://example.com/',
  });
}

test.describe('dialog-aria contract', () => {
  test('applyDialogAria writes role/modal/labelledby together', () => {
    const d = dom('<div id="p"></div>');
    const el = d.window.document.getElementById('p')!;
    applyDialogAria(el, { labelledBy: 't1', describedBy: 'd1' });
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-modal')).toBe('true');
    expect(el.getAttribute('aria-labelledby')).toBe('t1');
    expect(el.getAttribute('aria-describedby')).toBe('d1');
  });

  test('dialogAriaAttrs is the same bag as applyDialogAria (Vue h() twin)', () => {
    const d = dom('<div id="p"></div>');
    const el = d.window.document.getElementById('p')!;
    applyDialogAria(el, { labelledBy: 't1' });
    const attrs = dialogAriaAttrs({ labelledBy: 't1' });
    for (const [k, v] of Object.entries(attrs)) {
      expect(el.getAttribute(k), k).toBe(v);
    }
  });

  test('title gets heading semantics', () => {
    const d = dom('<h3 id="t">x</h3>');
    const el = d.window.document.getElementById('t')!;
    applyDialogTitleAria(el, 3);
    expect(el.getAttribute('role')).toBe('heading');
    expect(el.getAttribute('aria-level')).toBe('3');
  });

  test('status badge pair is polite (errors use toast-aria alert instead)', () => {
    const d = dom('<span id="b"></span>');
    const el = d.window.document.getElementById('b')!;
    applyStatusBadgeAria(el);
    expect(el.getAttribute('role')).toBe(STATUS_BADGE_ARIA.role);
    expect(el.getAttribute('aria-live')).toBe('polite');
  });
});

test.describe('focus-trap contract', () => {
  const html = `
    <div id="panel">
      <button id="a">a</button>
      <input id="b" />
      <button id="c">c</button>
    </div>
    <button id="outside">out</button>
  `;

  test('getFocusableElements lists stops in document order', () => {
    const d = dom(html);
    const panel = d.window.document.getElementById('panel')!;
    expect(getFocusableElements(panel).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  test('Tab on last wraps to first; Shift+Tab on first wraps to last', () => {
    const d = dom(html);
    const doc = d.window.document;
    const panel = doc.getElementById('panel')!;
    const last = doc.getElementById('c')!;
    last.focus();
    const tab = new d.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    expect(handleTrapTabKey(tab, panel)).toBe(true);
    expect(doc.activeElement?.id).toBe('a');

    const first = doc.getElementById('a')!;
    first.focus();
    const shiftTab = new d.window.KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
    });
    expect(handleTrapTabKey(shiftTab, panel)).toBe(true);
    expect(doc.activeElement?.id).toBe('c');
  });

  test('Tab in the middle is not consumed (native order proceeds)', () => {
    const d = dom(html);
    const doc = d.window.document;
    const panel = doc.getElementById('panel')!;
    doc.getElementById('b')!.focus();
    const tab = new d.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    expect(handleTrapTabKey(tab, panel)).toBe(false);
  });

  test('focus escaped the panel is pulled back', () => {
    const d = dom(html);
    const doc = d.window.document;
    const panel = doc.getElementById('panel')!;
    doc.getElementById('outside')!.focus();
    const tab = new d.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    expect(handleTrapTabKey(tab, panel)).toBe(true);
    expect(doc.activeElement?.id).toBe('a');
  });

  test('returnFocusIfLost only steals when focus is lost', () => {
    const d = dom(html);
    const doc = d.window.document;
    const anchor = doc.getElementById('outside')!;
    const nested = doc.getElementById('b')!;
    nested.focus();
    returnFocusIfLost(anchor, doc);
    expect(doc.activeElement?.id).toBe('b');
    (doc.activeElement as HTMLElement).blur();
    returnFocusIfLost(anchor, doc);
    expect(doc.activeElement?.id).toBe('outside');
  });

  test('focusFirst moves to the first stop', () => {
    const d = dom(html);
    const doc = d.window.document;
    focusFirst(doc.getElementById('panel')!);
    expect(doc.activeElement?.id).toBe('a');
  });
});
