export const PLATFORM_HUES: Record<string, number> = {
  douban: 142, imdb: 45, neodb: 217, tmdb: 271,
  javdb: 0, sehuatang: 25, local: 200,
  bilibili: 340,
  youtube: 10,
  bangumi: 355,
  mukaku: 300,
}


// Ink thresholds: ratio(fg,fill) >= 4.5  ⇔  fill luminance on the far side.
const MAX_LUM_FOR_WHITE = 1.05 / 4.5 - 0.05 // fill must be DARKER than this for white ink

function linearize(u: number): number {
  return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4)
}

function hslToRgb(h: number, sPercent: number, lPercent: number): [number, number, number] {
  const s = sPercent / 100
  const l = lPercent / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  return [(r + m), (g + m), (b + m)]
}

/** Relative luminance (WCAG 2.x) for an HSL color. */
function hslLuminance(h: number, sPercent: number, lPercent: number): number {
  const [r, g, b] = hslToRgb(h, sPercent, lPercent)
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

/**
 * LIGHT-theme tile fill: deepen from baseL until WHITE ink clears AA
 * (12-step cap; worst hue imdb=45 converges at l≈34 = 4 steps; the
 * 20..72 clamp is a runaway guard). Dark theme uses the hand-built
 * deep-tint tile in usePlatformColor and never calls this.
 */
function tileFill(hue: number, s: number, baseL: number): string {
  let l = baseL
  for (let i = 0; i < 12; i++) {
    if (hslLuminance(hue, s, l) <= MAX_LUM_FOR_WHITE) break
    l -= 2
    l = Math.max(20, Math.min(72, l))
  }
  return `hsl(${hue}, ${s}%, ${l}%)`
}

export function usePlatformColor(hue: number) {
  const isDark = document.documentElement.classList.contains('dark')
  if (isDark) {
    // Dark-native letter tile (Linear/Notion pattern): deep tinted fill ×
    // bright same-hue ink. No bright saturated fills, no dark ink in dark UI.
    return {
      bar: `hsl(${hue}, 55%, 50%)`,
      icon: `hsl(${hue}, 32%, 24%)`,
      onIcon: `hsl(${hue}, 82%, 76%)`,
      chipBg: `hsl(${hue}, 30%, 15%)`,
      chipText: `hsl(${hue}, 50%, 75%)`,
      chipBorder: `hsl(${hue}, 25%, 25%)`,
    }
  }
  return {
    /** Distribution-bar / mini-progress fill (decorative, non-text). */
    bar: `hsl(${hue}, 55%, 45%)`,
    /** Icon-tile fill — deepened until white ink clears WCAG AA (ADR-020 D1). */
    icon: tileFill(hue, 55, 42),
    onIcon: '#ffffff',
    chipBg: `hsl(${hue}, 40%, 95%)`,
    chipText: `hsl(${hue}, 45%, 32%)`,
    chipBorder: `hsl(${hue}, 35%, 80%)`,
  }
}
