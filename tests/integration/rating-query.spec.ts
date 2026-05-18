import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

test.describe('Rating Query Integration Tests', () => {
  let context: any;
  let page: any;
  let extensionId: string;

  test.beforeAll(async () => {
    // 验证扩展构建是否存在
    if (!fs.existsSync(EXTENSION_PATH)) {
      throw new Error(`Extension build not found at ${EXTENSION_PATH}. Run 'npm run build' first.`);
    }

    // 启动带扩展的 Chromium
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    // 获取扩展 ID
    const [background] = context.serviceWorkers();
    if (!background) {
      throw new Error('No background service worker found');
    }
    extensionId = background.url().split('/')[2];
    console.log('Extension ID:', extensionId);

    // 打开 Popup
    page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  test('should query douban movie record from database', async () => {
    // 1. 注入测试数据到 IndexedDB
    await page.evaluate(() => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('umm-database', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(['records'], 'readwrite');
          const store = transaction.objectStore('records');
          
          const recordData = {
            domain: 'movie',
            provider: 'douban',
            providerId: '1234567',
            url: 'https://movie.douban.com/subject/1234567/',
            status: 'done',
            rating10: 8,
            updatedAt: new Date().toISOString(),
          };
          
          const putRequest = store.put(recordData);
          putRequest.onsuccess = () => resolve(undefined);
          putRequest.onerror = () => reject(putRequest.error);
        };
      });
    });
    
    await page.waitForTimeout(100);
    
    // 2. 输入 URL
    await page.fill('input[type="text"]', 'https://movie.douban.com/subject/1234567/');
    
    // 3. 等待防抖查询完成
    await page.waitForTimeout(600);
    
    // 4. 验证查询结果
    const alertElement = page.locator('[role="alert"]').first();
    const isVisible = await alertElement.isVisible();
    expect(isVisible).toBe(true);
    
    const title = await alertElement.locator('h4').textContent();
    expect(title).toContain('找到记录');
    
    const ratingBadge = await alertElement.locator('.badge').textContent();
    expect(ratingBadge).toContain('8/10');
  });

  test('should show "not found" for non-existent record', async () => {
    await page.fill('input[type="text"]', 'https://movie.douban.com/subject/9999999/');
    await page.waitForTimeout(600);
    
    const alertElement = page.locator('[role="alert"]').first();
    const isVisible = await alertElement.isVisible();
    expect(isVisible).toBe(true);
    
    const title = await alertElement.locator('h4').textContent();
    expect(title).toContain('未找到记录');
  });

  test('should capture query logs for debugging', async () => {
    const logs: string[] = [];
    
    page.on('console', (msg: any) => {
      if (msg.text().includes('[Query]')) {
        logs.push(msg.text());
      }
    });
    
    await page.fill('input[type="text"]', 'https://movie.douban.com/subject/1234567/');
    await page.waitForTimeout(600);
    
    // 验证日志输出
    const parsedLog = logs.find(log => log.includes('[Query] Parsed result:'));
    const mapLog = logs.find(log => log.includes('[Query] Map size:'));
    const foundLog = logs.find(log => log.includes('[Query] Found record:'));
    
    expect(parsedLog).toBeDefined();
    expect(mapLog).toBeDefined();
    expect(foundLog).toBeDefined();
    
    console.log('Captured logs:', logs);
  });
});
