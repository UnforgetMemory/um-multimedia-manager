/**
 * 色花堂「已看标记与淡化」状态层（自 sehuatang-controls.ts 抽出）
 *
 * 职责：把「已看」这一状态**应用到 DOM**——落 `.umm-viewed` 类、批量免过渡、
 * 运行时显隐切换、以及点击跳转时的纯视觉标记。与另外两组职责分离：
 *   - `sehuatang-controls.ts`：控件重建（提取站点 DOM → 构建项目基准 UI）+ 挂载编排
 *   - 本模块：状态应用（不改结构，只改类/样式），零依赖、纯 DOM 操作
 *
 * 语义纪律（ADR-024，勿改）：
 *   - 初始渲染「只隐藏不 dim」；运行时标记「只 dim 不隐藏」——`setGridHideViewed`
 *     的网格类仅作状态标记，不挂持久 CSS 规则，以免牵连运行时标记语义。
 *   - 落类即生效（不等异步结果）：dimmer 与「隐藏已看」在类落下瞬间应用。
 */

/**
 * 批量上色免过渡执行器（dimmer 提速）：一次给多张卡落 `.umm-viewed` 时，若
 * 每张都播 0.18s opacity + 0.22s 图片 filter 过渡，几十张同时动画会造成
 * 长尾卡顿（首屏 dim 观感「慢」的主因）。本函数在批量期间给网格挂
 * `.umm-sht-dim-batch`（CSS 侧 `transition: none`），下一帧 rAF 撤销——
 * 批量变更是瞬时完成，之后单卡（点击/复制）的过渡动效不受影响。
 * apply 同步执行（classList 变更与批量类同帧生效，无中间态闪烁）。
 */
export function withDimBatch(grid: HTMLElement, apply: () => void): void {
  const already = grid.classList.contains('umm-sht-dim-batch');
  if (!already) grid.classList.add('umm-sht-dim-batch');
  try {
    apply();
  } finally {
    if (!already) {
      // rAF 兜底：非视觉宿主无 requestAnimationFrame 时退化为宏任务（类必被
      // 撤销，绝不残留免过渡态）；不抽取函数引用调用，规避 Illegal invocation。
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => grid.classList.remove('umm-sht-dim-batch'));
      } else {
        setTimeout(() => grid.classList.remove('umm-sht-dim-batch'), 16);
      }
    }
  }
}

/** 已看落库接口（生产实现 = AdultAvStore，测试注入 fake）。 */
export interface MarkedStore {
  batchAdd(source: string, items: { id: string; rating?: number; url?: string }[]): Promise<number>;
  /** 可选单条落库（batchAdd 失败时的逐条兜底路径）。 */
  add?(source: string, id: string, rating?: number, url?: string): Promise<void>;
  /** 可选单条存在性检查（写入后读回自检，探测运行时写读不对称）。 */
  has?(id: string): Promise<boolean>;
}

/**
 * 卡片已看计数（纯 DOM 类状态，jsdom 可测）。
 * 语义（初始隐藏 / 非初始 dim）：网格内 .umm-viewed 数 = 本页已看（dimmer）。
 * 「本页隐藏」由初始挂载过滤决定（见 sehuatang.ts hiddenAtMount），
 * 运行时标记永不隐藏。
 */
export function countSehuatangCardStates(grid: HTMLElement | null): { watched: number } {
  if (!grid) return { watched: 0 };
  return { watched: grid.querySelectorAll('.umm-card.umm-viewed').length };
}

/**
 * 「隐藏已看」运行时 toggle（命令式一次性显隐，非持久 CSS 规则）：
 * ON → 当前已渲染的已看卡片立即 display:none 并返回隐藏数；OFF → 复原。
 * 网格类 umm-sht-hide-viewed 仅作状态标记（菜单激活态），不挂 CSS 规则——
 * 运行时标记（磁力点击/复制）「只 dim 不隐藏」的既定语义因此不受牵连。
 */
