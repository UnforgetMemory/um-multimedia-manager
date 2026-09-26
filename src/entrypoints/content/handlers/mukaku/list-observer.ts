/**
 * Mukaku lazy-load observer + debounce lifecycle (split from ./handler, 2026-09-26).
 *
 * Owns the IntersectionObserver (lazy-loaded cards) and MutationObserver (DOM
 * mutations) that schedule rescans through a trailing debounce. The scan
 * callback is injected, so this class holds no handler state.
 */

/** Cards entering the viewport are rescanned after a short trailing debounce. */
const INTERSECTION_DEBOUNCE_MS = 150;
/** DOM mutations (AJAX pagination, menu toggles) are rescanned after a longer debounce. */
const MUTATION_DEBOUNCE_MS = 300;

export class MukakuListObserver {
  private listObserver: MutationObserver | null = null;
  private listIntersectionObserver: IntersectionObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onIdleScan: () => void;

  /** @param onIdleScan invoked (debounced) when a rescan is due; the caller serializes it. */
  constructor(onIdleScan: () => void) {
    this.onIdleScan = onIdleScan;
  }

  /** (Re)build both observers; disconnects any previous pair first. */
  setup(): void {
    this.disconnect();

    this.listIntersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) this.scheduleScan(INTERSECTION_DEBOUNCE_MS);
        }
      },
      {
        rootMargin: '500px 0px',
        threshold: 0.1,
      },
    );

    this.listObserver = new MutationObserver(() => this.scheduleScan(MUTATION_DEBOUNCE_MS));

    this.listObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /** Disconnect both observers and cancel any pending debounce. Idempotent. */
  disconnect(): void {
    if (this.listObserver) {
      this.listObserver.disconnect();
      this.listObserver = null;
    }
    if (this.listIntersectionObserver) {
      this.listIntersectionObserver.disconnect();
      this.listIntersectionObserver = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private scheduleScan(delayMs: number): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.onIdleScan();
    }, delayMs);
  }
}
