/**
 * JavDB dimmer — dims watched items on JavDB list/search/favorite pages.
 *
 * Batches all visible AV IDs into a single check request to avoid
 * per-item message timeout.  Supports multiple page layouts and
 * various Jav ID formats (FC2-PPV, standard codes, etc.).
 */

import { AdultAvStore } from '@/provider/adult-av';
import type { AdultAvWatchedSet } from '@/provider/adult-av';
import { throttle } from '@/libraries/utils';
import { initI18n } from '../i18n';
import {
  normalizeAvId,
  extractBaseId,
  JAV_IDS_STORE_NAME,
  USAV_IDS_STORE_NAME,
} from '@/provider/adult-av/models';
import { watchRecord } from '@/libraries/utils/watch-record';

let observer: MutationObserver | null = null;

// MutationObserver 回调节流窗口（trailing 语义，audit §P-C）；
// run() 每趟批量收集全部未处理条目，丢中间事件不丢最终状态。
const OBSERVER_THROTTLE_MS = 250;

/**
 * 读失败后的重读排程（上界退避）。
 *
 * WHY：初次 `batchCheckExists` 走 8s 消息预算 + 重试，冷 SW / 机器争用下会整批失败；
 * 而失败时**不能**清除标记（X21：读失败不是答案），于是页面在没有任何后续 DOM 变更、
 * 也没有后续记录事件的静态列表页上会**永远不淡化**——实测过一次（X69 的 300 卡夹具
 * 首跑即命中）。重试是有界的：拿到一次真实答案即归零，最多 3 次后放弃，不追着后台打。
 */
const RESYNC_RETRY_DELAYS_MS = [1_500, 3_000, 6_000] as const;

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;

function clearResyncRetry(): void {
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
  retryAttempt = 0;
}

function scheduleResyncRetry(): void {
  if (retryTimer !== null) return;
  const delay = RESYNC_RETRY_DELAYS_MS[retryAttempt];
  if (delay === undefined) return;
  retryAttempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    syncViewedMarks();
  }, delay);
}

const AVID_REGEX = /[A-Za-z0-9]{2,}[-][\w-]{2,}/i;

const ITEM_SELECTORS = ['.item', '.grid-item', '.video-card', '.column-item'];

const ID_SELECTORS = [
  '.video-title strong',
  '.video-title a',
  '.title a',
  '.id-text',
  '[class*="id"]',
];

/**
 * Extract and normalize AV ID from a JavDB item element.
 * Tries multiple selectors and returns the first valid match.
 * FC2-PPV IDs preserve their full format; other IDs have version
 * suffixes (-C, -U, -UC) stripped and leading zeros removed.
 */
function extractAvId(item: Element): string | null {
  for (const sel of ID_SELECTORS) {
    const el = item.querySelector(sel);
    if (!el) continue;
    const text = el.textContent?.trim();
    if (!text) continue;
    const match = text.match(AVID_REGEX);
    if (match) {
      const normalized = normalizeAvId(match[0]);
      if (normalized.startsWith('FC2-PPV-')) return normalized;
      return extractBaseId(normalized).replace(/^0+/, '');
    }
  }
  return null;
}

function run(): void {
  const items: { el: Element; avid: string }[] = [];

  for (const sel of ITEM_SELECTORS) {
    const found = document.querySelectorAll(sel);
    found.forEach((el) => {
      if (el.getAttribute('data-umm-processed')) return;
      const avid = extractAvId(el);
      if (!avid) return;
      el.setAttribute('data-umm-processed', 'true');
      el.setAttribute('data-umm-avid', avid);
      items.push({ el, avid });
    });
  }

  if (items.length === 0) return;

  // Batch query: send all IDs in one message
  const avids = items.map((i) => i.avid);
  AdultAvStore.batchCheckExists(avids).then((watched: AdultAvWatchedSet) => {
    // 读失败 ⇒ 这一批永远不淡化（静态列表页后续既无 DOM 变更也无记录事件）。
    // 不清标记（读失败不是答案），改为有界重读。
    if (!watched.ok) {
      scheduleResyncRetry();
      return;
    }
    for (const { el, avid } of items) {
      if (watched.has(avid)) {
        (el as HTMLElement).classList.add('umm-viewed');
      }
    }
  });

  // Click handler per item (fire-and-forget, doesn't block)
  for (const { el, avid } of items) {
    el.addEventListener(
      'click',
      () => {
        AdultAvStore.add('javdb', avid, 0);
        (el as HTMLElement).classList.add('umm-viewed');
      },
      { once: true },
    );
  }
}

