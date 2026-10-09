/**
 * Shadow-overlay probes for the real-browser e2e suite.
 *
 * WHY page.evaluate instead of Playwright locators: several assertions here
 * must distinguish the LIGHT DOM from the overlay's shadow root (Playwright's
 * CSS engine pierces shadow roots transparently, which would silently turn a
 * "no host-page leakage" assertion into a tautology). These probes read the
 * shadow root explicitly and count light-DOM nodes separately.
 *
 * Also the runtime counterpart of `npm run scope:check`
 * (scripts/check-content-style-scope.cjs): `auditInjectedStyles` replays that
 * guard's first-compound rule over every style sheet the extension put in the
 * HOST document, so a bare-selector regression is caught in a real page
 * instead of only in the source text.
 */

import type { Page } from '@playwright/test';

/** One overlay card as the browser sees it. */
export interface OverlayCardProbe {
  title: string;
  avid: string | null;
  tid: string | null;
  viewed: boolean;
  opacity: string;
  hasMagnet: boolean;
  hasCover: boolean;
  detail: string | null;
}

export interface OverlayProbe {
  hostPresent: boolean;
  hasShadowRoot: boolean;
  /** Loading skeleton from the document_start entry still on screen. */
  loadingPresent: boolean;
  /** `<style data-umm-sht-style>` injected by attachSehuatangOverlay. */
  shadowStylePresent: boolean;
  gridPresent: boolean;
  cards: OverlayCardProbe[];
  risk: {
    panelPresent: boolean;
    domain: string | null;
    enterLabels: string[];
    enterPrimaryLabel: string | null;
    warnings: string[];
    warningTitle: string | null;
  };
  home: { sections: number; cardNames: string[]; viewedCards: number };
  copyButtonLabel: string | null;
  headerInfo: string | null;
  /** Global three-table counters (ADULT_AV_STATS) rendered next to the page box. */
  globalStats: string | null;
}

export async function probeOverlay(page: Page, overlayId: string): Promise<OverlayProbe> {
  return page.evaluate((id) => {
    const host = document.getElementById(id);
    const shadow: ShadowRoot | null = host?.shadowRoot ?? null;
    const empty: OverlayProbe = {
      hostPresent: !!host,
      hasShadowRoot: !!shadow,
      loadingPresent: !!shadow?.querySelector('.ov-loading'),
      shadowStylePresent: !!shadow?.querySelector('style[data-umm-sht-style]'),
      gridPresent: !!shadow?.querySelector('.umm-preview-grid'),
      cards: [],
      risk: {
        panelPresent: false,
        domain: null,
        enterLabels: [],
        enterPrimaryLabel: null,
        warnings: [],
        warningTitle: null,
      },
      home: { sections: 0, cardNames: [], viewedCards: 0 },
      copyButtonLabel: null,
      headerInfo: null,
      globalStats: null,
    };
    if (!shadow) return empty;

    empty.cards = Array.from(shadow.querySelectorAll<HTMLElement>('.umm-card')).map((card) => ({
      title: card.dataset.title ?? '',
      avid: card.getAttribute('data-avid'),
      tid: card.getAttribute('data-tid'),
      viewed: card.classList.contains('umm-viewed'),
      opacity: getComputedStyle(card).opacity,
      hasMagnet: card.querySelector('.umm-magnet-link') !== null,
      hasCover: card.querySelector('.umm-card-image img') !== null,
      detail: card.getAttribute('data-umm-detail'),
    }));

    const panel = shadow.querySelector('.umm-sht-risk-panel');
    if (panel) {
      empty.risk.panelPresent = true;
      empty.risk.domain = panel.querySelector('.umm-sht-risk-domain')?.textContent ?? null;
      empty.risk.enterLabels = Array.from(
        panel.querySelectorAll<HTMLElement>('.umm-sht-risk-enter'),
      ).map((b) => (b.textContent ?? '').trim());
      empty.risk.enterPrimaryLabel =
        panel.querySelector<HTMLElement>('.umm-sht-risk-enter--primary')?.textContent?.trim() ??
        null;
      empty.risk.warningTitle =
        panel.querySelector('.umm-sht-risk-warn-title')?.textContent ?? null;
      empty.risk.warnings = Array.from(panel.querySelectorAll('.umm-sht-risk-warn')).map(
        (p) => p.textContent ?? '',
      );
    }

    empty.home.sections = shadow.querySelectorAll('.umm-sht-home-section').length;
    empty.home.cardNames = Array.from(
      shadow.querySelectorAll('.umm-sht-home-card .umm-sht-home-name'),
    ).map((n) => (n.textContent ?? '').trim());
    empty.home.viewedCards = shadow.querySelectorAll('.umm-card.umm-viewed').length;

    empty.copyButtonLabel = shadow.querySelector('.umm-copy-btn')?.textContent ?? null;
    empty.headerInfo = shadow.querySelector('.umm-header-info')?.textContent ?? null;
    empty.globalStats = shadow.querySelector('.umm-sht-stats')?.textContent ?? null;
    return empty;
  }, overlayId);
}

