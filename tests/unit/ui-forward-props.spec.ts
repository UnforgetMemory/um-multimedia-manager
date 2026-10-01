import { test, expect } from '@playwright/test';
import { defineGlobal } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';

/**
 * forward-props.ts — Vapor-safe reka-ui forwarding helpers.
 * Contracts pinned:
 * 1. forwardProps DROPS undefined-valued props (so the wrapped primitive's own
 *    defaults apply) but KEEPS null/false/0 — only undefined is a "not given";
 * 2. `omitted` keys are stripped (class, which wrappers bind explicitly);
 * 3. the result is a live ComputedRef, not a snapshot — prop mutations show up;
 * 4. forwardEmits keys are DOM handler props: camelize + onXxx
 *    ('update:modelValue' → onUpdate:modelValue, 'close-auto-focus' →
 *    onCloseAutoFocus) while the emit itself receives the ORIGINAL name.
 * Vue binds `document` at module-init → jsdom globals first, imports lazy
 * (precedent: debounced-query.spec.ts).
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);

type Mod = typeof import('@/libraries/ui/forward-props');
type Vue = typeof import('vue');

let mod: Mod | undefined;
let vue: Vue | undefined;
async function load(): Promise<{ mod: Mod; vue: Vue }> {
  if (!mod) mod = await import('@/libraries/ui/forward-props');
  if (!vue) vue = await import('vue');
  return { mod, vue };
}

test.describe('forwardProps', () => {
  test('drops undefined values but keeps null/false/0/empty-string', async () => {
    const { mod: m } = await load();
    const props = {
      modelValue: null,
      disabled: false,
      count: 0,
      label: '',
      open: undefined,
      id: 'x',
    };
    expect(m.forwardProps(props).value).toEqual({
      modelValue: null,
      disabled: false,
      count: 0,
      label: '',
      id: 'x',
    });
    expect('open' in m.forwardProps(props).value).toBe(false);
  });

  test('omitted keys are stripped even when present and defined', async () => {
    const { mod: m } = await load();
    const props = { class: 'bound-explicitly', id: 'keep', disabled: true };
    expect(m.forwardProps(props, ['class']).value).toEqual({ id: 'keep', disabled: true });
  });

  test('returns a live computed — mutations propagate, new keys stay dropped', async () => {
    const { mod: m, vue: v } = await load();
    const props = v.reactive<Record<string, unknown>>({ a: 1, b: undefined });
    const fwd = m.forwardProps(props);
    expect(fwd.value).toEqual({ a: 1 });
    props.a = 2;
    expect(fwd.value).toEqual({ a: 2 });
    props.b = 'now-set';
    expect(fwd.value).toEqual({ a: 2, b: 'now-set' });
    expect(v.isRef(fwd)).toBe(true);
  });

  test('empty props → empty object', async () => {
    const { mod: m } = await load();
    expect(m.forwardProps({}).value).toEqual({});
  });
});

type EmitMap = { 'update:modelValue': [unknown]; close: []; 'close-auto-focus': [undefined] };

/** Looser than one union member's signature — assignable to the EmitFnOf union. */
function makeEmit(
  sink: (name: string, payload?: unknown) => void,
): (name: string, payload?: unknown) => void {
  return (name, payload) => sink(name, payload);
}

test.describe('forwardEmits', () => {
  test('names map to camelize+onXxx handler props', async () => {
    const { mod: m } = await load();
    const emit = makeEmit(() => {});
    const handlers = m.forwardEmits<EmitMap>(emit, [
      'update:modelValue',
      'close',
      'close-auto-focus',
    ]);
    expect(Object.keys(handlers).sort()).toEqual([
      'onClose',
      'onCloseAutoFocus',
      'onUpdate:modelValue',
    ]);
  });

  test('every handler forwards the ORIGINAL declared name + payload to emit', async () => {
    const { mod: m } = await load();
    const seen: Array<[string, unknown]> = [];
    const emit = makeEmit((name, payload) => void seen.push([name, payload]));
    const handlers = m.forwardEmits<EmitMap>(emit, ['update:modelValue', 'close-auto-focus']);
    handlers['onUpdate:modelValue']!('hello');
    handlers['onCloseAutoFocus']!(undefined);
    expect(seen).toEqual([
      ['update:modelValue', 'hello'],
      ['close-auto-focus', undefined],
    ]);
  });

  test('no names → no handlers', async () => {
    const { mod: m } = await load();
    const emit = makeEmit(() => {});
    expect(m.forwardEmits<EmitMap>(emit, [])).toEqual({});
  });
});
