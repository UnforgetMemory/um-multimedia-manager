import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/hooks/useToast'
import { useConfirmStore } from '@/stores/use-confirm-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Download, Upload, AlertCircle, FileJson } from 'lucide-react'
import { safeSendMessage } from '@/utils/context'

export function ImportExportTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const { show } = useConfirmStore()
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  async function handleExport() {
    setIsExporting(true)
    setStatus(null)
    try {
      const response = await safeSendMessage<{ success: boolean; data?: any; error?: string }>(
        { type: 'EXPORT_DATA' },
        { timeout: 30000 }
      )
      if (!response?.success) throw new Error(response?.error || t('toast.exportFailed') as string)

      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `umm-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success(t('toast.exportSuccess') as string)
      setStatus({ type: 'success', message: t('toast.exportSuccess') as string })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(t('toast.exportFailed') as string, msg)
      setStatus({ type: 'error', message: msg })
    } finally {
      setIsExporting(false)
    }
  }

  function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = async (event) => {
        setStatus(null)
        try {
          const raw = (event.target?.result as string) || ''
          const clean = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw

          let payload: any
          try {
            payload = JSON.parse(clean)
          } catch (parseErr) {
            const preview = raw.slice(0, 80).replace(
              /[\x00-\x1f]/g,
              (ch) => `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`
            )
            toast.error(
              t('toast.importFailed') as string,
              `${String(parseErr)}\n\nFile starts with: "${preview}"`
            )
            setStatus({ type: 'error', message: String(parseErr) })
            return
          }

          let recordCount = 0
          if (payload.stores) {
            for (const storeName of Object.keys(payload.stores)) {
              recordCount += Object.keys(payload.stores[storeName]).length
            }
          }

          show({
            title: t('confirm.importData') as string,
            description: (t('confirm.importRecords', { count: recordCount.toLocaleString() }) as string),
            icon: Upload as any,
            confirmText: t('common.startImport') as string,
            action: async () => {
              setIsImporting(true)
              try {
                let importPayload = payload
                if (payload.datasets && !payload.stores) {
                  const stores: Record<string, Record<string, any>> = {}
                  for (const provider of ['douban', 'imdb', 'neodb', 'tmdb']) {
                    const storeName = `${provider}_records`
                    if (payload.datasets[provider]) {
                      stores[storeName] = {}
                      for (const type of Object.keys(payload.datasets[provider])) {
                        for (const r of payload.datasets[provider][type]) {
                          stores[storeName][`${type}::${r.providerId || r.id}`] = {
                            url: r.url || '',
                            status: r.status ?? 1,
                            rating: r.rating ?? null,
                            updatedAt: r.updatedAt || new Date().toISOString(),
                            linkedIds: r.linkedIds || {},
                          }
                        }
                      }
                    }
                  }
                  importPayload = { stores }
                }

                const res = await safeSendMessage<{ success: boolean; error?: string }>(
                  { type: 'IMPORT_DATA', payload: importPayload },
                  { timeout: 30000 }
                )
                if (res?.success) {
                  toast.success(t('toast.importSuccess') as string)
                  setStatus({ type: 'success', message: t('toast.importSuccess') as string })
                } else {
                  throw new Error(res?.error || 'Import returned no response')
                }
              } catch (e) {
                const errMsg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
                toast.error(t('toast.importFailed') as string, errMsg)
                setStatus({ type: 'error', message: errMsg })
              } finally {
                setIsImporting(false)
              }
            },
          } as any)
        } catch (e) {
          toast.error(t('toast.importFailed') as string, String(e))
          setStatus({ type: 'error', message: String(e) })
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <div className="umm:flex umm:flex-col umm:gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="umm:flex umm:items-center umm:gap-2">
            <FileJson className="umm:h-5 umm:w-5" />
            {t('tab.importExport')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="umm:flex umm:flex-col umm:gap-4">
            <Alert variant="destructive">
              <AlertCircle className="umm:h-4 umm:w-4" />
              <AlertTitle>{t('common.overrideWarning')}</AlertTitle>
              <AlertDescription>
                {t('sync.localOverwriteDesc')}
              </AlertDescription>
            </Alert>

            <div className="umm:grid umm:grid-cols-2 umm:gap-3">
              <Button
                variant="outline"
                disabled={isExporting || isImporting}
                onClick={handleExport}
                className="umm:w-full"
              >
                {isExporting ? (
                  <>
                    <span className="umm:animate-spin umm:w-4 umm:h-4 umm-border-2 umm-border-current umm-border-t-transparent umm-rounded-full" />
                    {t('common.exporting')}
                  </>
                ) : (
                  <>
                    <Download className="umm:h-4 umm:w-4" />
                    {t('common.exportData')}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                disabled={isExporting || isImporting}
                onClick={handleImport}
                className="umm:w-full"
              >
                {isImporting ? (
                  <>
                    <span className="umm:animate-spin umm:w-4 umm:h-4 umm-border-2 umm-border-current umm-border-t-transparent umm-rounded-full" />
                    {t('common.importing')}
                  </>
                ) : (
                  <>
                    <Upload className="umm:h-4 umm:w-4" />
                    {t('common.importData')}
                  </>
                )}
              </Button>
            </div>

            {status && (
              <Alert variant={status.type === 'error' ? 'destructive' : 'default'}>
                <AlertCircle className="umm:h-4 umm:w-4" />
                <AlertTitle>
                  {status.type === 'success' ? t('toast.exportSuccess') : t('toast.importFailed')}
                </AlertTitle>
                <AlertDescription>{status.message}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
