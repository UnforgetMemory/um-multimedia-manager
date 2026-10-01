import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';
import { showManualAddPanel } from '@/entrypoints/content/ui/manual-add-panel';
import { showCheckViewedPanel } from '@/entrypoints/content/ui/check-viewed-panel';
import { t } from '@/entrypoints/content/i18n';
import type { AdultAvId } from '@/types';

/**
 * 内容脚本面板的「发消息边界」单元测试（x98 e2e 的补集）。
 *
 * 为什么这两类断言只能待在 unit 层：
 *   1. 空输入守卫 `if (!val) return` 在 e2e 里不可观测——background 的
 *      handleAdultAvAdd 同样拒空 id（`if (!id || !source)`），两层防御删掉任一层，
 *      产品行为都不变（实测：删掉面板守卫后 x98 全绿）。这里直接盯
 *      chrome.runtime.sendMessage 的调用次数，删掉守卫立刻变红。
 *   2. `if (document.getElementById(PANEL_ID)) return` 防的是重复叠层，而面板是
 *      模态遮罩（.umm-overlay 铺满视口），UI 上点不到第二次触发器——
 *      只有程序化重复调用才走得进去。
 *
 * chrome stub 只暴露 transport 用到的两面：runtime.id（safeSendMessage 的有效性
 * 检查）+ callback 形态的 sendMessage（sendMessageWithTimeout 的调用形状）；
 * 写入类响应补 addedCount，其余回 success:true。
 * 语言不初始化，t() 停在模块默认 zh-CN，产出文案确定性。
 */

test.describe.configure({ mode: 'serial' });

type Sent = { type: string; payload: Record<string, unknown> };

let sent: Sent[] = [];
let alerts: string[] = [];

function installDom(seedItems: AdultAvId[] = []): void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://www.sehuatang.net/forum.php?mod=forumdisplay&fid=1',
  });
  sent = [];
  alerts = [];
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
  defineGlobal('alert', (msg: string) => {
    alerts.push(msg);
  });
  defineGlobal('chrome', {
    runtime: {
      id: 'test-ext',
      lastError: null,
      sendMessage: (msg: Sent, cb?: (res: unknown) => void) => {
        sent.push(msg);
        if (msg.type === 'ADULT_AV_BATCH_ADD') cb?.({ success: true, addedCount: 1 });
        else if (msg.type === 'ADULT_AV_GET_ALL') cb?.({ success: true, items: seedItems });
        else cb?.({ success: true });
      },
    },
  });
}

/** saveBtn.onclick 是 async：等一个宏任务让消息与清空落地。 */
async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少 #${id}`);
  return node as T;
}

function count(id: string): number {
  return document.querySelectorAll(`#${id}`).length;
}

