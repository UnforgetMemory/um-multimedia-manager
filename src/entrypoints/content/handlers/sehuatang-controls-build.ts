/**
 * 色花堂 forumdisplay 控件「构建器」层（自 sehuatang-controls.ts 抽出）
 *
 * doc 显式传参（JSDOM 可测）：数据 → 项目基准 UI 元素。与「提取」层
 * （./sehuatang-controls-extract）以数据为界；编排入口 mountSehuatangControls
 * （./sehuatang-controls）组合两侧。全部颜色消费 --umm-* 语义令牌，本层零调色板 hex。
 *
 * 公共表面仍经 ./sehuatang-controls（barrel）再导出，消费者无需改导入路径。
 */

import { t } from '@/entrypoints/content/i18n';
import { windowPages, resolveJumpUrl, clampPage, type PaginationData } from './sehuatang-paging';
import type { BreadcrumbItem, TypeTab } from './sehuatang-controls-extract';

export function el(doc: Document, tag: string, className: string, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 面包屑条（空数据 → null）。 */
export function buildBreadcrumbBar(doc: Document, items: BreadcrumbItem[]): HTMLElement | null {
  if (items.length === 0) return null;
  const bar = el(doc, 'div', 'umm-sht-breadcrumb');
  items.forEach((item, idx) => {
    if (idx > 0) bar.appendChild(el(doc, 'span', 'umm-sht-crumb-sep', '›'));
    const a = el(
      doc,
      'a',
      `umm-sht-crumb${item.current ? ' umm-sht-crumb--current' : ''}`,
      item.text,
    );
    if (item.href) a.setAttribute('href', item.href);
    bar.appendChild(a);
  });
  return bar;
}

/** 选项卡条（空数据 → null）。 */
export function buildTabsBar(doc: Document, tabs: TypeTab[]): HTMLElement | null {
  if (tabs.length === 0) return null;
  const bar = el(doc, 'div', 'umm-sht-tabs');
  for (const tab of tabs) {
    const a = el(doc, 'a', `umm-sht-tab${tab.active ? ' umm-sht-tab--active' : ''}`, tab.text);
    if (tab.href) a.setAttribute('href', tab.href);
    if (tab.active) a.setAttribute('aria-current', 'page');
    if (tab.count) a.appendChild(el(doc, 'span', 'umm-sht-tab-count', tab.count));
    bar.appendChild(a);
  }
  return bar;
}

/** 现代窗口化分页条：‹ 1 … 4 5 [6] 7 8 … 1495 › + 跳转 + 计数器。空数据 → null。 */
export function buildPager(doc: Document, data: PaginationData): HTMLElement | null {
  if (data.current === 0 && data.total === 0 && data.pages.length === 0) return null;

  const bar = el(doc, 'div', 'umm-sht-pager');

  const nav = (href: string, glyph: string, title: string) => {
    if (!href) {
      const span = el(doc, 'span', 'umm-sht-pg-nav umm-sht-pg-nav--disabled', glyph);
      span.setAttribute('title', title);
      span.setAttribute('aria-label', title);
      return span;
    }
    const a = el(doc, 'a', 'umm-sht-pg-nav', glyph);
    a.setAttribute('href', href);
    a.setAttribute('title', title);
    a.setAttribute('aria-label', title);
    return a;
  };

  bar.appendChild(nav(data.prevHref, '‹', '上一页'));
  for (const item of windowPages(data.pages, data.current, data.total)) {
    if (item.kind === 'gap') {
      bar.appendChild(el(doc, 'span', 'umm-sht-pg-gap', '…'));
      continue;
    }
    if (item.page === data.current) {
      const cap = el(doc, 'span', 'umm-sht-pg-page umm-sht-pg-page--current', String(item.page));
      cap.setAttribute('aria-current', 'page');
      bar.appendChild(cap);
      continue;
    }
    const a = el(doc, 'a', 'umm-sht-pg-page', String(item.page));
    if (item.href) a.setAttribute('href', item.href);
    bar.appendChild(a);
  }
  bar.appendChild(nav(data.nextHref, '›', '下一页'));

  if (data.jumpTemplate) {
    const input = el(doc, 'input', 'umm-sht-pg-jump') as HTMLInputElement;
    input.type = 'text';
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('size', '2');
    input.setAttribute('title', '输入页码，按回车快速跳转');
    input.value = String(data.current || 1);
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const raw = parseInt(input.value, 10);
      const page = clampPage(Number.isNaN(raw) ? 0 : raw, data.total);
      const base = doc.location?.href ?? doc.defaultView?.location?.href ?? '';
      const url = resolveJumpUrl(data.jumpTemplate, page, base);
      const view = doc.defaultView;
      if (url && view) view.location.href = url;
    });
    bar.appendChild(input);
  }
  if (data.total > 0)
    bar.appendChild(el(doc, 'span', 'umm-sht-pg-total', `${data.current || 1} / ${data.total}`));

  return bar;
}