/** Light-DOM-only element count (never pierces a shadow root). */
export async function countInLightDom(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => document.querySelectorAll(sel).length, selector);
}

/** Inline display value the overlay code leaves on an original host element. */
export async function lightDomDisplay(page: Page, id: string): Promise<string | null> {
  return page.evaluate((elId) => document.getElementById(elId)?.style.display ?? null, id);
}

export interface StyleAudit {
  /** ids of every UMM-owned light-DOM style element found. */
  sheetIds: string[];
  /** selectors that would restyle arbitrary host elements (scope:check leaks). */
  leaks: string[];
  /** overlay-internal class names appearing in a host-document sheet. */
  overlaySelectorsInLightDom: string[];
}

/**
 * Replay the static scope guard at runtime over the host document's sheets.
 *
 * `html` / `body` first compounds are the guard's two sanctioned anchors
 * (THEME_VARS' custom-property host and the overlay page lock / first-frame
 * background paint); everything else must be class-, id- or attribute-scoped.
 */
export async function auditInjectedStyles(page: Page): Promise<StyleAudit> {
  return page.evaluate(() => {
    const OVERLAY_CLASSES = [
      '.umm-card',
      '.umm-preview-grid',
      '.umm-sht-shell',
      '.umm-sht-risk-panel',
      '.umm-sht-home-section',
    ];
    const sheetIds: string[] = [];
    const leaks: string[] = [];
    const overlayHits: string[] = [];

    const firstCompound = (selector: string): string => selector.trim().split(/[\s>+~]/)[0] ?? '';
    const isLeak = (first: string): boolean => {
      if (!first) return false;
      if (first.startsWith('.umm-') || first.startsWith('#umm')) return false;
      if (first.startsWith('[')) return false;
      if (/^(from|to|\d+(?:\.\d+)?%)$/.test(first)) return false;
      if (first === 'html' || first === 'body' || first.startsWith('html[')) return false;
      return (
        first.startsWith('*') ||
        first.startsWith('::') ||
        /^:(?!:)/.test(first) ||
        /^[a-z][a-z0-9-]*/i.test(first)
      );
    };

    const walk = (rules: CSSRuleList | CSSRule[], owner: string): void => {
      for (const rule of Array.from(rules)) {
        const withList = rule as CSSRule & { cssRules?: CSSRuleList };
        if (withList.cssRules) {
          walk(withList.cssRules, owner);
          continue;
        }
        const style = rule as CSSStyleRule;
        if (typeof style.selectorText !== 'string') continue;
        for (const raw of style.selectorText.split(',')) {
          const sel = raw.trim();
          if (!sel) continue;
          if (isLeak(firstCompound(sel))) leaks.push(`${owner}: ${sel}`);
          for (const marker of OVERLAY_CLASSES) {
            if (sel.startsWith(marker) || sel.includes(`${marker} `)) {
              overlayHits.push(`${owner}: ${sel}`);
            }
          }
        }
      }
    };

    for (const sheet of Array.from(document.styleSheets)) {
      const owner = sheet.ownerNode;
      if (!owner) continue;
      // Shadow-root sheets are isolated by construction — skip them.
      if (owner.getRootNode() instanceof ShadowRoot) continue;
      const el = owner as HTMLElement;
      const id = el.id ?? '';
      if (!id.startsWith('umm-')) continue;
      sheetIds.push(id);
      let rules: CSSRuleList | null = null;
      try {
        rules = sheet.cssRules;
      } catch {
        rules = null;
      }
      if (rules) walk(rules, id);
    }
    return { sheetIds, leaks, overlaySelectorsInLightDom: overlayHits };
  });
}

/**
 * Long-task sampler installed via page.addInitScript (MAIN world, document_start).
 *
 * MEASURED CAVEAT (X69): on this Chromium build the reported `duration` is
 * **not** the blocking time — a deliberate 220 ms busy loop is delivered as a
 * 55 ms entry, and reading right after the block can return nothing at all
 * (the observer callback lands in a later task). Treat `longtask` as
 * "something was slow", never as a budget; use {@link RAF_GAP_INIT_SCRIPT} for
 * magnitudes and always pair it with {@link blockMainThread} as a positive
 * control, so an assertion can't pass by measuring nothing.
 */
