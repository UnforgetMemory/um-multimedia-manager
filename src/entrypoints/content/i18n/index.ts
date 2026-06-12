import locales, { type Locale } from './locales'

const STORAGE_KEY = 'umm:locale'

let currentLocale: Locale = 'zh-CN'

function detectLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
  if (stored && stored in locales) return stored
  const lang = navigator.language
  if (lang.startsWith('zh')) {
    if (lang.includes('TW') || lang.includes('HK')) return lang.includes('TW') ? 'zh-TW' : 'zh-HK'
    return 'zh-CN'
  }
  return 'en-US'
}

export function initI18n(): void {
  currentLocale = detectLocale()
}

export function setLocale(locale: Locale): void {
  currentLocale = locale
  localStorage.setItem(STORAGE_KEY, locale)
}

export function getLocale(): Locale {
  return currentLocale
}

export function t(key: string, params?: Record<string, string | number>): string {
  const str = locales[currentLocale]?.[key] || locales['en-US']?.[key] || key
  if (!params) return str
  return Object.entries(params).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
    str
  )
}
