import { createI18n } from 'vue-i18n';
import { messages, resolveSpaLocale } from '@/libraries/locales';
import type { MessageSchema, Locale } from '@/libraries/locales';
import { STORAGE_KEYS } from '@/libraries/config';

/**
 * Detect the user's preferred locale from chrome.storage, then navigator.language.
 * Falls back to 'zh-CN' (the extension's primary locale).
 */
async function detectLocale(): Promise<Locale> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.LANGUAGE);
    const stored = result[STORAGE_KEYS.LANGUAGE] as string | undefined;
    // 显式解析而不是 `stored in messages`：zh-HK 有偏好无词典，按 SPA_LOCALE_FALLBACK
    // 定调为 zh-TW 文案（存储值仍是 zh-HK）。原写法会把它当成垃圾值跌进
    // navigator 分支 —— 浏览器是 en 的粤语用户 popup 会变成英文（偶然落点）。
    const resolved = resolveSpaLocale(stored);
    if (resolved) return resolved;
  } catch {
    // chrome.storage unavailable (e.g. during local dev)
  }

  // Fall back to browser language
  const navLang = navigator.language;
  if (navLang === 'zh-CN' || navLang === 'zh-TW' || navLang === 'en-US') return navLang;
  if (navLang.startsWith('zh'))
    return navLang.includes('TW') || navLang.includes('HK') ? 'zh-TW' : 'zh-CN';
  return 'zh-CN';
}

export async function createAppI18n() {
  const locale = await detectLocale();

  return createI18n<[MessageSchema], Locale>({
    legacy: false,
    locale,
    fallbackLocale: 'zh-CN',
    messages: messages as unknown as Record<Locale, MessageSchema>,
  });
}

/**
 * Persist the user's locale choice to chrome.storage.
 * Call this after the user changes language in the UI.
 */
export function persistLocale(locale: Locale) {
  try {
    // set() is async: the try/catch alone only eats a synchronous throw
    // (chrome.storage missing); the rejection needs its own .catch, else a
    // quota/invalidated-context failure escapes as an unhandled rejection.
    chrome.storage.local.set({ [STORAGE_KEYS.LANGUAGE]: locale }).catch(() => {
      // ignore — locale switch already applied in-memory
    });
  } catch {
    // ignore
  }
}

/** Available locales with display labels */
export const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en-US', label: 'English' },
];
