import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/hooks/useToast'
import { useConfirmStore } from '@/stores/use-confirm-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Server, Upload, Download, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { safeSendMessage } from '@/utils/context'

interface WebDAVConfig {
  url: string
  username: string
  password: string
}

export function WebDAVTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const { show } = useConfirmStore()

  const [config, setConfig] = useState<WebDAVConfig>({ url: '', username: '', password: '' })
  const [isConfigSaved, setIsConfigSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [loading, setLoading] = useState({ sync: false, download: false, upload: false })
  const [connectionStatus, setConnectionStatus] = useState<{
    type: 'success' | 'error' | 'idle'
    message?: string
  }>({ type: 'idle' })

  const isAnyRunning = Object.values(loading).some(Boolean) || isTesting || isSaving

  // Load config on mount
  useEffect(() => {
    async function loadConfig() {
      const result = await safeSendMessage<{ success: boolean; settings?: Record<string, any> }>(
        { type: 'GET_SETTINGS' },
        { timeout: 8000 }
      )
      if (result?.settings) {
        const s = result.settings
        setConfig({
          url: s.webdavUrl || '',
          username: s.webdavUsername || '',
          password: s.webdavPassword || '',
        })
        setIsConfigSaved(!!(s.webdavUrl && s.webdavUsername && s.webdavPassword))
      }
    }
    loadConfig()
  }, [])

  // Cross-tab sync via chrome.storage
  useEffect(() => {
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string
    ) => {
      if (area !== 'local') return
      const relevant = ['webdavUrl', 'webdavUsername', 'webdavPassword']
      if (!relevant.some((k) => k in changes)) return

      setConfig((prev) => ({
        url: (changes.webdavUrl?.newValue as string) ?? prev.url,
        username: (changes.webdavUsername?.newValue as string) ?? prev.username,
        password: (changes.webdavPassword?.newValue as string) ?? prev.password,
      }))
      const newUrl = (changes.webdavUrl?.newValue as string) ?? config.url
      const newUsername = (changes.webdavUsername?.newValue as string) ?? config.username
      const newPassword = (changes.webdavPassword?.newValue as string) ?? config.password
      setIsConfigSaved(!!(newUrl && newUsername && newPassword))
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => {
      chrome.storage.onChanged.removeListener(onChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateConfig(field: keyof WebDAVConfig, value: string) {
    setConfig((prev) => ({ ...prev, [field]: value }))
    setIsConfigSaved(false)
  }

  async function saveConfig() {
    if (config.url && !config.url.startsWith('https://')) {
      toast.error(t('validation.httpsRequired') as string)
      return
    }

    setIsSaving(true)
    try {
      const result = await safeSendMessage<{ success: boolean }>(
        {
          type: 'UPDATE_SETTINGS',
          payload: {
            webdavUrl: config.url,
            webdavUsername: config.username,
            webdavPassword: config.password,
          },
        },
        { timeout: 8000 }
      )
      if (result?.success) {
        setIsConfigSaved(true)
        toast.success(t('toast.configSaved') as string)
      } else {
        throw new Error('Save failed')
      }
    } catch (e) {
      setIsConfigSaved(false)
      toast.error(t('toast.saveFailed') as string, String(e))
    } finally {
      setIsSaving(false)
    }
  }

  async function testConnection() {
    if (!config.url) {
      toast.error(t('validation.webdavUrlRequired') as string)
      return
    }
    if (!config.url.startsWith('https://')) {
      toast.error(t('validation.httpsRequired') as string)
      return
    }

    setIsTesting(true)
    setConnectionStatus({ type: 'idle' })
    try {
      const result = await safeSendMessage<{ success: boolean; message?: string }>(
        { type: 'WEBDAV_TEST', payload: config },
        { timeout: 10000 }
      )
      if (result?.success) {
        toast.success(t('toast.connectionSuccess') as string)
        setConnectionStatus({ type: 'success', message: t('toast.connectionSuccess') as string })
      } else {
        const errMsg = result?.message || t('toast.connectionFailed') as string
        toast.error(t('toast.connectionFailed') as string, errMsg)
        setConnectionStatus({ type: 'error', message: errMsg })
      }
    } catch (e) {
      const errMsg = String(e)
      toast.error(t('toast.connectionFailed') as string, errMsg)
      setConnectionStatus({ type: 'error', message: errMsg })
    } finally {
      setIsTesting(false)
    }
  }

  function syncCloud() {
    if (!isConfigSaved) {
      toast.error(t('validation.saveConfigFirst') as string)
      return
    }

    show({
      title: t('sync.smartMerge') as string,
      description: t('sync.smartMergeDesc') as string,
      icon: RefreshCw as any,
      confirmText: t('sync.startSync') as string,
      action: async () => {
        setLoading((prev) => ({ ...prev, sync: true }))
        try {
          const r = await safeSendMessage<{ success: boolean; message?: string }>(
            { type: 'WEBDAV_SYNC' },
            { timeout: 30000 }
          )
          if (r?.success) {
            toast.success(t('toast.syncSuccess') as string, r.message)
          } else {
            toast.error(t('toast.syncFailed') as string, r?.message)
          }
        } catch (e) {
          toast.error(t('toast.syncFailed') as string, String(e))
        } finally {
          setLoading((prev) => ({ ...prev, sync: false }))
        }
      },
    } as any)
  }

  function downloadCloud() {
    if (!isConfigSaved) {
      toast.error(t('validation.saveConfigFirst') as string)
      return
    }

    show({
      title: t('sync.cloudOverwrite') as string,
      description: t('sync.cloudOverwriteDesc') as string,
      icon: Download as any,
      confirmText: t('sync.confirmOverwrite') as string,
      action: async () => {
        setLoading((prev) => ({ ...prev, download: true }))
        try {
          const r = await safeSendMessage<{ success: boolean; message?: string }>(
            { type: 'WEBDAV_DOWNLOAD' },
            { timeout: 30000 }
          )
          if (r?.success) {
            toast.success(t('sync.downloadSuccess') as string, r.message)
          } else {
            toast.error(t('sync.downloadFailed') as string, r?.message)
          }
        } catch (e) {
          toast.error(t('sync.downloadFailed') as string, String(e))
        } finally {
          setLoading((prev) => ({ ...prev, download: false }))
        }
      },
    } as any)
  }

  function uploadCloud() {
    if (!isConfigSaved) {
      toast.error(t('validation.saveConfigFirst') as string)
      return
    }

    show({
      title: t('sync.localOverwrite') as string,
      description: t('sync.localOverwriteDesc') as string,
      icon: Upload as any,
      confirmText: t('sync.confirmOverwrite') as string,
      action: async () => {
        setLoading((prev) => ({ ...prev, upload: true }))
        try {
          const r = await safeSendMessage<{ success: boolean; message?: string }>(
            { type: 'WEBDAV_UPLOAD' },
            { timeout: 30000 }
          )
          if (r?.success) {
            toast.success(t('sync.uploadSuccess') as string, r.message)
          } else {
            toast.error(t('sync.uploadFailed') as string, r?.message)
          }
        } catch (e) {
          toast.error(t('sync.uploadFailed') as string, String(e))
        } finally {
          setLoading((prev) => ({ ...prev, upload: false }))
        }
      },
    } as any)
  }

  return (
    <div className="umm:flex umm:flex-col umm:gap-4">
      {/* WebDAV Configuration */}
      <Card>
        <CardHeader className="umm:pb-3">
          <div className="umm:flex umm:items-center umm:justify-between">
            <CardTitle className="umm:flex umm:items-center umm:gap-2">
              <Server className="umm:h-5 umm:w-5" />
              {t('settings.webdav')}
            </CardTitle>
            <span
              className={`umm:inline-flex umm:items-center umm:rounded-full umm:px-2.5 umm:py-0.5 umm:text-xs umm:font-medium ${
                isConfigSaved
                  ? 'umm:bg-green-100 umm:text-green-700 dark:umm:bg-green-900/30 dark:umm:text-green-400'
                  : 'umm:bg-orange-100 umm:text-orange-600 dark:umm:bg-orange-900/30 dark:umm:text-orange-400'
              }`}
            >
              {isConfigSaved ? t('toast.configSaved') : t('common.unsaved')}
            </span>
          </div>
        </CardHeader>
        <CardContent className="umm:flex umm:flex-col umm:gap-4">
          <div className="umm:grid umm:gap-2">
            <Label htmlFor="webdav-url">{t('common.serverUrl')}</Label>
            <Input
              id="webdav-url"
              value={config.url}
              onChange={(e) => updateConfig('url', e.target.value)}
              placeholder="https://example.com/dav/"
            />
          </div>
          <div className="umm:grid umm:gap-2">
            <Label htmlFor="webdav-username">{t('common.username')}</Label>
            <Input
              id="webdav-username"
              value={config.username}
              onChange={(e) => updateConfig('username', e.target.value)}
            />
          </div>
          <div className="umm:grid umm:gap-2">
            <Label htmlFor="webdav-password">{t('common.password')}</Label>
            <Input
              id="webdav-password"
              type="password"
              value={config.password}
              onChange={(e) => updateConfig('password', e.target.value)}
            />
          </div>

          <div className="umm:flex umm:gap-2">
            <Button onClick={saveConfig} disabled={isSaving || isAnyRunning} className="umm:flex-1">
              {isSaving ? (
                <>
                  <span className="umm:animate-spin umm:w-4 umm:h-4 umm-border-2 umm-border-current umm-border-t-transparent umm-rounded-full" />
                  {t('common.saving')}
                </>
              ) : (
                t('common.saveConfig')
              )}
            </Button>
            <Button
              onClick={testConnection}
              variant="outline"
              disabled={isTesting || isAnyRunning || !config.url}
              className="umm:flex-1"
            >
              {isTesting ? (
                <>
                  <span className="umm:animate-spin umm:w-4 umm:h-4 umm-border-2 umm-border-current umm-border-t-transparent umm-rounded-full" />
                  {t('common.testing')}
                </>
              ) : (
                t('common.testConnection')
              )}
            </Button>
          </div>

          {connectionStatus.type !== 'idle' && (
            <Alert variant={connectionStatus.type === 'error' ? 'destructive' : 'default'}>
              {connectionStatus.type === 'success' ? (
                <CheckCircle2 className="umm:h-4 umm:w-4" />
              ) : (
                <AlertCircle className="umm:h-4 umm:w-4" />
              )}
              <AlertTitle>
                {connectionStatus.type === 'success'
                  ? t('toast.connectionSuccess')
                  : t('toast.connectionFailed')}
              </AlertTitle>
              {connectionStatus.message && (
                <AlertDescription>{connectionStatus.message}</AlertDescription>
              )}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Sync Operations */}
      <Card>
        <CardHeader className="umm:pb-3">
          <CardTitle className="umm:flex umm:items-center umm:gap-2">
            <RefreshCw className="umm:h-5 umm:w-5" />
            {t('sync.smartMerge')}
          </CardTitle>
        </CardHeader>
        <CardContent className="umm:flex umm:flex-col umm:gap-2">
          <Button
            variant="outline"
            className="umm:w-full"
            disabled={!isConfigSaved || isAnyRunning}
            onClick={downloadCloud}
          >
            {loading.download ? (
              <>
                <span className="umm:animate-spin umm:w-4 umm:h-4 umm-border-2 umm-border-current umm-border-t-transparent umm-rounded-full" />
                {t('common.downloading')}
              </>
            ) : (
              <>
                <Download className="umm:h-4 umm:w-4" />
                {t('sync.cloudOverwrite')}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="umm:w-full"
            disabled={!isConfigSaved || isAnyRunning}
            onClick={uploadCloud}
          >
            {loading.upload ? (
              <>
                <span className="umm:animate-spin umm:w-4 umm:h-4 umm-border-2 umm-border-current umm-border-t-transparent umm-rounded-full" />
                {t('common.uploading')}
              </>
            ) : (
              <>
                <Upload className="umm:h-4 umm:w-4" />
                {t('sync.localOverwrite')}
              </>
            )}
          </Button>
          <Button
            className="umm:w-full"
            disabled={!isConfigSaved || isAnyRunning}
            onClick={syncCloud}
          >
            {loading.sync ? (
              <>
                <span className="umm:animate-spin umm:w-4 umm:h-4 umm-border-2 umm-border-current umm-border-t-transparent umm-rounded-full" />
                {t('common.syncing')}
              </>
            ) : (
              <>
                <RefreshCw className="umm:h-4 umm:w-4" />
                {t('sync.smartMerge')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
