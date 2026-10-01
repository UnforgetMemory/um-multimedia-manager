import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import {
  withDimBatch,
  mountSehuatangControls,
  buildPager,
  buildFloatbar,
  paintSehuatangBackground,
  type PaginationData,
} from '@/entrypoints/content/handlers/sehuatang-controls';
import { BASE_URL, PAGE1_PG } from './sehuatang-controls-fixtures';

/**
 * 色花堂 forumdisplay 控件重建（sehuatang-controls）单元测试——编排与首帧背景。
 *
 * 本 spec 按测试组拆分（>600 行门禁），其余组在同名前缀兄弟文件：
 *   - sehuatang-controls-extract.spec.ts — 提取层（面包屑/选项卡/分页数据）
 *   - sehuatang-controls-build.spec.ts   — 构建器层（数据 → UI 元素/搜索）
 *   - sehuatang-controls-mark.spec.ts    — 「已看标记与淡化」状态层
 *   - sehuatang-controls-menu.spec.ts    — ☰ 居中菜单对话框
 *   - sehuatang-controls-fixtures.ts     — 共享 Discuz 分页夹具
 *
 * 夹具结构来自 .localref/高清中文字幕 - 98堂[原色花堂] - Powered by Discuz!.html
 * （#pt .z 面包屑、#pgt/#fd_page_top 分页、#thread_types 选项卡、
 * #fd_page_bottom 底部分页、#newspecial 发新帖），仅做必要裁剪。
 */

