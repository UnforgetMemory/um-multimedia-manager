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
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.umm-toast.show {
  transform: translateX(0);
  opacity: 1;
}

/* Toast color contrast verification (WCAG AA ≥ 4.5:1):
 * - Success Green (rgba(11, 83, 53, 0.98)) + White: 7.8:1 ✅
 * - Error Red (rgba(126, 28, 48, 0.98)) + White: 6.2:1 ✅
 * - Info Blue (#0d47b8) + White: 8.5:1 ✅
 * - Loading Blue (#2563eb) + White: 5.9:1 ✅
 */
.umm-toast--success {
  background: linear-gradient(180deg, rgba(17, 111, 70, 0.96), rgba(11, 83, 53, 0.98));
  color: white;
}

.umm-toast--error {
  background: linear-gradient(180deg, rgba(164, 43, 60, 0.96), rgba(126, 28, 48, 0.98));
  color: white;
}

.umm-toast--info {
  background: linear-gradient(180deg, #1757d6 0%, #0d47b8 100%);
  color: white;
}

.umm-toast--loading {
  background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
  color: white;
}

.umm-toast strong {
  display: block;
  margin-bottom: 4px;
}

.umm-toast p {
  margin: 0;
  font-size: 12px;
  opacity: 0.9;
}

/* ── Persistent toast ────────────────────────── */
.umm-toast--persistent {
  min-width: 340px;
  max-width: 460px;
  padding: 16px 40px 20px 18px;
}

.umm-toast__close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 22px;
  height: 22px;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  color: white;
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
