import { test, expect } from '@playwright/test';
import { defineGlobal } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';

/**
 * store/confirm.ts — global confirm-dialog pinia store.
 * Contracts pinned:
 * 1. show() opens with loading=false and RESETS every field the new config does
 *    not carry (defaults first, then the config) — a confirm dialog must never
 *    inherit an earlier dialog's `warning`/`details`/`confirmText`; loading is
 *    cleared even if a prior confirm was still flagged busy;
 * 2. defaults: confirmText '确认', icon AlertCircle — overridable per show();
 * 3. confirm(): loading true while the action runs; success closes (open=false)
 *    and clears loading; a REJECTING action keeps the dialog OPEN (caller owns
 *    error UX) but still clears loading;
 * 4. re-entry guard: confirm() while one is in flight is ignored (single action
 *    run), and an in-flight confirm never cross-wires a newer show() — the
 *    stale dialog-close bug fixed in the umreview wave 2;
 * 5. confirm() without a prior show() runs the inert default action and closes.
 * Vue binds `document` at module-init → jsdom globals first, lazy imports.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);

type StoreMod = typeof import('@/store/confirm');
type PiniaMod = typeof import('pinia');
type IconsMod = typeof import('@/libraries/ui/icons');

let storeMod: StoreMod | undefined;
let pinia: PiniaMod | undefined;
let icons: IconsMod | undefined;

/** Fresh pinia per test + the component identity the store defaults to. */
async function freshStore(): Promise<{
  store: ReturnType<StoreMod['useConfirmStore']>;
  AlertCircle: IconsMod['AlertCircle'];
}> {
  if (!storeMod) {
    storeMod = await import('@/store/confirm');
    pinia = await import('pinia');
    icons = await import('@/libraries/ui/icons');
  }
  pinia!.setActivePinia(pinia!.createPinia());
  return { store: storeMod!.useConfirmStore(), AlertCircle: icons!.AlertCircle };
}

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (e: Error) => void;
} {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = () => res();
    reject = (e) => rej(e);
  });
  return { promise, resolve, reject };
}

