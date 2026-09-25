/**
 * Stateless DOM applier for resolved mukaku cards.
 *
 * Extracted from `handler.processVisibleCards` phase 2. Holds **no class
 * state** — it only reads its inputs and mutates the card elements, returning
 * the ids that need failure-cooldown registration so the caller keeps owning
 * the cooldown map. That separation is what makes the apply rules (dim on
 * match, re-collect on probe failure, write nothing on skip) unit-testable
 * without instantiating the handler.
 */

import { PROCESSED_ATTR } from './dom'
import type { CardAction } from './resolve'

export interface CardApplyInput {
  cardEl: HTMLElement
  mvId: string
  action: CardAction
  /**
   * Resolved probe for a `needs-probe` card (`{doubanId, imdbId}`, either may be
   * null). `null` means the probe FAILED (network/timeout/invalid payload).
   * Ignored for `dim` / `skip`.
   */
  linkedIds: { doubanId: string | null; imdbId: string | null } | null
}

export interface CardApplyOutcome {
  /** mvIds whose probe failed — the caller registers the failure cooldown. */
  failedProbeMvIds: string[]
}

export function applyCardActions(
  inputs: CardApplyInput[],
  watched: { watchedDouban: Set<string>; watchedImdb: Set<string> },
): CardApplyOutcome {
  const failedProbeMvIds: string[] = []

  for (const { cardEl, mvId, action, linkedIds } of inputs) {
    switch (action) {
      case 'dim':
        cardEl.classList.add('umm-dimmed')
        break

      case 'skip':
        // No association / no match: nothing to write
        break

      case 'needs-probe': {
        if (linkedIds === null) {
          // Probe failed (network/timeout/invalid payload) — no cache write, no
          // session cooldown here. Report it so the caller sets a short failure
          // cooldown AND the processed marker is cleared: the card is then
          // RE-COLLECTED and re-probed after the window (failures are re-probed,
          // never permanently skipped).
          failedProbeMvIds.push(mvId)
          cardEl.removeAttribute(PROCESSED_ATTR)
          break
        }

        if (linkedIds.doubanId || linkedIds.imdbId) {
          const matched =
            (linkedIds.doubanId && watched.watchedDouban.has(linkedIds.doubanId)) ||
            (linkedIds.imdbId && watched.watchedImdb.has(linkedIds.imdbId))
          if (matched) cardEl.classList.add('umm-dimmed')
          // not matched → nothing (no write)
        }
        // both ids null → nothing (cooldown was registered inside probeLinkedIds)
        break
      }
    }
  }

  return { failedProbeMvIds }
}
