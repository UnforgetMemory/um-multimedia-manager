/**
 * Status-modal view for the shared video-overlay module (bilibili ↔ youtube, T18).
 *
 * Split out of video-overlay.ts (ADR-026 req 9 file-size gate): pure view layer —
 * builds the modal DOM, wires hover/click feedback, and exposes a theme re-apply
 * hook. All record state and persistence stay in the host (VideoOverlayImpl),
 * reached only through the StatusModalContext callbacks below.
 *
 * Status codes: 0=NONE, 1=WISHLIST, 2=DONE, 3=DOING
 */

import { STATUS_DISPLAY_ORDER as DISPLAY, STATUS_LABELS as LABELS } from './video-overlay-pure';
import {
  ThemeVars,
  sActionRow,
  sCancelBtn,
  sCard,
  sOverlay,
  sRatingBtn,
  sRatingGrid,
  sRatingLabel,
  sRatingSection,
  sSaveBtn,
  sSectionRow,
  sStatusBtn,
  sTitle,
} from './video-overlay-styles';

/** Host-provided state access + actions for the modal. */
export interface StatusModalContext {
  /** Attribute prefix for modal elements: 'umm-bili' | 'umm-yt'. */
  attrPrefix: string;
  /** Font stack for the modal overlay. */
  fontFamily: string;
  /** Current theme vars — read once at build time and again on each applyTheme(). */
  getThemeVars: () => ThemeVars;
  getStatus: () => number;
  getRating: () => number;
  setStatus: (status: number) => void;
  setRating: (rating: number) => void;
  /** Cancel clicked — host tears the modal down. */
  onCancel: () => void;
  /** Save clicked — host closes, repaints the FAB, persists the record, syncs the tracker. */
  onSave: () => void;
}

export interface StatusModal {
  el: HTMLDivElement;
  /** Re-paint card/cancel/rating styles with the (possibly switched) theme. */
  applyTheme: () => void;
}

