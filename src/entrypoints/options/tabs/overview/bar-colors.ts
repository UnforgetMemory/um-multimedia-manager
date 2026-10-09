/**
 * Theme-adaptive bar colors for the overview charts, read from the
 * `--umm-bar-*` design tokens via getComputedStyle (style.css registers them
 * per theme). Shared by WeeklyPanel and PlatformPanel — extracted from
 * OverviewTab.vue under the ≤600-line file gate.
 */

export function platformColor(hue: number, variant: 'bar' | 'icon'): string {
  const s = getComputedStyle(document.documentElement);
  const barL = s.getPropertyValue('--umm-bar-platform-l').trim();
  const iconL = s.getPropertyValue('--umm-bar-platform-icon-l').trim();
  switch (variant) {
    case 'bar':
      return `hsl(${hue}, 55%, ${barL || '45%'})`;
    case 'icon':
      return `hsl(${hue}, 55%, ${iconL || '40%'})`;
  }
}

export function barColor(count: number, maxCount: number): string {
  if (count === 0) return 'var(--muted)';
  const s = getComputedStyle(document.documentElement);
  const baseS = parseFloat(s.getPropertyValue('--umm-bar-base-s')) || 35;
  const baseL = parseFloat(s.getPropertyValue('--umm-bar-base-l')) || 75;
  // Direction lets dark themes INVERT the ramp: stronger days get BRIGHTER
  // fills (visible on deep panels) instead of darker ones.
  const dir = parseFloat(s.getPropertyValue('--umm-bar-dir')) || 1;
  const ratio = count / maxCount;
  const level = Math.min(5, Math.ceil(ratio * 5));
  return `hsl(210, ${baseS + level * 7}%, ${baseL - level * 6 * dir}%)`;
}
