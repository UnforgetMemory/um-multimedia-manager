/**
 * Mukaku detail-page status-chip rendering (extracted from handler.renderDetailState).
 *
 * Realtime, read-only — never writes caches. All data fetching is injected
 * by the handler (`probe` = cached linked-id resolution, `watchedSets` = the
 * epoch-guarded watched-id fetch), so this module owns only the presentation
 * decision: DOM ids → probe fallback → matched/no-match/no-id chip.
 */

import { FloatingToast } from '../../utils/toast';
import { createStatusChip } from '../../utils/dom';
import { t } from '../../i18n';
import { extractLinkedIdsFromDOM } from './dom';
import { MukakuToastController } from './toast';

export interface DetailRenderDeps {
  probe(mvId: string): Promise<{ doubanId: string | null; imdbId: string | null }>;
  watchedSets(): Promise<{ movieDoubanIds: Set<string>; imdbIds: Set<string> }>;
}

export async function renderMukakuDetailState(
  infoRoot: HTMLElement,
  mvId: string,
  deps: DetailRenderDeps,
): Promise<void> {
  // Find or create the status slot
  let slot = infoRoot.querySelector('.umm-mukaku-status');
  if (!slot) {
    slot = document.createElement('div');
    slot.className = 'umm-mukaku-status';
    infoRoot.prepend(slot);
  }

  // Extract linked ids from the DOM
  let linkedIds = extractLinkedIdsFromDOM(document);

  // Fall back to the API probe when the DOM carries no ids
  if (!linkedIds.doubanId && !linkedIds.imdbId) {
    try {
      linkedIds = await deps.probe(mvId);
    } catch (error: unknown) {
      console.error('[Mukaku] API probe failed:', error);
      if (MukakuToastController.hasActive()) {
        MukakuToastController.error(t('mukaku.api_failed', { error: String(error) }));
      } else {
        FloatingToast.error(t('mukaku.api_failed_title'), String(error));
      }
      return;
    }
  }

  // Realtime watched-id sets (the injected impl — handler.refreshWatchedIdSets —
  // owns the 30s TTL, the epoch-guarded write-back (R3) and graceful failure
  // (F1): a DB error degrades to empty sets without failing the detail render).
  const { movieDoubanIds, imdbIds } = await deps.watchedSets();

  // Match against local records (read-only decision — this method writes no cache)
  if (linkedIds.doubanId || linkedIds.imdbId) {
    const matched =
      (linkedIds.doubanId && movieDoubanIds.has(linkedIds.doubanId)) ||
      (linkedIds.imdbId && imdbIds.has(linkedIds.imdbId));

    slot.innerHTML = '';
    if (matched) {
      const chip = createStatusChip('movie', 2, 0, t('mukaku.match_found'));
      slot.appendChild(chip);
    } else {
      const chip = createStatusChip('movie', 0, 0, t('mukaku.no_match'));
      slot.appendChild(chip);
    }
  } else {
    slot.innerHTML = '';
    const chip = createStatusChip('movie', 0, 0, t('mukaku.no_id'));
    slot.appendChild(chip);
  }
}
