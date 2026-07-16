import { createI18n } from 'vue-i18n'
import { messages } from '@/shared/locales'
import type { MessageSchema, Locale } from '@/shared/locales'
import { STORAGE_KEYS } from '@/config'

/**
 * Detect the user's preferred locale from chrome.storage, then navigator.language.
 * Falls back to 'zh-CN' (the extension's primary locale).
 */
async function detectLocale(): Promise<Locale> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.LANGUAGE)
    const stored = result[STORAGE_KEYS.LANGUAGE] as string | undefined
    if (stored && stored in messages) return stored as Locale
  } catch {
    // chrome.storage unavailable (e.g. during local dev)
  }

  // Fall back to browser language
  const navLang = navigator.language
  if (navLang === 'zh-CN' || navLang === 'zh-TW' || navLang === 'en-US') return navLang
  if (navLang.startsWith('zh')) return navLang.includes('TW') || navLang.includes('HK') ? 'zh-TW' : 'zh-CN'
  return 'zh-CN'
}

export async function createAppI18n() {
  const locale = await detectLocale()

  return createI18n<[MessageSchema], Locale>({
    legacy: false,
    locale,
    fallbackLocale: 'zh-CN',
    messages: messages as unknown as Record<Locale, MessageSchema>,
  })
}

/**
 * Persist the user's locale choice to chrome.storage.
 * Call this after the user changes language in the UI.
 */
export function persistLocale(locale: Locale) {
  try {
    chrome.storage.local.set({ [STORAGE_KEYS.LANGUAGE]: locale })
  } catch {
    // ignore
  }
}

/** Available locales with display labels */
export const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en-US', label: 'English' },
]
