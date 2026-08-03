/**
 * Bangumi P1 端到端手动 QA：
 * 1. 以 headless chromium 加载构建产物扩展 (dist/chrome-mv3)
 * 2. 将 https://bgm.tv/subject/253 路由代理到本地离线 HTML（已登录态快照）
 * 3. 断言 .umm-status-chip 注入到收藏盒内 rate-now 表单之前
 */
import { chromium } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

const EXT_PATH = path.resolve('dist/chrome-mv3')
const HTML_PATH = path.resolve('.localref/bangumi/カウボーイビバップ _ Bangumi 番组计划.html')
const USER_DATA = '/tmp/umm-bangumi-qa-profile'

const html = fs.readFileSync(HTML_PATH, 'utf-8')

async function main() {
  const context = await chromium.launchPersistentContext(USER_DATA, {
    headless: true,
    executablePath: process.env.UMM_QA_CHROME ?? '/home/um/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
    ],
  })

  // 拦截 bgm.tv 域 → 本地离线 HTML（保持 URL 的 subject id 语义）
  await context.route('https://bgm.tv/**', (route) => {
    void route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
  })

  const page = await context.newPage()
  await page.goto('https://bgm.tv/subject/253', { waitUntil: 'domcontentloaded' })

  // 等待内容脚本完成初始化 + chip 注入（healthCheck 最多 8 次退避，给足时间）
  await page.waitForSelector('.umm-status-chip[data-umm-owner^="bangumi-"]', { timeout: 15000 })

  const result = await page.evaluate(() => {
    const chip = document.querySelector('.umm-status-chip[data-umm-owner^="bangumi-"]')
    const sidePanel = document.querySelector('#panelInterestWrapper .SidePanel')
    const rateForm = document.querySelector('form[name="rate-now"]')
    const subjectNav = document.querySelector('#headerSubject .subjectNav')
    return {
      chipText: chip?.textContent?.trim() ?? null,
      chipOwner: chip?.getAttribute('data-umm-owner') ?? null,
      chipStatus: chip?.getAttribute('data-status') ?? null,
      inSidePanel: sidePanel?.contains(chip) ?? false,
      beforeRateForm: rateForm && chip ? (rateForm.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_PRECEDING) !== 0 : null,
      interestType: window.INTEREST_TYPE ?? null,
    }
  })

  console.log('QA RESULT:', JSON.stringify(result, null, 2))

  const pass =
    result.chipOwner?.startsWith('bangumi-') === true &&
    result.chipStatus === 'done' &&
    result.inSidePanel === true &&
    result.beforeRateForm === true

  console.log(pass ? '✅ QA PASS: chip injected in SidePanel before rate-now form, status=done' : '❌ QA FAIL')
  await context.close()
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('QA ERROR:', err)
  process.exit(1)
})