function injectStyles(): void {
  if (document.getElementById('umm-javdb-styles')) return;
  const style = document.createElement('style');
  style.id = 'umm-javdb-styles';
  style.textContent = `
    body.javdb-enhanced .item.umm-viewed,
    body.javdb-enhanced .grid-item.umm-viewed,
    body.javdb-enhanced .video-card.umm-viewed,
    body.javdb-enhanced .column-item.umm-viewed {
      opacity: 0.3 !important; transition: opacity .3s ease-in-out; filter: grayscale(80%);
    }
    body.javdb-enhanced .item.umm-viewed:hover,
    body.javdb-enhanced .grid-item.umm-viewed:hover,
    body.javdb-enhanced .video-card.umm-viewed:hover,
    body.javdb-enhanced .column-item.umm-viewed:hover {
      opacity: 1 !important; filter: grayscale(0%);
    }`;
  document.head.appendChild(style);
}

/**
 * Re-evaluate every already-scanned card against the store, adding **and
 * removing** the dim.
 *
 * `run()` is add-only by design, so a record deleted elsewhere left the page
 * stale until reload — the same one-way gap X18/X32 closed for PT listings.
 * A failed read is not an answer: it must not clear anything (X21 rule).
 */
function syncViewedMarks(): void {
  const els = [...document.querySelectorAll<HTMLElement>('[data-umm-avid]')];
  if (els.length === 0) return;
  const ids = els.map((el) => el.dataset.ummAvid ?? '').filter(Boolean);
  void AdultAvStore.batchCheckExists(ids).then((watched) => {
    if (!watched.ok) {
      scheduleResyncRetry();
      return;
    }
    // 拿到一次真实答案就把重试预算归零（退避只针对连续失败）。
    retryAttempt = 0;
    for (const el of els) {
      const id = el.dataset.ummAvid ?? '';
      el.classList.toggle('umm-viewed', watched.has(id));
    }
  });
}

function disconnectObserver(): void {
  observer?.disconnect();
  observer = null;
}

export interface JavDBPageOptions {
  /**
   * Record-event seam. Injected in tests because the event bus is module-level
   * shared state per worker — a spec riding the real bus would pass or fail by
   * file order.
   */
  subscribeRecord?: typeof watchRecord;
}

/** Returns a cleanup: the router's teardown contract expects one per enhancer. */
export async function handleJavDBPage(options: JavDBPageOptions = {}): Promise<() => void> {
  await initI18n();
  console.log('[UMM] JavDB enhancer activated');

  injectStyles();
  document.body.classList.add('javdb-enhanced');
  clearResyncRetry();

  run();

  disconnectObserver();
  observer = new MutationObserver(throttle(() => run(), OBSERVER_THROTTLE_MS));
  const container =
    document.querySelector('.movie-list, .grid, .video-grid, #main-container, #content') ||
    document.body;
  observer.observe(container, { childList: true, subtree: true });

  // 日系 / 美欧两张 avId 表都订阅：一条 avid 落在哪张表由 classifyAvId 决定，页面本身
  // 无法预判，只订一张就会漏刷新；事件风暴由同一节流窗口合并。
  const subscribe = options.subscribeRecord ?? watchRecord;
  const syncThrottled = throttle(() => syncViewedMarks(), OBSERVER_THROTTLE_MS);
  const releases = [
    subscribe(JAV_IDS_STORE_NAME, undefined, () => syncThrottled()),
    subscribe(USAV_IDS_STORE_NAME, undefined, () => syncThrottled()),
  ];

  return () => {
    disconnectObserver();
    clearResyncRetry();
    for (const release of releases) release();
  };
}
