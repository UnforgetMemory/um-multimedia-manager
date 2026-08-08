/**
 * Shared video-overlay style templates (bilibili ↔ youtube, audit §2.1 T18).
 *
 * Split out of video-overlay.ts (was 861L) — pure string builders parameterized
 * by theme vars + site colors/font. No DOM access, no side effects at module level.
 *
 * Status codes: 0=NONE, 1=WISHLIST, 2=DONE, 3=DOING
 */

import {
  STATUS_COLORS as COLORS,
  STATUS_LABELS as LABELS,
} from './video-overlay-pure'

/** Theme color set. The legacy `muted` field was never read — dropped. */
export interface ThemeVars {
  card: string
  fg: string
  border: string
  overlay: string
  bbg: string
  mutedFg: string
  ratingBtnBg: string
  ratingBtnFg: string
}

function css(parts: string[]): string { return parts.join(';') + ';' }

export function sBtnFloat(_t: ThemeVars, s: number, fontFamily: string): string {
  return css([
    'position:fixed', 'left:16px', 'top:50%', 'transform:translateY(-50%)',
    'z-index:2147483647', 'width:48px', 'height:48px', 'border-radius:14px',
    'background:' + COLORS[s], 'color:#fff',
    'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
    'cursor:pointer', 'font-size:11px', 'font-weight:' + (s === 2 ? '800' : '700'),
    'font-family:' + fontFamily,
    'box-shadow:' + (s > 0 ? '0 4px 16px ' + COLORS[s] + '66,0 2px 6px rgba(0,0,0,0.2)' : '0 3px 14px rgba(0,0,0,0.25)'),
    'transition:background 0.25s,transform 0.2s,box-shadow 0.25s',
    'user-select:none', 'line-height:1.2',
  ])
}

export function sBadge(t: ThemeVars, s: number, isDark: boolean): string {
  return css([
    'position:absolute', 'top:-7px', 'right:-7px',
    'background:' + t.card, 'color:' + COLORS[s],
    'border-radius:9px', 'padding:0 5px',
    'font-size:10px', 'font-weight:' + (isDark ? '700' : '800'),
    'line-height:18px', 'box-shadow:0 1px 4px rgba(0,0,0,0.2)',
    'border:1.5px solid ' + COLORS[s],
  ])
}

export function sOverlay(t: ThemeVars, fontFamily: string): string {
  return css([
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'background:' + t.overlay,
    'display:flex', 'align-items:center', 'justify-content:center',
    'font-family:' + fontFamily,
  ])
}

export function sCard(t: ThemeVars): string {
  return css([
    'background:' + t.card, 'border-radius:16px', 'padding:24px',
    'width:300px', 'max-width:90vw',
    'box-shadow:0 8px 32px rgba(0,0,0,0.25)', 'color:' + t.fg,
  ])
}

export function sTitle(): string {
  return 'font-size:16px;font-weight:700;margin-bottom:16px;'
}

export function sStatusBtn(idx: number, cur: number): string {
  const active = cur === idx
  return css([
    'flex:1', 'min-width:' + (LABELS[idx].length > 2 ? '60px' : '44px'),
    'padding:8px 0', 'border:2px solid ' + COLORS[idx],
    'border-radius:8px', 'cursor:pointer', 'font-size:13px', 'font-weight:700',
    'font-family:inherit', 'transition:all 0.15s',
    'background:' + (active ? COLORS[idx] : 'transparent'),
    'color:' + (active ? '#fff' : COLORS[idx]),
    'opacity:' + (active ? '1' : '0.85'),
  ])
}

export function sSectionRow(): string { return 'display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;' }

export function sRatingLabel(t: ThemeVars): string {
  return 'font-size:13px;color:' + t.mutedFg + ';margin-bottom:6px;font-weight:600;'
}

export function sRatingBtn(t: ThemeVars, v: number, cur: number): string {
  const active = v === cur
  return css([
    'width:40px', 'height:32px', 'border:none',
    'border-radius:6px', 'cursor:pointer',
    'font-size:12px', 'font-weight:700', 'font-family:inherit',
    'background:' + (active ? COLORS[2] : t.ratingBtnBg),
    'color:' + (active ? '#fff' : t.ratingBtnFg),
    'transition:all 0.1s', 'opacity:' + (active ? '1' : '0.85'),
  ])
}

export function sActionRow(): string { return 'display:flex;gap:8px;' }

export function sCancelBtn(t: ThemeVars): string {
  return css([
    'flex:1', 'padding:10px 0', 'border:1px solid ' + t.border,
    'border-radius:8px', 'cursor:pointer', 'font-size:14px', 'font-weight:600',
    'font-family:inherit', 'background:' + t.bbg, 'color:' + t.fg,
  ])
}

export function sSaveBtn(s: number): string {
  return css([
    'flex:1', 'padding:10px 0', 'border:none',
    'border-radius:8px', 'cursor:pointer', 'font-size:14px', 'font-weight:600',
    'font-family:inherit', 'color:#fff', 'background:' + COLORS[s],
  ])
}

export function sRatingGrid(): string { return 'display:flex;flex-wrap:wrap;gap:4px;' }

export function sRatingSection(show: boolean): string {
  return 'display:' + (show ? 'block' : 'none') + ';margin-bottom:16px;'
}
