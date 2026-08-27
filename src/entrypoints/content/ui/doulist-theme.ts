/**
 * Doulist modal theme tokens (extracted from doulist-replace.ts, P2 split).
 *
 * Light/dark token set for the themed doulist management dialog.
 * Pure data — no DOM access.
 */

export interface DialogTheme {
  overlayBg: string
  panelBg: string
  panelBorder: string
  panelShadow: string
  headerBg: string
  headerBorder: string
  titleColor: string
  closeColor: string
  closeHoverBg: string
  closeHoverColor: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  surfaceAlt: string
  borderDark: string
  inputBg: string
  inputBorder: string
  onAccent: string
  accent: string
  accentGlow: string
  accentSubtle: string
  tableHeaderBg: string
  theadText: string
  rowBorder: string
  rowHover: string
  selectedBg: string
  checkedColor: string
  checkedBg: string
  uncheckedColor: string
  confirmBg: string
  emptyText: string
  scrollThumb: string
  placeholderColor: string
  labelColor: string
  yesBtnBg: string
  noBtnBg: string
  noBtnText: string
  noBtnBorder: string
  borderInputBlur: string
}

export function createDialogTheme(dark: boolean): DialogTheme {
  // Dark branch = macOS Vibrancy family (#1c1c1e panels, white-alpha tiers,
  // Apple-blue selection glow). Light branch unchanged.
  return {
    overlayBg: dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)',
    panelBg: dark ? '#1c1c1e' : '#fff',
    panelBorder: dark ? 'rgba(255,255,255,0.10)' : '#e8e8e8',
    panelShadow: dark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.15)',
    headerBg: dark ? '#2c2c2e' : '#fafafa',
    headerBorder: dark ? 'rgba(255,255,255,0.08)' : '#e8e8e8',
    titleColor: dark ? '#f4f4f5' : '#1a1a1a',
    closeColor: dark ? '#98989d' : '#6f7d94',
    closeHoverBg: dark ? '#3a3a3c' : '#f0f0f0',
    closeHoverColor: dark ? '#f4f4f5' : '#333',
    textPrimary: dark ? '#f4f4f5' : '#1a1a1a',
    textSecondary: dark ? '#c9c9cb' : '#333',
    textMuted: dark ? '#98989d' : '#5d6a81',
    surfaceAlt: dark ? '#3a3a3c' : '#fff',
    borderDark: dark ? 'rgba(255,255,255,0.14)' : '#d0d0d0',
    inputBg: dark ? '#161618' : '#f5f5f5',
    inputBorder: dark ? 'rgba(255,255,255,0.12)' : '#d0d0d0',
    onAccent: dark ? '#10141b' : '#ffffff',
    accent: dark ? '#7e9bf9' : '#3a55ec',
    accentGlow: dark ? 'rgba(10,132,255,0.14)' : 'rgba(79,110,247,0.12)',
    accentSubtle: dark ? 'rgba(10,132,255,0.10)' : 'rgba(79,110,247,0.06)',
    tableHeaderBg: dark ? '#2c2c2e' : '#fafafa',
    theadText: dark ? '#98989d' : '#5d6a81',
    rowBorder: dark ? 'rgba(255,255,255,0.06)' : '#eee',
    rowHover: dark ? '#2c2c2e' : '#f5f5f5',
    selectedBg: dark ? 'rgba(10,132,255,0.12)' : '#f0f4ff',
    checkedColor: dark ? '#6fcf73' : '#0f7a43',
    checkedBg: dark ? 'rgba(111,207,115,0.12)' : 'rgba(15,122,67,0.1)',
    uncheckedColor: dark ? '#98989d' : '#5d6a81',
    confirmBg: dark ? 'rgba(28,28,30,0.93)' : 'rgba(255,255,255,0.93)',
    emptyText: dark ? '#98989d' : '#5d6a81',
    scrollThumb: dark ? '#48484a' : '#ccc',
    placeholderColor: dark ? '#98989d' : '#5d6a81',
    labelColor: dark ? '#98989d' : '#5d6a81',
    yesBtnBg: dark ? '#7e9bf9' : '#3a55ec',
    noBtnBg: dark ? '#3a3a3c' : '#fff',
    noBtnText: dark ? '#c9c9cb' : '#333',
    noBtnBorder: dark ? 'rgba(255,255,255,0.14)' : '#d0d0d0',
    borderInputBlur: dark ? 'rgba(255,255,255,0.25)' : '#d0d0d0',
  }
}
