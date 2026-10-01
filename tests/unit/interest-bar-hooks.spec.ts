import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';

/**
 * UmmInterestBar 交互契约单元测试（组件级，不依赖任何页面）。组件是纯 props 驱动 +
 * 单个 `save` 出口，自身不碰 IndexedDB / chrome 消息，故无需任何 seam：挂真组件、点
 * 真按钮、断真 DOM 与真 emit 载荷。13 个用户可触发绑定全覆盖：:171 触发、:193/:208/
 * :223 页签、:241 星级、:266 建议 chip、:286 移除、:304 输入 Enter、:319 添加、:356
 * 保存、:365 取消、:374 遮罩、:393 ✕、:88 document 捕获期 keydown。
 * 与 douban-mark-dialog-a11y.spec.ts 分工：那边钉「语义属性存在」与「✕/取消/Escape 关
 * 闭 + 焦点归还 + 边界 Tab」；这边钉另一半——关闭路径零 emit、保存载荷与重入守卫、标
 * 签集合语义、捕获阶段先于宿主监听、监听器卸载释放、aria-labelledby 多实例不冲突、各
 * 页签/props 对应的评分行存在性。不重复、不矛盾。
 *
 * 断言纪律：`t()` 文案与星级标签键（RATING_KEYS）只是复制品，契约住在 douban-mark-dialog-a11y
 * （键↔位置配对 + 随语言解析）与 x105-use-interest-errors（错误分支）；本文件只断类名/索引/
 * 数量/存在性/焦点落点/emit 载荷，需要「标签有内容」时只断非空 + 不同选择给出不同字符串。
 * jsdom 全局先于 'vue' 首次 import（runtime-dom 在模块初始化期捕获 document），故两者都动态 import。
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://movie.douban.com/',
  pretendToBeVisual: true,
});

defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);

const doc = dom.window.document;

/** 与组件内 FOCUSABLE_SELECTOR（:20）同一基准，用于按 DOM 序推导面板焦点边界。 */
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type BarTab = 'wish' | 'do' | 'collect';
type BarType = 'movie' | 'music' | 'book' | 'game';
type BarComponent =
  (typeof import('@/scenario/douban/components/umm-interest-bar'))['UmmInterestBar'];

interface BarProps {
  status: number;
  rating: number;
  myTags: string[];
  savedTags: string[];
  hasDo: boolean;
  comment: string;
  loading: boolean;
  error: string;
  type: BarType;
}

type SaveCall = { tab: BarTab; stars: number; tags: string; comment: string };

/** root=该实例的 .umm-interest-bar；saves=组件自身 emit 的记录；patch=改 props。 */
interface Bar {
  root: HTMLElement;
  saves: SaveCall[];
  patch(changes: Partial<BarProps>): Promise<void>;
  open(): Promise<void>;
  unmount(): void;
}

type Deps = { vue: typeof import('vue'); UmmInterestBar: BarComponent };
let deps: Promise<Deps> | null = null;
const loadDeps = (): Promise<Deps> =>
  (deps ??= Promise.all([
    import('vue'),
    import('@/scenario/douban/components/umm-interest-bar'),
  ]).then(([vue, bar]) => ({ vue, UmmInterestBar: bar.UmmInterestBar })));

const live: Bar[] = [];

