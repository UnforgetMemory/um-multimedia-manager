import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import {
  countSehuatangCardStates,
  setGridHideViewed,
  markCardsViewed,
  dimCardsVisually,
} from '@/entrypoints/content/handlers/sehuatang-controls';
import { BASE_URL } from './sehuatang-controls-fixtures';

/**
 * 色花堂「已看标记与淡化」状态层单测（自 sehuatang-controls.spec.ts 按测试组拆出；
 * 实现见 ./sehuatang-controls-mark，经 controls barrel 再导出的公共表面消费）。
 */

test.describe('countSehuatangCardStates — 已看统计（本页已看=dimmer 数）', () => {
  test('null 网格 / 无已看卡片 → watched=0', () => {
    expect(countSehuatangCardStates(null)).toEqual({ watched: 0 });
    const dom = new JSDOM(
      '<body><div class="umm-preview-grid"><div class="umm-card">1</div></div></body>',
      { url: BASE_URL },
    );
    const grid = dom.window.document.querySelector('.umm-preview-grid') as HTMLElement;
    expect(countSehuatangCardStates(grid)).toEqual({ watched: 0 });
  });

  test('已看计数正确；hide 类不影响 watched（隐藏由初始挂载过滤决定）', () => {
    const dom = new JSDOM(
      '<body><div class="umm-preview-grid"><div class="umm-card umm-viewed"></div><div class="umm-card umm-viewed"></div><div class="umm-card"></div></div></body>',
      { url: BASE_URL },
    );
    const grid = dom.window.document.querySelector('.umm-preview-grid') as HTMLElement;
    expect(countSehuatangCardStates(grid)).toEqual({ watched: 2 });
    grid.classList.add('umm-sht-hide-viewed');
    expect(countSehuatangCardStates(grid)).toEqual({ watched: 2 });
  });

  test('开启隐藏的网格：watched 仍只计已看卡（隐藏卡不在 DOM 中）', () => {
    const dom = new JSDOM(
      '<body><div class="umm-preview-grid umm-sht-hide-viewed"><div class="umm-card umm-viewed"></div><div class="umm-card"></div></div></body>',
      { url: BASE_URL },
    );
    const grid = dom.window.document.querySelector('.umm-preview-grid') as HTMLElement;
    expect(countSehuatangCardStates(grid)).toEqual({ watched: 1 });
  });
});

test.describe('setGridHideViewed — 命令式隐藏已看 toggle（运行时即时生效）', () => {
  function gridWithCards(): HTMLElement {
    const dom = new JSDOM(
      '<body><div class="umm-preview-grid"><div class="umm-card umm-viewed"></div><div class="umm-card"></div><div class="umm-card umm-viewed"></div></div></body>',
      { url: BASE_URL },
    );
    return dom.window.document.querySelector('.umm-preview-grid') as HTMLElement;
  }

  test('ON：已看卡立即 display:none + 网格类标记 + 返回隐藏数；OFF：复原', () => {
    const grid = gridWithCards();
    const hidden = setGridHideViewed(grid, true);
    expect(hidden).toBe(2);
    expect(grid.classList.contains('umm-sht-hide-viewed')).toBe(true);
    const cards = Array.from(grid.querySelectorAll('.umm-card')) as HTMLElement[];
    expect(cards[0]!.style.display).toBe('none');
    expect(cards[1]!.style.display).toBe('');
    expect(cards[2]!.style.display).toBe('none');

    const restored = setGridHideViewed(grid, false);
    expect(restored).toBe(0);
    expect(grid.classList.contains('umm-sht-hide-viewed')).toBe(false);
    expect(cards[0]!.style.display).toBe('');
  });

  test('无已看卡时 ON：隐藏数 0，类标记仍落（状态标记与显隐解耦）', () => {
    const dom = new JSDOM(
      '<body><div class="umm-preview-grid"><div class="umm-card"></div></div></body>',
      { url: BASE_URL },
    );
    const grid = dom.window.document.querySelector('.umm-preview-grid') as HTMLElement;
    expect(setGridHideViewed(grid, true)).toBe(0);
    expect(grid.classList.contains('umm-sht-hide-viewed')).toBe(true);
  });
});

