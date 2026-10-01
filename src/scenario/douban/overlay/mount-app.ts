/**
 * Vue app mounting inside an existing shadow DOM overlay.
 *
 * Injects page CSS, syncs the theme class, removes the loading spinner,
 * creates the Vue app via a factory, mounts it, and runs an optional
 * afterMount hook. A throwing mount tears the shell down (page lock +
 * theme listener included) and leaves a dismissible, retryable error
 * affordance in the light DOM — never a full-screen wall.
 */

import * as vue from 'vue';
import type { App, Plugin } from 'vue';
import { createOverlay, getOverlayShellOptions, removeOverlayShell } from './create-overlay';
import { showMountFailure } from './mount-failure';

export interface MountOptions {
  overlayId: string;
  css: string;
  /** Optional async setup. `registerRollback` accepts an undo for any host-DOM
   *  mutation performed here; all rollbacks run LIFO if a later step throws. */
  beforeMount?: (
    shadow: ShadowRoot,
    registerRollback: (fn: () => void) => void,
  ) => unknown | Promise<unknown>;
  createApp: (shadow: ShadowRoot, ctx?: unknown) => App;
  afterMount?: (
    shadow: ShadowRoot,
    app: App,
    container: HTMLDivElement,
    ctx?: unknown,
  ) => void | Promise<void>;
}

/**
 * Live app per overlay id. A second `mountUmmOverlay` for the same id (the
 * retry affordance after a mount that threw past `app.mount()`, or any future
 * SPA re-entry) must not leave the previous instance live: its effects and
 * record-cache subscriptions would keep running on a detached tree, doubling
 * every broadcast's cost.
 */
const liveMounts = new Map<string, { app: App; container: Element }>();

/** Unmount + detach whatever app this overlay currently shows, if any. */
function releaseLiveMount(overlayId: string): void {
  const live = liveMounts.get(overlayId);
  if (!live) return;
  live.app.unmount();
  live.container.remove();
  liveMounts.delete(overlayId);
}

/**
 * Mount a Vue app inside an existing shadow DOM overlay.
 * Creates the style element, applies theme class, then async-initializes
 * the app (beforeMount → loading remove → createApp → afterMount).
 */
export function mountUmmOverlay(options: MountOptions): void {
  const overlay = document.getElementById(options.overlayId);
  if (!overlay?.shadowRoot) return;

  const shadow = overlay.shadowRoot;

  // Inject page CSS. Tagged and de-duplicated: a locale change re-runs the page's
  // mountFn through this same path (see scenario/douban/main.ts), and each pass
  // would otherwise leave another identical <style> node in the shadow root.
  shadow.querySelectorAll('style[data-umm-page-css]').forEach((node) => node.remove());
  const style = document.createElement('style');
  style.dataset.ummPageCss = '1';
  style.textContent = options.css;
  shadow.appendChild(style);

  // Sync theme class onto host
  const host = shadow.host as HTMLElement;
  const theme =
    host.getAttribute('data-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  host.classList.remove('umm-theme--light', 'umm-theme--dark');
  host.classList.add(`umm-theme--${theme}`);

  const rollbacks: Array<() => void> = [];
  const registerRollback = (fn: () => void): void => {
    rollbacks.push(fn);
  };

  const finalize = async () => {
    // Sync host theme to page localStorage before Vue mounts —
    // the theme store (inside Shadow DOM) reads from localStorage on
    // the page origin via useStorage, NOT from chrome.storage.local.
    // Without this sync it always defaults to 'auto'.
    const hostTheme =
      host.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    try {
      localStorage.setItem('umm:appearance', JSON.stringify({ theme: hostTheme }));
    } catch {
      /* localStorage may be restricted (private browsing, quota). Non-critical. */
    }

    let ctx: unknown;
    if (options.beforeMount) {
      ctx = await options.beforeMount(shadow, registerRollback);
    }

    const loading = shadow.querySelector('.ov-loading');
    if (loading) loading.remove();

    // Re-entry guard: the overlay shows one app at a time.
    releaseLiveMount(options.overlayId);

    const container = document.createElement('div');
    container.className = 'umm-mount';
    shadow.appendChild(container);
    const app = options.createApp(shadow, ctx);
    // ADR-026 D2：Douban overlay 的页面 SFC 已 vapor 化，但树内仍有 VDOM
    // 组件（reka-ui 等 VDOM 子组件；图标已改内联 SVG）。缺少此插件时它们静默不渲染且零报错。
    // Namespace lookup: the plugin only exists in the vapor vue entry, which
    // Node test resolution does not pick; browser builds always ship it, so
    // the guard is a no-op in production.
    const interopPlugin = (vue as unknown as Record<string, unknown>)['vaporInteropPlugin'] as
      | Plugin
      | undefined;
    if (interopPlugin) app.use(interopPlugin);
    app.mount(container);
    liveMounts.set(options.overlayId, { app, container });

    if (options.afterMount) {
      await options.afterMount(shadow, app, container, ctx);
    }
  };

  finalize().catch((err) => {
    console.warn('[UMM] mountUmmOverlay error:', err);
    // The shell is torn down below, so nothing may stay live for this id —
    // neither an app this call mounted before `afterMount` threw, nor one an
    // earlier successful mount had registered (retry would stack a second).
    releaseLiveMount(options.overlayId);
    // Undo host mutations first (LIFO) so a retry starts from clean DOM.
    for (const undo of rollbacks.reverse()) {
      try {
        undo();
      } catch {
        /* rollback is best-effort */
      }
    }
    // The shell is an opaque full-screen wall with a scroll-locked body:
    // remove element + page-level style + theme listener, keep only a
    // light-DOM toast with retry/dismiss.
    const shellOptions = getOverlayShellOptions(options.overlayId);
    removeOverlayShell(options.overlayId);
    showMountFailure({
      overlayId: options.overlayId,
      onRetry: () => {
        if (shellOptions) createOverlay(shellOptions);
        mountUmmOverlay(options);
      },
    });
  });
}
