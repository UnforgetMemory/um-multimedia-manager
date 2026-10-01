/**
 * Mukaku RequestQueue construction (extracted from handler.ensureQueue).
 *
 * Owns the rAF-coalesced progress toast: one `toastScheduled` flag per queue
 * instance — the same lifetime as the handler field it replaced (the handler
 * nulls the queue on cleanup, so the next ensureQueue() rebuilds both together).
 */

import { RequestQueue } from '@/libraries/utils/request-queue';
import { t } from '../../i18n';
import { NETWORK_CONFIG } from './config';
import { MukakuToastController } from './toast';

export function createMukakuQueue(): RequestQueue {
  let toastScheduled = false;

  return new RequestQueue({
    maxConcurrent: NETWORK_CONFIG.MAX_CONCURRENT,
    minDelayMs: NETWORK_CONFIG.MIN_DELAY_MS,
    maxDelayMs: NETWORK_CONFIG.MAX_DELAY_MS,
    onStateChange: ({ queued, active, currentKey, total }) => {
      if (!queued && !active) {
        if (MukakuToastController.hasActive()) {
          MukakuToastController.success(t('mukaku.queue_done', { total }));
        }
        return;
      }

      const completed = total - queued - active;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

      const parts: string[] = [];
      parts.push(t('mukaku.progress', { completed, total }));
      if (active > 0) parts.push(`并发 ${active}`);
      if (currentKey) parts.push(`当前 ${currentKey}`);

      if (!toastScheduled) {
        toastScheduled = true;
        requestAnimationFrame(() => {
          toastScheduled = false;
          MukakuToastController.update(parts.join(' · '), progress);
        });
      }
    },
  });
}
