import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import {
  openSehuatangMenu,
  type SehuatangMenuAction,
} from '@/entrypoints/content/handlers/sehuatang-menu';
import { BASE_URL } from './sehuatang-controls-fixtures';

/**
 * 色花堂 ☰ 居中菜单对话框单测（自 sehuatang-controls.spec.ts 按测试组拆出；
 * 实现早已拆至 ./sehuatang-menu，本 spec 经 controls 测试族文件承接）。
 */

test.describe('openSehuatangMenu — ☰ 居中菜单对话框', () => {
  function menuDom() {
    const dom = new JSDOM('<body><button id="anchor">☰</button></body>', { url: BASE_URL });
    const anchor = dom.window.document.getElementById('anchor') as HTMLElement;
    return { dom, anchor };
  }

  const baseActions = (): SehuatangMenuAction[] => [
    { label: 'Manual Add', onClick: () => {} },
    { label: 'Check Viewed Status', onClick: () => {} },
  ];

  test('打开 → overlay + role=dialog + 规范 header（标题+close）+ 菜单项齐备 + 首项聚焦', () => {
    const { dom, anchor } = menuDom();
    openSehuatangMenu(dom.window.document, anchor, 'Menu', baseActions());
    const doc = dom.window.document;
    const overlay = doc.getElementById('umm-sht-menu-overlay')!;
    expect(overlay.className).toBe('umm-overlay');
    const panel = overlay.querySelector('.umm-sht-menu-panel') as HTMLElement;
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    // Header：标题 + close icon button 均在其内（规范 UIUX）。
    const header = panel.querySelector('.umm-sht-menu-header') as HTMLElement;
    expect(header).not.toBeNull();
    expect(header.querySelector('.umm-sht-menu-title')!.textContent).toBe('Menu');
    const closeBtn = header.querySelector('.umm-sht-menu-close') as HTMLButtonElement;
    expect(closeBtn.getAttribute('aria-label')).toBe('Close');
    expect(closeBtn.textContent).toBe('×');
    expect(panel.firstElementChild).toBe(header);
    expect(
      Array.from(overlay.querySelectorAll('.umm-sht-menu-item')).map((b) => b.textContent),
    ).toEqual(['Manual Add', 'Check Viewed Status']);
    expect(doc.activeElement).toBe(overlay.querySelector('.umm-sht-menu-item'));
  });

  test('普通项点击 → 回调执行 + 菜单关闭 + 焦点归还 anchor', () => {
    const { dom, anchor } = menuDom();
    let clicked = '';
    openSehuatangMenu(dom.window.document, anchor, 'Menu', [
      {
        label: 'A',
        onClick: () => {
          clicked = 'A';
        },
      },
    ]);
    const doc = dom.window.document;
    (doc.querySelector('.umm-sht-menu-item') as HTMLButtonElement).click();
    expect(clicked).toBe('A');
    expect(doc.getElementById('umm-sht-menu-overlay')).toBeNull();
    expect(doc.activeElement).toBe(anchor);
  });

  test('toggle 项点击 → 回调执行 + 文案/激活态刷新 + 菜单保持打开', () => {
    const { dom, anchor } = menuDom();
    let hidden = false;
    const label = () => `${hidden ? '✓ ' : ''}Hide Viewed`;
    openSehuatangMenu(dom.window.document, anchor, 'Menu', [
      {
        label: label(),
        onClick: () => {
          hidden = !hidden;
        },
        refreshLabel: label,
        active: () => hidden,
        keepOpen: true,
      },
    ]);
    const doc = dom.window.document;
    const item = doc.querySelector('.umm-sht-menu-item') as HTMLButtonElement;
    expect(item.classList.contains('umm-sht-menu-item--active')).toBe(false);
    item.click();
    expect(doc.getElementById('umm-sht-menu-overlay')).not.toBeNull();
    expect(item.textContent).toBe('✓ Hide Viewed');
    expect(item.classList.contains('umm-sht-menu-item--active')).toBe(true);
  });

  test('初始激活态：active()=true 打开即带 --active 类', () => {
    const { dom, anchor } = menuDom();
    openSehuatangMenu(dom.window.document, anchor, 'Menu', [
      { label: 'Hide Viewed', onClick: () => {}, active: () => true, keepOpen: true },
    ]);
    const item = dom.window.document.querySelector('.umm-sht-menu-item') as HTMLButtonElement;
    expect(item.classList.contains('umm-sht-menu-item--active')).toBe(true);
  });

  test('外部点击（overlay 空白处）→ 关闭；Escape → 关闭；× → 关闭', () => {
    const { dom, anchor } = menuDom();
    const doc = dom.window.document;
    openSehuatangMenu(doc, anchor, 'Menu', baseActions());
    const overlay = doc.getElementById('umm-sht-menu-overlay')!;
    overlay.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }));
    expect(doc.getElementById('umm-sht-menu-overlay')).toBeNull();

    openSehuatangMenu(doc, anchor, 'Menu', baseActions());
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(doc.getElementById('umm-sht-menu-overlay')).toBeNull();

    openSehuatangMenu(doc, anchor, 'Menu', baseActions());
    (doc.querySelector('.umm-sht-menu-close') as HTMLButtonElement).click();
    expect(doc.getElementById('umm-sht-menu-overlay')).toBeNull();
  });

  test('重复打开幂等：旧实例销毁，单一 overlay，无残留监听', () => {
    const { dom, anchor } = menuDom();
    const doc = dom.window.document;
    openSehuatangMenu(doc, anchor, 'Menu', baseActions());
    const first = doc.getElementById('umm-sht-menu-overlay');
    openSehuatangMenu(doc, anchor, 'Menu', baseActions());
    expect(doc.querySelectorAll('#umm-sht-menu-overlay')).toHaveLength(1);
    expect(doc.getElementById('umm-sht-menu-overlay')).not.toBe(first);
    // 旧实例的监听已被清理：关闭新实例后，再发 Escape 不产生任何效果/报错。
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(doc.getElementById('umm-sht-menu-overlay')).toBeNull();
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(doc.getElementById('umm-sht-menu-overlay')).toBeNull();
  });

  test('样式令牌基准：菜单样式消费 --umm-* 语义令牌（独立样式表）', () => {
    const { dom, anchor } = menuDom();
    openSehuatangMenu(dom.window.document, anchor, 'Menu', baseActions());
    const css = dom.window.document.getElementById('umm-sht-menu-styles')!.textContent!;
    expect(css).toContain('.umm-sht-menu-item');
    expect(css).toContain('var(--umm-surface-raised)');
    expect(css).not.toContain('#1e1e1e');
  });

  test('焦点陷阱：末元素 Tab → 回绕首元素；首元素 Shift+Tab → 回绕末元素', () => {
    const { dom, anchor } = menuDom();
    openSehuatangMenu(dom.window.document, anchor, 'Menu', baseActions());
    const doc = dom.window.document;
    const focusables = Array.from(
      doc.querySelectorAll('.umm-sht-menu-panel button, .umm-sht-menu-item'),
    );
    const first = focusables[0] as HTMLElement;
    const last = focusables[focusables.length - 1] as HTMLElement;
    expect(focusables.length).toBeGreaterThan(1);

    last.focus();
    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(doc.activeElement).toBe(first);

    first.focus();
    doc.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    expect(doc.activeElement).toBe(last);
  });
});
