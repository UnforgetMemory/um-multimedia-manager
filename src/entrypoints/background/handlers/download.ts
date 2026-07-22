/**
 * File download handler — uses MAIN world fetch for Referer-gated CDNs.
 */

export async function handleDownloadFile(
  payload: { url?: string; filename?: string },
  sender: chrome.runtime.MessageSender,
): Promise<{ success: boolean; error?: string }> {
  const { url, filename } = payload ?? {}
  if (!url || !filename || !sender.tab?.id) {
    return { success: false, error: 'Missing params or tab' }
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      args: [url, filename],
      func: (u: string, fn: string) => {
        fetch(u, { credentials: 'include' })
          .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob() })
          .then((blob) => {
            const blobUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl
            a.download = fn
            a.style.display = 'none'
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(blobUrl)
          })
          .catch(() => {
            const a = document.createElement('a')
            a.href = u
            a.target = '_blank'
            a.style.display = 'none'
            document.body.appendChild(a)
            a.click()
            a.remove()
          })
      },
    })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) }
  }
}
