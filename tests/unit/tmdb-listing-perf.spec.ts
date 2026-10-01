import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import { handleTMDBHomepage } from '@/entrypoints/content/handlers/tmdb';

/**
 * TMDB 首页徽章注入的「一次性大批量改 DOM」契约（requirement: 避免集中卡顿）。
 *
 * 夹具按 tmdb.ts 自己声明的 DOM 契约构造（`div.relative` + 卡内
 * `a[data-media-type][href*="/movie/"]`），并额外套两层真实的
 * `div.relative` 容器（页面 wrapper + carousel），因为被守住的正是
 * 「文档级查询只允许是有界的 poster 链接，不得枚举无界容器」。
 *
 * 三条契约：
 *  (a) 一个批次内所有 getComputedStyle 读必须先于该批次的任何写；
 *  (b) 写必须按帧分块，单帧不得写完整个语料；
 *  (c) 在途批次必须被新批次取代（取消），不得叠加。
 */

const CARD_COUNT = 24;

interface TimelineEntry {
  /** 'read' = getComputedStyle, 'insert' = appendChild, 'style' = style attribute write */
  kind: 'read' | 'insert' | 'style';
  turn: number;
  tag: string;
}

interface Harness {
  doc: Document;
  entries: TimelineEntry[];
  /** Selectors passed to document-wide querySelectorAll calls during the run. */
  docQueries: string[];
  pendingFrames(): number;
  /** One animation frame: runs every queued rAF callback, then drains writes. */
  pumpFrame(): void;
  /** Flush mutation records queued since the last drain into the timeline. */
  settle(): void;
  badgeCount(): number;
}

function tagOf(node: Node | null): string {
  if (!node || !(node instanceof (globalThis as { Element: typeof Element }).Element)) {
    return node?.nodeName ?? '?';
  }
  return node.getAttribute('data-tag') || node.nodeName;
}

function cardHtml(i: number): string {
  // Card 2 already positions its own poster link — covers the
  // getComputedStyle() !== 'static' branch (no style write, only the insert).
  const inlineStyle = i === 2 ? ' style="position: relative"' : '';
  return (
    `<div class="relative" data-card="${i}">` +
    `<a href="/movie/${100 + i}-title" data-media-type="movie" data-tag="c${i}"${inlineStyle}>` +
    '<img alt=""></a></div>'
  );
}