test.describe('mountSehuatangControls 编排', () => {
  const FULL_HTML = `
    <div id="pt" class="bm cl"><div class="z">
      <a href="https://www.sehuatang.net/" class="nvhm" title="首页">98堂[原色花堂]</a><em>»</em>
      <a href="https://www.sehuatang.net/forum.php">论坛</a> <em>›</em>
      <a href="https://www.sehuatang.net/forum.php?gid=1">原创BT电影</a><em>›</em>
      <a href="https://www.sehuatang.net/forum-103-1.html">高清中文字幕</a></div>
    </div>
    <div id="pgt" class="bm bw0 pgs cl">
      <span id="fd_page_top">${PAGE1_PG}</span>
      <span class="pgb y" id="visitedforums"><a href="https://www.sehuatang.net/forum.php">返&nbsp;回</a></span>
      <a href="javascript:;" id="newspecial" title="发新帖"><img src="pn_post.png" alt="发新帖"></a>
    </div>
    <ul id="thread_types" class="ttp bm cl">
      <li id="ttp_all" class="xw1 a"><a href="https://www.sehuatang.net/forum-103-1.html">全部</a></li>
      <li><a href="https://www.sehuatang.net/forum.php?mod=forumdisplay&amp;fid=103&amp;filter=typeid&amp;typeid=480">有码高清<span class="xg1 num">37534</span></a></li>
      <li><a href="https://www.sehuatang.net/forum.php?mod=forumdisplay&amp;fid=103&amp;filter=typeid&amp;typeid=481">无码高清<span class="xg1 num">7301</span></a></li>
    </ul>
    <div id="threadlisttableid"><table><tbody><tr><td>x</td></tr></tbody></table></div>
    <div class="bm bw0 pgs cl">
      <span id="fd_page_bottom">${PAGE1_PG}</span>
      <span id="visitedforumstmp" class="pgb y"><a href="https://www.sehuatang.net/forum.php">返&nbsp;回</a></span>
      <a href="javascript:;" id="newspecialtmp" title="发新帖"><img src="pn_post.png" alt="发新帖"></a>
    </div>
    <div id="hdr" class="umm-sehuatang-header">
      <div class="umm-header-info">info</div>
      <div class="umm-sht-center"><a class="umm-sht-action umm-sht-home-btn" href="forum.php">🏠</a><button class="umm-sht-action">☰</button></div>
      <div><button class="umm-copy-btn">copy</button></div>
    </div>`;

  function mountedDom(html: string = FULL_HTML) {
    const dom = new JSDOM(`<body>${html}</body>`, { url: BASE_URL });
    const header = dom.window.document.getElementById('hdr') as HTMLElement;
    return { dom, header };
  }

  test('原版元素全部隐藏；双行 header 结构（上下文行 + 导航行）；顶部居中簇；底部灵动岛齐备', () => {
    const { dom, header } = mountedDom();
    mountSehuatangControls(dom.window.document, header);
    const doc = dom.window.document;

    for (const sel of ['#pt', '#thread_types', '#pgt']) {
      expect((doc.querySelector(sel) as HTMLElement).style.display).toBe('none');
    }
    const bottomPgs = doc.getElementById('fd_page_bottom')!.closest('.pgs') as HTMLElement;
    expect(bottomPgs.style.display).toBe('none');

    // 双行结构：上行 = 面包屑 + 居中簇 + 统计信息（三列）；下行 = 选项卡 + 操作组。
    const rows = Array.from(header.children);
    expect(rows).toHaveLength(2);
    const rowContext = rows[0] as HTMLElement;
    const rowNav = rows[1] as HTMLElement;
    expect(rowContext.className).toContain('umm-sht-row--context');
    expect(rowContext.querySelector('.umm-sht-breadcrumb')).not.toBeNull();
    expect(rowContext.querySelector('.umm-header-info')).not.toBeNull();
    // 中列 = 顶部居中簇（🏠 首页 + ☰ 菜单，从 actions 中拆出）
    const center = rowContext.querySelector('.umm-sht-center') as HTMLElement;
    expect(center).not.toBeNull();
    expect(Array.from(center.children).map((n) => n.textContent)).toEqual(['🏠', '☰']);
    expect(rowNav.className).toContain('umm-sht-row--nav');
    expect(rowNav.querySelector('.umm-sht-tabs')).not.toBeNull();
    expect(header.querySelectorAll('a.umm-sht-action')).toHaveLength(2); // 返回 + 🏠
    // 按钮 = 发新帖 + ☰（搜索框在岛内；🏠 为链接不计入）
    expect(header.querySelectorAll('button.umm-sht-action')).toHaveLength(2);
    // 操作组 = 返回 / 发新帖 / 复制磁力（☰ 已上移居中簇，不再殿后）。
    const navActions = header.querySelector('.umm-sht-row--nav')!.lastElementChild!;
    const actionNodes = Array.from(navActions.children);
    expect(actionNodes.map((n) => (n as HTMLElement).className)).toEqual([
      'umm-sht-action',
      'umm-sht-action',
      'umm-copy-btn',
    ]);

    // 底部灵动岛（buildFloatbar 统一合成 + 摩天轮轮替）：有分页 → 默认展示
    // 分页舱（策略性优先），搜索舱悬于上方待轮替，⇅ 一键切换。
    const pill = doc.getElementById('umm-sht-floatbar')!;
    expect(pill.querySelector('.umm-sht-pager')).not.toBeNull();
    expect(pill.querySelector('.umm-sht-searchbox')).not.toBeNull();
    expect(pill.querySelector('.umm-sht-island-stage')).not.toBeNull();
    expect(pill.querySelector('.umm-sht-pager')!.getAttribute('data-umm-slot')).toBe('active');
    expect(pill.querySelector('.umm-sht-searchbox')!.getAttribute('data-umm-slot')).toBe(
      'hidden-up',
    );
    expect(pill.querySelector('.umm-sht-island-switch')).not.toBeNull();
    expect(pill.querySelectorAll('.umm-sht-action')).toHaveLength(1); // 仅 🔍（搜索舱内）
    expect(pill.querySelector('a.umm-sht-action')).toBeNull();
  });

  test('发新帖按钮 → 原版元素 click()（触发站点 showWindow 的接线点）', () => {
    const { dom, header } = mountedDom();
    mountSehuatangControls(dom.window.document, header);
    const doc = dom.window.document;
    let clicked = false;
    (doc.getElementById('newspecial') as HTMLElement).click = () => {
      clicked = true;
    };
    // 搜索框已移岛，header 按钮序为 [发新帖, ☰]——仍按文案精确选取（结构漂移防御）。
    const postBtn = Array.from(header.querySelectorAll('button.umm-sht-action')).find(
      (b) => b.textContent === '发新帖',
    ) as HTMLButtonElement;
    postBtn.click();
    expect(clicked).toBe(true);
  });

  test('守卫：无 #thread_types → 完全 no-op（详情/搜索页不注入）', () => {
    const html = `<div id="pt"><div class="z"><a href="https://www.sehuatang.net/forum.php">论坛</a></div></div><div id="hdr"><div></div><div></div></div>`;
    const { dom, header } = mountedDom(html);
    mountSehuatangControls(dom.window.document, header);
    const doc = dom.window.document;
    expect(header.getAttribute('data-umm-sht-mounted')).toBeNull();
    expect(doc.getElementById('umm-sht-floatbar')).toBeNull();
    expect((doc.querySelector('#pt') as HTMLElement).style.display).toBe('');
  });

  test('岛内摩天轮轮替：⇅ 点击 → 搜索舱升起为 active、分页舱沉为 hidden-down（可反向切回）', () => {
    const { dom, header } = mountedDom();
    mountSehuatangControls(dom.window.document, header);
    const pill = dom.window.document.getElementById('umm-sht-floatbar')!;
    const switchBtn = pill.querySelector('.umm-sht-island-switch') as HTMLButtonElement;

    switchBtn.click();
    expect(pill.querySelector('.umm-sht-searchbox')!.getAttribute('data-umm-slot')).toBe('active');
    expect(pill.querySelector('.umm-sht-pager')!.getAttribute('data-umm-slot')).toBe('hidden-down');
    // 隐藏舱同时 aria-hidden（不可见即不可达：读屏/键盘不进隐藏舱）
    expect(pill.querySelector('.umm-sht-searchbox')!.getAttribute('aria-hidden')).toBe('false');
    expect(pill.querySelector('.umm-sht-pager')!.getAttribute('aria-hidden')).toBe('true');

    switchBtn.click();
    expect(pill.querySelector('.umm-sht-pager')!.getAttribute('data-umm-slot')).toBe('active');
    expect(pill.querySelector('.umm-sht-searchbox')!.getAttribute('data-umm-slot')).toBe(
      'hidden-up',
    );
    expect(pill.querySelector('.umm-sht-pager')!.getAttribute('aria-hidden')).toBe('false');
    expect(pill.querySelector('.umm-sht-searchbox')!.getAttribute('aria-hidden')).toBe('true');
  });

  test('buildFloatbar：仅搜索/仅分页 → 无舞台无轮替控件；全空 → null；不可切换时 show no-op', () => {
    const dom = new JSDOM('<body></body>', { url: BASE_URL });
    const doc = dom.window.document;
    expect(buildFloatbar(doc)).toBeNull();

    const onlySearch = buildFloatbar(doc, { search: true })!;
    expect(onlySearch.mode).toBe('search');
    expect(onlySearch.pill.querySelector('.umm-sht-island-stage')).toBeNull();
    expect(onlySearch.pill.querySelector('.umm-sht-island-switch')).toBeNull();
    expect(onlySearch.pill.querySelector('.umm-sht-searchbox')).not.toBeNull();

    const pagerData: PaginationData = {
      current: 1,
      total: 3,
      prevHref: '',
      nextHref: '',
      pages: [],
      jumpTemplate: '',
    };
    const onlyPager = buildFloatbar(doc, { pager: buildPager(doc, pagerData) })!;
    expect(onlyPager.mode).toBe('pager');
    expect(onlyPager.pill.querySelector('.umm-sht-island-stage')).toBeNull();
    onlyPager.show('search');
    expect(onlyPager.mode).toBe('pager'); // 不可切换时 no-op
  });

  test('withDimBatch：批量期间挂免过渡类（rAF 后撤销）；嵌套调用只排一次撤销', () => {
    const dom = new JSDOM('<body><div class="umm-preview-grid"></div></body>', { url: BASE_URL });
    const grid = dom.window.document.querySelector('.umm-preview-grid') as HTMLElement;
    const g = globalThis as unknown as { requestAnimationFrame?: unknown };
    const saved = g.requestAnimationFrame;
    const callbacks: Array<() => void> = [];
    g.requestAnimationFrame = (cb: () => void) => {
      callbacks.push(cb);
      return callbacks.length;
    };
    try {
      let classNameInside = '';
      withDimBatch(grid, () => {
        classNameInside = grid.className;
      });
      // 批量期间（含 apply 内）已挂免过渡类；rAF 前仍在
      expect(classNameInside).toContain('umm-sht-dim-batch');
      expect(grid.classList.contains('umm-sht-dim-batch')).toBe(true);
      expect(callbacks).toHaveLength(1);
      // 嵌套：内层不重复挂类、不重复排撤销
      withDimBatch(grid, () => {});
      expect(callbacks).toHaveLength(1);
      callbacks.forEach((cb) => cb());
      expect(grid.classList.contains('umm-sht-dim-batch')).toBe(false);
    } finally {
      if (saved === undefined) delete g.requestAnimationFrame;
      else g.requestAnimationFrame = saved;
    }
  });

  test('幂等：重复调用不重复挂载（header 标志位 + 悬浮栏单例）', () => {
    const { dom, header } = mountedDom();
    mountSehuatangControls(dom.window.document, header);
    mountSehuatangControls(dom.window.document, header);
    const doc = dom.window.document;
    expect(header.getAttribute('data-umm-sht-mounted')).toBe('1');
    expect(header.children).toHaveLength(2);
    expect(header.querySelectorAll('.umm-sht-row--context')).toHaveLength(1);
    expect(header.querySelectorAll('.umm-sht-row--nav')).toHaveLength(1);
    expect(doc.querySelectorAll('#umm-sht-floatbar')).toHaveLength(1);
  });
});

