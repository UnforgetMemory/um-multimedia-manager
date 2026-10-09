/**
 * Mounted-app registry for component specs.
 *
 * Mounting into a shared jsdom document without unmounting leaves the app live
 * after its case ends: its effects and watchers keep running, and the document
 * accumulates nodes that a later `querySelector` can match. Register the app at
 * mount time and release it from `test.afterEach(releaseMounted)`.
 */
type Releasable = { unmount: () => void };

const live = new Map<Releasable, Element | null>();

export function trackMounted(app: Releasable, container?: Element | null): void {
  live.set(app, container ?? null);
}

/** Apps still mounted — the invariant a case must leave behind is zero. */
export function liveMountCount(): number {
  return live.size;
}

export function releaseMounted(): void {
  for (const [app, container] of live) {
    app.unmount();
    container?.remove();
  }
  live.clear();
}
