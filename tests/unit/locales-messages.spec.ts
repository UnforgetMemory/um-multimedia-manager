import { test, expect } from '@playwright/test';
import { messages } from '@/libraries/locales';

/**
 * locales/index.ts — the runtime shape of the vue-i18n message maps.
 * Key PARITY across locales is owned by `npm run i18n:check` — NOT re-implemented
 * here. This spec locks what that script does not check:
 * 1. the exported locale keys are exactly en-US / zh-CN / zh-TW (the `Locale`
 *    union's runtime face);
 * 2. every value is a non-empty string (flat-message contract: MessageSchema
 *    is `typeof en`, whose values must stay strings for the typed composer);
 * 3. keys are dotted flat names (`namespace.camelCase`) with no empty segments —
 *    the shape vue-i18n resolves through;
 * 4. named-interpolation placeholders ({n}, {count}, {level}) keep IDENTICAL
 *    placeholder sets per key across locales — parity scripts check key
 *    existence only, a divergent placeholder silently renders '{count}';
 * 5. zh-CN and zh-TW are genuinely distinct translations, en is ASCII.
 */

const locales = ['en-US', 'zh-CN', 'zh-TW'] as const;
type MsgKey = keyof (typeof messages)['en-US'];

/** Index-safe view of a locale map (literal key types are runtime-checked here). */
function msgMap(locale: (typeof locales)[number]): Record<MsgKey, string> {
  return messages[locale] as Record<MsgKey, string>;
}

function keysOf(locale: (typeof locales)[number]): MsgKey[] {
  return Object.keys(msgMap(locale)) as MsgKey[];
}

test.describe('locales message maps (runtime shape)', () => {
  test('exports exactly the three supported locales', () => {
    expect(Object.keys(messages).sort()).toEqual(['en-US', 'zh-CN', 'zh-TW']);
  });

  test('every value is a non-empty string; every key is a dotted flat name', () => {
    for (const locale of locales) {
      const entries = Object.entries(messages[locale]);
      expect(entries.length).toBeGreaterThan(100);
      for (const [key, value] of entries) {
        expect(typeof value, `${locale} ${key}`).toBe('string');
        expect(value.trim().length, `${locale} ${key} empty`).toBeGreaterThan(0);
        expect(key, `${locale} bad key shape: ${key}`).toMatch(
          /^[a-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$/,
        );
      }
    }
  });

  test('placeholder sets per templated key are identical across locales', () => {
    const placeholders = (value: string): string[] => [
      ...new Set([...value.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((m) => m[1]!).sort()),
    ];

    // Spot keys every locale must carry (they exist in all three by design).
    const templatedKeys: MsgKey[] = [
      'common.daysCount',
      'common.countActivity',
      'toast.logEnabled',
      'confirm.importRecords',
    ];
    for (const key of templatedKeys) {
      const expected = placeholders(msgMap('en-US')[key]);
      expect(expected.length, `${key} has no placeholder in en`).toBeGreaterThan(0);
      for (const locale of locales) {
        expect(placeholders(msgMap(locale)[key]), `${locale} ${key}`).toEqual(expected);
      }
    }
    // {n}d renders the day count — pin the concrete en shape.
    expect(messages['en-US']['common.daysCount']).toBe('{n}d');
  });

  test('en plural form carries the ` | ` ICU marker; zh locales use single forms', () => {
    expect(messages['en-US']['common.countActivity']).toContain(' | ');
    // Chinese has no grammatical plural — a stray marker here would render literally.
    expect(messages['zh-CN']['common.countActivity']).not.toContain(' | ');
    expect(messages['zh-TW']['common.countActivity']).not.toContain(' | ');
  });

  test('zh-CN and zh-TW are distinct scripts; en is ASCII', () => {
    expect(messages['zh-CN']['common.save']).toBe('保存');
    expect(messages['zh-TW']['common.save']).toBe('儲存');
    expect(messages['en-US']['common.save']).toBe('Save');
    for (const key of keysOf('en-US')) {
      // eslint-disable-next-line no-control-regex -- asserting pure-ASCII locale
      expect(msgMap('en-US')[key]).toMatch(/^[\x00-\x7F]+$/);
    }
  });

  test('the three maps share the identical key set (defensive tripwire, not the parity gate)', () => {
    const enKeys = keysOf('en-US').sort();
    expect(keysOf('zh-CN').sort()).toEqual(enKeys);
    expect(keysOf('zh-TW').sort()).toEqual(enKeys);
  });
});
