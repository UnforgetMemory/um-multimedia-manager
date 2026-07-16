import locales, { type Locale } from './locales'

const STORAGE_KEY = 'umm:locale'
const EXT_LANGUAGE_KEY = 'language'

let currentLocale: Locale = 'zh-CN'

async function detectLocale(): Promise<Locale> {
  // Try chrome.storage.local first (set by Vue apps via STORAGE_KEYS.LANGUAGE)
  try {
    const result = await chrome.storage.local.get(EXT_LANGUAGE_KEY)
    const stored = result[EXT_LANGUAGE_KEY] as Locale | undefined
    if (stored && stored in locales) return stored
  } catch {
    // chrome.storage not available
  }

  // Fall back to localStorage (legacy)
  const localStored = localStorage.getItem(STORAGE_KEY) as Locale | null
  if (localStored && localStored in locales) return localStored

  // Fall back to browser language
  const lang = navigator.language
  if (lang.startsWith('zh')) {
    if (lang.includes('TW') || lang.includes('HK')) return lang.includes('TW') ? 'zh-TW' : 'zh-HK'
    return 'zh-CN'
  }
  return 'en-US'
}

export async function initI18n(): Promise<void> {
  currentLocale = await detectLocale()
}

export async function setLocale(locale: Locale): Promise<void> {
  currentLocale = locale
  localStorage.setItem(STORAGE_KEY, locale)
  try {
    await chrome.storage.local.set({ [EXT_LANGUAGE_KEY]: locale })
  } catch {
    // chrome.storage not available
  }
}

export function getLocale(): Locale {
  return currentLocale
}

/**
 * Start listening for locale changes from other contexts (options/popup tabs).
 * Call this once after initI18n() to keep the content script's locale in sync.
 */
export function startLocaleSync(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    const langChange = changes[EXT_LANGUAGE_KEY]
    if (langChange?.newValue && langChange.newValue !== langChange.oldValue) {
      const newLocale = langChange.newValue as Locale
      if (newLocale in locales) {
        currentLocale = newLocale
      }
    }
  })
}

export function t(key: string, params?: Record<string, string | number>): string {
  const str = locales[currentLocale]?.[key] || locales['en-US']?.[key] || key
  if (!params) return str
  return Object.entries(params).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
    str
  )
}
