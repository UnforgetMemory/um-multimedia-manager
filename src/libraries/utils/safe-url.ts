/**
 * URL neutralization for host-origin navigation values.
 *
 * Douban/PT host pages embed user-authored anchors whose DOM-resolved `.href`
 * can carry executable schemes (javascript:/data:/vbscript:/...). Values that
 * cross from host DOM into overlay-rendered `<a href>`, `window.open` or
 * `location.href` sinks must pass here — a wrong-scheme string bound into a
 * template is a clickable XSS primitive.
 */

/** Schemes considered safe for anchors and new-tab navigation. */
const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:']);

/** Schemes that can execute script or read local files when navigated to.
 *  Used by the data walker only: prose like "Star: Trek" parses as scheme
 *  "star:", so a blocklist keeps non-URL strings intact while the sink-level
 *  `safeHref` stays allowlist-strict. */
const DANGEROUS_URL_PROTOCOLS = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'blob:',
  'filesystem:',
]);

/** Mirror the URL parser's input normalization before deciding on a scheme:
 *  surrounding whitespace/C0 and in-scheme tab/newline characters are stripped. */
function sanitizeCandidate(url: string): string {
  return url.replace(/[\n\r\t]/g, '').trim();
}

/**
 * Validate a URL intended for an `href`/navigation sink.
 * Returns the original string when safe and '#' for dangerous/unparseable
 * values; empty/nullish inputs pass through unchanged.
 */
export function safeHref(url: string): string {
  if (!url) return url;
  const candidate = sanitizeCandidate(url);
  try {
    const parsed = new URL(candidate, window.location.href);
    return SAFE_URL_PROTOCOLS.has(parsed.protocol) ? url : '#';
  } catch {
    return '#';
  }
}

/**
 * Optional-binding flavor for templates (`:href="safeHrefOpt(x)"`).
 * null/undefined/empty collapse to undefined so the attribute is omitted —
 * matching the previous `:href="x || undefined"` semantics.
 */
export function safeHrefOpt(url?: string | null): string | undefined {
  if (!url) return undefined;
  return safeHref(url);
}

/**
 * Whether an ABSOLUTE-parsed string carries a scheme unsafe for navigation.
 * Deliberately parses without a base: relative paths and ordinary prose
 * ("4:30", "Star: Trek") never match, so whole data trees can be scanned
 * without corrupting non-URL strings.
 */
export function isDangerousUrl(value: string): boolean {
  const candidate = sanitizeCandidate(value);
  if (!candidate) return false;
  try {
    const parsed = new URL(candidate);
    return DANGEROUS_URL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Deep-neutralize a host-derived data tree in place: every string that is an
 * absolute URL with an unsafe scheme becomes '#'. Plain objects, arrays, Maps
 * and Sets are walked; class instances/functions/DOM nodes are left untouched.
 * Used at the mount boundary so page data can never smuggle an executable
 * scheme into a template binding.
 */
export function sanitizePageData<T>(data: T): T {
  walkDangerous(data, new WeakSet<object>());
  return data;
}

function walkDangerous(value: unknown, seen: WeakSet<object>): void {
  if (typeof value === 'string') return;
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (typeof item === 'string') {
        if (isDangerousUrl(item)) value[i] = '#';
      } else {
        walkDangerous(item, seen);
      }
    }
    return;
  }

  if (value instanceof Map) {
    for (const [key, entry] of [...value.entries()]) {
      if (typeof entry === 'string') {
        if (isDangerousUrl(entry)) value.set(key, '#');
      } else {
        walkDangerous(entry, seen);
      }
    }
    return;
  }

  if (value instanceof Set) {
    for (const entry of [...value]) {
      if (typeof entry === 'string') {
        if (isDangerousUrl(entry)) {
          value.delete(entry);
          value.add('#');
        }
      } else {
        walkDangerous(entry, seen);
      }
    }
    return;
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const entry = record[key];
    if (typeof entry === 'string') {
      if (isDangerousUrl(entry)) record[key] = '#';
    } else {
      walkDangerous(entry, seen);
    }
  }
}

/**
 * Open a URL in a new tab only if it survives scheme validation.
 * Dangerous/unparseable targets are dropped silently — refusing to navigate
 * is always better than executing host-authored script.
 */
export function openExternalUrl(url?: string | null, target = '_blank', features?: string): void {
  const safe = safeHrefOpt(url);
  if (!safe || safe === '#') return;
  // Preserve 2-arg call shape: spies/assertions on window.open see exactly the
  // arity the direct call sites used before this choke point existed.
  if (features === undefined) {
    window.open(safe, target);
  } else {
    window.open(safe, target, features);
  }
}
