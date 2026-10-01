/**
 * Themed doulist management dialog for Douban detail pages.
 *
 * Split out of doulist-replace.ts (ADR-026 req 9 file-size gate): builds the
 * modal DOM (overlay/panel/header/table/create-form/confirm), wires in-dialog
 * interactions (search filter, collect toggle, doulist creation) and applies
 * theme tokens from doulist-theme.ts. Trigger detection and subject mapping
 * stay in doulist-replace.ts.
 */

import type { UrlIdentity } from '@/types';
import { debounce } from '@/libraries/utils';
import { runChunked } from '@/libraries/utils/dom-chunk';
import type { ChunkedRun } from '@/libraries/utils/dom-chunk';
import { applyDialogAria, applyDialogTitleAria } from '@/libraries/ui-contracts/dialog-aria';

import {
  fetchAllDoulists,
  addToDoulist,
  createDoulist,
  removeFromDoulist,
  getDoulistLabel,
} from './doulist-api';
import type { DoulistItem, SubjectInfo } from './doulist-api';
import { createDialogTheme } from './doulist-theme';

export const DL_MODAL_ID = 'umm-dl-modal';

/** Keystroke-triggered table rebuilds are collapsed to one trailing pass (X9-B jank guard). */
const DEFAULT_SEARCH_DEBOUNCE_MS = 150;
/** Lists above this row count render through runChunked instead of a single fragment attach. */
const DEFAULT_CHUNK_THRESHOLD = 50;
const DEFAULT_CHUNK_SIZE = 50;

export interface DoulistDialogOptions {
  /** Debounce window for search-input re-renders; click/toggle renders stay immediate. */
  searchDebounceMs?: number;
  /** Row count above which rendering switches to per-frame chunks. */
  chunkThreshold?: number;
  /** Rows written per frame in the chunked path. */
  chunkSize?: number;
  /** Frame scheduler for runChunked; injectable for tests, defaults to rAF. */
  schedule?: (task: () => void) => () => void;
}

