import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import { PLATFORM_HUES, usePlatformColor } from '@/feature/composables/use-platform-meta';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

/**
 * use-platform-meta — platform hue registry + WCAG-safe tile colors.
 * Contracts pinned:
 * 1. PLATFORM_HUES is the single source of platform→hue truth (golden map);
 * 2. light-mode icon tile fill: white ink must clear WCAG AA 4.5:1 for EVERY
 *    registered hue (ADR-020 D1 — the tileFill deepening loop's whole point),
 *    verified with an independent contrast oracle in this spec;
 * 3. the deterministic deepening outcome per hue (golden fills);
 * 4. light/dark token sets have exact documented shapes, switched solely by
 *    the `dark` class on <html>;
 * 5. dark theme NEVER routes through the deepening loop (hand-built deep tints).
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);

// A sibling spec sharing this worker can restore `document` away mid-session
// (fullyParallel interleaves files within one worker), so re-install the
// module's ambient DOM before every test instead of trusting module scope.
test.beforeEach(() => {
  defineGlobal('window', dom.window);
  defineGlobal('document', dom.window.document);
});

const doc = dom.window.document;

// ==================== Independent WCAG oracle (no import from src) ====================

function linearize(u: number): number {
  return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
}

function hslToRgb(h: number, sPct: number, lPct: number): [number, number, number] {
  const s = sPct / 100;
  const l = lPct / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

function luminance(h: number, sPct: number, lPct: number): number {
  const [r, g, b] = hslToRgb(h, sPct, lPct);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** Parse `hsl(H, S%, L%)` produced by the module. */
function parseHsl(css: string): { h: number; s: number; l: number } {
  const m = /^hsl\((\d+), (\d+)%, (\d+)%\)$/.exec(css);
  if (!m) throw new Error(`unexpected color string: ${css}`);
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

/** Contrast ratio of WHITE ink against an hsl() fill. */
function whiteContrast(fill: string): number {
  const { h, s, l } = parseHsl(fill);
  return (1.0 + 0.05) / (luminance(h, s, l) + 0.05);
}

function setDark(dark: boolean): void {
  doc.documentElement.classList.toggle('dark', dark);
}

/** noUncheckedIndexedAccess: the registry is a Record<string, number>. */
function hueOf(platform: string): number {
  const hue = PLATFORM_HUES[platform];
  if (hue === undefined) throw new Error(`PLATFORM_HUES missing ${platform}`);
  return hue;
}

test.afterEach(() => {
  setDark(false);
});

test.describe('PLATFORM_HUES registry', () => {
  test('golden platform→hue map (single source of truth)', () => {
    expect({ ...PLATFORM_HUES }).toEqual({
      douban: 142,
      imdb: 45,
      neodb: 217,
      tmdb: 271,
      javdb: 0,
      sehuatang: 25,
      local: 200,
      bilibili: 340,
      youtube: 10,
      bangumi: 355,
      mukaku: 300,
    });
  });
});

test.describe('usePlatformColor — light theme', () => {
  test('non-tile tokens are exact template shapes; onIcon is white', () => {
    const c = usePlatformColor(hueOf('douban'));
    expect(c.bar).toBe('hsl(142, 55%, 45%)');
    expect(c.onIcon).toBe('#ffffff');
    expect(c.chipBg).toBe('hsl(142, 40%, 95%)');
    expect(c.chipText).toBe('hsl(142, 45%, 32%)');
    expect(c.chipBorder).toBe('hsl(142, 35%, 80%)');
  });

  test('icon tile deepening converges to the golden fill per hue', () => {
    const expectedFills: Readonly<Record<string, string>> = {
      douban: 'hsl(142, 55%, 34%)', // deepened 4 steps from base 42
      imdb: 'hsl(45, 55%, 34%)',
      neodb: 'hsl(217, 55%, 42%)', // already dark enough at base
      tmdb: 'hsl(271, 55%, 42%)',
      javdb: 'hsl(0, 55%, 42%)',
      sehuatang: 'hsl(25, 55%, 42%)',
      local: 'hsl(200, 55%, 40%)',
      bilibili: 'hsl(340, 55%, 42%)',
      youtube: 'hsl(10, 55%, 42%)',
      bangumi: 'hsl(355, 55%, 42%)',
      mukaku: 'hsl(300, 55%, 42%)',
    };
    for (const [platform, hue] of Object.entries(PLATFORM_HUES)) {
      expect(usePlatformColor(hue).icon, `tile fill for ${platform}`).toBe(expectedFills[platform]);
    }
  });

  test('WCAG AA invariant: white ink on every registered tile fill >= 4.5:1', () => {
    for (const [platform, hue] of Object.entries(PLATFORM_HUES)) {
      const ratio = whiteContrast(usePlatformColor(hue).icon);
      expect(
        ratio,
        `contrast for ${platform} (${usePlatformColor(hue).icon})`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('deepening stays inside the 20..72 runaway-guard clamp', () => {
    // Extremes of the registry must all land within the documented clamp.
    for (const hue of Object.values(PLATFORM_HUES)) {
      const { l } = parseHsl(usePlatformColor(hue).icon);
      expect(l).toBeGreaterThanOrEqual(20);
      expect(l).toBeLessThanOrEqual(72);
    }
  });
});

test.describe('usePlatformColor — dark theme', () => {
  test('dark-native deep-tint tokens (never routes through tileFill)', () => {
    setDark(true);
    const hue = hueOf('neodb');
    const c = usePlatformColor(hue);
    expect(c).toEqual({
      bar: 'hsl(217, 55%, 50%)',
      icon: 'hsl(217, 32%, 24%)',
      onIcon: 'hsl(217, 82%, 76%)',
      chipBg: 'hsl(217, 30%, 15%)',
      chipText: 'hsl(217, 50%, 75%)',
      chipBorder: 'hsl(217, 25%, 25%)',
    });
  });

  test('the .dark class is the only switch — toggling flips both token sets', () => {
    const hue = hueOf('bilibili');
    const light = usePlatformColor(hue);
    setDark(true);
    const dark = usePlatformColor(hue);
    setDark(false);
    const lightAgain = usePlatformColor(hue);
    expect(dark.icon).not.toBe(light.icon);
    expect(dark.onIcon).not.toBe(light.onIcon);
    expect(lightAgain).toEqual(light);
  });
});
