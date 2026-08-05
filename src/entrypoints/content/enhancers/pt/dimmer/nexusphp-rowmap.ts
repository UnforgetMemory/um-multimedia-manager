/**
 * NexusPHP row-index builder — pure function, unit-testable.
 *
 * Background (S5 double-scan elimination): the scanBatch completion callback previously
 * re-ran document.querySelectorAll(config.rowSelector) per result and linearly scanned
 * all rows to match detail URLs — O(N) query + O(N) scan per callback → O(N*M) overall.
 * This helper builds the URL → row Map once at the start of process(), dropping the
 * callback to O(1) lookups.
 *
 * Normalization contract: identical to the scan queue's result.url — process() pushes
 * `${origin}${pathname}${search}` (no hash) into scanTasks, queue.ts returns task.url
 * as-is, so the keys here must use the same normalization.
 */

export interface RowUrlExtractor {
  /** Extract the detail-page URL from a row (null when absent). */
  extractDetailUrl(row: Element): string | null
}

/**
 * Build the normalized detail-URL → row Map.
 * Normalization: `new URL(detailUrl, location.origin)` then
 * `${origin}${pathname}${search}` (same as the scan enqueue path, no hash);
 * falls back to the raw string when URL parsing fails. Duplicate URLs: last wins.
 */
export function buildRowByUrl(
  rows: Element | NodeListOf<Element>,
  config: RowUrlExtractor,
): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>()
  const list = isRowList(rows) ? Array.from(rows) : [rows]
  for (const row of list) {
    const detailUrl = config.extractDetailUrl(row)
    if (!detailUrl) continue

    let normalizedUrl: string
    try {
      const u = new URL(detailUrl, location.origin)
      // Scheme guard: only http(s) rows are indexed (matches the scanner's origin allowlist).
      if (u.protocol !== 'https:' && u.protocol !== 'http:') continue
      normalizedUrl = `${u.origin}${u.pathname}${u.search}`
    } catch {
      normalizedUrl = detailUrl
    }

    map.set(normalizedUrl, row as HTMLElement)
  }
  return map
}

/** Runtime distinction between NodeList and a single Element (NodeList/arrays have length, Element does not). */
function isRowList(rows: Element | NodeListOf<Element>): rows is NodeListOf<Element> {
  return typeof (rows as { length?: unknown }).length === 'number'
}
