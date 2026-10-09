import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* Spec files share one module registry per worker, and vendor modules capture
 * DOM globals when they are first imported — so the globals must exist before
 * any spec module is evaluated, not per file. */
const domBaseline = path.resolve('tests/unit/helpers/worker-dom-baseline.mjs');
if (!fs.existsSync(domBaseline)) {
  throw new Error(`missing DOM baseline preload: ${domBaseline}`);
}
const baselineFlag = `--import=${pathToFileURL(domBaseline).href}`;
process.env.NODE_OPTIONS = process.env.NODE_OPTIONS
  ? `${process.env.NODE_OPTIONS} ${baselineFlag}`
  : baselineFlag;

/**
 * Read environment variables from file.
 * https://github.com/motdotnode/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* tests/e2e runs real browser + loaded extension under playwright.e2e.config.ts
   * (npm run test:e2e) — never sweep it into `npm run test:unit` / default runs. */
  testIgnore: ['**/e2e/**'],
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html', { outputFolder: 'test-results/html' }], ['list']],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Capture console logs */
    actionTimeout: 30000,
    navigationTimeout: 30000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Folder for test artifacts such as screenshots, videos, traces, etc. */
  outputDir: 'test-results/artifacts',
});
