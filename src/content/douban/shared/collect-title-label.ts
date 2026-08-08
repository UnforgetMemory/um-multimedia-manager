/**
 * Collect-page title label helper (H4-⑤, 2026-08-08).
 *
 * Extracted from 4 byte-identical `titleLabel` computed blocks in
 * user-media / book-collect / music-collect / game-collect App.vue.
 * The only real difference: game-collect uses subType key `'do'` while the
 * others use `'doing'` (game platform sub-type vocabulary) — parameterized
 * via `doingKey`.
 *
 * Pure function — no DOM, no Vue reactivity.
 */
export function collectTitleLabel(
  labels: { wish: string; doing: string; done: string },
  subType: string,
  doingKey = 'doing',
): string {
  switch (subType) {
    case 'wish':
      return labels.wish
    case doingKey:
      return labels.doing
    default:
      return labels.done
  }
}