export const LONGTASK_INIT_SCRIPT = (): void => {
  const w = window as Window & { __ummLongTasks?: number[] };
  w.__ummLongTasks = [];
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        w.__ummLongTasks?.push(Math.round(entry.duration));
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    /* longtask unsupported — callers must prove sensitivity via the rAF control */
  }
};

export async function readLongTasks(page: Page): Promise<number[]> {
  // Flush the observer callback (posted after the blocking task) before reading.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 60)));
  return page.evaluate(() => {
    const w = window as Window & { __ummLongTasks?: number[] };
    return w.__ummLongTasks ?? [];
  });
}

/**
 * Frame-gap recorder (MAIN world, document_start): the honest jank signal.
 *
 * A rAF callback cannot run while the main thread is busy, so the gap between
 * two consecutive frames is a direct upper bound on one blocking task. Measured
 * on the JavDB list page: 33 ms at 300 cards, 56 ms at 2 000, and 225-234 ms
 * for a 220 ms control block — i.e. it scales with the work and it sees the
 * control, which `longtask` did neither.
 */
export const RAF_GAP_INIT_SCRIPT = (): void => {
  const w = window as Window & { __ummRafGaps?: number[] };
  w.__ummRafGaps = [];
  let last = performance.now();
  const tick = (): void => {
    const now = performance.now();
    const gaps = w.__ummRafGaps;
    // Cap the corpus: a long-lived page only needs the worst gaps.
    if (gaps && gaps.length < 5000) gaps.push(Math.round(now - last));
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

export async function readRafGaps(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    // Visibility is asserted HERE, at the same evaluation point as the
    // measurement. `requireVisiblePage()` called before `page.goto()` only
    // proves `about:blank` was foregrounded; a page that fell behind during the
    // pass would report a collapsed batch shape and read as a production
    // regression (X71 measured 100x10 writes becoming 5x200 when throttled).
    if (document.visibilityState !== 'visible') {
      throw new Error(
        `[probe] page is ${document.visibilityState} at read time — rAF gaps are meaningless`,
      );
    }
    const w = window as Window & { __ummRafGaps?: number[] };
    return w.__ummRafGaps ?? [];
  });
}

/**
 * Put the measured page in the foreground and refuse to continue if the browser
 * still reports it hidden.
 *
 * WHY this is a precondition and not a nicety: a backgrounded page has its
 * animation frames and timers throttled and then fired in bursts. X71 measured
 * the same chunked 1 000-card pass arriving as 100 deliveries of 10 writes in
 * the foreground and as 5 deliveries of 200 when throttled — every timing and
 * shape leg in these specs is silently invalidated by the hidden state, and a
 * leg that fails because of that reads like a production regression.
 */
export async function requireVisiblePage(page: Page): Promise<void> {
  await page.bringToFront();
  const state = await page.evaluate(() => document.visibilityState);
  if (state !== 'visible') {
    throw new Error(`host page visibility is '${state}': the timing legs would be meaningless`);
  }
}

/** Positive control: occupy the main thread for `ms`; the recorder must see it. */ export async function blockMainThread(
  page: Page,
  ms: number,
): Promise<void> {
  await page.evaluate((blockMs) => {
    const start = performance.now();
    while (performance.now() - start < blockMs) {
      // deliberate main-thread block
    }
  }, ms);
}

/**
 * Write framer (MAIN world, document_start): attributes every single-item DOM
 * write (a class added, or an attribute going absent → present) to the
 * animation frame that was current when it landed.
 *
 * WHY this replaces a sampling tick. X71 first tried a 5 ms level sampler and
 * it read `0 → 30` on code that IS frame-chunked at 20 rows: an interval probe
 * can only see an intermediate level if a tick happens to fall between the two
 * writes, so it reports "everything landed at once" whenever the page is busy —
 * a guard that fails on correct code is worthless, and worse, invites relaxing
 * the threshold until it passes. A MutationObserver callback fires at the
 * microtask checkpoint of the task that did the writing, so grouping writes by
 * frame token measures the batching directly, with no sampling rate to tune.
 *
 * What it can catch that a millisecond budget cannot: collapsing the chunk size
 * to "write all rows in one task" leaves the largest frame gap **unchanged at
 * 34 ms** (measured), yet it moves every write into a single frame bucket.
 */