/**
 * 搜索 URL 构建（纯函数，JSDOM/Node 可测）：Discuz 搜索的 GET 契约，
 * 形态与站点原生结果页链接一致（search.php?mod=forum&srchtxt=…&searchsubmit=yes）。
 * action 优先取原生 #scbar_form 的端点（调用方传入），空串回退通用形态；
 * URLSearchParams.set 保证参数幂等（action 自带 searchsubmit=yes 时原地覆盖，
 * 不产生重复键）；协议白名单仅 http(s)（非可信输入防御，与磁力/封面同纪律）。
 * 返回 null = 关键词空白或解析失败（调用方静默 no-op）。
 */
export function buildSearchUrl(action: string, base: string, keyword: string): string | null {
  const kw = keyword.trim();
  if (!kw) return null;
  try {
    const u = new URL(action || 'search.php?mod=forum&searchsubmit=yes', base || undefined);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.searchParams.set('mod', 'forum');
    u.searchParams.set('srchtxt', kw);
    u.searchParams.set('searchsubmit', 'yes');
    return u.href;
  } catch {
    return null;
  }
}

/**
 * 搜索框（原生 #scbar 搜索条被 overlay 取代后的重建；列表页 header 与首页
 * header 共用）。Enter 或按钮 → buildSearchUrl 同页导航，结果页由搜索
 * overlay 接管（app-search）。关键词空白 / 端点解析失败 → 静默 no-op。
 * navigate 可注入（JSDOM 无导航实现，测试传 spy；生产默认同页跳转）。
 * value：预填关键词（搜索页从 URL 的 kw/srchtxt 提取后回填，便于用户改词重搜）。
 */
export function buildSearchBox(
  doc: Document,
  opts?: { navigate?: (url: string) => void; value?: string },
): HTMLElement {
  const box = el(doc, 'div', 'umm-sht-searchbox');
  const input = el(doc, 'input', 'umm-sht-search-input') as HTMLInputElement;
  input.type = 'text';
  input.placeholder = t('sht.search_placeholder');
  input.setAttribute('aria-label', t('sht.search_placeholder'));
  const preset = (opts?.value ?? '').trim();
  if (preset) input.value = preset;
  const navigate =
    opts?.navigate ??
    ((url: string) => {
      const view = doc.defaultView;
      if (view) view.location.href = url;
    });
  const go = () => {
    const action = doc.getElementById('scbar_form')?.getAttribute('action') ?? '';
    const url = buildSearchUrl(action, doc.location?.href ?? '', input.value);
    if (url) navigate(url);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go();
  });
  const btn = el(doc, 'button', 'umm-sht-action umm-sht-search-btn', '🔍') as HTMLButtonElement;
  btn.type = 'button';
  btn.title = t('sht.search_go');
  btn.addEventListener('click', go);
  box.appendChild(input);
  box.appendChild(btn);
  return box;
}

/**
 * 「首页」按钮（🏠 图标，零文字占位）：header 操作组的导航入口，指向论坛
 * 根 `forum.php`（相对解析，Discuz 首页与 overlay 首页判型同源）。
 * 列表/搜索页 header 接入；首页本身不加（当前页即首页，自链无意义）。
 */
export function buildHomeLink(doc: Document): HTMLElement {
  const a = el(doc, 'a', 'umm-sht-action umm-sht-home-btn', '🏠');
  a.setAttribute('href', 'forum.php');
  a.setAttribute('title', t('sht.home'));
  a.setAttribute('aria-label', t('sht.home'));
  return a;
}

/** 「返 回」链接 + 「发新帖」按钮（发新帖点击 → 原版元素 click()，触发站点 showWindow）。 */
export function buildActions(
  doc: Document,
  back: HTMLAnchorElement | null,
  post: HTMLElement | null,
): HTMLElement[] {
  const buttons: HTMLElement[] = [];
  if (back) {
    const label = (back.textContent ?? '').replace(/\u00a0/g, ' ').trim() || '返回';
    const a = el(doc, 'a', 'umm-sht-action', label);
    const href = back.getAttribute('href');
    if (href) a.setAttribute('href', href);
    buttons.push(a);
  }
  if (post) {
    const imgAlt =
      (post.querySelector('img') as HTMLImageElement | null)?.getAttribute('alt') ?? '';
    const label = post.getAttribute('title') || imgAlt || '发新帖';
    const b = el(doc, 'button', 'umm-sht-action', label);
    b.setAttribute('type', 'button');
    b.addEventListener('click', () => post.click());
    buttons.push(b);
  }
  return buttons;
}

