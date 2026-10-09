import type { App, Component } from 'vue';
import type { MountOptions, OverlayOptions } from './overlay';

/**
 * The mount bootstrap, expressed as data — extracted from `mount-factory.ts` (X52)
 * so that the orchestration can be tested at all.
 *
 * `mount-factory` is unreachable from a node spec: it imports `css-map`, whose 45
 * `?raw` CSS imports the node loader parses as JavaScript. That left the failure
 * paths (shell teardown, retry wiring, host-data sanitation) permanently
 * e2e-only. The logic moves here and takes only injected dependencies; the
 * adapter in `mount-factory.ts` stays a thin wiring shim.
 */

export interface PageMountPlan<T> {
  /** Id of the overlay shell created at document_start. */
  overlayId: string;
  /** Compose this page's CSS; throwing (e.g. unknown preset) counts as failure. */
  composeCss: () => string;
  /** Load the page's root component; may reject. */
  loadComponent: () => Promise<Component>;
  /** Wrap the loaded component into a Vue app instance. */
  createApp: (root: Component, data: T | undefined) => App;
  /** Optional extraction/setup step against the shadow root. */
  beforeMount?: (shadow: ShadowRoot, registerRollback: (undo: () => void) => void) => Promise<T>;
  afterMount?: (
    shadow: ShadowRoot,
    app: App,
    container: HTMLDivElement,
    data: T | undefined,
  ) => void | Promise<void>;
  /** Trust boundary applied to anything that came from host DOM. */
  sanitize: <V>(data: V) => V;
}

export interface PageMountDeps {
  mountOverlay: (options: MountOptions) => void;
  getShellOptions: (overlayId: string) => OverlayOptions | undefined;
  createShell: (options: OverlayOptions) => unknown;
  removeShell: (overlayId: string) => void;
  showFailure: (options: { overlayId: string; onRetry: () => void }) => void;
  /** Diagnostic hook, injected so the shipped path keeps its visible warn. */
  onBootstrapFailure: (error: unknown) => void;
}

/**
 * Run the bootstrap once. On any composition/load failure the opaque full-screen
 * shell is torn down — it would otherwise strand the user behind a spinner with
 * a scroll-locked body — and a retry affordance is offered. Retry recreates the
 * shell first, because teardown removed it from the document.
 */
export async function runPageMount<T>(plan: PageMountPlan<T>, deps: PageMountDeps): Promise<void> {
  const run = async (): Promise<void> => {
    let css = '';
    let root: Component;
    try {
      css = plan.composeCss();
      root = await plan.loadComponent();
    } catch (error: unknown) {
      deps.onBootstrapFailure(error);
      const shellOptions = deps.getShellOptions(plan.overlayId);
      deps.removeShell(plan.overlayId);
      deps.showFailure({
        overlayId: plan.overlayId,
        onRetry: () => {
          if (shellOptions) deps.createShell(shellOptions);
          void run();
        },
      });
      return;
    }

    const options: MountOptions = {
      overlayId: plan.overlayId,
      css,
      createApp: (_shadow, ctx) => plan.createApp(root, ctx as T | undefined),
    };
    const { beforeMount, afterMount } = plan;
    if (beforeMount) {
      options.beforeMount = async (shadow, registerRollback) =>
        plan.sanitize(await beforeMount(shadow, registerRollback));
    }
    if (afterMount) {
      options.afterMount = (shadow, app, container, ctx) =>
        afterMount(shadow, app, container, ctx as T | undefined);
    }
    deps.mountOverlay(options);
  };

  await run();
}