async function mountMany(count: number, overrides: Partial<BarProps> = {}): Promise<Bar[]> {
  const { vue, UmmInterestBar } = await loadDeps();
  const state = vue.reactive<BarProps>({
    status: 0,
    rating: 0,
    myTags: [],
    savedTags: [],
    hasDo: false,
    comment: '',
    loading: false,
    error: '',
    type: 'movie',
    ...overrides,
  });
  const savesByIndex: SaveCall[][] = Array.from({ length: count }, () => []);
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  const app = vue.createApp({
    render: () =>
      vue.h(
        'div',
        { class: 'bar-host' },
        Array.from({ length: count }, (_unused, index) =>
          vue.h(UmmInterestBar, {
            key: index,
            status: state.status,
            rating: state.rating,
            myTags: state.myTags,
            savedTags: state.savedTags,
            hasDo: state.hasDo,
            comment: state.comment,
            loading: state.loading,
            error: state.error,
            type: state.type,
            onSave: (...args: unknown[]) => {
              const [tab, stars, tags, comment] = args as [BarTab, number, string, string];
              savesByIndex[index]!.push({ tab, stars, tags, comment });
            },
          }),
        ),
      ),
  });
  app.mount(container);
  const roots = Array.from(container.querySelectorAll<HTMLElement>('.umm-interest-bar'));
  if (roots.length !== count) throw new Error(`expected ${count} bars, got ${roots.length}`);
  let detached = false;
  const bars: Bar[] = [];
  const detach = () => {
    if (detached) return;
    detached = true;
    app.unmount();
    container.remove();
    for (const bar of bars) {
      const at = live.indexOf(bar);
      if (at >= 0) live.splice(at, 1);
    }
  };
  roots.forEach((root, index) => {
    bars.push({
      root,
      saves: savesByIndex[index]!,
      patch: async (changes) => {
        Object.assign(state, changes);
        await vue.nextTick();
      },
      open: async () => {
        q(root, '.umm-mark-btn').click();
        await flush();
      },
      unmount: detach,
    });
  });
  live.push(...bars);
  return bars;
}

const mountBar = async (overrides: Partial<BarProps> = {}): Promise<Bar> =>
  (await mountMany(1, overrides))[0]!;

/** 渲染 flush + watch(open) 内 nextTick 的微任务全部走完。 */
const flush = (): Promise<void> => new Promise((resolve) => dom.window.setTimeout(resolve, 0));

function q<E extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): E {
  const el = root.querySelector<E>(selector);
  if (!el) throw new Error(`fixture element missing: ${selector}`);
  return el;
}

function qa<E extends Element = HTMLElement>(root: ParentNode, selector: string): E[] {
  return Array.from(root.querySelectorAll<E>(selector));
}

function attr(el: Element, name: string): string {
  const value = el.getAttribute(name);
  if (!value) throw new Error(`attribute missing: ${name}`);
  return value;
}

const text = (el: Element): string => el.textContent ?? '';

/** 状态序列：断言用类名而非文案（:16 词表与 t() 都不是契约）。 */
const flags = (root: ParentNode, base: string, active: string): boolean[] =>
  qa(root, base).map((el) => el.classList.contains(active));

function pressKey(target: EventTarget, key: string, shift = false): KeyboardEvent {
  const init: KeyboardEventInit = { key, bubbles: true, cancelable: true, shiftKey: shift };
  const event = new dom.window.KeyboardEvent('keydown', init);
  target.dispatchEvent(event);
  return event;
}

