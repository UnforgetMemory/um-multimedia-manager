/**
 * Shared toast notification CSS styles.
 *
 * Used by:
 * - Content script FloatingToast (injectStyles)
 * - Background __showInlineToast (injected via executeScript)
 *
 * This is the canonical source — keep both consumers in sync.
 */
export const TOAST_CORE_CSS = `
/* ── Base toast ──────────────────────────────── */
.umm-toast {
  padding: 14px 18px;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 4px 8px rgba(0, 0, 0, 0.1);
  font-size: 14px;
  min-width: 300px;
  max-width: 420px;
  transform: translateX(120%);
  opacity: 0;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(8px);
  pointer-events: auto;
  position: relative;
  overflow: hidden;
  /* inherit instead of a hardcoded system stack: the toast lives in the
     page's light DOM (like every other legacy injection: neodb buttons,
     badges), so its font must follow the page/theme font like they do.
     A fixed stack previously left the toast looking like an orphan UI. */
  font-family: inherit;
}

.umm-toast.show {
  transform: translateX(0);
  opacity: 1;
}

/* Toast color contrast verification (WCAG AA ≥ 4.5:1):
 * - Success Green (rgba(11, 83, 53, 0.98)) + Ink white: 7.8:1 ✅
 * - Error Red (rgba(126, 28, 48, 0.98)) + Ink white: 6.2:1 ✅
 * - Info Blue (#3a55ec top) + Ink white: ≈5.7:1 ✅ (deep end #2f43cf higher)
 * - Loading Blue (#2563eb top) + Ink white: ≈5.1:1 ✅ (deep end #1d4ed8 higher)
 */
.umm-toast--success {
  background: linear-gradient(180deg, rgba(17, 111, 70, 0.96), rgba(11, 83, 53, 0.98));
  color: var(--usl-ink-on-fill, #ffffff);
}

.umm-toast--error {
  background: linear-gradient(180deg, rgba(164, 43, 60, 0.96), rgba(126, 28, 48, 0.98));
  color: var(--usl-ink-on-fill, #ffffff);
}

.umm-toast--info {
  background: linear-gradient(180deg, #3a55ec 0%, #2f43cf 100%);
  color: var(--usl-ink-on-fill, #ffffff);
}

.umm-toast--loading {
  background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
  color: var(--usl-ink-on-fill, #ffffff);
}

.umm-toast strong {
  display: block;
  margin-bottom: 4px;
  /* Explicit color:inherit — a host page styling p or strong with its own
     color would otherwise paint the toast text directly and override the
     ink inherited from the type class, rendering it in the page's dark
     text color (reported as black toasts on neodb).  */
  color: inherit;
}

.umm-toast p {
  margin: 0;
  font-size: 12px;
  opacity: 0.9;
  color: inherit;
}

/* ── Persistent toast ────────────────────────── */
.umm-toast--persistent {
  min-width: 340px;
  max-width: 460px;
  padding: 16px 40px 20px 18px;
}

/* Ink follows the legacy theme token (--usl-ink-on-fill), like every other
   light-DOM control (neodb buttons, badges); pages without UMM injection
   fall back to white. Semantic toast backgrounds stay theme-independent
   (variant = meaning), so ink-vs-bg contrast stays AA-verified. */
.umm-toast__close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 22px;
  height: 22px;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: var(--usl-ink-on-fill, #ffffff);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  transition: background 0.2s ease;
}

.umm-toast__close:hover,
.umm-toast__close:focus-visible {
  background: rgba(255, 255, 255, 0.35);
  outline: none;
}

.umm-toast__close:focus-visible {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6);
}

/* ── Progress bar ────────────────────────────── */
.umm-toast__progress-track {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.umm-toast__progress-bar {
  height: 100%;
  width: 0%;
  background: rgba(255, 255, 255, 0.7);
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 0 2px 2px 0;
}
`