/** Build the mark-status modal (status buttons + rating grid + actions). Not attached to the document. */
export function createStatusModal(ctx: StatusModalContext): StatusModal {
  const t = ctx.getThemeVars();
  const modal = document.createElement('div');
  modal.setAttribute(`data-${ctx.attrPrefix}-modal`, '');
  modal.style.cssText = sOverlay(t, ctx.fontFamily);

  const card = document.createElement('div');
  card.style.cssText = sCard(t);

  const title = document.createElement('div');
  title.setAttribute(`data-${ctx.attrPrefix}-title`, '');
  title.textContent = '\u6807\u8bb0\u72b6\u6001';
  title.style.cssText = sTitle();
  card.appendChild(title);

  let sbtns: HTMLButtonElement[] = [];
  let sv: HTMLButtonElement | null = null;
  let rr: HTMLDivElement | null = null;

  const updateUI = () => {
    if (!sbtns.length || !sv || !rr) return;
    sbtns.forEach((b, i) => {
      const idx = DISPLAY[i];
      if (idx === undefined) return;
      b.style.cssText = sStatusBtn(idx, ctx.getStatus());
    });
    sv.style.cssText = sSaveBtn(ctx.getStatus());
    rr.style.cssText = sRatingSection(ctx.getStatus() === 2);
  };

  const sr = document.createElement('div');
  sr.setAttribute(`data-${ctx.attrPrefix}-sr`, '');
  sr.style.cssText = sSectionRow();
  sbtns = [];
  DISPLAY.forEach((idx) => {
    const b = document.createElement('button');
    b.setAttribute(`data-${ctx.attrPrefix}-sb`, '');
    b.textContent = LABELS[idx];
    b.style.cssText = sStatusBtn(idx, ctx.getStatus());
    b.addEventListener('mouseenter', () => {
      if (ctx.getStatus() !== idx) b.style.opacity = '1';
    });
    b.addEventListener('mouseleave', () => {
      if (ctx.getStatus() !== idx) b.style.opacity = '0.85';
    });
    b.onclick = () => {
      ctx.setStatus(idx);
      updateUI();
    };
    sbtns.push(b);
    sr.appendChild(b);
  });
  card.appendChild(sr);

  rr = document.createElement('div');
  rr.setAttribute(`data-${ctx.attrPrefix}-rr`, '');
  rr.style.cssText = sRatingSection(ctx.getStatus() === 2);
  const rl = document.createElement('div');
  rl.setAttribute(`data-${ctx.attrPrefix}-rl`, '');
  rl.textContent = '\u8bc4\u5206';
  rl.style.cssText = sRatingLabel(t);
  rr.appendChild(rl);

  const rGrid = document.createElement('div');
  rGrid.setAttribute(`data-${ctx.attrPrefix}-rg`, '');
  rGrid.style.cssText = sRatingGrid();
  for (let ri = 0; ri <= 10; ri++) {
    const rb = document.createElement('button');
    rb.setAttribute(`data-${ctx.attrPrefix}-rb`, '');
    rb.textContent = String(ri);
    rb.style.cssText = sRatingBtn(t, ri, ctx.getRating());
    rb.addEventListener('mouseenter', () => {
      if (ri !== ctx.getRating()) rb.style.opacity = '1';
    });
    rb.addEventListener('mouseleave', () => {
      if (ri !== ctx.getRating()) rb.style.opacity = '0.85';
    });
    rb.onclick = ((v: number) => () => {
      ctx.setRating(v);
      const all = rGrid.querySelectorAll(
        `[data-${ctx.attrPrefix}-rb]`,
      ) as NodeListOf<HTMLButtonElement>;
      all.forEach((b) => {
        const bv = parseInt(b.textContent!, 10);
        b.style.cssText = sRatingBtn(t, bv, ctx.getRating());
      });
    })(ri);
    rGrid.appendChild(rb);
  }
  rr.appendChild(rGrid);
  card.appendChild(rr);

  const ar = document.createElement('div');
  ar.setAttribute(`data-${ctx.attrPrefix}-ar`, '');
  ar.style.cssText = sActionRow();

  const cb = document.createElement('button');
  cb.setAttribute(`data-${ctx.attrPrefix}-cancel`, '');
  cb.textContent = '\u53d6\u6d88';
  cb.style.cssText = sCancelBtn(t);
  cb.addEventListener('mouseenter', () => {
    cb.style.opacity = '0.8';
  });
  cb.addEventListener('mouseleave', () => {
    cb.style.opacity = '1';
  });
  cb.onclick = () => ctx.onCancel();
  ar.appendChild(cb);

  sv = document.createElement('button');
  sv.setAttribute(`data-${ctx.attrPrefix}-save`, '');
  sv.textContent = '\u4fdd\u5b58';
  sv.style.cssText = sSaveBtn(ctx.getStatus());
  sv.addEventListener('mouseenter', () => {
    sv.style.opacity = '0.85';
  });
  sv.addEventListener('mouseleave', () => {
    sv.style.opacity = '1';
  });
  sv.onclick = () => ctx.onSave();
  ar.appendChild(sv);

  card.appendChild(ar);
  modal.appendChild(card);

  const applyTheme = () => {
    const next = ctx.getThemeVars();
    const cardEl = modal.firstChild as HTMLElement | null;
    if (!cardEl) return;
    modal.style.background = next.overlay;
    cardEl.style.background = next.card;
    cardEl.style.color = next.fg;

    const cancel = cardEl.querySelector(
      `[data-${ctx.attrPrefix}-cancel]`,
    ) as HTMLButtonElement | null;
    if (cancel) cancel.style.cssText = sCancelBtn(next);

    const rlEl = cardEl.querySelector(`[data-${ctx.attrPrefix}-rl]`) as HTMLDivElement | null;
    if (rlEl) rlEl.style.cssText = sRatingLabel(next);

    const ratingBtns = cardEl.querySelectorAll(
      `[data-${ctx.attrPrefix}-rb]`,
    ) as NodeListOf<HTMLButtonElement>;
    ratingBtns.forEach((rb) => {
      const v = parseInt(rb.textContent!, 10);
      rb.style.cssText = sRatingBtn(next, v, ctx.getRating());
    });
  };

  return { el: modal, applyTheme };
}