test.describe('useConfirmStore', () => {
  test('fresh state is closed with the documented defaults', async () => {
    const { store, AlertCircle } = await freshStore();
    expect(store.state.open).toBe(false);
    expect(store.state.loading).toBe(false);
    expect(store.state.title).toBe('');
    expect(store.state.confirmText).toBe('确认');
    expect(store.state.icon).toBe(AlertCircle);
  });

  test('show() opens, resets loading, and overrides defaults', async () => {
    const { store, AlertCircle } = await freshStore();
    store.show({
      title: '删除记录',
      description: 'd',
      icon: AlertCircle,
      confirmText: '删除',
      action: async () => {},
    });
    expect(store.state.open).toBe(true);
    expect(store.state.loading).toBe(false);
    expect(store.state.title).toBe('删除记录');
    expect(store.state.confirmText).toBe('删除');
  });

  test('show() 先重置再合并：省略的可选字段回到默认，不继承上一张对话框的警告', async () => {
    const { store, AlertCircle } = await freshStore();
    store.show({
      title: 'first',
      description: 'a',
      warning: 'careful',
      details: 'file.txt',
      table: { headers: ['h'], rows: [{ cells: ['c'], tone: 'danger' }] },
      confirmText: '导入',
      action: async () => {},
      icon: AlertCircle,
    });
    store.show({ title: 'second', description: 'b', action: async () => {}, icon: AlertCircle });
    expect(store.state.title).toBe('second');
    expect(store.state.open).toBe(true);
    // A follow-up confirmation showing "careful" / "file.txt" / "导入" would be
    // warning the user about an action they never asked for.
    expect(store.state.warning).toBeUndefined();
    expect(store.state.details).toBeUndefined();
    expect(store.state.table).toBeUndefined();
    expect(store.state.confirmText).toBe('确认');
  });

  test('结构化预览表（ADR-027）逐字段透传，含风险色调', async () => {
    const { store, AlertCircle } = await freshStore();
    const table = {
      headers: ['数据集', '本地', '云端', '方向', '风险'],
      rows: [
        { cells: ['豆瓣', '2', '100', '上传', '预计丢失 98 条'], tone: 'danger' as const },
        { cells: ['设置', '12', '12', '无变化', '—'] },
      ],
    };
    store.show({ title: 't', description: 'd', icon: AlertCircle, table, action: async () => {} });
    // 结构性相等：reactive 包装使 state.table 不是同一个对象引用。
    expect(store.state.table).toEqual(table);
    expect(store.state.table?.rows[0]?.tone).toBe('danger');
    expect(store.state.table?.rows[1]?.tone).toBeUndefined();
  });

  test('confirm() success: loading during the action, closed + un-loaded after', async () => {
    const { store, AlertCircle } = await freshStore();
    const gate = deferred();
    let ran = 0;
    store.show({
      title: 't',
      description: 'd',
      icon: AlertCircle,
      action: async () => {
        ran += 1;
        await gate.promise;
      },
    });
    const inflight = store.confirm();
    expect(store.state.loading).toBe(true);
    expect(store.state.open).toBe(true);
    gate.resolve();
    await inflight;
    expect(ran).toBe(1);
    expect(store.state.open).toBe(false);
    expect(store.state.loading).toBe(false);
  });

  test('confirm() rejection: dialog STAYS open, loading clears', async () => {
    const { store, AlertCircle } = await freshStore();
    store.show({
      title: 't',
      description: 'd',
      icon: AlertCircle,
      action: async () => {
        throw new Error('backend down');
      },
    });
    await store.confirm();
    expect(store.state.open).toBe(true); // caller owns the error path
    expect(store.state.loading).toBe(false);
  });

  test('double confirm() is re-entry guarded — the action runs exactly once', async () => {
    // Previously pinned as "no guard, action runs twice (locked reality, not
    // endorsement)". Corrected contract: a second confirm() while one is in
    // flight is ignored, so a double-click cannot execute the action twice.
    const { store, AlertCircle } = await freshStore();
    const gate = deferred();
    let runs = 0;
    store.show({
      title: 't',
      description: 'd',
      icon: AlertCircle,
      action: async () => {
        runs += 1;
        await gate.promise;
      },
    });
    const a = store.confirm();
    const b = store.confirm();
    gate.resolve();
    await Promise.all([a, b]);
    expect(runs).toBe(1);
    expect(store.state.open).toBe(false);
    expect(store.state.loading).toBe(false);
  });

  test('an in-flight confirm for request A never consumes or closes request B', async () => {
    // Cross-wiring reproduction: A is confirming when B show()s. A must resolve
    // against ITS OWN action only, and finishing A must not close B's dialog.
    const { store, AlertCircle } = await freshStore();
    const gateA = deferred();
    let ranA = 0;
    let ranB = 0;
    store.show({
      title: 'A',
      description: 'a',
      icon: AlertCircle,
      action: async () => {
        ranA += 1;
        await gateA.promise;
      },
    });
    const inflightA = store.confirm();
    store.show({
      title: 'B',
      description: 'b',
      icon: AlertCircle,
      action: async () => {
        ranB += 1;
      },
    });
    gateA.resolve();
    await inflightA;

    expect(ranA).toBe(1);
    expect(ranB).toBe(0); // B's action was never run by A's confirm
    expect(store.state.open).toBe(true); // B's dialog survives A finishing
    expect(store.state.title).toBe('B');
    expect(store.state.loading).toBe(false); // B is user-confirmable

    await store.confirm();
    expect(ranB).toBe(1);
    expect(store.state.open).toBe(false);
  });

  test('confirm() without show() runs the inert default action and closes', async () => {
    const { store } = await freshStore();
    await store.confirm();
    expect(store.state.open).toBe(false);
    expect(store.state.loading).toBe(false);
  });
});
