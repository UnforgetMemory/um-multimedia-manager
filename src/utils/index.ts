/**
 * 工具函数模块
 */

import { CONFIG } from '../config';

export const Utils = {
  /**
   * 安全解析 JSON
   */
  safeParse<T = any>(raw: string, fallback: T): T {
    try {
      return JSON.parse(raw) as T;
    } catch (_error) {
      return fallback;
    }
  },

  /**
   * 标准化状态值 (0=未看, 1=在看, 2=已看)
   */
  normalizeStatus(status: unknown): number {
    if (status === CONFIG.STATUS.DONE || status === 1 || status === 'done' || status === 2) {
      return 2;  // 已看
    }
    if (status === CONFIG.STATUS.WISH || status === 3 || status === 'wish' || status === 1) {
      return 1;  // 在看
    }
    return 0;  // 未看
  },

  /**
   * 限制评分范围(0-10,步长0.5)
   */
  clampRating10(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      return 0;
    }
    const normalized = Math.max(0, Math.min(10, Math.round(num * 2) / 2));
    return Number(normalized.toFixed(1));
  },

  /**
   * 格式化评分显示
   */
  formatRating10(value: unknown): string {
    const rating = this.clampRating10(value);
    if (!rating) {
      return '';
    }
    return Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
  },

  /**
   * 获取当前 ISO 时间字符串
   */
  nowISO(): string {
    return new Date().toISOString();
  },

  /**
   * 简化 URL(移除 hash 和 query)
   */
  normalizeUrl(url: string): string {
    return String(url || '').split('#')[0].split('?')[0];
  },

  /**
   * 节流函数
   */
  throttle<T extends (...args: any[]) => void>(fn: T, delay: number): T {
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    return ((...args: Parameters<T>) => {
      const now = Date.now();
      if (now - last >= delay) {
        last = now;
        fn(...args);
        return;
      }
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        last = Date.now();
        fn(...args);
      }, delay - (now - last));
    }) as T;
  },

  /**
   * 防抖函数
   */
  debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
    let timer: ReturnType<typeof setTimeout> | null = null;

    return ((...args: Parameters<T>) => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => fn(...args), delay);
    }) as T;
  },

  /**
   * 延迟执行
   */
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  /**
   * 等待 DOM 元素出现
   */
  waitForElement(
    selector: string,
    callback: (element: Element) => void,
    timeout = 15000,
  ): () => void {
    const existing = document.querySelector(selector);
    if (existing) {
      callback(existing);
      return () => {};
    }

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) {
        observer.disconnect();
        callback(found);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => observer.disconnect(), timeout);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  },

  /**
   * 淡化元素
   */
  dimElement(element: HTMLElement | null): void {
    if (!element || element.dataset.ummDimmed === 'true') {
      return;
    }
    element.dataset.ummDimmed = 'true';
    element.style.transition = 'opacity 180ms ease';
    element.style.opacity = '0.34';
    element.addEventListener('mouseenter', () => {
      element.style.opacity = '1';
    });
    element.addEventListener('mouseleave', () => {
      element.style.opacity = '0.34';
    });
  },

  /**
   * 生成随机延迟
   */
  getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  /**
   * 将原始数据转换为数组
   */
  canonicalArrayMap(raw: any): any[] {
    if (Array.isArray(raw)) {
      return raw;
    }
    if (typeof raw === 'string') {
      const parsed = this.safeParse(raw, []);
      return Array.isArray(parsed) ? parsed : [];
    }
    return [];
  },

  /**
   * 将对象或数组转换为对象数组
   */
  toArrayOfObjects(raw: any): any[] {
    if (Array.isArray(raw)) {
      return raw;
    }
    if (raw && typeof raw === 'object') {
      return Object.values(raw);
    }
    return [];
  },

  /**
   * 格式化相对时间
   */
  formatRelativeTime(isoString: string): string {
    const now = Date.now();
    const date = new Date(isoString).getTime();
    const diff = now - date;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    
    // 超过7天显示具体日期
    return new Date(isoString).toLocaleDateString('zh-CN');
  },
};