/** 模拟用户打字：jsdom 不会因赋值 `.value` 自发 input，必须显式派发事件。 */
function simulateText(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

const panel = (bar: Bar) => q(bar.root, '.umm-dialog-panel');
const picks = (bar: Bar) => qa(bar.root, '.umm-dialog-pick');
const starButtons = (bar: Bar) => qa(bar.root, '.umm-star');
const activePickIndex = (bar: Bar) =>
  flags(bar.root, '.umm-dialog-pick', 'umm-dialog-pick--active').indexOf(true);
const starFlags = (bar: Bar) => flags(bar.root, '.umm-star', 'umm-star--filled');
const filledStars = (bar: Bar) => starFlags(bar).filter(Boolean).length;
const starLabel = (bar: Bar) => text(q(bar.root, '.umm-star-label'));
const selectedTagTexts = (bar: Bar) =>
  qa(bar.root, '.umm-tag-selected').map((el) => text(el.firstElementChild ?? el));
const suggestChips = (bar: Bar) => qa(bar.root, '.umm-tag-chip');
const chipFlags = (bar: Bar) => flags(bar.root, '.umm-tag-chip', 'umm-tag-chip--active');
const saveButton = (bar: Bar) => q<HTMLButtonElement>(bar.root, '.umm-dialog-save');
const cancelButton = (bar: Bar) => q<HTMLButtonElement>(bar.root, '.umm-dialog-cancel');
const commentBox = (bar: Bar) => q<HTMLTextAreaElement>(bar.root, '.umm-dialog-textarea');
/**
 * `.umm-dialog-tags` 的子数组无 key，选中列表一出现就把输入区推到新索引 → 输入框与添
 * 加按钮被 diff 重建（见「输入框 Enter」用例的节点身份断言）。故一律现查现用。
 */
const tagInput = (bar: Bar) => q<HTMLInputElement>(bar.root, '.umm-dialog-input');
const addTagButton = (bar: Bar) => q<HTMLButtonElement>(bar.root, '.umm-tag-add-btn');

test.afterEach(() => {
  // 活体注册表兜底卸载：断言抛错时也不会把 document 监听器/节点漏给后续用例。
  for (const bar of [...live]) bar.unmount();
});

test.describe('触发与对话框语义（:171）', () => {
  test('触发按钮 → 面板出现；aria-labelledby 解析到面板内唯一有内容元素；初始焦点落面板首个可聚焦控件', async () => {
    const bar = await mountBar({ status: 2, rating: 4, hasDo: true });
    expect(bar.root.querySelector('.umm-dialog-panel')).toBeNull();
    await bar.open();

    const box = panel(bar);
    expect(box.getAttribute('role')).toBe('dialog');
    expect(box.getAttribute('aria-modal')).toBe('true');
    const resolved = doc.querySelectorAll(`[id="${attr(box, 'aria-labelledby')}"]`);
    expect(resolved).toHaveLength(1);
    expect(box.contains(resolved[0]!)).toBe(true);
    expect(text(resolved[0]!).length).toBeGreaterThan(0);
    // 焦点落点由面板自己暴露的可聚焦序列推导（控件身份由 a11y spec 钉）
    expect(doc.activeElement).toBe(qa(box, FOCUSABLE)[0]!);
  });

  test('同一应用内两个实例同时打开 → aria-labelledby 互不相同且各指自己的标题', async () => {
    const [left, right] = await mountMany(2, { status: 2 });
    await left!.open();
    await right!.open();
    const idA = attr(panel(left!), 'aria-labelledby');
    const idB = attr(panel(right!), 'aria-labelledby');
    expect(idA).not.toBe(idB);
    expect(doc.querySelectorAll(`[id="${idA}"]`)).toHaveLength(1);
    expect(panel(left!).contains(q(doc, `[id="${idA}"]`))).toBe(true);
    expect(panel(right!).contains(q(doc, `[id="${idB}"]`))).toBe(true);
  });

  test('loading=true → 触发按钮 disabled；强制派发 click（绕过 disabled 抑制）也不打开面板', async () => {
    const bar = await mountBar({ status: 2, loading: true });
    const trigger = q<HTMLButtonElement>(bar.root, '.umm-mark-btn');
    expect(trigger.disabled).toBe(true);
    trigger.click();
    await flush();
    expect(bar.root.querySelector('.umm-dialog-panel')).toBeNull();
    trigger.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await flush();
    expect(bar.root.querySelector('.umm-dialog-panel')).toBeNull();
    expect(bar.saves).toHaveLength(0);
  });

  test('折叠态由 props 派生：status>0 → 激活类；status∈{2,3} 且 rating>0 → 分数行；type 决定词族', async () => {
    const bar = await mountBar({ status: 2, rating: 4 });
    expect(flags(bar.root, '.umm-mark-btn', 'umm-mark-btn--active')).toEqual([true]);
    expect(text(q(bar.root, '.umm-mark-score-num'))).toBe('8');
    await bar.patch({ status: 1 }); // wish 不显示分数
    expect(bar.root.querySelector('.umm-mark-score')).toBeNull();
    await bar.patch({ status: 3, rating: 0 }); // 在看但没评分
    expect(bar.root.querySelector('.umm-mark-score')).toBeNull();
    await bar.patch({ rating: 3 });
    expect(qa(bar.root, '.umm-mark-score')).toHaveLength(1);
    await bar.patch({ status: 0, rating: 4 });
    expect(bar.root.querySelector('.umm-mark-score')).toBeNull();
    expect(flags(bar.root, '.umm-mark-btn', 'umm-mark-btn--active')).toEqual([false]);

    await bar.patch({ status: 2 }); // 词族：只断四个 type 两两不同且非空，不钉字面量
    const labels = new Set<string>();
    for (const type of ['movie', 'music', 'book', 'game'] as const) {
      await bar.patch({ type });
      const label = text(q(bar.root, '.umm-mark-btn'));
      expect(label.length).toBeGreaterThan(0);
      labels.add(label);
    }
    expect(labels.size).toBe(4);
  });
});

test.describe('页签与评分行（:193 :208 :223）', () => {
  test('wish 无评分行 / collect 恰有 5 颗星：页签切换即评分行开关', async () => {
    const bar = await mountBar({ status: 1, hasDo: false });
    await bar.open();
    expect(picks(bar)).toHaveLength(2); // hasDo=false → 只剩 wish / collect
    expect(activePickIndex(bar)).toBe(0); // status=1 播种 wish
    expect(bar.root.querySelector('.umm-dialog-stars')).toBeNull();

    picks(bar)[1]!.click(); // collect
    await flush();
    expect(activePickIndex(bar)).toBe(1);
    expect(qa(bar.root, '.umm-dialog-stars')).toHaveLength(1);
    expect(starButtons(bar)).toHaveLength(5);
    picks(bar)[0]!.click(); // 回 wish
    await flush();
    expect(activePickIndex(bar)).toBe(0);
    expect(bar.root.querySelector('.umm-dialog-stars')).toBeNull();
  });

  test('do 页签仅在 hasDo 时渲染；status=3 播种 tab=do → 评分行照出、保存照发 do', async () => {
    const withoutDo = await mountBar({ status: 3, hasDo: false, rating: 3 });
    await withoutDo.open();
    expect(picks(withoutDo)).toHaveLength(2);
    // 播种的 tab 是 do，但面板里没有控件复现它 → 无 --active 页签，评分行仍按 tab
    // 出、保存照发 do。记录真实行为，不粉饰成「有选中」。
    expect(withoutDo.root.querySelector('.umm-dialog-pick--active')).toBeNull();
    expect(starButtons(withoutDo)).toHaveLength(5);
    saveButton(withoutDo).click();
    await flush();
    expect(withoutDo.saves).toEqual([{ tab: 'do', stars: 3, tags: '', comment: '' }]);
    const withDo = await mountBar({ status: 0, hasDo: true });
    await withDo.open();
    expect(picks(withDo)).toHaveLength(3);
    expect(activePickIndex(withDo)).toBe(-1); // status=0 → 无页签
    expect(withDo.root.querySelector('.umm-dialog-stars')).toBeNull();
    expect(saveButton(withDo).disabled).toBe(true);
    picks(withDo)[1]!.click(); // do
    await flush();
    expect(activePickIndex(withDo)).toBe(1);
    expect(starButtons(withDo)).toHaveLength(5);
  });

  test('星级点击：填充是点击序号的前缀；标签非空且六个状态两两不同；重复点同一颗不清空', async () => {
    const bar = await mountBar({ status: 2 });
    await bar.open();
    const seen = [starLabel(bar)];
    expect(filledStars(bar)).toBe(0);
    for (let i = 1; i <= 5; i++) {
      starButtons(bar)[i - 1]!.click();
      await flush();
      expect(starFlags(bar)).toEqual(Array.from({ length: 5 }, (_unused, index) => index < i));
      seen.push(starLabel(bar));
    }
    expect(starButtons(bar)).toHaveLength(5); // 没有第 6/10 个半点控件
    starButtons(bar)[4]!.click(); // 再点最后一颗
    await flush();
    expect(filledStars(bar)).toBe(5); // 代码无「再点清除」语义，也不支持半点
    starButtons(bar)[1]!.click(); // 降序点击
    await flush();
    expect(filledStars(bar)).toBe(2);

    expect(seen.every((label) => label.length > 0)).toBe(true);
    expect(new Set(seen).size).toBe(6);
  });
});

test.describe('标签集合（:266 :286 :304 :319）', () => {
  test('建议 chip 点击切换选中：chip 与选中列表同步增删，选中集按点选顺序累积', async () => {
    const bar = await mountBar({ status: 1, myTags: ['m1', 'm2'] });
    await bar.open();
    expect(chipFlags(bar)).toEqual([false, false]);
    expect(selectedTagTexts(bar)).toEqual([]);
    expect(bar.root.querySelector('.umm-tag-list')).toBeNull();

    suggestChips(bar)[0]!.click();
    await flush();
    expect(chipFlags(bar)).toEqual([true, false]);
    expect(selectedTagTexts(bar)).toEqual(['m1']);
    suggestChips(bar)[0]!.click(); // 再点取消
    await flush();
    expect(chipFlags(bar)).toEqual([false, false]);
    expect(bar.root.querySelector('.umm-tag-list')).toBeNull();

    suggestChips(bar)[1]!.click();
    suggestChips(bar)[0]!.click();
    await flush();
    expect(chipFlags(bar)).toEqual([true, true]);
    expect(selectedTagTexts(bar)).toEqual(['m2', 'm1']); // 选中集按点选顺序累积
  });

  test('输入框 Enter 与添加按钮都追加标签；空输入按钮 disabled；追加后输入框清空且值被 trim', async () => {
    const bar = await mountBar({ status: 1 });
    await bar.open();
    const inputBefore = tagInput(bar);
    const buttonBefore = addTagButton(bar);

    expect(addTagButton(bar).disabled).toBe(true);
    addTagButton(bar).click();
    await flush();
    expect(bar.root.querySelector('.umm-tag-list')).toBeNull();

    simulateText(inputBefore, '  tagZ  ');
    await flush();
    expect(addTagButton(bar).disabled).toBe(false);
    addTagButton(bar).click();
    await flush();
    expect(selectedTagTexts(bar)).toEqual(['tagZ']);
    expect(tagInput(bar).value).toBe(''); // 组件自清，不是写入值的回读
    expect(addTagButton(bar).disabled).toBe(true);
    // 无 key 子数组 + 索引 diff ⇒ 选中列表一出现就重建输入区，旧引用作废
    expect(tagInput(bar)).not.toBe(inputBefore);
    expect(addTagButton(bar)).not.toBe(buttonBefore);

    simulateText(tagInput(bar), 'tagY');
    await flush();
    expect(pressKey(tagInput(bar), 'Enter').defaultPrevented).toBe(true);
    await flush();
    expect(selectedTagTexts(bar)).toEqual(['tagZ', 'tagY']);
    saveButton(bar).click();
    await flush();
    expect(bar.saves[0]!.tags).toBe('tagZ tagY');
  });

  test('savedTags 在每次打开时即为选中；关闭再开会用 props 重新播种', async () => {
    const bar = await mountBar({ status: 1, myTags: ['m1', 'm2'], savedTags: ['s1', 's2'] });
    await bar.open();
    expect(selectedTagTexts(bar)).toEqual(['s1', 's2']);
    expect(chipFlags(bar)).toEqual([false, false]);

    cancelButton(bar).click();
    await flush();
    await bar.open();
    expect(selectedTagTexts(bar)).toEqual(['s1', 's2']);

    suggestChips(bar)[0]!.click(); // 临时加一个
    await flush();
    expect(selectedTagTexts(bar)).toEqual(['s1', 's2', 'm1']);
    await bar.patch({ savedTags: ['m2'] });
    cancelButton(bar).click(); // 临时改动不跨次打开存活
    await flush();
    await bar.open();
    expect(selectedTagTexts(bar)).toEqual(['m2']);
    expect(chipFlags(bar)).toEqual([false, true]);
  });

  test('移除按钮只去掉被点的那一项，被移除的标签不进 emit 载荷', async () => {
    const bar = await mountBar({ status: 1, savedTags: ['a', 'b'] });
    await bar.open();
    expect(selectedTagTexts(bar)).toEqual(['a', 'b']);

    q<HTMLButtonElement>(qa(bar.root, '.umm-tag-selected')[0]!, '.umm-tag-remove').click();
    await flush();
    expect(selectedTagTexts(bar)).toEqual(['b']);
    saveButton(bar).click();
    await flush();
    expect(bar.saves).toEqual([{ tab: 'wish', stars: 0, tags: 'b', comment: '' }]);
  });
});

test.describe('保存与重入（:356）', () => {
  test('保存 → 恰好一次 save：载荷含页签/星数/空格连接标签/trim 后评论，面板关闭且焦点归还触发按钮', async () => {
    const bar = await mountBar({
      status: 0,
      hasDo: true,
      myTags: ['m1'],
      savedTags: ['s1'],
      comment: '  hello  ',
    });
    await bar.open();
    expect(saveButton(bar).disabled).toBe(true); // 未选页签 → 不可保存
    saveButton(bar).click();
    await flush();
    expect(bar.saves).toHaveLength(0);

    picks(bar)[2]!.click(); // collect
    await flush();
    starButtons(bar)[2]!.click(); // 3 星
    await flush();
    suggestChips(bar)[0]!.click();
    await flush();
    simulateText(commentBox(bar), '  hello  ');
    await flush();
    saveButton(bar).click();
    await flush();
    expect(bar.saves).toEqual([{ tab: 'collect', stars: 3, tags: 's1 m1', comment: 'hello' }]);
    expect(bar.root.querySelector('.umm-dialog-panel')).toBeNull();
    expect(doc.activeElement).toBe(q(bar.root, '.umm-mark-btn'));
  });

  test('loading=true → 保存/取消/输入/评论全 disabled；强制派发 click 仍一次都不 emit（:141 守卫）', async () => {
    const bar = await mountBar({ status: 2 });
    await bar.open();
    expect(bar.saves).toHaveLength(0);

    await bar.patch({ loading: true });
    expect(saveButton(bar).disabled).toBe(true);
    expect(cancelButton(bar).disabled).toBe(true);
    expect(tagInput(bar).disabled).toBe(true);
    expect(commentBox(bar).disabled).toBe(true);
    saveButton(bar).click(); // jsdom 与真实浏览器一样抑制 disabled 上的 click()
    for (let i = 0; i < 2; i++) {
      // 绕过抑制直接派发：重入必须被 handler 自身的 loading 守卫吃掉
      saveButton(bar).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    }
    await flush();
    expect(bar.saves).toHaveLength(0);
    expect(bar.root.querySelector('.umm-dialog-panel')).not.toBeNull(); // 没保存就不该关
  });
});

test.describe('关闭路径、焦点陷阱与错误提示（:365 :374 :393 :88 :344）', () => {
  test('取消 / 遮罩 / ✕ / Escape 各自关闭面板且零 emit，并把焦点归还触发按钮', async () => {
    const paths = ['.umm-dialog-cancel', '.umm-dialog-overlay', '.umm-dialog-close', 'Escape'];
    for (const path of paths) {
      const bar = await mountBar({ status: 1, myTags: ['m1'] });
      const trigger = q(bar.root, '.umm-mark-btn');
      await bar.open();
      suggestChips(bar)[0]!.click(); // 改动状态，让「误保存」可被观测
      await flush();
      if (path === 'Escape') {
        expect(pressKey(panel(bar), 'Escape').defaultPrevented).toBe(true);
      } else {
        q(bar.root, path).click();
      }
      await flush();
      expect(bar.root.querySelector('.umm-dialog-panel'), path).toBeNull();
      expect(bar.saves, path).toHaveLength(0);
      expect(doc.activeElement, path).toBe(trigger);
      bar.unmount();
    }
  });

  test('Escape 在 document 捕获阶段拦截：面板外的冒泡监听器收不到事件（先于宿主页面）', async () => {
    const bar = await mountBar({ status: 2 });
    await bar.open();
    let hostReached = 0;
    const hostListener = () => {
      hostReached += 1;
    };
    doc.body.addEventListener('keydown', hostListener); // 冒泡阶段的祖先监听
    try {
      expect(pressKey(panel(bar), 'Escape').defaultPrevented).toBe(true);
      expect(hostReached).toBe(0); // :88 捕获期 stopPropagation 的设计意图
      await flush();
      expect(bar.root.querySelector('.umm-dialog-panel')).toBeNull();
    } finally {
      doc.body.removeEventListener('keydown', hostListener);
    }
  });

  test('Tab 只在面板边界生效：焦点在中间控件时不拦截、不移动焦点；末元素 Tab 回首元素', async () => {
    const bar = await mountBar({ status: 2 });
    await bar.open();
    const focusables = qa(panel(bar), FOCUSABLE);
    expect(focusables.length).toBeGreaterThan(2);
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const middle = focusables[1]!;

    for (const shift of [false, true]) {
      middle.focus();
      expect(doc.activeElement).toBe(middle);
      expect(pressKey(middle, 'Tab', shift).defaultPrevented).toBe(false);
      expect(doc.activeElement).toBe(middle);
    }
    last.focus();
    expect(pressKey(last, 'Tab').defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(first);
  });

  test('onBeforeUnmount 释放 document 捕获监听：卸载后按键不被拦截，新实例不受残留影响', async () => {
    const bar = await mountBar({ status: 2 });
    await bar.open();
    // 探针自检：监听在位时 Escape 必被 preventDefault——否则「未拦截」这条断言会因
    // 一个从不生效的监听而假绿。
    expect(pressKey(doc.body, 'Escape').defaultPrevented).toBe(true);
    await bar.open(); // 保持打开状态卸载：泄漏的 handler 届时仍会吃掉按键
    bar.unmount();

    const next = await mountBar({ status: 2 });
    expect(pressKey(doc.body, 'Escape').defaultPrevented).toBe(false);
    expect(next.root.querySelector('.umm-dialog-panel')).toBeNull();
    expect(next.saves).toHaveLength(0);

    await next.open();
    expect(pressKey(doc.body, 'Escape').defaultPrevented).toBe(true);
    await flush();
    expect(next.root.querySelector('.umm-dialog-panel')).toBeNull();
  });

  test('error prop → 面板内错误节点（有值渲染、空值移除）；代码未挂 aria-live/role', async () => {
    const bar = await mountBar({ status: 2, error: '' });
    await bar.open();
    expect(bar.root.querySelector('.umm-dialog-error')).toBeNull();

    await bar.patch({ error: 'E-7' }); // props 直传，非文案词表
    const region = q(bar.root, '.umm-dialog-error');
    expect(text(region)).toBe('E-7');
    expect(panel(bar).contains(region)).toBe(true); // 落在 role=dialog 区域内
    // 读屏不会主动播报：:345 只渲染 class，无 aria-live / role=alert（已知缺口）
    expect(region.getAttribute('aria-live')).toBeNull();
    expect(region.getAttribute('role')).toBeNull();

    await bar.patch({ error: '' });
    expect(bar.root.querySelector('.umm-dialog-error')).toBeNull();
  });
});