test.describe('paintSehuatangBackground — 首帧背景预载', () => {
  test('dark：注入 style 元素，html,body 双覆盖 + 暗面表面色', () => {
    const dom = new JSDOM('<body><p>x</p></body>', { url: BASE_URL });
    paintSehuatangBackground(dom.window.document, 'dark');
    const style = dom.window.document.getElementById('umm-sht-early-bg') as HTMLStyleElement;
    expect(style).not.toBeNull();
    expect(style.textContent).toContain('html, body');
    expect(style.textContent).toContain('#1c1c1e');
    expect(style.textContent).toContain('!important');
  });

  test('light：亮面表面色', () => {
    const dom = new JSDOM('<body></body>', { url: BASE_URL });
    paintSehuatangBackground(dom.window.document, 'light');
    expect(dom.window.document.getElementById('umm-sht-early-bg')!.textContent).toContain(
      '#f7f9fc',
    );
  });

  test('幂等：重复调用更新同一 style 元素（不产生第二个）', () => {
    const dom = new JSDOM('<body></body>', { url: BASE_URL });
    paintSehuatangBackground(dom.window.document, 'dark');
    paintSehuatangBackground(dom.window.document, 'light');
    const styles = dom.window.document.querySelectorAll('#umm-sht-early-bg');
    expect(styles).toHaveLength(1);
    expect(styles[0]!.textContent).toContain('#f7f9fc');
    expect(styles[0]!.textContent).not.toContain('#1c1c1e');
  });
});
