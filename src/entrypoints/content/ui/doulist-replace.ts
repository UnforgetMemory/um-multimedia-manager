/**
 * Self-contained doulist management modal for Douban detail pages.
 *
 * Triggered by clicking ".lnk-doulist-add" (native Douban link) or
 * ".umm-dl-trigger" (overlay button) on the page. This module keeps only the
 * trigger event wiring and subject-info mapping; the themed dialog DOM lives
 * in doulist-dialog.ts (ADR-026 req 9 file-size split), the API client in
 * doulist-api.ts, and the theme tokens in doulist-theme.ts.
 */

import type { UrlIdentity } from '@/types';
import { FloatingToast } from '../utils/toast';
import { sleep } from '@/libraries/utils';

import { fetchAllDoulists, getDoulistLabel, DOULIST_CAT_MAP } from './doulist-api';
import type { DoulistItem, SubjectInfo } from './doulist-api';
import { DL_MODAL_ID, buildThemedDialog } from './doulist-dialog';

// Preserve the historical export path: the modal id constant now lives in doulist-dialog.ts.
export { DL_MODAL_ID };

/**
 * Identity of the last `initDoulistReplacement` call. The document listeners are
 * attached once per document, so they resolve the identity from here instead of
 * each call stacking its own pair of listeners.
 */
let activeIdentity: UrlIdentity | null = null;
let listenersRegistered = false;
/**
 * Covers the async gap between click and modal append. The `getElementById`
 * guard alone cannot: while the doulist fetch is in flight no modal node exists
 * yet, so a second click passed it and stacked a second overlay.
 */
let opening = false;

function getSubjectInfo(identity: UrlIdentity): SubjectInfo | null {
  // Prefer hidden <input name="ck">; fall back to document.cookie (user may be logged in
  // even if the input is absent — e.g. partial page load, SPA navigation)
  const inputCk = document.querySelector<HTMLInputElement>('input[name="ck"]')?.value;
  const cookieMatch = document.cookie.match(/(?:^|;\s*)ck=([^;]+)/);
  const cookieRaw = cookieMatch?.[1];
  const ck = inputCk || (cookieRaw ? decodeURIComponent(cookieRaw) : '');
  if (!identity.providerId || !ck) return null;
  return {
    subjectId: identity.providerId,
    cat: DOULIST_CAT_MAP[identity.type] || '',
    kind: identity.type,
    url: location.href,
    ck,
  };
}

/**
 * Retry once — Douban's API sometimes returns empty on first call
 * (backend lazy init). Always opens dialog regardless of result.
 */
async function fetchWithRetry(subject: SubjectInfo): Promise<DoulistItem[]> {
  const items = await fetchAllDoulists(subject);
  if (items.length > 0) return items;
  await sleep(500);
  return fetchAllDoulists(subject);
}

function onDocumentClick(e: MouseEvent): void {
  const identity = activeIdentity;
  if (!identity) return;

  // Use composedPath() to penetrate Shadow DOM — the .umm-dl-trigger
  // button lives inside the detail-page Vue overlay (Shadow DOM), so
  // e.target gets retargeted to the shadow host, making .closest() fail.
  const trigger = (e.composedPath() as HTMLElement[]).find(
    (el) => el instanceof Element && el.matches('.lnk-doulist-add, .umm-dl-trigger'),
  ) as HTMLElement | undefined;
  if (!trigger) return;
  if (opening || document.getElementById(DL_MODAL_ID)) return;

  const subject = getSubjectInfo(identity);
  if (!subject) {
    // Missing ck token or providerId — can't proceed with custom dialog.
    // Don't block the native handler: for .lnk-doulist-add the native Douban
    // dialog will open; for .umm-dl-trigger show a toast so the user isn't
    // left with a dead button.
    if (trigger.matches('.umm-dl-trigger')) {
      console.warn('[UMM Doulist] Cannot open: missing ck token or providerId');
      FloatingToast.error('UMM', `${getDoulistLabel(identity)}功能暂不可用（请确认已登录豆瓣）`);
    }
    return;
  }
  e.preventDefault();
  e.stopImmediatePropagation();

  opening = true;

  // Show loading on the trigger button while fetching doulists
  const origText = trigger.textContent || '';
  trigger.setAttribute('data-loading', 'true');
  trigger.textContent = '加载中…';

  const clearLoading = () => {
    opening = false;
    trigger.removeAttribute('data-loading');
    trigger.textContent = origText;
  };

  fetchWithRetry(subject)
    .then((items) => {
      clearLoading();
      const { overlay } = buildThemedDialog({ items, subject, comment: '' }, identity);
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';
    })
    .catch(() => {
      clearLoading();
      FloatingToast.error('UMM', `${getDoulistLabel(identity)}加载失败`);
    });
}

function onDocumentKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  const modal = document.getElementById(DL_MODAL_ID);
  if (modal) {
    modal.remove();
    document.body.style.overflow = '';
  }
}

export function initDoulistReplacement(identity: UrlIdentity): void {
  activeIdentity = identity;
  if (listenersRegistered) return;
  listenersRegistered = true;
  document.addEventListener('click', onDocumentClick, { capture: true });
  document.addEventListener('keydown', onDocumentKeydown);
}
