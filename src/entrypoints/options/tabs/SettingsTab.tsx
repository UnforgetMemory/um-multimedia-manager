import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Key, Bug, Globe, Save } from 'lucide-react'
import { safeSendMessage } from '@/utils/context'
import { persistLocale, LOCALE_OPTIONS } from '@/shared/plugins/i18n-react'
import type { AppSettings } from '@/types'

const LOG_LEVEL_OPTIONS = [
  { value: 'debug' as const, label: 'Debug', descKey: 'settings.logDebugDesc' },
  { value: 'info' as const, label: 'Info', descKey: 'settings.logInfoDesc' },
  { value: 'warn' as const, label: 'Warn', descKey: 'settings.logWarnDesc' },
  { value: 'error' as const, label: 'Error', descKey: 'settings.logErrorDesc' },
]

export function SettingsTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const [neodbToken, setNeodbToken] = useState('')
  const [autoSyncNeoDB, setAutoSyncNeoDB] = useState(false)
  const [debugEnabled, setDebugEnabled] = useState(false)
  const [logLevel, setLogLevel] = useState<AppSettings['logLevel']>('info')
  const [saving, setSaving] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await safeSendMessage<{ settings: AppSettings }>({ type: 'GET_SETTINGS' })
        if (res?.settings) {
          setNeodbToken(res.settings.neodbToken || '')
          setAutoSyncNeoDB(res.settings.autoSyncNeoDB || false)
          setDebugEnabled(res.settings.debugEnabled || false)
          setLogLevel(res.settings.logLevel || 'info')
        }
      } catch {
        // silent
      } finally {
        setInitialized(true)
      }
    }
    loadSettings()
  }, [])

  async function saveSettings() {
    setSaving(true)
    try {
      await safeSendMessage({
        type: 'UPDATE_SETTINGS',
        payload: {
          neodbToken,
          autoSyncNeoDB,
          debugEnabled,
          logLevel,
        },
      })
      toast.success(t('common.saved'))
    } catch {
      toast.error(t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (!initialized) {
    return <div className="umm:animate-pulse umm:h-32 umm:bg-muted umm:rounded" />
  }

  return (
    <div className="umm:space-y-6">
      <h2 className="umm:text-lg umm:font-semibold">{t('nav.settings')}</h2>

      {/* NeoDB Settings */}
      <div className="umm:space-y-4">
        <h3 className="umm:text-sm umm:font-medium umm:text-muted-foreground umm:flex umm:items-center umm:gap-2">
          <Key className="umm:h-4 umm:w-4" />
          NeoDB
        </h3>
        <div className="umm:space-y-3">
          <div className="umm:space-y-1">
            <label className="umm:text-sm umm:font-medium">{t('settings.neodbToken')}</label>
            <Input
              type="password"
              value={neodbToken}
              onChange={(e) => setNeodbToken(e.target.value)}
              placeholder={t('settings.neodbTokenPlaceholder')}
            />
          </div>
          <div className="umm:flex umm:items-center umm:justify-between">
            <label className="umm:text-sm">{t('settings.autoSyncNeoDB')}</label>
            <Switch checked={autoSyncNeoDB} onCheckedChange={setAutoSyncNeoDB} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Debug Settings */}
      <div className="umm:space-y-4">
        <h3 className="umm:text-sm umm:font-medium umm:text-muted-foreground umm:flex umm:items-center umm:gap-2">
          <Bug className="umm:h-4 umm:w-4" />
          {t('settings.debug')}
        </h3>
        <div className="umm:space-y-3">
          <div className="umm:flex umm:items-center umm:justify-between">
            <label className="umm:text-sm">{t('settings.debugEnabled')}</label>
            <Switch checked={debugEnabled} onCheckedChange={setDebugEnabled} />
          </div>
          <div className="umm:space-y-1">
            <label className="umm:text-sm umm:font-medium">{t('settings.logLevel')}</label>
            <Select value={logLevel} onValueChange={(v) => setLogLevel(v as AppSettings['logLevel'])}>
              <SelectTrigger className="umm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOG_LEVEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      {/* Language */}
      <div className="umm:space-y-4">
        <h3 className="umm:text-sm umm:font-medium umm:text-muted-foreground umm:flex umm:items-center umm:gap-2">
          <Globe className="umm:h-4 umm:w-4" />
          {t('settings.language')}
        </h3>
        <div className="umm:space-y-1">
          <Select
            value={LOCALE_OPTIONS[0].value}
            onValueChange={(v) => persistLocale(v as any)}
          >
            <SelectTrigger className="umm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Save */}
      <Button onClick={saveSettings} disabled={saving}>
        <Save className="umm:h-4 umm:w-4 umm:mr-2" />
        {saving ? t('common.saving') : t('common.save')}
      </Button>
    </div>
  )
}