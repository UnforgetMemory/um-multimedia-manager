import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { STORAGE_KEYS } from '@/config'
import type { Locale } from '@/locales'

/**
 * Syncs the vue-i18n locale across tabs when language is changed in another context.
 * Must be called within a Vue component's setup() — uses useI18n() internally.
 */
export function useLocaleSync(): void {
  const { locale } = useI18n()

  const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local') return
    const langChange = changes[STORAGE_KEYS.LANGUAGE]
    if (langChange?.newValue && langChange.newValue !== langChange.oldValue) {
      locale.value = langChange.newValue as Locale
    }
  }

  onMounted(() => {
    chrome.storage.onChanged.addListener(onChange)
  })

  onUnmounted(() => {
    chrome.storage.onChanged.removeListener(onChange)
  })
}
