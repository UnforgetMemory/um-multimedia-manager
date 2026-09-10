/**
 * 色花堂首页（pg_index）分区提取（纯函数，Element → 数据）。
 *
 * 站点首页按 Discuz 分区模型组织：每个分区是一个 `<div id="category_X"
 * class="bm_c">` 容器，**前置**一个 `<h2 class="xs2/a"><span>分区名</span></h2>`
 * 与一组版主链接（`.y` 容器）。分区下含 `<table>...<tr><td class="fl_g">`
 * 子版块。`fl_g` 单元持有单版块卡片：图标、名称、今日新增、主题/帖数、
 * 最后发表。
 *
 * 与列表页（forumdisplay）的差异：首页是**导航层**，纯链接到子版块；
 * 列表页是**数据层**（帖子行 + 详情懒加载）。本模块只解导航，**不产生
 * 跟踪键**（子版块 URL 形如 `forum-{fid}-1.html`，无 tid 兜底、无 avId 提取）。
 *
 * 图标态在提取层一次解出（iconSrc + hasNew），编排层零 DOM 重扫——避免
 * 「每卡片一次 selector 重查」的 O(n) 全文档扫描与选择器字符串拼接。
 *
 * DOM 守卫失败（无任何 category_ 容器）→ 编排层判定为「非首页」并 dismiss
 * overlay。预留 DOM 漂移兜底。
 */

export interface SehuatangSubForum {
  /** 子版块名（如「国产原创」）。trim 后的纯文本。 */
  name: string
  /** 子版块链接，discuz 伪静态（forum-{fid}-1.html）。无 href → '#'。 */
  href: string
  /** 图标 src 原始值（相对/绝对均可，由编排层绝对化+白名单），无 → null。 */
  iconSrc: string | null
  /** 是否有新帖（forum_new.gif 二态图标）。 */
  hasNew: boolean
  /** 今日新增数（括号内数字），无 → null。 */
  todayCount: number | null
  /** 主题数（"主题: 1万" 形态），无 → null。 */
  threadsCount: string | null
  /** 帖数（"帖数: 247万" 形态），无 → null。 */
  postsCount: string | null
  /** 最后发表文本（如「1 小时前」「从未」「链接到外部地址」），无 → null。 */
  lastPostLabel: string | null
}

export interface SehuatangCategory {
  /** 分区 id（如 'category_1'），DOM 标记。 */
  id: string
  /** 分区名（如「原创BT电影」）。标题缺失时兜底为 id。 */
  title: string
  /** 分区下子版块列表（按 DOM 顺序）。 */
  forums: SehuatangSubForum[]
}

/**
 * 首页统计摘要（`.chart z em` 段）。
 * 今日 / 昨日 / 帖子 / 会员 —— 站点级别的元数据，渲染在 overlay 头部。
 */
export interface SehuatangIndexStats {
  today: string
  yesterday: string
  posts: string
  members: string
}

const TODAY_COUNT_RE = /\((\d+)\)/

/** 有新帖图标（Discuz 二态：forum.gif 无新 / forum_new.gif 有新）。 */
const FORUM_NEW_ICON_RE = /forum_new\.gif/i

/**
 * 解析单格 fl_g → 子版块。
 * 缺 dt > a → 跳过（非有效版块，如空白占位）。
 */