export function buildThemedDialog(
  data: { items: DoulistItem[]; subject: SubjectInfo; comment: string },
  identity: UrlIdentity,
  options: DoulistDialogOptions = {},
): { overlay: HTMLElement; refresh: (newItems: DoulistItem[]) => void } {
  let items: DoulistItem[] = data.items;
  let selectedId = '';
  const subject = data.subject;

  const searchDebounceMs = options.searchDebounceMs ?? DEFAULT_SEARCH_DEBOUNCE_MS;
  const chunkThreshold = options.chunkThreshold ?? DEFAULT_CHUNK_THRESHOLD;
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  // In-flight chunked render; cancelled whenever a new render starts (X9-B).
  let activeRun: ChunkedRun | undefined;

  // Re-read theme each time to stay in sync with extension settings
  const isDark = () =>
    document.documentElement.classList.contains('dark') ||
    document.documentElement.getAttribute('data-umm-theme') === 'dark';
  const theme = createDialogTheme(isDark());

  // ── Overlay (targeted resets instead of all:initial which destroys z-index/display) ──
  const overlay = document.createElement('div');
  overlay.id = DL_MODAL_ID;
  applyDialogAria(overlay, { labelledBy: 'umm-dl-title' });
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:300',
    `background:${theme.overlayBg}`,
    'display:flex;align-items:center;justify-content:center',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'margin:0;padding:0;border:none;box-sizing:border-box',
    'overflow-y:auto;pointer-events:auto',
  ].join(';');

  // ── Panel ──
  const panel = document.createElement('div');
  panel.className = 'umm-dl-panel';
  panel.style.cssText = [
    `background:${theme.panelBg}`,
    `border:1px solid ${theme.panelBorder}`,
    'border-radius:14px',
    `box-shadow:0 12px 48px ${theme.panelShadow}`,
    'width:800px;max-width:calc(100vw-32px);min-width:340px',
    'max-height:calc(100vh-64px)',
    'display:flex;flex-direction:column;overflow:hidden',
  ].join(';');
  overlay.appendChild(panel);

  // ── Responsive + style isolation CSS (13-tier breakpoint system) ──
  const rStyle = document.createElement('style');
  rStyle.textContent = [
    '@media(max-width:319px){.umm-dl-panel{width:calc(100vw-16px)!important}}',
    '@media(min-width:320px)and (max-width:374px){.umm-dl-panel{width:calc(100vw-16px)!important}}',
    '@media(min-width:375px)and (max-width:479px){.umm-dl-panel{width:calc(100vw-24px)!important}}',
    '@media(min-width:480px)and (max-width:639px){.umm-dl-panel{width:480px!important}}',
    '@media(min-width:640px)and (max-width:767px){.umm-dl-panel{width:580px!important}}',
    '@media(min-width:768px)and (max-width:1023px){.umm-dl-panel{width:660px!important}}',
    '@media(min-width:1024px)and (max-width:1279px){.umm-dl-panel{width:740px!important}}',
    '@media(min-width:1280px)and (max-width:1535px){.umm-dl-panel{width:860px!important}}',
    '@media(min-width:1536px)and (max-width:1919px){.umm-dl-panel{width:880px!important}}',
    '@media(min-width:1920px)and (max-width:2559px){.umm-dl-panel{width:920px!important}}',
    '@media(min-width:2560px)and (max-width:3199px){.umm-dl-panel{width:960px!important}}',
    '@media(min-width:3200px)and (max-width:3839px){.umm-dl-panel{width:1000px!important}}',
    '@media(min-width:3840px)and (max-width:5119px){.umm-dl-panel{width:1040px!important}}',
    '@media(min-width:5120px){.umm-dl-panel{width:1080px!important}}',
    // Font-size scales with viewport
    '@media(max-width:639px){.umm-dl-panel td,.umm-dl-panel th{font-size:12px!important}}',
    '@media(min-width:640px)and (max-width:1023px){.umm-dl-panel td,.umm-dl-panel th{font-size:13px!important}}',
    '@media(min-width:1024px)and (max-width:1535px){.umm-dl-panel td,.umm-dl-panel th{font-size:14px!important}}',
    '@media(min-width:1536px){.umm-dl-panel td{font-size:14.5px!important}.umm-dl-panel th{font-size:12px!important}}',
    // Placeholder colors
    `#umm-dl-modal input::placeholder{color:${theme.placeholderColor}!important}`,
    `#umm-dl-modal textarea::placeholder{color:${theme.placeholderColor}!important}`,
    // Scrollbar
    '#umm-dl-modal ::-webkit-scrollbar{width:7px!important;height:7px!important}',
    `#umm-dl-modal ::-webkit-scrollbar-thumb{background:${theme.scrollThumb}!important;border-radius:4px!important}`,
    `#umm-dl-modal ::-webkit-scrollbar-track{background:transparent!important}`,
    // Loading spinner for add/remove operations
    '@keyframes umm-dl-spin{to{transform:rotate(360deg)}}',
    '.umm-dl-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(128,128,128,0.25);border-top-color:currentColor;border-radius:50%;animation:umm-dl-spin .6s linear infinite;vertical-align:middle}',
  ].join('');
  overlay.appendChild(rStyle);

  // ── Header ──
  const header = document.createElement('div');
  header.style.cssText = [
    'display:flex;align-items:center;justify-content:space-between',
    'padding:18px 28px',
    `border-bottom:1px solid ${theme.panelBorder}`,
    `background:${theme.headerBg}`,
  ].join(';');
  const title = document.createElement('div');
  title.id = 'umm-dl-title';
  applyDialogTitleAria(title, 3);
  title.textContent = `添加到${getDoulistLabel(identity)}`;
  title.style.cssText = [
    'margin:0',
    'font-size:17px',
    'font-weight:600',
    'letter-spacing:-0.01em',
    'line-height:1.4',
    `color:${theme.titleColor}`,
  ].join(';');
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '\u2715';
  closeBtn.setAttribute('aria-label', '关闭');
  closeBtn.style.cssText = [
    'width:34px;height:34px;border:none;background:transparent;cursor:pointer',
    `color:${theme.closeColor};font-size:16px`,
    'display:flex;align-items:center;justify-content:center;border-radius:8px',
    'transition:background .15s,color .15s',
  ].join(';');
  closeBtn.onmouseenter = () => {
    closeBtn.style.background = theme.closeHoverBg;
    closeBtn.style.color = theme.closeHoverColor;
  };
  closeBtn.onmouseleave = () => {
    closeBtn.style.background = 'transparent';
    closeBtn.style.color = theme.closeColor;
  };
  closeBtn.addEventListener('click', () => {
    overlay.remove();
    document.body.style.overflow = '';
  });
  header.append(title, closeBtn);
  panel.appendChild(header);

  // ── Body ──
  const body = document.createElement('div');
  body.style.cssText = [
    'flex:1;overflow-y:auto;overscroll-behavior:contain',
    'padding:18px 24px',
  ].join(';');
  panel.appendChild(body);

  // Loading indicator shown during initial fetch
  const bodyLoading = document.createElement('div');
  bodyLoading.style.cssText = [
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:48px 0',
    `color:${theme.theadText}`,
    'font-size:13.5px',
  ].join(';');
  bodyLoading.innerHTML = `<span class="umm-dl-spinner" style="width:20px;height:20px;border-width:2.5px"></span><span>加载${getDoulistLabel(identity)}列表...</span>`;
  body.appendChild(bodyLoading);

  // ── Confirm overlay ──
  const confirmBox = document.createElement('div');
  confirmBox.style.display = 'none';
  confirmBox.style.cssText = [
    'position:absolute;inset:0;z-index:10',
    `background:${theme.confirmBg}`,
    'display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:32px;text-align:center',
  ].join(';');
  confirmBox.innerHTML = `<p id="umm-dl-confirm-text" style="margin:0;font-size:14.5px;font-weight:500;line-height:1.5;color:${theme.textPrimary}"></p><div style="display:flex;gap:12px"><button id="umm-dl-confirm-yes" style="padding:10px 28px;border:none;border-radius:10px;cursor:pointer;font-size:13.5px;font-weight:600"></button><button id="umm-dl-confirm-no" style="padding:10px 28px;border:1px solid;border-radius:10px;cursor:pointer;font-size:13.5px;font-weight:500"></button></div>`;
  panel.style.position = 'relative';
  panel.appendChild(confirmBox);

  const confirmText = confirmBox.querySelector('#umm-dl-confirm-text')!;
  const confirmYes = confirmBox.querySelector('#umm-dl-confirm-yes') as HTMLElement;
  const confirmNo = confirmBox.querySelector('#umm-dl-confirm-no') as HTMLElement;

  function showConfirm(msg: string, yesLabel: string, noLabel: string, action: () => void): void {
    confirmText.textContent = msg;
    confirmYes.textContent = yesLabel;
    confirmNo.textContent = noLabel;
    confirmYes.style.cssText = [
      'padding:10px 28px;border:none;border-radius:10px;cursor:pointer;font-size:13.5px;font-weight:600',
      `background:${theme.accent};color:${theme.onAccent}`,
    ].join(';');
    confirmNo.style.cssText = [
      'padding:10px 28px;border-radius:10px;cursor:pointer;font-size:13.5px;font-weight:500',
      `border:1px solid ${theme.borderDark}`,
      `background:${theme.surfaceAlt};color:${theme.textSecondary}`,
    ].join(';');
    confirmBox.style.display = 'flex';
    confirmYes.onclick = () => {
      confirmBox.style.display = 'none';
      action();
    };
    confirmNo.onclick = () => {
      confirmBox.style.display = 'none';
    };
  }

  // ── Search bar ──
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = `搜索${getDoulistLabel(identity)}...`;
  searchInput.style.cssText = [
    'width:100%;box-sizing:border-box;height:40px;padding:0 14px;margin-bottom:14px',
    `background:${theme.inputBg}`,
    `border:1px solid ${theme.borderDark}`,
    `color:${theme.textPrimary}`,
    'border-radius:10px;font-size:14px;outline:none',
    'transition:border-color .15s,box-shadow .15s',
  ].join(';');
  searchInput.onfocus = () => {
    searchInput.style.borderColor = theme.accent;
    searchInput.style.boxShadow = `0 0 0 3px ${theme.accentGlow}`;
  };
  searchInput.onblur = () => {
    searchInput.style.borderColor = theme.borderInputBlur;
    searchInput.style.boxShadow = 'none';
  };
  body.appendChild(searchInput);

  // ── Table ──
  const tableWrap = document.createElement('div');
  tableWrap.style.cssText = [
    `border:1px solid ${theme.panelBorder}`,
    'border-radius:10px;overflow:hidden;max-height:360px;overflow-y:auto;overscroll-behavior:contain',
  ].join(';');

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed';

  // Thead
  const thead = document.createElement('thead');
  thead.style.cssText = [
    `background:${theme.headerBg}`,
    `border-bottom:1px solid ${theme.panelBorder}`,
    'position:sticky;top:0;z-index:1',
  ].join(';');
  const hRow = document.createElement('tr');
  const h = (w: string, align: string) =>
    `padding:10px 12px;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:${theme.theadText};width:${w};text-align:${align}`;

  hRow.innerHTML = [
    '<th style="' + h('38px', 'center') + '">🔒</th>',
    '<th style="' + h('64px', 'center') + '">收藏</th>',
    `<th style="${h('auto', 'left')}">${getDoulistLabel(identity)}名称</th>`,
    '<th style="' + h('76px', 'right') + '">统计</th>',
  ].join('');
  thead.appendChild(hRow);
  table.appendChild(thead);

  // Tbody
  const tbody = document.createElement('tbody');
  const td = (align: string) =>
    `padding:10px 12px;font-size:13.5px;color:${theme.textSecondary};text-align:${align};border-bottom:1px solid ${theme.rowBorder};transition:background .12s`;

  function createRow(item: DoulistItem): HTMLTableRowElement {
    const row = document.createElement('tr');
    row.style.cursor = 'pointer';
    row.onmouseenter = () => {
      row.style.background = theme.rowHover;
    };
    row.onmouseleave = () => {
      if (item.id !== selectedId) row.style.background = 'transparent';
    };

    // Column 1: Lock icon
    const lockCell = document.createElement('td');
    lockCell.style.cssText = td('center');
    lockCell.textContent = item.is_private ? '🔒' : '';

    // Column 2: Toggle button (larger, clickable)
    const toggleCell = document.createElement('td');
    toggleCell.style.cssText = td('center') + ';cursor:pointer';
    const toggleBtn = document.createElement('span');
    const collected = item.is_collected ?? false;
    toggleBtn.textContent = collected ? '\u2713' : '\u25CB';
    toggleBtn.style.cssText = [
      'display:inline-flex;align-items:center;justify-content:center',
      'width:28px;height:28px;border-radius:50%',
      'font-size:16px;font-weight:700',
      'transition:color .15s,background-color .15s',
      collected
        ? `color:${theme.checkedColor};background:${theme.checkedBg}`
        : `color:${theme.uncheckedColor}`,
    ].join(';');
    toggleCell.appendChild(toggleBtn);
    toggleCell.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = item.is_collected ?? false;
      async function doToggle(): Promise<void> {
        toggleBtn.innerHTML = '<span class="umm-dl-spinner"></span>';
        const ok = cur
          ? await removeFromDoulist(item.id, {
              tkind: subject.cat,
              tid: subject.subjectId,
              ck: subject.ck,
            })
          : await addToDoulist(item.id, {
              sid: subject.subjectId,
              skind: subject.cat,
              ck: subject.ck,
              comment: '',
            });
        if (ok) {
          item.is_collected = !cur;
          renderItems(searchInput.value);
        } else {
          toggleBtn.textContent = '\u2715';
          toggleBtn.style.color = '#b91c1c';
          setTimeout(() => renderItems(searchInput.value), 1200);
        }
      }
      if (cur) {
        showConfirm(
          `确认从${getDoulistLabel(identity)}「${item.name}」中移除此条目？`,
          '确认移出',
          '取消',
          doToggle,
        );
      } else {
        showConfirm(
          `确认将本条目添加到${getDoulistLabel(identity)}「${item.name}」？`,
          '确认添加',
          '取消',
          doToggle,
        );
      }
    });

    // Column 3: Name (click to select/deselect)
    const nameCell = document.createElement('td');
    nameCell.style.cssText =
      td('left') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500';
    nameCell.textContent = item.name;
    if (item.id === selectedId) {
      row.style.background = theme.selectedBg;
      row.style.outline = '1px solid ' + theme.accent;
      row.style.outlineOffset = '-1px';
    }
    row.addEventListener('click', () => {
      selectedId = selectedId === item.id ? '' : item.id;
      renderItems(searchInput.value);
    });

    // Column 4: Count
    const countCell = document.createElement('td');
    countCell.style.cssText = td('right') + ';font-size:12px;color:' + theme.theadText;
    const m = item.count.match(/(\d+)/);
    countCell.textContent = m?.[1] ?? item.count;

    row.append(lockCell, toggleCell, nameCell, countCell);
    return row;
  }

  function renderItems(filter: string): void {
    // WHY: cancel before rebuilding so a stale chunked pass can never append
    // rows into the tbody this render has just taken ownership of.
    activeRun?.cancel();
    activeRun = undefined;
    tbody.innerHTML = '';
    const q = filter.toLowerCase().trim();
    const visible = q ? items.filter((item) => item.name.toLowerCase().includes(q)) : items.slice();

    if (visible.length === 0) {
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = 4;
      emptyCell.style.cssText = [
        'padding:40px;text-align:center',
        `color:${theme.emptyText}`,
        'font-size:13.5px',
      ].join(';');
      emptyCell.textContent = q
        ? `未找到匹配的${getDoulistLabel(identity)}`
        : `暂无${getDoulistLabel(identity)}`;
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
      return;
    }

    // Small/medium lists: one DocumentFragment attach (no per-row reflow).
    if (visible.length <= chunkThreshold) {
      const fragment = document.createDocumentFragment();
      for (const item of visible) fragment.appendChild(createRow(item));
      tbody.appendChild(fragment);
      return;
    }

    // Large lists: one chunk per frame so a 100+ row rebuild never blocks a frame.
    activeRun = runChunked(
      visible,
      (item) => {
        tbody.appendChild(createRow(item));
      },
      { chunkSize, schedule: options.schedule },
    );
  }

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  body.appendChild(tableWrap);

  // ── Footer ──
  const footer = document.createElement('div');
  footer.style.cssText = [
    'display:flex;align-items:center;justify-content:flex-end;gap:10px',
    'padding:14px 24px',
    `border-top:1px solid ${theme.panelBorder}`,
    `background:${theme.headerBg}`,
  ].join(';');

  // Create doulist button (left side)
  const createBtn = document.createElement('button');
  createBtn.textContent = `＋ 新建${getDoulistLabel(identity)}`;
  createBtn.style.cssText = [
    'padding:7px 14px;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:500;transition:background-color .12s',
    `color:${theme.accent}`,
    `background:${theme.accentSubtle}`,
  ].join(';');
  createBtn.onmouseenter = () => {
    createBtn.style.background = theme.accentGlow;
  };
  createBtn.onmouseleave = () => {
    createBtn.style.background = theme.accentSubtle;
  };

  // ── Create doulist form (hidden until createBtn is clicked) ──
  const createForm = document.createElement('div');
  createForm.style.display = 'none';
  createForm.style.cssText = [
    'display:none;flex-direction:column;gap:10px',
    'padding:14px 0 10px',
    `border-bottom:1px solid ${theme.panelBorder}`,
    'margin-bottom:10px',
  ].join(';');

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = `请输入${getDoulistLabel(identity)}名称`;
  nameInput.style.cssText = [
    'width:100%;box-sizing:border-box;height:38px;padding:0 14px',
    `background:${theme.inputBg}`,
    `border:1px solid ${theme.borderDark}`,
    `color:${theme.textPrimary}`,
    'border-radius:10px;font-size:14px;outline:none',
  ].join(';');
  nameInput.onfocus = () => {
    nameInput.style.borderColor = theme.accent;
    nameInput.style.boxShadow = `0 0 0 3px ${theme.accentGlow}`;
  };
  nameInput.onblur = () => {
    nameInput.style.borderColor = theme.borderInputBlur;
    nameInput.style.boxShadow = 'none';
  };

  const privateRow = document.createElement('label');
  privateRow.style.cssText = [
    'display:flex;align-items:center;gap:8px',
    `color:${theme.labelColor}`,
    'font-size:13px;cursor:pointer',
  ].join(';');
  const privateCheck = document.createElement('input');
  privateCheck.type = 'checkbox';
  privateRow.append(privateCheck, `私密${getDoulistLabel(identity)}`);

  const formActions = document.createElement('div');
  formActions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
  const formCancel = document.createElement('button');
  formCancel.textContent = '取消';
  formCancel.style.cssText = `padding:7px 20px;border:1px solid ${theme.borderDark};border-radius:8px;background:${theme.surfaceAlt};color:${theme.textSecondary};font-size:13px;font-weight:500;cursor:pointer`;
  const formConfirm = document.createElement('button');
  formConfirm.innerHTML = '创建';
  formConfirm.style.cssText = `padding:7px 20px;border:none;border-radius:8px;background:${theme.accent};color:${theme.onAccent};font-size:13px;font-weight:600;cursor:pointer;line-height:1.4`;
  formActions.append(formCancel, formConfirm);
  createForm.append(nameInput, privateRow, formActions);
  body.insertBefore(createForm, searchInput);

  createBtn.addEventListener('click', () => {
    const isOpen = createForm.style.display === 'flex';
    createForm.style.display = isOpen ? 'none' : 'flex';
    if (!isOpen) nameInput.focus();
  });
  formCancel.addEventListener('click', () => {
    createForm.style.display = 'none';
    nameInput.value = '';
    privateCheck.checked = false;
  });
  formConfirm.addEventListener('click', async () => {
    const title = nameInput.value.trim();
    if (!title) {
      nameInput.focus();
      return;
    }
    formConfirm.disabled = true;
    formConfirm.innerHTML =
      '<span class="umm-dl-spinner" style="width:13px;height:13px;border-width:2px;display:block;margin:0 auto"></span>';
    const result = await createDoulist({
      title,
      category: subject.kind,
      isPrivate: privateCheck.checked,
      ck: subject.ck,
    });
    if (result) {
      createForm.style.display = 'none';
      nameInput.value = '';
      privateCheck.checked = false;
      const newItems = await fetchAllDoulists(subject);
      if (newItems.length > 0) {
        items = newItems;
        renderItems(searchInput.value);
      }
    } else {
      formConfirm.innerHTML = '创建失败';
      setTimeout(() => {
        formConfirm.innerHTML = '创建';
        formConfirm.disabled = false;
      }, 2000);
    }
  });

  const closeBtn2 = document.createElement('button');
  closeBtn2.textContent = '关闭';
  closeBtn2.style.cssText = `padding:9px 28px;border:1px solid ${theme.borderDark};border-radius:10px;background:${theme.surfaceAlt};color:${theme.textSecondary};font-size:13.5px;font-weight:500;cursor:pointer`;
  closeBtn2.addEventListener('click', () => {
    overlay.remove();
    document.body.style.overflow = '';
  });

  footer.append(createBtn, closeBtn2);
  panel.appendChild(footer);

  // WHY: keystroke re-renders are collapsed to one trailing pass (~150ms); click/toggle
  // paths call renderItems directly and stay immediate (discrete user actions).
  const debouncedSearchRender = debounce((q: string) => renderItems(q), searchDebounceMs);
  searchInput.addEventListener('input', () => debouncedSearchRender(searchInput.value));
  bodyLoading.remove();
  renderItems('');

  const refresh = (newItems: DoulistItem[]) => {
    items = newItems;
    selectedId = '';
    renderItems(searchInput.value);
  };
  return { overlay, refresh };
}
