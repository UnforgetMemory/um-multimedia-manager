import { test, expect } from '@playwright/test';
import { configureLogging, debugLog, infoLog, warnLog, errorLog } from '@/libraries/utils/logger';

/**
 * logger — runtime-gated console wrapper.
 * Contracts pinned:
 * 1. enabled=false mutes every level regardless of `level`;
 * 2. the four writers hit distinct console methods with distinct prefixes
 *    (debug→log '[UMM Debug]', info→info '[UMM]', warn→warn '[UMM Warning]',
 *    error→error '[UMM Error]');
 * 3. threshold rule is `config.level <= target`, i.e. setting a level emits at
 *    that level and above (debug<info<warn<error);
 * 4. configureLogging updates fields independently (partial object leaves the
 *    other field untouched);
 * 5. trailing args pass through verbatim.
 * Module-global config is shared, so each test establishes its own baseline.
 */

interface Captured {
  log: unknown[][];
  info: unknown[][];
  warn: unknown[][];
  error: unknown[][];
}

function capture(): { state: Captured; restore: () => void } {
  const state: Captured = { log: [], info: [], warn: [], error: [] };
  const orig = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  console.log = (...a: unknown[]) => void state.log.push(a);
  console.info = (...a: unknown[]) => void state.info.push(a);
  console.warn = (...a: unknown[]) => void state.warn.push(a);
  console.error = (...a: unknown[]) => void state.error.push(a);
  return { state, restore: () => Object.assign(console, orig) };
}

test.describe('logger', () => {
  test('enabled=false mutes every level', () => {
    const { state, restore } = capture();
    try {
      configureLogging({ enabled: false, level: 'debug' });
      debugLog('a');
      infoLog('b');
      warnLog('c');
      errorLog('d');
      expect(state.log.length + state.info.length + state.warn.length + state.error.length).toBe(0);
    } finally {
      restore();
    }
  });

  test('level=debug emits all four writers on their distinct console channels', () => {
    const { state, restore } = capture();
    try {
      configureLogging({ enabled: true, level: 'debug' });
      debugLog('d');
      infoLog('i');
      warnLog('w');
      errorLog('e');
      expect(state.log).toEqual([['[UMM Debug]', 'd']]);
      expect(state.info).toEqual([['[UMM]', 'i']]);
      expect(state.warn).toEqual([['[UMM Warning]', 'w']]);
      expect(state.error).toEqual([['[UMM Error]', 'e']]);
    } finally {
      restore();
    }
  });

  test('threshold rule: level=info drops debug, keeps info/warn/error', () => {
    const { state, restore } = capture();
    try {
      configureLogging({ enabled: true, level: 'info' });
      debugLog('d');
      infoLog('i');
      warnLog('w');
      errorLog('e');
      expect(state.log).toEqual([]); // debug muted
      expect(state.info.map((c) => c[1])).toEqual(['i']);
      expect(state.warn.map((c) => c[1])).toEqual(['w']);
      expect(state.error.map((c) => c[1])).toEqual(['e']);
    } finally {
      restore();
    }
  });

  test('threshold rule: level=error keeps only error', () => {
    const { state, restore } = capture();
    try {
      configureLogging({ enabled: true, level: 'error' });
      debugLog('d');
      infoLog('i');
      warnLog('w');
      errorLog('e');
      expect(state.log).toEqual([]);
      expect(state.info).toEqual([]);
      expect(state.warn).toEqual([]);
      expect(state.error).toEqual([['[UMM Error]', 'e']]);
    } finally {
      restore();
    }
  });

  test('threshold rule: level=warn emits warn+error only', () => {
    const { state, restore } = capture();
    configureLogging({ enabled: true, level: 'warn' });
    debugLog('d');
    infoLog('i');
    warnLog('w');
    errorLog('e');
    expect(state.log).toEqual([]);
    expect(state.info).toEqual([]);
    expect(state.warn.map((c) => c[1])).toEqual(['w']);
    expect(state.error.map((c) => c[1])).toEqual(['e']);
    restore();
  });

  test('configureLogging merges fields independently', () => {
    const { state, restore } = capture();
    try {
      configureLogging({ enabled: true, level: 'debug' });
      configureLogging({ level: 'error' }); // enabled must survive
      debugLog('suppressed');
      expect(state.log).toEqual([]);
      errorLog('kept');
      expect(state.error).toEqual([['[UMM Error]', 'kept']]);

      configureLogging({ enabled: false }); // level must survive
      errorLog('muted');
      expect(state.error).toHaveLength(1);
    } finally {
      restore();
    }
  });

  test('trailing args pass through verbatim to the writer', () => {
    const { state, restore } = capture();
    try {
      configureLogging({ enabled: true, level: 'info' });
      const err = new Error('boom');
      infoLog('ctx', 42, { a: 1 }, err);
      expect(state.info[0]).toEqual(['[UMM]', 'ctx', 42, { a: 1 }, err]);
    } finally {
      restore();
    }
  });
});
