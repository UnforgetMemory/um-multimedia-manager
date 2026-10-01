import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * SPA ToastContainer accessibility — source-fixture assertions.
 *
 * The SFC cannot be compiled in this runner (precedent:
 * douban-mark-dialog-a11y.spec.ts), so the a11y contract is pinned on the
 * template text:
 * - the live region (role/aria-live/aria-atomic) sits on the PERSISTENT
 *   container, derived from the shared @/libraries/toast-aria contract
 *   (the mapping table itself is pinned by toast-aria-contract.spec.ts:
 *   error → alert/assertive, everything else → status/polite).
 *   Items are plain content: per-item live regions created with their text
 *   already inside are skipped by many screen readers.
 * - decorative icons aria-hidden; close button type=button with a LOCALIZED
 *   aria-label resolved through vue-i18n in every shipped locale.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.resolve(HERE, '../../src/feature/ToastContainer.vue'), 'utf8');
const localeSrc = (locale: string) =>
  fs.readFileSync(path.resolve(HERE, `../../src/libraries/locales/${locale}.ts`), 'utf8');

test.describe('SPA ToastContainer a11y', () => {
  test('live-region semantics sit on the persistent container via the shared contract', () => {
    expect(SRC).toContain("import { toastAria } from '@/libraries/toast-aria'");
    expect(SRC).toContain(':role="regionAria.role"');
    expect(SRC).toContain(':aria-live="regionAria.live"');
    // The container stacks, so atomic must stay off: atomic=true re-reads every
    // visible toast on each append instead of only the new one.
    expect(SRC).toContain('aria-atomic="false"');
    expect(SRC).not.toContain('aria-atomic="true"');
    // regionAria is resolved through toastAria, never a local literal mapping
    expect(SRC).toContain('toastAria(toast.type)');
    expect(SRC).toContain("toastAria('info')");
    expect(SRC).not.toContain("type === 'error' ? 'alert' : 'status'");
    expect(SRC).not.toContain("type === 'error' ? 'assertive' : 'polite'");
  });

  test('toast items are plain content without their own live-region roles', () => {
    // Corrected contract: per-item live regions (created with their text already
    // inside) are not announced by many screen readers — items must stay plain.
    expect(SRC).not.toContain(':role="toastAria(toast.type).role"');
    expect(SRC).not.toContain(':aria-live="toastAria(toast.type).live"');
  });

  test('decorative icons are hidden, close button is a labelled button', () => {
    expect(SRC).toContain('aria-hidden="true"');
    expect(SRC).toContain('type="button"');
    expect(SRC).toContain(`:aria-label="t('toast.closeNotification')"`);
    // the previously hardcoded literal must be gone from the component
    expect(SRC).not.toContain('aria-label="关闭通知"');
  });

  test('the close label resolves in every shipped locale', () => {
    expect(localeSrc('en')).toContain("'toast.closeNotification': 'Close notification'");
    expect(localeSrc('zh-CN')).toContain("'toast.closeNotification': '关闭通知'");
    expect(localeSrc('zh-TW')).toContain("'toast.closeNotification': '關閉通知'");
  });
});