function mount(cardCount: number): Harness {
  const cards = Array.from({ length: cardCount }, (_, i) => cardHtml(i + 1)).join('');
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>` +
      `<div class="relative" id="wrapper"><div class="relative carousel">${cards}</div></div>` +
      `</body></html>`,
    { url: 'https://www.themoviedb.org/' },
  );
  const win = dom.window;
  const doc = win.document;

  const entries: TimelineEntry[] = [];
  const docQueries: string[] = [];
  let turn = 0;

  // Writes are observed two ways: the callback catches everything jsdom hands
  // over at a microtask checkpoint, and `takeRecords()` catches the ones still
  // queued at each read / frame boundary — which is what makes "read before
  // write" observable instead of merely asserted. A drained record never
  // reaches the callback, so nothing is double-counted.
  const writes = new win.MutationObserver((records) => pushWrites(records));
  const pushWrites = (records: MutationRecord[]): void => {
    for (const rec of records) {
      entries.push({
        kind: rec.type === 'childList' ? 'insert' : 'style',
        turn,
        tag: tagOf(rec.target),
      });
    }
  };
  const drainWrites = (): void => pushWrites(writes.takeRecords());
  writes.observe(doc.body, { childList: true, subtree: true, attributes: true });

  const realComputedStyle = win.getComputedStyle.bind(win);
  const computedCalls: string[] = [];
  defineGlobal('getComputedStyle', (el: Element) => {
    drainWrites();
    computedCalls.push(tagOf(el));
    entries.push({ kind: 'read', turn, tag: tagOf(el) });
    return realComputedStyle(el);
  });

  // Manual frame clock: runChunked's default scheduler picks these up off
  // globalThis, so the test decides where frames begin and end.
  const frames = new Map<number, () => void>();
  let frameId = 0;
  defineGlobal('requestAnimationFrame', (cb: () => void) => {
    const id = ++frameId;
    frames.set(id, cb);
    return id;
  });
  defineGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });

  // Document-wide queries are recorded so the selector narrowing is testable.
  const realQSA = doc.querySelectorAll.bind(doc);
  Object.defineProperty(doc, 'querySelectorAll', {
    value: (selector: string) => {
      docQueries.push(String(selector));
      return realQSA(selector);
    },
    configurable: true,
    writable: true,
  });

  defineGlobal('document', doc);
  defineGlobal('window', win);
  defineGlobal('navigator', win.navigator);
  defineGlobal('Node', win.Node);
  defineGlobal('Element', win.Element);
  defineGlobal('HTMLElement', win.HTMLElement);
  defineGlobal('MutationObserver', win.MutationObserver);
  defineGlobal('chrome', {
    runtime: {
      id: 'test-extension',
      lastError: undefined,
      sendMessage: (msg: { type: string }, cb?: (res: unknown) => void) => {
        const body =
          msg.type === 'DB_GET_BULK' || msg.type === 'DB_GET_ALL'
            ? { success: true, entries: [] }
            : { success: true };
        cb?.(body);
      },
      onMessage: { addListener: () => {} },
    },
    storage: { local: { get: async () => ({}) }, onChanged: { addListener: () => {} } },
  });

  return {
    doc,
    entries,
    docQueries,
    pendingFrames: () => frames.size,
    settle: () => {
      drainWrites();
    },
    pumpFrame: () => {
      drainWrites();
      turn += 1;
      const batch = [...frames.values()];
      frames.clear();
      for (const run of batch) run();
      drainWrites();
    },
    badgeCount: () => doc.body.querySelectorAll('.umm-homepage-badge').length,
  };
}

/** Let the awaited DB read in the scan resolve (promise hops, not timers). */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve));
}

function timeline(harness: Harness): string {
  return harness.entries.map((e) => `${e.kind[0]}${e.turn}:${e.tag}`).join(' ');
}

/** How many badges actually landed inside each animation frame turn. */
function badgeInsertsByTurn(harness: Harness): Map<number, number> {
  const byTurn = new Map<number, number>();
  for (const e of harness.entries) {
    if (e.kind !== 'insert') continue;
    byTurn.set(e.turn, (byTurn.get(e.turn) ?? 0) + 1);
  }
  return byTurn;
}

const teardowns: Array<() => void> = [];
test.afterEach(() => {
  for (const teardown of teardowns.splice(0)) teardown();
});

test.describe('TMDB 首页批量注入 — 读写分离与分帧', () => {
  test('(a) 一个批次的全部几何读取必须先于该批次的任何写入', async () => {
    const harness = mount(3);
    teardowns.push(await handleTMDBHomepage());
    await flush();
    harness.settle();

    const reads = harness.entries.filter((e) => e.kind === 'read');
    expect(
      reads.map((r) => r.tag),
      `读取集合: ${timeline(harness)}`,
    ).toEqual(['c1', 'c2', 'c3']);

    const lastRead = harness.entries.findLastIndex((e) => e.kind === 'read');
    const firstWrite = harness.entries.findIndex((e) => e.kind !== 'read');
    expect(
      lastRead,
      `读写交错（时间线 ${timeline(harness)}）：最后一次读 ${lastRead} 必须早于首次写 ${firstWrite}`,
    ).toBeLessThan(firstWrite);
    expect(firstWrite, timeline(harness)).toBeGreaterThan(-1);
  });

  test('(b) 写按帧分块：24 卡至少 2 帧，单帧不得写完整个语料', async () => {
    const harness = mount(CARD_COUNT);
    teardowns.push(await handleTMDBHomepage());
    await flush();
    harness.settle();

    expect(harness.badgeCount(), `首批之后仍有未写卡（时间线 ${timeline(harness)}）`).toBeLessThan(
      CARD_COUNT,
    );

    for (let i = 0; i < 40 && harness.pendingFrames() > 0; i++) harness.pumpFrame();
    expect(harness.badgeCount(), timeline(harness)).toBe(CARD_COUNT);

    const byTurn = badgeInsertsByTurn(harness);
    const turns = [...byTurn.keys()];
    expect(
      turns.length,
      `批次跨帧分布 ${JSON.stringify([...byTurn])} 必须 ≥2 个帧批次`,
    ).toBeGreaterThanOrEqual(2);
    const maxTurnInserts = Math.max(...byTurn.values());
    expect(
      maxTurnInserts,
      `单帧写入 ${maxTurnInserts} 枚徽章（分布 ${JSON.stringify([...byTurn])}）不得覆盖全量`,
    ).toBeLessThan(CARD_COUNT);
  });

  test('(c) 路由重派发取消在途批次，不叠加帧队列', async () => {
    const harness = mount(CARD_COUNT);
    teardowns.push(await handleTMDBHomepage());
    await flush();
    harness.settle();
    const inFlightBadges = harness.badgeCount();
    expect(inFlightBadges < CARD_COUNT, `首个批次必须仍在途：${inFlightBadges}`).toBe(true);
    expect(harness.pendingFrames(), `在途帧应为 1，实际 ${harness.pendingFrames()}`).toBe(1);

    teardowns.push(await handleTMDBHomepage());
    await flush();
    harness.settle();
    expect(
      harness.pendingFrames(),
      `重派发后帧队列叠加 ${harness.pendingFrames()}`,
    ).toBeLessThanOrEqual(1);

    for (let i = 0; i < 40 && harness.pendingFrames() > 0; i++) {
      harness.pumpFrame();
      expect(
        harness.pendingFrames(),
        `帧 ${i} 后仍有 ${harness.pendingFrames()} 个在途批次`,
      ).toBeLessThanOrEqual(1);
    }
    expect(harness.badgeCount(), timeline(harness)).toBe(CARD_COUNT);
  });

  test('(c2) 观察者重启取代在途批次（async scan 无重入保护即叠加）', async () => {
    const harness = mount(CARD_COUNT);
    teardowns.push(await handleTMDBHomepage());
    await flush();
    harness.settle();
    expect(harness.pendingFrames()).toBe(1);

    // The badge inserts are body mutations → the handler's own MutationObserver
    // re-arms scanAllCards (280 ms throttle). Never pumping frames keeps the
    // first pass in flight across that restart, which is the re-entrancy window.
    await new Promise<void>((resolve) => setTimeout(resolve, 400));
    expect(
      harness.docQueries.length > 1,
      `扫描未重启（doc 查询 ${JSON.stringify(harness.docQueries)}）`,
    ).toBe(true);
    expect(
      harness.pendingFrames(),
      `两次批次同时在途 = ${harness.pendingFrames()} 个帧`,
    ).toBeLessThanOrEqual(1);

    for (let i = 0; i < 40 && harness.pendingFrames() > 0; i++) harness.pumpFrame();
    expect(harness.badgeCount(), timeline(harness)).toBe(CARD_COUNT);
  });

  test('(d) 文档级查询只允许有界的 poster 链接选择器，不得枚举 div.relative', async () => {
    const harness = mount(3);
    teardowns.push(await handleTMDBHomepage());
    await flush();
    harness.settle();

    expect(harness.docQueries.length, '未发生任何文档级查询').toBeGreaterThan(0);
    for (const selector of harness.docQueries) {
      expect(selector.includes('data-media-type'), `文档级查询枚举了无界容器: ${selector}`).toBe(
        true,
      );
    }
    expect(harness.badgeCount()).toBe(3);
  });

  test('(e) 徽章内容仍由记录状态决定，一卡一枚（行为不变）', async () => {
    const harness = mount(3);
    teardowns.push(await handleTMDBHomepage());
    await flush();
    harness.settle();
    for (let i = 0; i < 40 && harness.pendingFrames() > 0; i++) harness.pumpFrame();

    const badges = [...harness.doc.body.querySelectorAll('.umm-homepage-badge')];
    expect(badges).toHaveLength(3);
    expect(
      badges.every(
        (b) =>
          b.parentElement?.getAttribute('data-tag') ===
          b.closest('[data-card]')?.querySelector('a')?.getAttribute('data-tag'),
      ),
    ).toBe(true);
    expect(badges.every((b) => b.getAttribute('role') === 'status')).toBe(true);
    // Card 2 was already positioned: no style write for it (see (a) timeline).
    expect(
      harness.entries.some((e) => e.kind === 'style' && e.tag === 'c2'),
      `c2 本就有 position:relative，不应再被写 style：${timeline(harness)}`,
    ).toBe(false);
  });
});