function parseSubForum(td: Element): SehuatangSubForum | null {
  const link = td.querySelector('dt a') as HTMLAnchorElement | null
  if (!link) return null
  const rawName = (link.textContent ?? '').trim()
  if (!rawName) return null

  // 图标（一次解出 src 与二态，编排层零 DOM 重扫）。
  const iconImg = td.querySelector('.fl_icn_g img') as HTMLImageElement | null
  const iconSrc = iconImg?.getAttribute('src') || null
  const hasNew = iconSrc !== null && FORUM_NEW_ICON_RE.test(iconSrc)

  // 今日新增：dt 内 a 后跟随的 em.xw0.xi1
  const emToday = td.querySelector('dt em')
  let todayCount: number | null = null
  if (emToday) {
    const m = TODAY_COUNT_RE.exec(emToday.textContent ?? '')
    if (m) todayCount = parseInt(m[1]!, 10)
  }

  // 主题数 / 帖数：第一个 dd 里的两个 em
  const firstDd = td.querySelector('dd')
  let threadsCount: string | null = null
  let postsCount: string | null = null
  if (firstDd) {
    for (const em of Array.from(firstDd.querySelectorAll('em'))) {
      const text = (em.textContent ?? '').trim()
      if (text.startsWith('主题')) {
        // "主题: 1万" / "主题: 77869" —— 取冒号后整段
        threadsCount = text.replace(/^主题[:：]\s*/, '').trim() || null
      } else if (text.startsWith('帖数')) {
        postsCount = text.replace(/^帖数[:：]\s*/, '').trim() || null
      }
    }
  }

  // 最后发表：第二个 dd（可能含 a，文本是整段混合）。
  // 外链版块（如「鲍鱼直播盒子」）只有单个 dd，Discuz 文本为「链接到外部
  // 地址」——透传原文（与原页一致），避免误显示「从未」。
  const ddList = td.querySelectorAll('dd')
  let lastPostLabel: string | null = null
  if (ddList.length >= 2) {
    const text = (ddList[ddList.length - 1]?.textContent ?? '').trim()
    if (text) lastPostLabel = text.replace(/\s+/g, ' ')
  } else if (ddList.length === 1) {
    const text = (ddList[0]?.textContent ?? '').replace(/\s+/g, ' ').trim()
    // 防 DOM 漂移：单 dd 若是「主题/帖数」结构（未按预期拆分）则不透传。
    if (text && !text.startsWith('主题') && !text.startsWith('帖数')) {
      lastPostLabel = text
    }
  }

  return {
    name: rawName,
    href: link.getAttribute('href') ?? '#',
    iconSrc,
    hasNew,
    todayCount,
    threadsCount,
    postsCount,
    lastPostLabel,
  }
}

/**
 * 提取首页所有分区。
 * DOM 守卫：必须存在至少一个 `[id^="category_"]` 容器，否则返回 []（由
 * 编排层决定 dismiss overlay）。
 */
export function extractIndexCategories(): SehuatangCategory[] {
  const categoryEls = Array.from(document.querySelectorAll('[id^="category_"]'))
    // 排除 `category_94_img`（img 元素的 id 也以 category_ 开头）。
    .filter((el) => el.tagName === 'DIV' && el.classList.contains('bm_c'))
  if (categoryEls.length === 0) return []

  const out: SehuatangCategory[] = []
  for (const container of categoryEls) {
    const id = container.id
    // 标题 = 同一 `.bm bm-*` 块（容器父级）内、容器之前的 `<h2><span>`。
    // 标题缺失 → 以分区 id 兜底（不静默丢弃整个分区）。
    const parent = container.parentElement
    const heading = parent?.querySelector('h2')
    const titleSpan = heading?.querySelector('span')
    const title = (titleSpan?.textContent ?? heading?.textContent ?? '').trim() || id

    // 子版块 = container 内全部 fl_g
    const cells = Array.from(container.querySelectorAll('td.fl_g'))
    const forums: SehuatangSubForum[] = []
    for (const td of cells) {
      const forum = parseSubForum(td)
      if (forum) forums.push(forum)
    }
    if (forums.length === 0) continue
    out.push({ id, title, forums })
  }
  return out
}

/**
 * 提取首页统计摘要（#chart .chart z em 段）。
 * 元素缺一 → 整段返回 null（编排层据此决定不显示统计行）。
 */
export function extractIndexStats(): SehuatangIndexStats | null {
  const chart = document.querySelector('#chart .chart')
  if (!chart) return null
  const ems = Array.from(chart.querySelectorAll('em'))
  if (ems.length < 4) return null
  const values = ems.slice(0, 4).map((em) => (em.textContent ?? '').trim())
  if (values.some((v) => !v)) return null
  return {
    today: values[0]!,
    yesterday: values[1]!,
    posts: values[2]!,
    members: values[3]!,
  }
}
