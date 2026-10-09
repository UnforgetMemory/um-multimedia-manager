import { test, expect } from '@playwright/test';
import type { App, Component } from 'vue';
import type { MountOptions } from '@/scenario/douban/overlay';
import { runPageMount, type PageMountDeps, type PageMountPlan } from '@/scenario/douban/mount-plan';

/**
 * runPageMount — the Douban page bootstrap, made testable by X52.
 *
 * It used to live entirely inside `mount-factory.ts`, which a node spec cannot
 * import (its `css-map` dependency carries 45 `?raw` CSS imports that the node
 * loader parses as JavaScript). Consequence: the shell-teardown and retry wiring
 * — the code that decides whether a failed page leaves a user behind an opaque
 * full-screen spinner with a scroll-locked body — had never been asserted.
 *
 * The fakes capture the `MountOptions` the plan hands to `mountOverlay`, so tests
 * can drive the hooks exactly as the real mount path would.
 */

const SHELL_OPTIONS = { overlayId: 'umm-x', subtitle: 's' } as unknown as Parameters<
  PageMountDeps['createShell']
>[0];

interface Harness {
  deps: PageMountDeps;
  mounted: MountOptions[];
  removed: string[];
  created: unknown[];
  failures: Array<{ overlayId: string; onRetry: () => void }>;
  warnings: unknown[];
}

function harness(getShellOptions: PageMountDeps['getShellOptions'] = () => SHELL_OPTIONS): Harness {
  const h: Harness = {
    mounted: [],
    removed: [],
    created: [],
    failures: [],
    warnings: [],
    deps: {
      mountOverlay: (options) => h.mounted.push(options),
      getShellOptions,
      createShell: (options) => h.created.push(options),
      removeShell: (overlayId) => h.removed.push(overlayId),
      showFailure: (options) => h.failures.push(options),
      onBootstrapFailure: (error) => h.warnings.push(error),
    },
  };
  return h;
}

function fakeApp(): App {
  return { unmount: () => undefined } as unknown as App;
}

function plan<T>(over: Partial<PageMountPlan<T>> = {}): PageMountPlan<T> {
  return {
    overlayId: 'umm-x',
    composeCss: () => 'CSS',
    loadComponent: async () => ({ name: 'Root' }) as unknown as Component,
    createApp: () => fakeApp(),
    sanitize: ((value: T) => value) as PageMountPlan<T>['sanitize'],
    ...over,
  };
}

const SHADOW = {} as ShadowRoot;

/** runPageMount resumes a retry asynchronously (its retry handler awaits loadComponent). */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

test('成功路径：挂载一次，缺席的钩子不被注册，失败面完全不触发', async () => {
  const h = harness();
  await runPageMount(plan({}), h.deps);

  expect(h.mounted).toHaveLength(1);
  expect(h.mounted[0]?.overlayId).toBe('umm-x');
  expect(h.mounted[0]?.css).toBe('CSS');
  expect(h.mounted[0]?.beforeMount).toBeUndefined();
  expect(h.mounted[0]?.afterMount).toBeUndefined();
  expect(h.failures).toEqual([]);
  expect(h.removed).toEqual([]);
  expect(h.warnings).toEqual([]);
});

test('beforeMount 的产物必须先净化，再作为 data 交给 createApp', async () => {
  const h = harness();
  const calls: string[] = [];
  const extracted = { href: 'javascript:alert(1)' };

  await runPageMount<{ href: string }>(
    plan<{ href: string }>({
      beforeMount: async () => {
        calls.push('extract');
        return extracted;
      },
      sanitize: ((value) => {
        calls.push('sanitize');
        return { ...value, href: 'about:blank#blocked' };
      }) as PageMountPlan<{ href: string }>['sanitize'],
      createApp: (_root, data) => {
        calls.push(`create:${data?.href}`);
        return fakeApp();
      },
    }),
    h.deps,
  );

  const options = h.mounted[0];
  expect(options?.beforeMount, 'beforeMount must be forwarded when configured').toBeTruthy();
  const ctx = await options?.beforeMount?.(SHADOW, () => undefined);
  expect(calls).toEqual(['extract', 'sanitize']);

  options?.createApp(SHADOW, ctx);
  expect(calls, 'createApp must receive the sanitized value').toEqual([
    'extract',
    'sanitize',
    'create:about:blank#blocked',
  ]);
});

test('afterMount 收到 app / 容器与同一份 data，可异步', async () => {
  const h = harness();
  const seen: Array<{ hasApp: boolean; containerId: string; data: unknown }> = [];

  await runPageMount<{ n: number }>(
    plan<{ n: number }>({
      beforeMount: async () => ({ n: 7 }),
      createApp: () => fakeApp(),
      afterMount: (_shadow, app, container, data) => {
        seen.push({ hasApp: typeof app?.unmount === 'function', containerId: container.id, data });
      },
    }),
    h.deps,
  );

  const options = h.mounted[0];
  expect(options?.afterMount).toBeTruthy();
  const ctx = await options?.beforeMount?.(SHADOW, () => undefined);
  options?.afterMount?.(SHADOW, fakeApp(), { id: 'mount-node' } as HTMLDivElement, ctx);
  expect(seen).toEqual([{ hasApp: true, containerId: 'mount-node', data: { n: 7 } }]);
});

test('CSS 组合抛错（预设缺失）也必须拆壳并给出重试，而不是留下满屏遮罩', async () => {
  const h = harness();
  const boom = new Error('unknown preset');

  await runPageMount(
    plan({
      composeCss: () => {
        throw boom;
      },
    }),
    h.deps,
  );

  expect(h.mounted, 'must not mount into a broken page').toEqual([]);
  expect(h.warnings).toEqual([boom]);
  expect(h.removed).toEqual(['umm-x']);
  expect(h.failures).toHaveLength(1);
  expect(h.failures[0]?.overlayId).toBe('umm-x');
});

test('组件 import 失败走同一条失败路径', async () => {
  const h = harness();
  await runPageMount(
    plan({
      loadComponent: async () => {
        throw new Error('chunk 404');
      },
    }),
    h.deps,
  );
  expect(h.mounted).toEqual([]);
  expect(h.removed).toEqual(['umm-x']);
  expect(h.warnings).toHaveLength(1);
});

test('重试必须先重建壳再重跑；成功后正常挂载', async () => {
  const h = harness();
  let attempts = 0;

  await runPageMount(
    plan({
      loadComponent: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('transient');
        return { name: 'Root' } as unknown as Component;
      },
    }),
    h.deps,
  );

  const retry = h.failures[0]?.onRetry;
  expect(retry).toBeTruthy();
  expect(h.mounted).toEqual([]);

  retry?.();
  await flushMicrotasks();
  expect(h.created).toEqual([SHELL_OPTIONS]);
  expect(h.mounted).toHaveLength(1);
  expect(h.mounted[0]?.css).toBe('CSS');
});

test('没有可重建的壳记录时，重试仍会重跑但不伪造 createShell', async () => {
  const h = harness(() => undefined);
  let attempts = 0;

  await runPageMount(
    plan({
      loadComponent: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('transient');
        return { name: 'Root' } as unknown as Component;
      },
    }),
    h.deps,
  );

  h.failures[0]?.onRetry();
  await flushMicrotasks();
  expect(h.created, 'nothing to recreate was recorded').toEqual([]);
  expect(h.mounted).toHaveLength(1);
});
