import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { messages } from '@/shared/locales'
import type { Locale } from '@/shared/locales'
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

  const navLang = navigator.language
  if (navLang === 'zh-CN' || navLang === 'zh-TW' || navLang === 'en-US') return navLang
  if (navLang.startsWith('zh')) return navLang.includes('TW') || navLang.includes('HK') ? 'zh-TW' : 'zh-CN'
  return 'zh-CN'
}

export async function initReactI18n() {
  const locale = await detectLocale()

  await i18n.use(initReactI18next).init({
    resources: messages as Record<string, any>,
    lng: locale,
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
  })

  return i18n
}

export function persistLocale(locale: Locale) {
  try {
    chrome.storage.local.set({ [STORAGE_KEYS.LANGUAGE]: locale })
  } catch {
    // ignore
  }
}

export const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en-US', label: 'English' },
]
