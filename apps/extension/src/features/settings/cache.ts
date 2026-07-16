import type { AppSettings, LogLevel } from '@/types'
import { STORAGE_KEYS } from '@/config'

class SettingsCache {
  private cache: AppSettings | null = null
  private initPromise: Promise<void> | null = null

  async init(): Promise<void> {
    if (this.cache) return
    if (this.initPromise) return this.initPromise
    this.initPromise = (async () => {
      const raw = await chrome.storage.local.get(null)
      this.cache = {
        webdavUrl: (raw[STORAGE_KEYS.WEBDAV_URL] as string) ?? '',
        webdavUsername: (raw[STORAGE_KEYS.WEBDAV_USERNAME] as string) ?? '',
        webdavPassword: (raw[STORAGE_KEYS.WEBDAV_PASSWORD] as string) ?? '',
        neodbToken: (raw[STORAGE_KEYS.NEODB_TOKEN] as string) ?? '',
        autoSync: (raw[STORAGE_KEYS.AUTO_SYNC] as boolean) ?? false,
        autoSyncNeoDB: (raw[STORAGE_KEYS.AUTO_SYNC_NEO_DB] as boolean) ?? false,
        syncInterval: (raw[STORAGE_KEYS.SYNC_INTERVAL] as number) ?? 30,
        theme: (raw[STORAGE_KEYS.THEME] as AppSettings['theme']) ?? 'auto',
        language: (raw[STORAGE_KEYS.LANGUAGE] as string) ?? 'zh-CN',
        notificationEnabled: (raw[STORAGE_KEYS.NOTIFICATION_ENABLED] as boolean) ?? true,
        appearance: (raw[STORAGE_KEYS.APPEARANCE] as AppSettings['appearance']) ?? 'auto',
        accentColor: (raw[STORAGE_KEYS.ACCENT_COLOR] as string) ?? 'blue',
        grayColor: (raw[STORAGE_KEYS.GRAY_COLOR] as string) ?? 'slate',
        debugEnabled: (raw[STORAGE_KEYS.DEBUG_ENABLED] as boolean) ?? false,
        logLevel: (raw[STORAGE_KEYS.LOG_LEVEL] as LogLevel) ?? 'info',
      }
    })()
    return this.initPromise
  }

  get(): AppSettings {
    if (!this.cache) {
      console.warn('[SettingsCache] Cache not initialized, returning defaults')
      return this.defaultSettings()
    }
    return { ...this.cache }
  }

  async updateAll(settings: Partial<AppSettings>): Promise<void> {
    if (!this.cache) await this.init()
    Object.assign(this.cache!, settings)
    await chrome.storage.local.set(settings as Record<string, any>)
  }

  startListening(): void {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !this.cache) return
      for (const [key, change] of Object.entries(changes)) {
        if (change.newValue !== undefined) {
          ;(this.cache as any)[key] = change.newValue
        }
      }
      // Sync theme from umm:appearance key (used by content scripts / AppearanceTab)
      // into settingsCache's theme field for background consistency
      const appearanceChange = changes['umm:appearance']
      if (appearanceChange?.newValue) {
        const mode = (appearanceChange.newValue as { theme?: string }).theme
        if (mode && ['auto', 'light', 'dark'].includes(mode)) {
          this.cache.theme = mode as AppSettings['theme']
        }
      }
    })
  }

  private defaultSettings(): AppSettings {
    return {
      webdavUrl: '', webdavUsername: '', webdavPassword: '',
      neodbToken: '', autoSync: false, autoSyncNeoDB: false,
      syncInterval: 30,       theme: 'auto', language: 'zh-CN',
      notificationEnabled: true, appearance: 'auto',
      accentColor: 'blue', grayColor: 'slate',
      debugEnabled: false, logLevel: 'info',
    }
  }
}

export const settingsCache = new SettingsCache()
