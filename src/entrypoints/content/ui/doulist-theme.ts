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
  return {
    overlayBg: dark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.35)',
    panelBg: dark ? '#25262b' : '#fff',
    panelBorder: dark ? '#373a40' : '#e8e8e8',
    panelShadow: dark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.15)',
    headerBg: dark ? '#2c2e33' : '#fafafa',
    headerBorder: dark ? '#373a40' : '#e8e8e8',
    titleColor: dark ? '#f0f0f0' : '#1a1a1a',
    closeColor: dark ? '#888' : '#999',
    closeHoverBg: dark ? '#373a40' : '#f0f0f0',
    closeHoverColor: dark ? '#e8e8e8' : '#333',
    textPrimary: dark ? '#e8e8e8' : '#1a1a1a',
    textSecondary: dark ? '#c8c8c8' : '#333',
    textMuted: dark ? '#999' : '#888',
    surfaceAlt: dark ? '#373a40' : '#fff',
    borderDark: dark ? '#45484f' : '#d0d0d0',
    inputBg: dark ? '#1a1b1e' : '#f5f5f5',
    inputBorder: dark ? '#45484f' : '#d0d0d0',
    accent: dark ? '#6e8aff' : '#4f6ef7',
    accentGlow: dark ? 'rgba(110,138,255,0.15)' : 'rgba(79,110,247,0.12)',
    accentSubtle: dark ? 'rgba(110,138,255,0.08)' : 'rgba(79,110,247,0.06)',
    tableHeaderBg: dark ? '#2c2e33' : '#fafafa',
    theadText: dark ? '#999' : '#888',
    rowBorder: dark ? '#2c2e33' : '#eee',
    rowHover: dark ? '#2c2e33' : '#f5f5f5',
    selectedBg: dark ? 'rgba(110,138,255,0.08)' : '#f0f4ff',
    checkedColor: dark ? '#6fcf73' : '#0f7a43',
    checkedBg: dark ? 'rgba(111,207,115,0.12)' : 'rgba(15,122,67,0.1)',
    uncheckedColor: dark ? '#555' : '#bbb',
    confirmBg: dark ? 'rgba(37,38,43,0.93)' : 'rgba(255,255,255,0.93)',
    emptyText: dark ? '#777' : '#999',
    scrollThumb: dark ? '#45484f' : '#ccc',
    placeholderColor: dark ? '#666' : '#aaa',
    labelColor: dark ? '#999' : '#666',
    yesBtnBg: dark ? '#6e8aff' : '#4f6ef7',
    noBtnBg: dark ? '#373a40' : '#fff',
    noBtnText: dark ? '#c8c8c8' : '#333',
    noBtnBorder: dark ? '#45484f' : '#d0d0d0',
    borderInputBlur: dark ? '#373a40' : '#d0d0d0',
  }
}
