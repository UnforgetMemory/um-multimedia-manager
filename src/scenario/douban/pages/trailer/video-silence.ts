/**
 * Reversible silencing of Douban's native trailer player.
 *
 * The trailer overlay replaces the native player, so before mounting we must
 * stop playback, strip video sources and remove the player containers. That
 * mutation runs before the Vue app resolves — it is only safe because every
 * removal is captured and an undo is returned: mount failures restore the
 * host exactly, so the user is never left without their player.
 */

/** Native containers whose children must not survive into the overlay page. */
const PLAYER_CONTAINERS = '#player, #movie_player, .html5-video-container, .stage-cont';

interface RemovedNode {
  el: HTMLElement;
  parent: Node | null;
  ref: Node | null;
}

/**
 * Pause + strip every host video and remove native player containers.
 * Returns a rollback restoring the containers (position-exact, outermost
 * first) and the stripped `src` attributes.
 */
export function silenceNativePlayers(): () => void {
  const videos = [...document.querySelectorAll<HTMLVideoElement>('video')];
  const savedSrcs = videos.map((v) => ({ v, src: v.getAttribute('src') }));
  for (const v of videos) {
    v.pause();
    v.removeAttribute('src');
    v.load();
  }

  const candidates = [...document.querySelectorAll<HTMLElement>(PLAYER_CONTAINERS)];
  // Only remove outermost hits; nested ones travel with their subtree and are
  // restored together, which keeps sibling positions recoverable.
  const removed: RemovedNode[] = candidates
    .filter((el) => !candidates.some((other) => other !== el && other.contains(el)))
    .map((el) => ({ el, parent: el.parentNode, ref: el.nextSibling }));
  for (const { el } of removed) el.remove();

  return () => {
    // Reverse removal order: each node's ref sibling is either still attached
    // or already restored, so insertBefore lands position-exactly.
    for (const { el, parent, ref } of [...removed].reverse()) {
      if (!parent || el.parentNode) continue;
      parent.insertBefore(el, ref && ref.parentNode === parent ? ref : null);
    }
    for (const { v, src } of savedSrcs) {
      if (src !== null) v.setAttribute('src', src);
      try {
        v.load();
      } catch {
        /* detached/unsupported load — attribute already restored */
      }
    }
  };
}
