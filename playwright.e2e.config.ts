import { defineConfig } from '@playwright/test';

/**
 * X9-C end-to-end configuration — REAL browser + REAL built extension
 * (dist/chrome-mv3, produced by `npm run build`) with host pages replaced
 * by local mock web pages via network interception (URLs stay on the real
 * douban hosts so content scripts still inject; bodies are fixtures).
 *
 * Deliberately NOT part of playwright.config.ts: the default config would
 * otherwise sweep tests/e2e into `npm run test:unit` (its testDir is ./tests
 * and tests/e2e specs need a headed persistent-context browser with the
 * unpacked extension loaded).
 *
 * Facts established empirically on this stack (Playwright 1.62 / bundled
 * Chromium / Windows):
 *  - Unpacked MV3 extensions never load in ANY headless mode of the bundled
 *    Chromium (`--load-extension` is ignored; no service_worker CDP target
 *    ever appears). Headed mode (`headless: false`) is therefore mandatory.
 *  - Playwright's `context.waitForEvent('serviceworker')` does not fire for
 *    the extension SW in a persistent context — the harness derives the
 *    extension id by polling `context.serviceWorkers()` plus the browser-level
 *    CDP `Target.getTargets` (type 'service_worker', chrome-extension:// URL)
 *    instead. See tests/e2e/fixtures/extension-harness.ts.
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results/e2e-artifacts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'e2e' }],
});