test.describe('手动添加面板', () => {
  test.beforeEach(() => installDom());

  test('空输入点保存：一条消息都不发，输入原样留着', async () => {
    showManualAddPanel();
    expect(document.getElementById('umm-manual-add-overlay'), '面板没建出来').toBeTruthy();

    const input = el<HTMLInputElement>('umm-add-input');
    input.value = '   ';
    el<HTMLButtonElement>('umm-add-save').click();
    await flush();

    expect(sent, '空输入越过了守卫，仍然发了写库消息').toEqual([]);
    expect(input.value, '空输入把输入框改了').toBe('   ');
  });

  test('合法输入恰好一条 ADULT_AV_ADD：原值 + 所选评分，随后清空输入框', async () => {
    showManualAddPanel();
    const input = el<HTMLInputElement>('umm-add-input');
    const save = el<HTMLButtonElement>('umm-add-save');
    input.value = 'abc jp 123';
    el<HTMLSelectElement>('umm-add-rating').value = '8';
    save.click();
    await flush();

    expect(sent.length, '合法输入没有恰好发一条消息').toBe(1);
    const msg = sent[0];
    expect(msg?.type).toBe('ADULT_AV_ADD');
    // 面板不做规范化：原值交给 background 的 normalizeAvId（规范化结果由 x98 e2e 验）。
    expect(msg?.payload).toMatchObject({ source: 'manual', id: 'abc jp 123', rating: 8 });
    expect(input.value, '保存成功后输入框没清空').toBe('');
  });

  test('重复调用只留一层面板（模态遮罩让这条守卫无法从 UI 触达）', () => {
    showManualAddPanel();
    showManualAddPanel();
    expect(count('umm-manual-add-overlay'), '面板叠了两层').toBe(1);
    expect(count('umm-add-input'), '输入框叠了两份').toBe(1);
  });

  test('合法 JSON 走批量通道并带上每一条 id', async () => {
    showManualAddPanel();
    const input = el<HTMLInputElement>('umm-add-input');
    input.value = '[{"id":"ABC-1","rating":7},{"id":"DEF-2"}]';
    el<HTMLButtonElement>('umm-add-save').click();
    await flush();

    expect(
      sent.map((m) => m.type),
      '合法 JSON 没走批量通道',
    ).toEqual(['ADULT_AV_BATCH_ADD']);
    const msg = sent[0];
    expect(msg?.payload).toMatchObject({ source: 'manual' });
    const items = msg?.payload['items'] as Array<{ id: string }>;
    expect(
      items.map((i) => i.id),
      '批量项丢了 id',
    ).toEqual(['ABC-1', 'DEF-2']);
  });

  test('非法 JSON 只弹提示：不发消息、不清空输入', async () => {
    showManualAddPanel();
    const input = el<HTMLInputElement>('umm-add-input');
    input.value = '[{"id": broken }]';
    el<HTMLButtonElement>('umm-add-save').click();
    await flush();

    expect(sent, '解析失败的 JSON 仍然发了消息').toEqual([]);
    expect(alerts, '解析失败没有弹出可读提示').toEqual([t('Invalid JSON')]);
    expect(input.value, '解析失败清掉了用户输入（应留着改）').toBe('[{"id": broken }]');
  });

  test('关闭按钮与遮罩点击移除面板，点面板内部不关', () => {
    showManualAddPanel();
    const overlay = document.getElementById('umm-manual-add-overlay')!;
    el<HTMLInputElement>('umm-add-input').click();
    expect(document.getElementById('umm-manual-add-overlay'), '面板内部点击把面板关了').toBe(
      overlay,
    );

    el<HTMLButtonElement>('umm-add-close').click();
    expect(document.getElementById('umm-manual-add-overlay'), '关闭按钮没移除面板').toBeNull();

    showManualAddPanel();
    document.getElementById('umm-manual-add-overlay')!.click();
    expect(document.getElementById('umm-manual-add-overlay'), '点遮罩没关面板').toBeNull();
  });
});

test.describe('查看已看面板', () => {
  test.beforeEach(() => installDom());

  test('重复调用只留一个面板，关闭按钮移除它', () => {
    showCheckViewedPanel();
    showCheckViewedPanel();
    expect(count('umm-check-viewed-panel'), '查询面板叠了两层').toBe(1);

    el<HTMLButtonElement>('umm-cv-close').click();
    expect(document.getElementById('umm-check-viewed-panel'), '关闭按钮没移除查询面板').toBeNull();
  });

  test('空输入点查询：一次 ADULT_AV_GET_ALL 都不发', async () => {
    showCheckViewedPanel();
    el<HTMLInputElement>('umm-cv-input').value = '  ';
    el<HTMLButtonElement>('umm-cv-check').click();
    await flush();
    expect(sent, '空输入也去拉全量记录（白跑一次三表读）').toEqual([]);
  });

  test('入库 id 出三行（状态/日期/评分），未入库只出一行状态', async () => {
    installDom([
      {
        source: 'javdb',
        id: 'ABC-123',
        url: '',
        rating: 8,
        updatedAt: '2026-09-10T00:00:00.000Z',
      },
    ]);
    showCheckViewedPanel();
    const input = el<HTMLInputElement>('umm-cv-input');
    const check = el<HTMLButtonElement>('umm-cv-check');
    const result = el<HTMLElement>('umm-cv-result');

    // 查询侧只做 trim + toUpperCase，不做空格规范化：小写输入必须命中大写记录。
    input.value = 'abc-123';
    check.click();
    await flush();

    const rows = Array.from(result.children).map((c) => c.textContent ?? '');
    expect(rows.length, '已入库番号没有给出完整三行').toBe(3);
    expect(rows.join('|'), '命中记录却没显示所选评分').toContain('8 / 10');

    input.value = 'ZZZ-999';
    check.click();
    await flush();
    const miss = Array.from(result.children).map((c) => c.textContent ?? '');
    expect(miss.length, '未入库番号也产出了多行（应只有状态行）').toBe(1);
    expect(miss[0], '未入库番号却显示了评分').not.toContain('/ 10');
  });
});
