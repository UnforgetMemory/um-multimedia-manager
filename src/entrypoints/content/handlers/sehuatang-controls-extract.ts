/**
 * 色花堂 forumdisplay 控件「提取」层（自 sehuatang-controls.ts 抽出）
 *
 * 纯函数：Element → 数据（面包屑 / 主题分类选项卡 / 分页）。不触碰项目 UI
 * 构建，也不改变入参 DOM——与「构建器」层（./sehuatang-controls-build）以
 * 数据为界分离，两侧均可独立在 JSDOM 下测试。
 *
 * 公共表面仍经 ./sehuatang-controls（barrel）再导出，消费者无需改导入路径。
 */

import type { PaginationData, PagerLink } from './sehuatang-paging';

export interface BreadcrumbItem {
  text: string;
  href: string;
  current: boolean;
}

export interface TypeTab {
  text: string;
  href: string;
  count: string;
  active: boolean;
}

/** 从任意 href 提取 typeid 参数（仅解析查询串，base 只作占位）。 */
function typeIdFromHref(href: string): string {
  try {
    return new URL(href, 'https://www.sehuatang.net/').searchParams.get('typeid') ?? '';
  } catch {
    return '';
  }
}

/** 面包屑：#pt .z 内全部 a 节点；过滤空文本后再标记末位为当前页。 */
export function extractBreadcrumb(container: Element | null): BreadcrumbItem[] {
  if (!container) return [];
  const anchors = Array.from(container.querySelectorAll('a'))
    .map((a) => ({
      text: (a.textContent ?? '').trim(),
      href: a.getAttribute('href') ?? '',
    }))
    .filter((item) => item.text !== '');
  if (anchors.length === 0) return [];
  const last = anchors.length - 1;
  return anchors.map((item, idx) => ({ ...item, current: idx === last }));
}

/**
 * 选项卡：#thread_types li > a；标签文本 = 精确剔除计数 span（span.xg1.num）
 * 后的剩余子节点文本（避免 replace 首处替换误删标题中同形文本）。
 * 激活判定：URL 语义优先（typeid 参数相等者激活；无 typeid 的「全部」
 * 选项卡在 URL 无 typeid 时激活），全部未命中时回退 li.xw1/a 类名。
 */
export function extractTypeTabs(ul: Element | null, currentUrl: string): TypeTab[] {
  if (!ul) return [];
  const currentTypeId = typeIdFromHref(currentUrl);

  interface RawTab {
    text: string;
    href: string;
    count: string;
    activeByUrl: boolean;
    marked: boolean;
  }
  const raw: RawTab[] = [];
  for (const li of Array.from(ul.querySelectorAll('li'))) {
    const a = li.querySelector('a');
    if (!a) continue;
    const href = a.getAttribute('href') ?? '';
    const count = (a.querySelector('span.xg1.num')?.textContent ?? '').trim();
    const text = Array.from(a.childNodes)
      .filter((n) => !(n.nodeType === 1 && (n as Element).classList.contains('xg1')))
      .map((n) => n.textContent ?? '')
      .join('')
      .trim();
    if (!text) continue;
    const tabTypeId = typeIdFromHref(href);
    raw.push({
      text,
      href,
      count,
      activeByUrl: tabTypeId ? tabTypeId === currentTypeId : currentTypeId === '',
      marked: li.classList.contains('xw1') || li.classList.contains('a'),
    });
  }

  const anyActiveByUrl = raw.some((t) => t.activeByUrl);
  return raw.map((t) => ({
    text: t.text,
    href: t.href,
    count: t.count,
    active: anyActiveByUrl ? t.activeByUrl : t.marked,
  }));
}

const JUMP_TEMPLATE_RE = /window\.location\s*=\s*['"]([^'"]+)['"]\s*\+/;

/** 分页：.pg 块 → 数据。prev 在第 1 页、next 在末页均缺省为空串。 */
export function extractPagination(pg: Element | null): PaginationData {
  const empty: PaginationData = {
    current: 0,
    total: 0,
    prevHref: '',
    nextHref: '',
    pages: [],
    jumpTemplate: '',
  };
  if (!pg) return empty;

  const current = parseInt(pg.querySelector('strong')?.textContent?.trim() ?? '', 10) || 0;
  const prevHref = pg.querySelector('.prev')?.getAttribute('href') ?? '';
  const nextHref = pg.querySelector('.nxt')?.getAttribute('href') ?? '';

  const totalTitle = pg.querySelector('span[title]')?.getAttribute('title') ?? '';
  const totalMatch = /共\s*(\d+)\s*页/.exec(totalTitle);
  const lastEl = pg.querySelector('a.last');
  const lastHrefMatch = /-(\d+)(?:\.html)?$/.exec(lastEl?.getAttribute('href') ?? '');
  const lastTextMatch = /(\d+)\s*$/.exec(lastEl?.textContent ?? '');
  const lastPage = lastHrefMatch
    ? parseInt(lastHrefMatch[1]!, 10)
    : lastTextMatch
      ? parseInt(lastTextMatch[1]!, 10)
      : 0;
  const total = totalMatch ? parseInt(totalMatch[1]!, 10) : lastPage;

  const pages: PagerLink[] = [];
  for (const child of Array.from(pg.children)) {
    if (child.tagName !== 'A') continue;
    const a = child as HTMLAnchorElement;
    if (a.classList.contains('nxt') || a.classList.contains('prev')) continue;
    const pageMatch = /(\d+)/.exec((a.textContent ?? '').trim());
    if (!pageMatch) continue;
    pages.push({
      label: (a.textContent ?? '').trim(),
      page: parseInt(pageMatch[1]!, 10),
      href: a.getAttribute('href') ?? '',
      last: a.classList.contains('last'),
    });
  }

  const jumpInput = pg.querySelector('input[name="custompage"]') as HTMLInputElement | null;
  const jumpTemplate = JUMP_TEMPLATE_RE.exec(jumpInput?.getAttribute('onkeydown') ?? '')?.[1] ?? '';

  return { current, total, prevHref, nextHref, pages, jumpTemplate };
}