export function setGridHideViewed(grid: HTMLElement, hide: boolean): number {
  grid.classList.toggle('umm-sht-hide-viewed', hide);
  let hidden = 0;
  for (const card of Array.from(grid.querySelectorAll('.umm-card.umm-viewed'))) {
    (card as HTMLElement).style.display = hide ? 'none' : '';
    if (hide) hidden++;
  }
  return hidden;
}

/**
 * 统一已看标记路径（磁力点击 / 一键复制共用）：
 *   1. 去重加 .umm-viewed —— dimmer 与「隐藏已看」（CSS display:none）
 *      在类落下的瞬间生效，无需等待任何异步结果；
 *   2. 新标记项单次 batchAdd 落库（1 消息，替代逐卡 ADD）；
 *   3. onMarked 回调（统计节流刷新）。
 * 已带 .umm-viewed 的卡片跳过（幂等，不重复计数/落库）。
 */
export function markCardsViewed(
  cards: HTMLElement[],
  source: string,
  store: MarkedStore,
  onMarked?: () => void,
  onAdded?: (added: number, ids: string[]) => void,
  onError?: (error: unknown) => void,
): void {
  const fresh = cards.filter((card) => !card.classList.contains('umm-viewed'));
  if (fresh.length === 0) {
    onMarked?.();
    return;
  }
  const items: { id: string; rating?: number; url?: string }[] = [];
  for (const card of fresh) {
    card.classList.add('umm-viewed');
    const avid = card.getAttribute('data-avid');
    if (avid) {
      const url = card.getAttribute('data-url') ?? undefined;
      items.push({ id: avid, rating: 0, ...(url ? { url } : {}) });
    }
  }
  if (items.length > 0) {
    store
      .batchAdd(source, items)
      .then((added: number) => {
        onAdded?.(
          added,
          items.map((i) => i.id),
        );
        // 写入后读回自检：探测「写入报成功但读不回来」的运行时不对称
        // （消息层/SW 状态的最后一环证据）。
        if (added > 0 && store.has) {
          const probeId = items[0]!.id;
          store
            .has(probeId)
            .then((found) => {
              if (!found) onError?.(new Error(`readback-mismatch: ${probeId}`));
            })
            .catch((probeError: unknown) => {
              console.warn('[UMM] Sehuatang watched readback probe failed:', probeError);
            });
        }
      })
      .catch((error: unknown) => {
        console.warn('[UMM] Sehuatang watched batchAdd failed:', error);
        // 逐条兜底：批量路径失败时退化为单条 ADD，提高保存可靠性。
        if (store.add) {
          let fallbackAdded = 0;
          const ids = items.map((i) => i.id);
          for (const item of items) {
            store
              .add(source, item.id, item.rating, item.url)
              .then(() => {
                fallbackAdded++;
                // 逐条兜底完成后回调 onAdded（成功条数+id），保持统计链路闭合。
                if (fallbackAdded === items.length) onAdded?.(fallbackAdded, ids);
              })
              .catch((fallbackError: unknown) => {
                console.warn('[UMM] Sehuatang watched single add failed:', fallbackError);
              });
          }
        }
        onError?.(error);
      });
  }
  onMarked?.();
}

/**
 * 仅页面状态标记（**不落库**）：点击跳转时同步加 dimmer，类落下即生效。
 *
 * 用于「只提取到 TID」或「详情已结束但无磁力」的条目——这两类没有自然的
 * 复制磁力落库路径，用户会直接点进帖子；数据变更交给目标帖子页的静默记录
 * 逻辑（sehuatang-main.content），此处重复落库属冗余。
 * 幂等：已带 .umm-viewed 的卡片跳过（不重复触发统计刷新）。
 */
export function dimCardsVisually(cards: HTMLElement[]): number {
  let marked = 0;
  for (const card of cards) {
    if (card.classList.contains('umm-viewed')) continue;
    card.classList.add('umm-viewed');
    marked++;
  }
  return marked;
}
