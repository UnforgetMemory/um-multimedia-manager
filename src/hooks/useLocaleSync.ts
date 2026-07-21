import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { STORAGE_KEYS } from '@/config'
import type { Locale } from '@/shared/locales'

export function useLocaleSync(): void {
  const { i18n } = useTranslation()

  useEffect(() => {
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return
      const langChange = changes[STORAGE_KEYS.LANGUAGE]
      if (langChange?.newValue && langChange.newValue !== langChange.oldValue && i18n.language !== langChange.newValue) {
        i18n.changeLanguage(langChange.newValue as Locale)
      }
    }

    chrome.storage.onChanged.addListener(onChange)

    return () => {
      chrome.storage.onChanged.removeListener(onChange)
    }
  }, [i18n])
}