/** What counts as "one item written" for {@link WRITE_BATCH_INIT_SCRIPT}. */
export interface WriteBatchTarget {
  /** Count `class` tokens added to an element (e.g. `umm-dimmed`). */
  className?: string;
  /** Count attributes going absent → present (e.g. `data-umm-bili-processed`). */
  attribute?: string;
  /** Count attributes going present → absent (a marker-clear pass). */
  removedAttribute?: string;
  /**
   * Count nodes ADDED to the document already carrying this class — the shape
   * of a `createElement` + `appendChild` marking pass (e.g. bangumi's list
   * status marker), which the two attribute modes cannot see at all.
   */
  createdClass?: string;
}

/**
 * Write-batch framer (MAIN world, document_start): every MutationObserver
 * delivery is one task's worth of writes, so batching the records by callback
 * measures **writes per task** — which is the thing that actually blocks
 * painting.
 *
 * WHY not "writes per animation frame": X71 first bucketed by a rAF counter and
 * it lied. On the 200-card bilibili fixture the recorder saw 200 writes inside
 * ONE frame while the pass is demonstrably chunked — a page that nobody is
 * looking at gets its animation frames throttled, so the frame counter is not a
 * clock. Task attribution needs no clock at all: a chunked pass yields many
 * small batches, a one-shot pass yields one batch that holds the whole corpus.
 *
 * VALIDATE BEFORE TRUSTING: this probe first disagreed with an interval sampler
 * on the bilibili fixture (one delivery of 200 records for a 20-chunk pass).
 * The cause was not the probe but the PAGE: a hidden/occluded tab has its
 * animation frames throttled and then executed in bursts, so ~20 chunks land in
 * one delivery. Re-measured with {@link requireVisiblePage} the same build
 * delivers 100 batches of exactly 10 — the chunk size. Hence: any use of this
 * probe must assert page visibility first, or a correct build reads as a
 * regression.
 */
export const WRITE_BATCH_INIT_SCRIPT = (target: WriteBatchTarget): void => {
  const w = window as Window & {
    __ummWriteBatches?: { at: number; n: number }[];
  };
  const batches: { at: number; n: number }[] = [];
  const hasClass = (value: string | null, cls: string): boolean =>
    value !== null && value.split(/\s+/).includes(cls);

  // Publish ONLY after a successful attach. An init script runs at
  // document_start — `document.documentElement` can still be null there, and an
  // `observe()` that throws must read as "probe never armed", never as the
  // (opposite-signed, much easier to ignore) "the pass wrote nothing".
  try {
    const observer = new MutationObserver((mutations) => {
      let n = 0;
      for (const m of mutations) {
        if (m.type === 'childList') {
          const cls = target.createdClass;
          if (!cls) continue;
          for (const node of Array.from(m.addedNodes)) {
            if (node instanceof HTMLElement && node.classList.contains(cls)) n++;
          }
          continue;
        }
        if (target.createdClass !== undefined) continue;
        const el = m.target as HTMLElement;
        if (target.className !== undefined) {
          if (m.attributeName !== 'class') continue;
          if (!el.classList.contains(target.className)) continue;
          // Only real transitions in; a no-op classList.add fires no record, but
          // an attribute rewrite that keeps the class must not double-count.
          if (hasClass(m.oldValue, target.className)) continue;
        } else if (target.removedAttribute !== undefined) {
          const attr = target.removedAttribute;
          if (m.attributeName !== attr) continue;
          if (el.hasAttribute(attr)) continue;
          // oldValue === null means it was absent already — not a clear.
          if (m.oldValue === null) continue;
        } else {
          const attr = target.attribute;
          if (!attr || m.attributeName !== attr) continue;
          if (!el.hasAttribute(attr)) continue;
          // oldValue === null means the attribute was absent before this write.
          if (m.oldValue !== null) continue;
        }
        n++;
      }
      if (n > 0) batches.push({ at: Math.round(performance.now()), n });
    });
    observer.observe(
      document,
      target.createdClass
        ? { subtree: true, childList: true }
        : {
            subtree: true,
            attributes: true,
            attributeFilter: target.className
              ? ['class']
              : [target.removedAttribute ?? target.attribute ?? ''],
            attributeOldValue: true,
          },
    );
    w.__ummWriteBatches = batches;
  } catch {
    /* not armed — readWriteBatches() returns null and the spec goes red loudly */
  }
};

/**
 * Arm the framer before navigation (init scripts only apply to later frames).
 * The target travels as addInitScript's ARG — a page-world script cannot close
 * over spec scope, and a silently-`undefined` selector reads as "no writes",
 * which is the exact vacuity this fixture exists to prevent.
 */
