// Playwright's ESM entry (package "type":"module") does not expose hooks as
// named exports; they live on `test` (repo-wide precedent: test.afterAll).
import { test } from '@playwright/test';

/**
 * Test-global sandbox.
 *
 * Playwright reuses a worker across spec files AND splits one file's tests into
 * chunks (root afterAll fires per chunk under fullyParallel). So a naive
 * "restore everything once at import" would wipe globals that other files — or
 * later chunks of the SAME file — still need. Instead:
 *  - every install is attributed to the importing spec file (initFileSandbox /
 *    first module-scope defineGlobal registers per-file hooks);
 *  - `beforeEach` re-asserts the file's latest installed values, healing state
 *    lost to a chunk-boundary restore;
 *  - `afterAll` restores a file's own layers only when this file still owns the
 *    current value (identity check), so a still-live later file is untouched.
 * Guards against re-saving: the first install of a key keeps the TRUE original
 * descriptor; later installs of the same key only update the latest value.
 */

type Entry = { key: string; prev?: PropertyDescriptor; latest: unknown };
type Scope = { entries: Map<string, Entry>; hooksRegistered: boolean };

const scopes = new Map<string, Scope>();

function normalizeFile(p: string): string {
  const clean = p.replace(/^file:\/\/\//, '').replace(/\\/g, '/');
  const segs = clean.split('/').filter(Boolean);
  return segs.slice(-2).join('/');
}

function runningInTest(): boolean {
  try {
    return test.info() !== undefined;
  } catch {
    return false;
  }
}

function specFileId(): string | undefined {
  if (runningInTest()) {
    // Throws outside a test/hook context; callers gate with runningInTest().
    return normalizeFile(test.info().file);
  }
  const m = (new Error().stack ?? '').match(/([^(\s]+\.spec\.tsx?)/);
  const frame = m?.[1];
  return frame ? normalizeFile(frame) : undefined;
}

function ensureScope(file: string | undefined, atLoadContext: boolean): Scope | undefined {
  if (!file) return undefined;
  let scope = scopes.get(file);
  if (!scope) {
    scope = { entries: new Map(), hooksRegistered: false };
    scopes.set(file, scope);
  }
  // Hooks may only be registered while the file's suite is being built
  // (module scope); installs that first appear inside a test cannot self-heal.
  if (!scope.hooksRegistered && atLoadContext) {
    scope.hooksRegistered = true;
    const self = scope;
    test.beforeEach(() => {
      for (const e of self.entries.values()) {
        Object.defineProperty(globalThis, e.key, {
          value: e.latest,
          configurable: true,
          writable: true,
        });
      }
    });
    test.afterAll(() => {
      for (const e of self.entries.values()) {
        const cur = Object.getOwnPropertyDescriptor(globalThis, e.key);
        // Only undo layers this file still owns; a live later file keeps them.
        if (cur && cur.value === e.latest) {
          if (e.prev) {
            Object.defineProperty(globalThis, e.key, e.prev);
          } else {
            delete (globalThis as Record<string, unknown>)[e.key];
          }
        }
      }
    });
  }
  return scope;
}

function install(key: string, value: unknown): void {
  const atLoad = !runningInTest();
  const fileId = specFileId();
  if (!fileId) {
    // An unattributed install can never be released: it would leak into every
    // later file in the worker while the isolation gate still reads green.
    throw new Error(
      `global-sandbox: cannot attribute defineGlobal('${key}') to a spec file — ` +
        'call it at spec module scope, or call initFileSandbox() there.',
    );
  }
  const scope = ensureScope(fileId, atLoad);
  const entry = scope?.entries.get(key);
  if (scope && !entry) {
    scope.entries.set(key, {
      key,
      prev: originalDescriptorBelow(key, scope),
      latest: value,
    });
  } else if (scope && entry) {
    entry.latest = value;
  }
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

/**
 * The descriptor to fall back to, skipping over a stub another file still has
 * installed. Without this, a second file records the first file's stub as its
 * `prev`; the first file then fails its identity check at afterAll and stops
 * restoring, so the stub survives for the rest of the worker.
 */
function originalDescriptorBelow(key: string, own: Scope): PropertyDescriptor | undefined {
  const current = Object.getOwnPropertyDescriptor(globalThis, key);
  if (!current) return undefined;
  for (const scope of scopes.values()) {
    if (scope === own) continue;
    const other = scope.entries.get(key);
    if (other && other.latest === current.value) return other.prev;
  }
  return current;
}

/**
 * Call once at spec module scope: registers this file's sandbox hooks even
 * when the file's first install happens later (inside tests/hooks).
 */
export function initFileSandbox(): void {
  ensureScope(specFileId(), !runningInTest());
}

export function defineGlobal(key: string, value: unknown): void {
  install(key, value);
}

export function defineGlobals(values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    install(key, value);
  }
}

export function restoreGlobals(): void {
  const scope = scopes.get(specFileId() ?? '');
  if (!scope) return;
  for (const e of scope.entries.values()) {
    const cur = Object.getOwnPropertyDescriptor(globalThis, e.key);
    if (cur && cur.value === e.latest) {
      if (e.prev) {
        Object.defineProperty(globalThis, e.key, e.prev);
      } else {
        delete (globalThis as Record<string, unknown>)[e.key];
      }
    }
  }
}
