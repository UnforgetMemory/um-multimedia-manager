import { onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { STORAGE_KEYS } from '@/libraries/config';
import { resolveSpaLocale, type Locale } from '@/libraries/locales';

/**
 * Syncs the vue-i18n locale across tabs when language is changed in another context.
 * Must be called within a Vue component's setup() — uses useI18n() internally.
 */
export function useLocaleSync(): void {
  const { locale } = useI18n();

  const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local') return;
    const langChange = changes[STORAGE_KEYS.LANGUAGE];
    if (langChange?.newValue && langChange.newValue !== langChange.oldValue) {
      const next = langChange.newValue;
      // A language we can hold but that has no SPA dictionary (zh-HK) falls to
      // zh-TW via the downgrade table. Without this step vue-i18n treats it as
      // an unknown locale and accidentally falls back to fallbackLocale
      // (zh-CN), so "new tab in Traditional / switch to Simplified mid-session"
      // contradicts itself. Unknown values still pass through unchanged
      // (existing contract: use-locale-sync.spec pins this path with the fake
      // locale 'en').
      const resolved = typeof next === 'string' ? resolveSpaLocale(next) : undefined;
      locale.value = resolved ?? (next as Locale);
    }
  };

  onMounted(() => {
    chrome.storage.onChanged.addListener(onChange);
  });

  onUnmounted(() => {
    chrome.storage.onChanged.removeListener(onChange);
  });
}
