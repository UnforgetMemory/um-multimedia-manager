/**
 * Compact formatting for rating-count numbers (X108).
 *
 * The two consumer pages (doulist-detail / series) historically rendered
 * Chinese counts **inconsistently**:
 *   - doulist-detail: >=1 wan (`万`) → X.Xwan; >=1k → X.Xk; otherwise as-is
 *   - series:         >=1 wan (`万`) → X.Xwan; otherwise thousands-grouped (9,999)
 * This wave only does i18n: the Chinese path keeps each page's original
 * rendering **verbatim** (zero-drift); unifying the thresholds is a product
 * decision, logged as a follow-up. Non-Chinese locales go through `Intl`
 * compact (12.3K / 1.2M) and never emit Chinese units.
 */

import { getLocale, t } from '@/entrypoints/content/i18n';

function compactForOtherLocale(n: number): string {
  return new Intl.NumberFormat(getLocale(), {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

/** doulist-detail semantics: >=1 wan → X.Xwan; >=1k → X.Xk; otherwise as-is. */
export function formatCountK(n: number): string {
  if (!getLocale().startsWith('zh')) return compactForOtherLocale(n);
  if (n >= 10000) return (n / 10000).toFixed(1) + t('douban.count.wan');
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}

/** series semantics: >=1 wan → X.Xwan; otherwise thousands-grouped. */
export function formatCountGrouped(n: number): string {
  if (!getLocale().startsWith('zh')) return compactForOtherLocale(n);
  if (n >= 10000) return (n / 10000).toFixed(1) + t('douban.count.wan');
  return n.toLocaleString('zh-CN');
}
