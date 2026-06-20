import type { SiteScannerConfig } from '../types'

function extractDetailUrlFromLink(row: Element): string | null {
  const links = row.querySelectorAll<HTMLAnchorElement>('a[href*="details.php"]')
  for (const link of links) {
    const href = link.getAttribute('href') || link.href
    if (href.includes('userdetails.php')) continue
    try {
      const url = new URL(link.href, location.origin)
      return `${url.origin}${url.pathname}${url.search}`
    } catch {
      return link.href
    }
  }
  return null
}

function extractIdsFromDoc(doc: Document): { doubanId?: string; imdbId?: string } {
  let doubanId: string | null = null
  let imdbId: string | null = null

  for (const a of doc.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = a.getAttribute('href') || a.href
    if (!doubanId) {
      const m = href.match(/douban\.com\/subject\/(\d+)/)
      if (m) doubanId = m[1]
    }
    if (!imdbId) {
      const m = href.match(/imdb\.com\/title\/(tt\d+)/)
      if (m) imdbId = m[1]
    }
    if (doubanId && imdbId) break
  }

  if (!doubanId || !imdbId) {
    const bodyText = doc.body?.textContent || ''
    if (!doubanId) {
      const m = bodyText.match(/douban\.com\/subject\/(\d+)/)
      if (m) doubanId = m[1]
    }
    if (!imdbId) {
      const m = bodyText.match(/imdb\.com\/title\/(tt\d+)/)
      if (m) imdbId = m[1]
    }
    if (!imdbId) {
      const m = bodyText.match(/(?:IMDb|imdb)[\s:：]*(tt\d{5,})/i)
      if (m) imdbId = m[1]
    }
  }

  return { doubanId: doubanId ?? undefined, imdbId: imdbId ?? undefined }
}

function extractIdsFromRowLinks(row: Element): { doubanId?: string; imdbId?: string } {
  let doubanId: string | null = null
  let imdbId: string | null = null

  const doubanLink = row.querySelector('a[href*="douban.com/subject/"]') as HTMLAnchorElement | null
  const imdbLink = row.querySelector('a[href*="imdb.com/title/"]') as HTMLAnchorElement | null

  if (doubanLink) {
    const m = doubanLink.getAttribute('href')?.match(/\/subject\/(\d+)/)
    if (m) doubanId = m[1]
  }
  if (imdbLink) {
    const m = imdbLink.getAttribute('href')?.match(/\/title\/(tt\d+)/)
    if (m) imdbId = m[1]
  }

  if (!doubanId || !imdbId) {
    const dataDouban = row.getAttribute('data-doubanid')
    const dataImdb = row.getAttribute('data-imdbid')
    if (!doubanId && dataDouban) doubanId = dataDouban
    if (!imdbId && dataImdb) imdbId = dataImdb.startsWith('tt') ? dataImdb : `tt${dataImdb}`
  }

  return { doubanId: doubanId ?? undefined, imdbId: imdbId ?? undefined }
}

function extractIdsFromDataAttrs(row: Element): { doubanId?: string; imdbId?: string } {
  const doubanId = row.querySelector('[data-doubanid]')?.getAttribute('data-doubanid') ?? undefined
  const rawImdbId = row.querySelector('[data-imdbid]')?.getAttribute('data-imdbid') ?? undefined
  const imdbId = rawImdbId ? (rawImdbId.startsWith('tt') ? rawImdbId : `tt${rawImdbId}`) : undefined
  return { doubanId, imdbId }
}