test.describe('markCardsViewed — 统一已看标记路径（磁力/一键复制共用）', () => {
  function cardsFromHtml(html: string): HTMLElement[] {
    const dom = new JSDOM(`<body><div class="umm-preview-grid">${html}</div></body>`, {
      url: BASE_URL,
    });
    return Array.from(dom.window.document.querySelectorAll('.umm-card')) as HTMLElement[];
  }

  // 异步落库断言只依赖微任务（store fake 无真实 IO）——用 setImmediate 刷新，
  // 消除 sleep 定时器在慢 CI 下的时序抖动。
  const sleep = () => new Promise<void>((resolve) => setImmediate(resolve));

  test('去重 + 单次批量落库 + 类立即落下（dimmer/隐藏即时生效）', async () => {
    const cards = cardsFromHtml(
      '<div class="umm-card" data-avid="ABC-123" data-url="https://x.test/1"></div>' +
        '<div class="umm-card umm-viewed" data-avid="XYZ-999"></div>' +
        '<div class="umm-card" data-avid="SSIS-001"></div>',
    );
    const calls: { source: string; items: { id: string; rating?: number; url?: string }[] }[] = [];
    const store = {
      batchAdd: async (source: string, items: { id: string; rating?: number; url?: string }[]) => {
        calls.push({ source, items });
        return items.length;
      },
    };
    let marked = 0;
    let added = -1;
    markCardsViewed(
      cards,
      'sehuatang',
      store,
      () => {
        marked++;
      },
      (n) => {
        added = n;
      },
    );
    // 类同步落下（不等异步落库）——隐藏/dimmer 立即生效的关键。
    expect(cards.map((c) => c.classList.contains('umm-viewed'))).toEqual([true, true, true]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.source).toBe('sehuatang');
    expect(calls[0]!.items.map((i) => i.id)).toEqual(['ABC-123', 'SSIS-001']);
    expect(calls[0]!.items[0]!.url).toBe('https://x.test/1');
    expect(marked).toBe(1);
    await sleep();
    expect(added).toBe(2);
  });

  test('全部已看 → 零落库调用，onMarked 仍触发（幂等）', () => {
    const cards = cardsFromHtml('<div class="umm-card umm-viewed" data-avid="A-1"></div>');
    let storeCalls = 0;
    let marked = 0;
    const store = {
      batchAdd: async () => {
        storeCalls++;
        return 0;
      },
    };
    markCardsViewed(cards, 'sehuatang', store, () => {
      marked++;
    });
    expect(storeCalls).toBe(0);
    expect(marked).toBe(1);
  });

  test('无番号卡片 → 类仍落下但不落库', () => {
    const cards = cardsFromHtml('<div class="umm-card"></div>');
    let storeCalls = 0;
    const store = {
      batchAdd: async () => {
        storeCalls++;
        return 0;
      },
    };
    markCardsViewed(cards, 'sehuatang', store);
    expect(cards[0]!.classList.contains('umm-viewed')).toBe(true);
    expect(storeCalls).toBe(0);
  });

  test('落库失败 → onError 回调（保存失败诊断通道）', async () => {
    const cards = cardsFromHtml('<div class="umm-card" data-avid="A-1"></div>');
    const store = {
      batchAdd: async () => {
        throw new Error('db down');
      },
    };
    let errored = false;
    markCardsViewed(cards, 'sehuatang', store, undefined, undefined, () => {
      errored = true;
    });
    await sleep();
    expect(errored).toBe(true);
    // 类仍落下：dimmer 与落库解耦，保存失败不阻断 UI。
    expect(cards[0]!.classList.contains('umm-viewed')).toBe(true);
  });

  test('批量失败 → 逐条 add 兜底（提高保存可靠性）+ onError 触发', async () => {
    const cards = cardsFromHtml(
      '<div class="umm-card" data-avid="A-1"></div><div class="umm-card" data-avid="B-2"></div>',
    );
    const addedIds: string[] = [];
    const store = {
      batchAdd: async () => {
        throw new Error('batch down');
      },
      add: async (_source: string, id: string) => {
        addedIds.push(id);
      },
    };
    let errored = false;
    markCardsViewed(cards, 'sehuatang', store, undefined, undefined, () => {
      errored = true;
    });
    await sleep();
    expect(addedIds).toEqual(['A-1', 'B-2']);
    expect(errored).toBe(true);
  });

  test('写入后读回自检：读不到 → onError(readback-mismatch)；读得到 → 静默', async () => {
    const cards = cardsFromHtml('<div class="umm-card" data-avid="A-1"></div>');
    const storeMiss = {
      batchAdd: async () => 1,
      has: async () => false,
    };
    let missError = '';
    markCardsViewed(cards, 'sehuatang', storeMiss, undefined, undefined, (e) => {
      missError = String(e);
    });
    await sleep();
    expect(missError).toContain('readback-mismatch: A-1');

    const cards2 = cardsFromHtml('<div class="umm-card" data-avid="B-2"></div>');
    const storeHit = {
      batchAdd: async () => 1,
      has: async () => true,
    };
    let hitError = '';
    markCardsViewed(cards2, 'sehuatang', storeHit, undefined, undefined, (e) => {
      hitError = String(e);
    });
    await sleep();
    expect(hitError).toBe('');
  });
});

test.describe('dimCardsVisually — 仅页面状态标记（点击跳转，不落库）', () => {
  function cardsFromHtml(html: string): HTMLElement[] {
    const dom = new JSDOM(`<body><div class="umm-preview-grid">${html}</div></body>`, {
      url: BASE_URL,
    });
    return Array.from(dom.window.document.querySelectorAll('.umm-card')) as HTMLElement[];
  }

  test('同步落类：返回新增数，且不产生任何 store/消息调用', () => {
    const cards = cardsFromHtml(
      '<div class="umm-card" data-avid="TID-3664524"></div>' +
        '<div class="umm-card" data-avid="ABC-123"></div>',
    );
    const marked = dimCardsVisually(cards);
    expect(marked).toBe(2);
    expect(cards.every((c) => c.classList.contains('umm-viewed'))).toBe(true);
  });

  test('幂等：已带 umm-viewed 的卡片不重复计数', () => {
    const cards = cardsFromHtml(
      '<div class="umm-card umm-viewed" data-avid="TID-1"></div>' +
        '<div class="umm-card" data-avid="TID-2"></div>',
    );
    expect(dimCardsVisually(cards)).toBe(1);
    expect(dimCardsVisually(cards)).toBe(0);
  });

  test('空数组 → 0（无副作用）', () => {
    expect(dimCardsVisually([])).toBe(0);
  });
});
