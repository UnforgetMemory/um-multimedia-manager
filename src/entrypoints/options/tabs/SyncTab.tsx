import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { WebDAVTab } from './sync/WebDAVTab'
import { ImportExportTab } from './sync/ImportExportTab'

export function SyncTab() {
  const { t } = useTranslation()
  const [activeSubTab, setActiveSubTab] = useState<'webdav' | 'import-export'>('webdav')

  return (
    <div className="umm:flex umm:flex-col umm:gap-[var(--umm-section-gap)]">
      <div className="umm:flex umm:gap-2">
        <Button
          variant={activeSubTab === 'webdav' ? 'default' : 'outline'}
          onClick={() => setActiveSubTab('webdav')}
        >
          WebDAV Sync
        </Button>
        <Button
          variant={activeSubTab === 'import-export' ? 'default' : 'outline'}
          onClick={() => setActiveSubTab('import-export')}
        >
          {t('tab.importExport')}
        </Button>
      </div>

      {activeSubTab === 'webdav' && <WebDAVTab />}
      {activeSubTab === 'import-export' && <ImportExportTab />}
    </div>
  )
}