/** 岛内展示组件（摩天轮两舱）。 */
export type IslandMode = 'search' | 'pager';

/** 岛句柄：pill 供挂载，mode 读取当前组件，show 执行摩天轮轮替。 */
export interface FloatbarHandle {
  /** 岛根（.umm-sht-floatbar）。 */
  pill: HTMLElement;
  /** 当前展示组件（有分页时初始 = pager；仅搜索时 = search）。 */
  readonly mode: IslandMode;
  /**
   * 摩天轮轮替：切到指定组件。搜索舱恒在上舱、分页舱恒在下舱——切换时
   * 一舱滚出、另一舱滚入（位置由舱位唯一决定，**单次赋值即完成方向正确的
   * 过渡，无 double-rAF 时序依赖**）。不可切换（仅一方在场）时 no-op。
   */
  show(mode: IslandMode): void;
}

/**
 * 统一「灵动岛」合成器（全站页面的浮动 UI 单一定义点）。
 *
 * 组合顺序固定 = [搜索舱/分页舱（摩天轮舞台）] → 轮替控件；两者全空 → null
 * （不渲染空岛）。挂岛页面（列表/首页/搜索）按场景传入所需成分：
 *   - 列表页：search + pager（有分页 → 默认展示分页，⇅ 可切搜索）
 *   - 搜索页：search + pager（同上；空结果分支仅 search，无轮替控件）
 *   - 首页：仅 search（导航层，无分页，无轮替控件）
 * 策略性显示：搜索与分页同时在场时**优先展示分页**（分页是浏览主路径，搜索
 * 为次要入口）；舱位固定使过渡方向天然正确（摩天轮观感）。
 * 岛是全站唯一搜索入口（header 不持有搜索框）。
 */
export function buildFloatbar(
  doc: Document,
  opts?: { search?: boolean; searchValue?: string; pager?: HTMLElement | null },
): FloatbarHandle | null {
  const searchEl = opts?.search ? buildSearchBox(doc, { value: opts.searchValue }) : null;
  const pagerEl = opts?.pager ?? null;
  if (!searchEl && !pagerEl) return null;

  const pill = el(doc, 'div', 'umm-sht-floatbar');
  pill.id = 'umm-sht-floatbar';

  let mode: IslandMode = pagerEl ? 'pager' : 'search';

  const applySlots = () => {
    // 隐藏舱同步 aria-hidden（配合 CSS visibility:hidden：不可见即不可达，
    // 读屏与键盘不会再进入不可见舱）。
    if (searchEl) {
      const active = mode === 'search';
      searchEl.setAttribute('data-umm-slot', active ? 'active' : 'hidden-up');
      searchEl.setAttribute('aria-hidden', String(!active));
    }
    if (pagerEl) {
      const active = mode === 'pager';
      pagerEl.setAttribute('data-umm-slot', active ? 'active' : 'hidden-down');
      pagerEl.setAttribute('aria-hidden', String(!active));
    }
  };

  if (searchEl && pagerEl) {
    // 摩天轮舞台：两舱固定舱位（搜索上 / 分页下），切换即轮替入窗。
    const stage = el(doc, 'div', 'umm-sht-island-stage');
    stage.appendChild(searchEl);
    stage.appendChild(pagerEl);
    applySlots();
    pill.appendChild(stage);

    const switchBtn = el(doc, 'button', 'umm-sht-island-switch', '⇅') as HTMLButtonElement;
    switchBtn.type = 'button';
    switchBtn.setAttribute('title', t('sht.island_switch'));
    switchBtn.setAttribute('aria-label', t('sht.island_switch'));
    switchBtn.addEventListener('click', () => show(mode === 'pager' ? 'search' : 'pager'));
    pill.appendChild(switchBtn);
  } else if (searchEl) {
    pill.appendChild(searchEl);
  } else if (pagerEl) {
    pill.appendChild(pagerEl);
  }

  const show = (next: IslandMode): void => {
    if (!(searchEl && pagerEl)) return;
    if (next === mode) return;
    mode = next;
    applySlots();
  };

  return {
    pill,
    get mode() {
      return mode;
    },
    show,
  };
}