export async function armWriteBatchProbe(page: Page, target: WriteBatchTarget): Promise<void> {
  await page.addInitScript(WRITE_BATCH_INIT_SCRIPT, target);
}

/**
 * Per-task write batches in arrival order, plus the wall-clock window they span.
 * `null` means the probe was never armed — which must never be read as "zero
 * writes happened".
 */
export async function readWriteBatches(
  page: Page,
): Promise<{ counts: number[]; total: number; windowMs: number } | null> {
  return page.evaluate(() => {
    // Same rule as readRafGaps: the visibility precondition is checked at the
    // measurement instant, not only before navigation. A throttled page
    // collapses delivery batches, which would read as "chunking is broken".
    if (document.visibilityState !== 'visible') {
      throw new Error(
        `[probe] page is ${document.visibilityState} at read time — write batches are collapsed`,
      );
    }
    const w = window as Window & { __ummWriteBatches?: { at: number; n: number; v?: string }[] };
    const batches = w.__ummWriteBatches;
    if (!Array.isArray(batches)) return null;
    // Framers that record per-batch visibility additionally reject a pass that
    // was throttled MID-flight (endpoints alone cannot see that window).
    const throttled = batches.find((b) => b.v !== undefined && b.v !== 'visible');
    if (throttled) {
      throw new Error(
        `[probe] a write delivery landed while the page was ${throttled.v} — batches collapsed`,
      );
    }
    const first = batches[0]?.at ?? 0;
    const last = batches[batches.length - 1]?.at ?? 0;
    return {
      counts: batches.map((b) => b.n),
      total: batches.reduce((sum, b) => sum + b.n, 0),
      windowMs: last - first,
    };
  });
}

/**
 * Shadow-scoped sibling of {@link WRITE_BATCH_INIT_SCRIPT}.
 *
 * A MutationObserver never crosses a shadow boundary, so the framer above cannot
 * see content mounted inside the Sehuatang/Douban overlay roots. This variant
 * observes `document` for the host to appear (an init script and a
 * `document_start` content script race each other), then re-attaches to
 * `host.shadowRoot` — which is only readable when the root is OPEN, and the
 * product creates it open. Publishes to the SAME `__ummWriteBatches` global, so
 * {@link readWriteBatches} stays the single reader.
 *
 * Fail-closed by construction: if the host never appears or its root is closed,
 * no delivery is ever recorded. A spec using this must therefore assert the
 * POSITIVE total (every node the product wrote), or "probe blind" would read as
 * "pass finished in zero deliveries".
 */
export interface ShadowWriteBatchTarget {
  /** id of the element carrying the open shadow root to observe. */
  hostId: string;
  /** Count nodes ADDED inside that root already carrying this class. */
  createdClass: string;
}

export const SHADOW_WRITE_BATCH_INIT_SCRIPT = (target: ShadowWriteBatchTarget): void => {
  const w = window as Window & {
    __ummWriteBatches?: { at: number; n: number; v?: string }[];
  };
  const batches: { at: number; n: number; v?: string }[] = [];
  let inner: MutationObserver | null = null;

  const attach = (): void => {
    if (inner) return;
    const root = document.getElementById(target.hostId)?.shadowRoot ?? null;
    if (!root) return;
    inner = new MutationObserver((mutations) => {
      let n = 0;
      for (const m of mutations) {
        if (m.type !== 'childList') continue;
        for (const node of Array.from(m.addedNodes)) {
          if (node instanceof HTMLElement && node.classList.contains(target.createdClass)) n++;
        }
      }
      if (n > 0) {
        // Record the visibility WITH the batch, not only at the endpoints: a page
        // occluded mid-pass has its frames throttled and then burst-delivered,
        // which would read as "chunking collapsed" on a correct build.
        batches.push({ at: Math.round(performance.now()), n, v: document.visibilityState });
      }
    });
    inner.observe(root, { subtree: true, childList: true });
  };

  try {
    attach();
    // Keep the finder attached: `attach()` is idempotent, and the host may still
    // be absent at this instant. The product never removes the host, so once
    // attached the extra callbacks are no-ops.
    const finder = new MutationObserver(attach);
    finder.observe(document, { subtree: true, childList: true });
    w.__ummWriteBatches = batches;
  } catch {
    /* not armed — readWriteBatches() returns null and the spec goes red loudly */
  }
};

export async function armShadowWriteBatchProbe(
  page: Page,
  target: ShadowWriteBatchTarget,
): Promise<void> {
  await page.addInitScript(SHADOW_WRITE_BATCH_INIT_SCRIPT, target);
}
