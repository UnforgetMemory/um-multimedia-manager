import { Page, BrowserContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 加载 Chrome 扩展
 */
export async function loadExtension(context: BrowserContext): Promise<string> {
  const extensionPath = path.resolve(__dirname, '../../dist');
  
  if (!fs.existsSync(extensionPath)) {
    throw new Error(`Extension build not found at ${extensionPath}. Run 'npm run build' first.`);
  }
  
  // 获取扩展 ID
  const [background] = context.serviceWorkers();
  if (!background) {
    throw new Error('No background service worker found');
  }
  
  const extensionId = background.url().split('/')[2];
  return extensionId;
}

/**
 * 打开 Popup 面板
 */
export async function openPopup(page: Page, extensionId: string): Promise<void> {
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  await page.goto(popupUrl);
  await page.waitForLoadState('networkidle');
}

/**
 * 注入测试记录到 IndexedDB
 */
export async function injectTestRecord(
  page: Page,
  record: {
    domain: string;
    provider: string;
    providerId: string;
    status: string;
    rating10: number;
    url?: string;
  }
): Promise<void> {
  const defaultUrl = `https://${record.provider === 'douban' ? (record.domain === 'music' ? 'music' : 'movie') : record.provider}.com/${record.domain}/${record.providerId}/`;
  
  await page.evaluate((data) => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('umm-database', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['records'], 'readwrite');
        const store = transaction.objectStore('records');
        
        const recordData = {
          domain: data.domain,
          provider: data.provider,
          providerId: data.providerId,
          url: data.url || defaultUrl,
          status: data.status,
          rating10: data.rating10,
          updatedAt: new Date().toISOString(),
        };
        
        const putRequest = store.put(recordData);
        putRequest.onsuccess = () => resolve(undefined);
        putRequest.onerror = () => reject(putRequest.error);
      };
    });
  }, {
    ...record,
    url: record.url || defaultUrl,
  });
  
  // 等待一小段时间确保数据写入完成
  await page.waitForTimeout(100);
}

/**
 * 清除所有测试数据
 */
export async function clearTestData(page: Page): Promise<void> {
  await page.evaluate(() => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('umm-database', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['records'], 'readwrite');
        const store = transaction.objectStore('records');
        
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => resolve(undefined);
        clearRequest.onerror = () => reject(clearRequest.error);
      };
    });
  });
}

/**
 * 捕获控制台日志
 */
export function captureConsoleLogs(page: Page, filterPattern?: string): string[] {
  const logs: string[] = [];
  
  page.on('console', msg => {
    const text = msg.text();
    if (!filterPattern || text.includes(filterPattern)) {
      logs.push(text);
    }
  });
  
  return logs;
}

/**
 * 获取查询结果文本
 */
export async function getQueryResultText(page: Page): Promise<{
  title: string | null;
  description: string | null;
  rating: string | null;
}> {
  const alertElement = await page.locator('[role="alert"]').first();
  
  if (!await alertElement.isVisible()) {
    return { title: null, description: null, rating: null };
  }
  
  const title = await alertElement.locator('h4').textContent();
  const description = await alertElement.locator('p').textContent();
  const ratingBadge = await alertElement.locator('.badge').textContent();
  
  return {
    title: title?.trim() || null,
    description: description?.trim() || null,
    rating: ratingBadge?.trim() || null,
  };
}