export const SITE_CONFIGS: SiteScannerConfig[] = [
  {
    domain: 'ptsbao.club',
    isListPage: (url) => url.includes('ptsbao.club/torrents.php'),
    isDetailPage: (url) => url.includes('ptsbao.club/details.php'),
    extractDetailUrl: extractDetailUrlFromLink,
    extractIdsFromDetail: extractIdsFromDoc,
    rowSelector: 'table.torrents > tbody > tr',
    skipRowSelector: 'td.colhead',
    enableBackgroundScan: true,
    scanConcurrency: 3,
    scanDelayRange: [1000, 2000],
  },
  {
    domain: 'haidan.cc',
    isListPage: (url) => url.includes('haidan.cc') && (url.includes('torrents.php') || url.includes('videos.php')),
    isDetailPage: (url) => url.includes('haidan.cc/details.php'),
    extractDetailUrl: (row) => {
      const link = row.querySelector('a.video_name_str') as HTMLAnchorElement | null
      if (!link) return null
      try {
        const url = new URL(link.href, location.origin)
        return `${url.origin}${url.pathname}${url.search}`
      } catch {
        return link.href
      }
    },
    extractIdsFromDetail: extractIdsFromDoc,
    extractIdsFromRow: extractIdsFromRowLinks,
    rowSelector: '.torrent_group',
    skipRowSelector: undefined,
    enableBackgroundScan: false,
    scanConcurrency: 3,
    scanDelayRange: [1000, 2000],
  },
  {
    domain: 'ourbits.club',
    isListPage: (url) => url.includes('ourbits.club') && url.includes('torrents.php'),
    isDetailPage: (url) => url.includes('ourbits.club/details.php'),
    extractDetailUrl: extractDetailUrlFromLink,
    extractIdsFromDetail: extractIdsFromDoc,
    extractIdsFromRow: extractIdsFromDataAttrs,
    rowSelector: 'tbody > tr',
    skipRowSelector: 'td.colhead',
    enableBackgroundScan: false,
    scanConcurrency: 3,
    scanDelayRange: [1000, 2000],
  },
  {
    domain: 'pterclub.net',
    isListPage: (url) => url.includes('pterclub.net') && (url.includes('torrents.php') || url.includes('officialgroup.php')),
    isDetailPage: (url) => url.includes('pterclub.net/details.php'),
    extractDetailUrl: extractDetailUrlFromLink,
    extractIdsFromDetail: extractIdsFromDoc,
    extractIdsFromRow: extractIdsFromDataAttrs,
    rowSelector: 'tbody > tr',
    skipRowSelector: 'td.colhead',
    enableBackgroundScan: false,
    scanConcurrency: 3,
    scanDelayRange: [1000, 2000],
  },
  {
    domain: 'audiences.me',
    isListPage: (url) => url.includes('audiences.me/torrents.php'),
    isDetailPage: (url) => url.includes('audiences.me/details.php'),
    extractDetailUrl: extractDetailUrlFromLink,
    extractIdsFromDetail: extractIdsFromDoc,
    extractIdsFromRow: extractIdsFromRowLinks,
    rowSelector: 'tbody > tr',
    skipRowSelector: 'td.colhead',
    enableBackgroundScan: false,
    scanConcurrency: 3,
    scanDelayRange: [1000, 2000],
  },
  {
    domain: 'hdhome.org',
    isListPage: (url) => url.includes('hdhome.org/torrents.php'),
    isDetailPage: (url) => url.includes('hdhome.org/details.php'),
    extractDetailUrl: extractDetailUrlFromLink,
    extractIdsFromDetail: extractIdsFromDoc,
    extractIdsFromRow: extractIdsFromRowLinks,
    rowSelector: 'tbody > tr',
    skipRowSelector: 'td.colhead',
    enableBackgroundScan: false,
    scanConcurrency: 3,
    scanDelayRange: [1000, 2000],
  },
  {
    domain: 'hdarea.club',
    isListPage: (url) => url.includes('hdarea.club/torrents.php'),
    isDetailPage: (url) => url.includes('hdarea.club/details.php'),
    extractDetailUrl: extractDetailUrlFromLink,
    extractIdsFromDetail: extractIdsFromDoc,
    extractIdsFromRow: extractIdsFromRowLinks,
    rowSelector: 'tbody > tr',
    skipRowSelector: 'td.colhead',
    enableBackgroundScan: false,
    scanConcurrency: 3,
    scanDelayRange: [1000, 2000],
  },
  {
    domain: 'pthome.net',
    isListPage: (url) => url.includes('pthome.net/torrents.php'),
    isDetailPage: (url) => url.includes('pthome.net/details.php'),
    extractDetailUrl: extractDetailUrlFromLink,
    extractIdsFromDetail: extractIdsFromDoc,
    extractIdsFromRow: extractIdsFromRowLinks,
    rowSelector: 'tbody > tr',
    skipRowSelector: 'td.colhead',
    enableBackgroundScan: false,
    scanConcurrency: 3,
    scanDelayRange: [1000, 2000],
  },
  {
    domain: 'pt.btschool.club',
    isListPage: (url) => url.includes('pt.btschool.club/torrents.php'),
    isDetailPage: (url) => url.includes('pt.btschool.club/details.php'),
    extractDetailUrl: extractDetailUrlFromLink,
    extractIdsFromDetail: extractIdsFromDoc,
    rowSelector: 'table.torrents > tbody > tr',
    skipRowSelector: 'td.colhead',
    enableBackgroundScan: true,
    scanConcurrency: 3,
    scanDelayRange: [1000, 2000],
  },
  {
    domain: 'discfan.net',
    isListPage: (url) => url.includes('discfan.net/torrents.php'),
    isDetailPage: (url) => url.includes('discfan.net/details.php'),
    extractDetailUrl: extractDetailUrlFromLink,
    extractIdsFromDetail: extractIdsFromDoc,
    rowSelector: 'table.torrents > tbody > tr',
    skipRowSelector: 'td.colhead',
    enableBackgroundScan: true,
    scanConcurrency: 3,
    scanDelayRange: [1000, 2000],
  },
  {
    domain: 'hhanclub.net',
    isListPage: (url) => url.includes('hhanclub.net/torrents.php'),
    isDetailPage: (url) => url.includes('hhanclub.net/details.php'),
    extractDetailUrl: extractDetailUrlFromLink,
    extractIdsFromDetail: extractIdsFromDoc,
    rowSelector: 'table.torrents > tbody > tr',
    skipRowSelector: 'td.colhead',
    enableBackgroundScan: true,
    scanConcurrency: 3,
    scanDelayRange: [1000, 2000],
  },
  {
    domain: 'hddolby.com',
    isListPage: (url) => url.includes('hddolby.com/torrents.php'),
    isDetailPage: (url) => url.includes('hddolby.com/details.php'),
    extractDetailUrl: extractDetailUrlFromLink,
    extractIdsFromDetail: extractIdsFromDoc,
    extractIdsFromRow: extractIdsFromRowLinks,
    rowSelector: 'tbody > tr',
    skipRowSelector: 'td.colhead',
    enableBackgroundScan: false,
    scanConcurrency: 3,
    scanDelayRange: [1000, 2000],
  },
  {
    domain: 'hdfans.org',
    isListPage: (url) => url.includes('hdfans.org/torrents.php'),
    isDetailPage: (url) => url.includes('hdfans.org/details.php'),
    extractDetailUrl: extractDetailUrlFromLink,
    extractIdsFromDetail: extractIdsFromDoc,
    rowSelector: 'table.torrents > tbody > tr',
    skipRowSelector: 'td.colhead',
    enableBackgroundScan: true,
    scanConcurrency: 3,
    scanDelayRange: [1000, 2000],
  },
  {
    domain: 'pt.soulvoice.club',
    isListPage: (url) => url.includes('pt.soulvoice.club/torrents.php'),
    isDetailPage: (url) => url.includes('pt.soulvoice.club/details.php'),
    extractDetailUrl: extractDetailUrlFromLink,
    extractIdsFromDetail: extractIdsFromDoc,
    rowSelector: 'table.torrents > tbody > tr',
    skipRowSelector: 'td.colhead',
    enableBackgroundScan: true,
    scanConcurrency: 3,
    scanDelayRange: [1000, 2000],
  },
  {
    domain: 'hdtime.org',
    isListPage: (url) => url.includes('hdtime.org/torrents.php'),
    isDetailPage: (url) => url.includes('hdtime.org/details.php'),
    extractDetailUrl: extractDetailUrlFromLink,
    extractIdsFromDetail: extractIdsFromDoc,
    rowSelector: 'table.torrents > tbody > tr',
    skipRowSelector: 'td.colhead',
    enableBackgroundScan: true,
    scanConcurrency: 3,
    scanDelayRange: [1000, 2000],
  },
]
