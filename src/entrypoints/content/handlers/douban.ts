/**
 * 豆瓣详情页处理器
 * 功能：检测页面状态并注入状态标签
 *
 * 职责：入口文件，协调各子模块
 * - douban-scanner: 页面状态扫描、评论提取、跨平台链接
 * - douban-sync: 本地存储同步、通知缓存管理
 * - douban-neodb: NeoDB 推送按钮、事件绑定、推送逻辑
 * - douban-toast: 页面通知显示
 * - Theme sync: 读取 UMM 主题并同步到页面
 * - Beautify: 页面元素简单美化（CSS注入）
 */

import { Utils } from '@/utils'
import type { UrlIdentity } from '@/types'
import { normalizeSearchQuery } from '@/utils/search-normalizer'
import { escapeHtml, waitForElement } from '../utils/dom'
import { scanDoubanPageStatus } from './douban-scanner'
import { getLocalRecord, syncToLocalStorage } from './douban-sync'
import { injectNeoDBPushButtons } from './douban-neodb'
import { showNotification } from './douban-toast'
import { t } from '../i18n'
import { enhanceDetailPageSearch } from '../enhancers/douban-search-bar'
import { initDoulistReplacement } from '../ui/doulist-replace'
import { setNeoDBInjector } from '../observers/rating'

// ✅ P2: 提取魔法数字为常量
const STATUS_DONE = 2
// const STATUS_WISH = 1  // 暂未使用
const STATUS_NONE = 0

const THEME_KEY = 'umm:appearance'
export const THEME_ATTR = 'data-umm-theme'
export const BEAUTIFY_STYLE_ID = 'umm-detail-beautify'
export const DETAIL_BEAUTIFY_CSS = `
/* ===== Shared (both themes) ===== */
#mainpic img {
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  transition: box-shadow 0.25s ease, transform 0.25s ease;
}
#mainpic img:hover {
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  transform: translateY(-2px);
}

#info {
  line-height: 1.75 !important;
  font-size: 13.5px !important;
}

#link-report-intra {
  font-size: 14px !important;
  line-height: 1.9 !important;
  color: #333 !important;
}
#link-report-intra p {
  margin: 0.6em 0 !important;
}

#celebrities .celebrity {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  border-radius: 6px;
  overflow: hidden;
}
#celebrities .celebrity:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

#interest_sectl {
  border-radius: 8px;
  overflow: hidden;
}

/* ===== Dark theme — comprehensive override ===== */
[${THEME_ATTR}="dark"] body {
  background: #1a1b1e !important;
}
[${THEME_ATTR}="dark"] #wrapper,
[${THEME_ATTR}="dark"] #content {
  background: transparent !important;
}
[${THEME_ATTR}="dark"] .article {
  background: transparent !important;
}

/* Global text color reset */
[${THEME_ATTR}="dark"] body,
[${THEME_ATTR}="dark"] #wrapper,
[${THEME_ATTR}="dark"] #content,
[${THEME_ATTR}="dark"] .article,
[${THEME_ATTR}="dark"] .aside,
[${THEME_ATTR}="dark"] p,
[${THEME_ATTR}="dark"] li,
[${THEME_ATTR}="dark"] .pl,
[${THEME_ATTR}="dark"] .color-gray,
[${THEME_ATTR}="dark"] .gray_ad {
  color: #c8c8c8 !important;
}

/* Headings */
[${THEME_ATTR}="dark"] h1,
[${THEME_ATTR}="dark"] h2,
[${THEME_ATTR}="dark"] h3,
[${THEME_ATTR}="dark"] .title a {
  color: #e8e8e8 !important;
}

/* Links */
[${THEME_ATTR}="dark"] a:link {
  color: #6e8aff !important;
}
[${THEME_ATTR}="dark"] a:visited {
  color: #9b72cf !important;
}
[${THEME_ATTR}="dark"] a:hover {
  color: #8aa0ff !important;
}

/* Navigation bar */
[${THEME_ATTR}="dark"] #db-nav-movie,
[${THEME_ATTR}="dark"] #db-nav-music {
  background: #25262b !important;
  border-color: #373a40 !important;
}
[${THEME_ATTR}="dark"] #db-nav-movie .nav-logo a,
[${THEME_ATTR}="dark"] #db-nav-music .nav-logo a {
  color: #e8e8e8 !important;
}
[${THEME_ATTR}="dark"] #db-nav-movie .nav-search input,
[${THEME_ATTR}="dark"] #db-nav-music .nav-search input {
  background: #2c2e33 !important;
  color: #e0e0e0 !important;
  border-color: #373a40 !important;
}

/* Poster section */
[${THEME_ATTR}="dark"] #mainpic img {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}
[${THEME_ATTR}="dark"] #mainpic img:hover {
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55);
}

/* Info section */
[${THEME_ATTR}="dark"] #info {
  color: #c8c8c8 !important;
}
[${THEME_ATTR}="dark"] #info .pl {
  color: #999 !important;
}
[${THEME_ATTR}="dark"] #info a:link {
  color: #6e8aff !important;
}

/* Rating section */
[${THEME_ATTR}="dark"] #interest_sectl {
  background: #25262b !important;
  border-color: #373a40 !important;
}
[${THEME_ATTR}="dark"] #interest_sectl .rating_num {
  color: #e8e8e8 !important;
}
[${THEME_ATTR}="dark"] #interest_sectl .rating_sum a {
  color: #6e8aff !important;
}
[${THEME_ATTR}="dark"] .bigstar50 { background-position: 0 -40px !important; }
[${THEME_ATTR}="dark"] .bigstar45 { background-position: 0 -36px !important; }
[${THEME_ATTR}="dark"] .bigstar40 { background-position: 0 -32px !important; }
[${THEME_ATTR}="dark"] .bigstar35 { background-position: 0 -28px !important; }
[${THEME_ATTR}="dark"] .bigstar30 { background-position: 0 -24px !important; }
[${THEME_ATTR}="dark"] .bigstar25 { background-position: 0 -20px !important; }
[${THEME_ATTR}="dark"] .bigstar20 { background-position: 0 -16px !important; }

/* User interest section */
[${THEME_ATTR}="dark"] #interest_sect_level {
  color: #c8c8c8 !important;
}
[${THEME_ATTR}="dark"] #interest_sect_level a:link {
  color: #6e8aff !important;
}

/* Synopsis */
[${THEME_ATTR}="dark"] #link-report-intra {
  background: #25262b !important;
  border-color: #373a40 !important;
  color: #c8c8c8 !important;
}
[${THEME_ATTR}="dark"] #link-report-intra .all-hidden {
  color: #c8c8c8 !important;
}

/* Cast section */
[${THEME_ATTR}="dark"] #celebrities {
  background: transparent !important;
}
[${THEME_ATTR}="dark"] #celebrities .celebrity {
  background: #25262b !important;
  border-color: #373a40 !important;
}
[${THEME_ATTR}="dark"] #celebrities .name a {
  color: #c8c8c8 !important;
}
[${THEME_ATTR}="dark"] #celebrities .role {
  color: #999 !important;
}
[${THEME_ATTR}="dark"] #celebrities .celebrity:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

/* Aside / Sidebar */
[${THEME_ATTR}="dark"] .aside {
  background: transparent !important;
}
[${THEME_ATTR}="dark"] .aside .info-wrapper {
  background: #25262b !important;
  border-color: #373a40 !important;
}
[${THEME_ATTR}="dark"] .aside .content {
  color: #c8c8c8 !important;
}

/* Comments section */
[${THEME_ATTR}="dark"] #comments-section {
  background: transparent !important;
}
[${THEME_ATTR}="dark"] #comments-section .comment-item {
  background: #25262b !important;
  border-color: #373a40 !important;
}
[${THEME_ATTR}="dark"] #comments-section .comment {
  color: #c8c8c8 !important;
}

/* Footer */
[${THEME_ATTR}="dark"] #footer {
  background: #1a1b1e !important;
  border-color: #373a40 !important;
}
[${THEME_ATTR}="dark"] #footer .ft-links a {
  color: #6e8aff !important;
}

/* Borders */
[${THEME_ATTR}="dark"] hr,
[${THEME_ATTR}="dark"] .line {
  border-color: #373a40 !important;
}
[${THEME_ATTR}="dark"] #content {
  border-color: #373a40 !important;
}

/* Recommendation section */
[${THEME_ATTR}="dark"] .recommendations {
  background: transparent !important;
}
[${THEME_ATTR}="dark"] .recommendations .title a {
  color: #c8c8c8 !important;
}

/* Tabs */
[${THEME_ATTR}="dark"] .tabs a {
  color: #999 !important;
}
[${THEME_ATTR}="dark"] .tabs a:link {
  color: #6e8aff !important;
}
[${THEME_ATTR}="dark"] .tabs .on a {
  color: #e8e8e8 !important;
  background: #373a40 !important;
}

/* Paginator */
[${THEME_ATTR}="dark"] .paginator a:link {
  color: #6e8aff !important;
}
[${THEME_ATTR}="dark"] .paginator .thisval {
  color: #e8e8e8 !important;
  background: #373a40 !important;
}

/* User action buttons (想看/看过) */
[${THEME_ATTR}="dark"] #interest_sect_level .buylist a,
[${THEME_ATTR}="dark"] #interest_sect_level .add2 a {
  background: #373a40 !important;
  border-color: #373a40 !important;
  color: #c8c8c8 !important;
}
[${THEME_ATTR}="dark"] #interest_sect_level .add2 a:hover {
  background: #45484f !important;
}

/* ===== 搜索栏增强 — 浮动居中灵动岛（fixed） ===== */
.umm-detail-pill-wrap {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  z-index: 1000 !important;
  display: flex !important;
  justify-content: center !important;
  padding: 10px 16px !important;
  background: rgba(255, 255, 255, 0.90) !important;
  backdrop-filter: blur(20px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.06) !important;
  box-sizing: border-box !important;
}
.umm-detail-pill-inner {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  max-width: 800px !important;
  flex: 1 !important;
  min-width: 0 !important;
}
.umm-detail-pill-inner > .umm-search-bar {
  flex: 1 !important;
  min-width: 0 !important;
}
html {
  scroll-padding-top: 64px !important;
}
#wrapper {
  padding-top: 56px !important;
}
#content {
  padding-top: 8px !important;
}

/* ===== Subjectwrap 布局重构 — 卡片式视觉 ===== */
.subjectwrap {
  display: grid !important;
  grid-template-columns: 280px 1fr !important;
  gap: 0 24px !important;
  margin-top: 16px !important;
}
.subjectwrap .subject {
  width: auto !important;
  float: none !important;
}
.subjectwrap #mainpic {
  width: auto !important;
  float: none !important;
  margin: 0 !important;
}
.subjectwrap #mainpic img {
  width: 100% !important;
  max-width: 280px !important;
  height: auto !important;
  border-radius: 10px !important;
}
.subjectwrap #info {
  float: none !important;
  width: auto !important;
  padding: 0 !important;
  font-size: 13.5px !important;
  line-height: 1.8 !important;
}
.subjectwrap #info br {
  display: none !important;
}
.subjectwrap #info > span,
.subjectwrap #info > span[class] {
  display: block !important;
  margin-bottom: 4px !important;
}
.subjectwrap #info .pl {
  color: #888 !important;
  min-width: 70px !important;
  display: inline-block !important;
}
.subjectwrap #interest_sectl {
  float: none !important;
  width: auto !important;
  margin-top: 20px !important;
  padding: 16px 20px !important;
  background: rgba(0, 0, 0, 0.02) !important;
  border-radius: 12px !important;
  border: 1px solid rgba(0, 0, 0, 0.06) !important;
}
.subjectwrap #interest_sect_level {
  float: none !important;
  width: auto !important;
  margin-top: 8px !important;
  padding: 12px 20px !important;
}
/* Remove old h1 left-float that interferes with grid */
#content h1 {
  margin-bottom: 4px !important;
}
/* Reset douban float hacks inside subject */
.indent.clearfix,
.subjectwrap.clearfix,
.subject.clearfix {
  overflow: visible !important;
}

/* Dark theme */
[${THEME_ATTR}="dark"] .subjectwrap #info .pl {
  color: #777 !important;
}
[${THEME_ATTR}="dark"] .subjectwrap #interest_sectl {
  background: rgba(255, 255, 255, 0.03) !important;
  border-color: rgba(255, 255, 255, 0.06) !important;
}
.umm-detail-pill-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 36px !important;
  padding: 0 14px !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  color: #444 !important;
  background: rgba(0, 0, 0, 0.03) !important;
  border: 1px solid rgba(0, 0, 0, 0.06) !important;
  border-radius: 999px !important;
  text-decoration: none !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
  flex-shrink: 0 !important;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
}
.umm-detail-pill-btn:hover {
  background: rgba(0, 0, 0, 0.06) !important;
  color: #111 !important;
}
.umm-detail-pill-btn:active {
  background: rgba(0, 0, 0, 0.1) !important;
}
.umm-detail-pill-btn--active {
  background: rgba(23, 87, 214, 0.12) !important;
  color: #1757d6 !important;
  border-color: rgba(23, 87, 214, 0.25) !important;
  font-weight: 600 !important;
}

[${THEME_ATTR}="dark"] .umm-detail-pill-btn {
  color: #bbb !important;
  background: rgba(255, 255, 255, 0.06) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}
[${THEME_ATTR}="dark"] .umm-detail-pill-btn:hover {
  background: rgba(255, 255, 255, 0.1) !important;
  color: #e8e8e8 !important;
}
[${THEME_ATTR}="dark"] .umm-detail-pill-btn--active {
  background: rgba(110, 138, 255, 0.15) !important;
  color: #8aa0ff !important;
  border-color: rgba(110, 138, 255, 0.3) !important;
}
[${THEME_ATTR}="dark"] .umm-detail-pill-wrap {
  background: rgba(26, 27, 30, 0.95) !important;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.3) !important;
}
[${THEME_ATTR}="dark"] .umm-detail-pill-inner > .umm-search-bar {
  background: rgba(255, 255, 255, 0.06) !important;
}

/* UMM status chip (System 1) */
[${THEME_ATTR}="dark"] .umm-status-chip {
  background: #25262b !important;
  border-color: #373a40 !important;
  color: #c8c8c8 !important;
}
[${THEME_ATTR}="dark"] .umm-status-chip[data-status="done"] {
  background: #1a3a2a !important;
  border-color: #0f5c3a !important;
}

/* UMM NeoDB buttons (System 1) */
[${THEME_ATTR}="dark"] #umm-neodb-push-buttons {
  background: #25262b !important;
  border-color: #373a40 !important;
}
[${THEME_ATTR}="dark"] #umm-neodb-push-buttons .umm-neodb-btn {
  background: #373a40 !important;
  color: #c8c8c8 !important;
  border-color: #45484f !important;
}

/* ===== Subject card — rebuilt card layout ===== */
.umm-subject-root {
  display: grid !important;
  grid-template-columns: 300px 1fr !important;
  gap: 28px !important;
  max-width: 1200px !important;
  margin: 24px auto !important;
  padding: 0 16px !important;
  box-sizing: border-box !important;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
}
.umm-subject-left-col {
  grid-column: 1 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 28px !important;
}
.umm-subject-poster {
  align-self: start !important;
}
.umm-subject-poster img {
  width: 100% !important;
  max-width: 300px !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15) !important;
  display: block !important;
  transition: transform 0.3s ease, box-shadow 0.3s ease !important;
}
.umm-subject-poster img:hover {
  transform: translateY(-4px) scale(1.02) !important;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.2) !important;
}
.umm-subject-rating-card {
  align-self: start !important;
  margin-bottom: 16px !important;
}
.umm-subject-body {
  grid-column: 2 !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 20px !important;
}
.umm-subject-title {
  grid-column: 1 / -1 !important;
  font-size: 28px !important;
  font-weight: 700 !important;
  line-height: 1.3 !important;
  color: #111 !important;
  margin: 0 0 12px !important;
  width: 100% !important;
}
.umm-subject-title .year {
  font-weight: 400 !important;
  font-size: 18px !important;
  color: #888 !important;
  margin-left: 8px !important;
}
.umm-subject-meta {
  background: rgba(0, 0, 0, 0.02) !important;
  border: 1px solid rgba(0, 0, 0, 0.06) !important;
  border-radius: 12px !important;
  padding: 16px 20px !important;
  font-size: 13.5px !important;
  line-height: 1.8 !important;
  color: #333 !important;
}
.umm-meta-row {
  display: flex !important;
  gap: 4px !important;
  margin-bottom: 2px !important;
}
.umm-meta-label {
  color: #888 !important;
  flex-shrink: 0 !important;
  min-width: 64px !important;
  font-weight: 500 !important;
}
.umm-meta-value {
  color: #333 !important;
}
.umm-meta-value a {
  color: #1757d6 !important;
  text-decoration: none !important;
  transition: color 0.15s !important;
}
.umm-meta-value a:hover {
  color: #0d47b8 !important;
  text-decoration: underline !important;
}
.umm-meta-value .more-attrs {
  color: #1757d6 !important;
  font-size: 12px !important;
  cursor: pointer !important;
}
.umm-subject-rating-card {
  background: rgba(0, 0, 0, 0.02) !important;
  border: 1px solid rgba(0, 0, 0, 0.06) !important;
  border-radius: 12px !important;
  padding: 16px 20px !important;
}
.umm-rating-header {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  margin-bottom: 12px !important;
}
.umm-rating-score {
  font-size: 36px !important;
  font-weight: 700 !important;
  color: #e0901a !important;
  line-height: 1 !important;
}
.umm-rating-stars {
  display: flex !important;
  align-items: center !important;
  gap: 2px !important;
}
.umm-rating-stars .bigstar {
  display: inline-block !important;
  width: 16px !important;
  height: 16px !important;
  background-image: url(https://img3.doubanio.com/pics/ic_rating_s.png) !important;
  background-repeat: no-repeat !important;
}
.umm-rating-stats {
  font-size: 13px !important;
  color: #666 !important;
}
.umm-rating-bars {
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
  margin-top: 8px !important;
}
.umm-rating-bar-row {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  font-size: 12px !important;
}
.umm-rating-bar-label {
  width: 28px !important;
  text-align: right !important;
  color: #888 !important;
}
.umm-rating-bar-track {
  flex: 1 !important;
  height: 6px !important;
  background: rgba(0, 0, 0, 0.06) !important;
  border-radius: 3px !important;
  overflow: hidden !important;
}
.umm-rating-bar-fill {
  height: 100% !important;
  background: #f5a623 !important;
  border-radius: 3px !important;
  transition: width 0.3s ease !important;
}
.umm-rating-bar-pct {
  width: 36px !important;
  text-align: right !important;
  color: #888 !important;
}
.umm-subject-actions {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  flex-wrap: wrap !important;
}
.umm-subject-actions .collect_btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 38px !important;
  padding: 0 20px !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  border-radius: 10px !important;
  text-decoration: none !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
  border: none !important;
  font-family: inherit !important;
}
.umm-subject-actions .collect_btn[name*="wish"] {
  background: rgba(23, 87, 214, 0.1) !important;
  color: #1757d6 !important;
}
.umm-subject-actions .collect_btn[name*="wish"]:hover {
  background: rgba(23, 87, 214, 0.18) !important;
}
.umm-subject-actions .collect_btn[name*="collect"] {
  background: rgba(15, 122, 67, 0.1) !important;
  color: #0f7a43 !important;
}
.umm-subject-actions .collect_btn[name*="collect"]:hover {
  background: rgba(15, 122, 67, 0.18) !important;
}

/* Dark theme */
[${THEME_ATTR}="dark"] .umm-subject-title {
  color: #e8e8e8 !important;
}
[${THEME_ATTR}="dark"] .umm-subject-title .year {
  color: #666 !important;
}
[${THEME_ATTR}="dark"] .umm-subject-meta {
  background: rgba(255, 255, 255, 0.03) !important;
  border-color: rgba(255, 255, 255, 0.06) !important;
  color: #c8c8c8 !important;
}
[${THEME_ATTR}="dark"] .umm-meta-label {
  color: #777 !important;
}
[${THEME_ATTR}="dark"] .umm-meta-value {
  color: #c8c8c8 !important;
}
[${THEME_ATTR}="dark"] .umm-meta-value a {
  color: #6e8aff !important;
}
[${THEME_ATTR}="dark"] .umm-meta-value a:hover {
  color: #8aa0ff !important;
}
[${THEME_ATTR}="dark"] .umm-subject-rating-card {
  background: rgba(255, 255, 255, 0.03) !important;
  border-color: rgba(255, 255, 255, 0.06) !important;
}
[${THEME_ATTR}="dark"] .umm-rating-stats {
  color: #999 !important;
}
[${THEME_ATTR}="dark"] .umm-rating-bar-track {
  background: rgba(255, 255, 255, 0.08) !important;
}
[${THEME_ATTR}="dark"] .umm-rating-bar-label,
[${THEME_ATTR}="dark"] .umm-rating-bar-pct {
  color: #777 !important;
}
[${THEME_ATTR}="dark"] .umm-subject-actions .collect_btn[name*="wish"] {
  background: rgba(110, 138, 255, 0.12) !important;
  color: #8aa0ff !important;
}
[${THEME_ATTR}="dark"] .umm-subject-actions .collect_btn[name*="wish"]:hover {
  background: rgba(110, 138, 255, 0.2) !important;
}
[${THEME_ATTR}="dark"] .umm-subject-actions .collect_btn[name*="collect"] {
  background: rgba(16, 185, 129, 0.12) !important;
  color: #6fcf73 !important;
}
[${THEME_ATTR}="dark"] .umm-subject-actions .collect_btn[name*="collect"]:hover {
  background: rgba(16, 185, 129, 0.2) !important;
}

/* ===== Douban dui-dialog: visual rebuild ===== */
/* Layout overrides (always apply, no theme prefix needed) */
.dui-dialog {
  width: auto !important;
  max-width: min(640px, calc(100vw - 48px)) !important;
  min-width: 360px !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  top: 120px !important;
}
.dui-dialog-shd {
  width: 100% !important;
  height: 100% !important;
  border-radius: 14px !important;
}
.doulist-bd .doulist-preview {
  display: none !important;
}
.doulist-bd .dl_exist_select {
  overscroll-behavior: contain !important;
  max-height: 300px !important;
}
.doulist-bd .dl-item-wrap:hover label b,
.doulist-bd .dl-item-wrap:hover label span,
.doulist-bd .dl-item-wrap:hover label {
  color: inherit !important;
}

/* Dark theme color overrides */
[${THEME_ATTR}="dark"] .dui-dialog {
  background: transparent !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-shd {
  background: #25262b !important;
  border: 1px solid #373a40 !important;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.35) !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-content {
  background: transparent !important;
}

/* --- Header --- */
[${THEME_ATTR}="dark"] .dui-dialog-content .hd {
  background: #2c2e33 !important;
  border-bottom: 1px solid #373a40 !important;
  padding: 14px 20px !important;
  border-radius: 14px 14px 0 0 !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-content .hd h3 {
  color: #e8e8e8 !important;
  font-size: 15px !important;
  font-weight: 600 !important;
  margin: 0 !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-close {
  color: #888 !important;
  text-decoration: none !important;
  font-size: 16px !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-close:hover {
  color: #e8e8e8 !important;
}

/* --- Body background --- */
[${THEME_ATTR}="dark"] .dui-dialog-content .bd {
  background: #25262b !important;
  color: #c8c8c8 !important;
}

/* --- Preview card (hidden) --- */
[${THEME_ATTR}="dark"] .doulist-bd .doulist-preview {
  display: none !important;
}

/* --- Item section separators --- */
[${THEME_ATTR}="dark"] .dui-dialog-content .bd .item {
  border-bottom: 1px solid #373a40 !important;
  padding-bottom: 12px !important;
  margin-bottom: 12px !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-content .bd .item:last-of-type {
  border-bottom: none !important;
  margin-bottom: 0 !important;
}

/* --- Search section header row */
[${THEME_ATTR}="dark"] .dui-dialog-content .bd .item .item-hd h3 {
  color: #e8e8e8 !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  margin: 0 0 4px !important;
  width: 100% !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-content .bd .item .item-hd h3 span {
  color: #888 !important;
  font-weight: 400 !important;
  font-size: 12px !important;
}

/* --- Search input (dl_search) + action row */
[${THEME_ATTR}="dark"] .dui-dialog-content .bd input.dl_search {
  height: 34px !important;
  padding: 0 10px !important;
  background: #1a1b1e !important;
  border: 1px solid #373a40 !important;
  border-radius: 8px !important;
  color: #e8e8e8 !important;
  font-size: 13px !important;
  outline: none !important;
  box-sizing: border-box !important;
  width: calc(100% - 100px) !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-content .bd input.dl_search:focus {
  border-color: #6e8aff !important;
}

/* --- lnk-flat buttons (创建片单, 创建) --- */
[${THEME_ATTR}="dark"] .doulist-bd .lnk-flat {
  height: 34px !important;
  padding: 0 16px !important;
  background: #373a40 !important;
  border: 1px solid #45484f !important;
  border-radius: 8px !important;
  color: #c8c8c8 !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  cursor: pointer !important;
  transition: all 0.15s !important;
}
[${THEME_ATTR}="dark"] .doulist-bd .lnk-flat:hover {
  background: #45484f !important;
  color: #e8e8e8 !important;
}
[${THEME_ATTR}="dark"] .doulist-bd .lnk-flat.dl_new_submit {
  background: #6e8aff !important;
  border-color: #6e8aff !important;
  color: #fff !important;
}
[${THEME_ATTR}="dark"] .doulist-bd .lnk-flat.dl_new_submit:hover {
  background: #8aa0ff !important;
}

/* --- Create new doulist form section */
[${THEME_ATTR}="dark"] .doulist-bd .dl_new_title {
  background: #2c2e33 !important;
  border: 1px solid #45484f !important;
  border-radius: 10px !important;
  padding: 14px !important;
  margin-bottom: 12px !important;
}
[${THEME_ATTR}="dark"] .doulist-bd .dl_title_block {
  margin-bottom: 10px !important;
}
[${THEME_ATTR}="dark"] .doulist-bd input.dl-title {
  width: 100% !important;
  box-sizing: border-box !important;
  height: 36px !important;
  padding: 0 12px !important;
  background: #1a1b1e !important;
  border: 1px solid #373a40 !important;
  border-radius: 8px !important;
  color: #e8e8e8 !important;
  font-size: 13px !important;
  outline: none !important;
}
[${THEME_ATTR}="dark"] .doulist-bd input.dl-title:focus {
  border-color: #6e8aff !important;
}
[${THEME_ATTR}="dark"] .doulist-bd .dl_action_block {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  flex-wrap: wrap !important;
}
[${THEME_ATTR}="dark"] .doulist-bd .dl_create_option {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  flex-wrap: wrap !important;
  font-size: 12px !important;
}
[${THEME_ATTR}="dark"] .doulist-bd .dl_create_option span,
[${THEME_ATTR}="dark"] .doulist-bd .dl_create_option label {
  color: #c8c8c8 !important;
  display: flex !important;
  align-items: center !important;
  gap: 3px !important;
  cursor: pointer !important;
}
[${THEME_ATTR}="dark"] .doulist-bd .dl_create_option input[type="radio"] {
  accent-color: #6e8aff !important;
  margin: 0 !important;
}

/* --- Existing doulist list area */
[${THEME_ATTR}="dark"] .doulist-bd .dl-item-exist {
  border: 1px solid #373a40 !important;
  border-radius: 10px !important;
  overflow: hidden !important;
}
[${THEME_ATTR}="dark"] .doulist-bd .dl_exist_select {
  max-height: 260px !important;
  overflow-y: auto !important;
  overscroll-behavior: contain !important;
  padding: 4px !important;
}
[${THEME_ATTR}="dark"] .doulist-bd .dl_exist_select::-webkit-scrollbar {
  width: 5px !important;
}
[${THEME_ATTR}="dark"] .doulist-bd .dl_exist_select::-webkit-scrollbar-track {
  background: transparent !important;
}
[${THEME_ATTR}="dark"] .doulist-bd .dl_exist_select::-webkit-scrollbar-thumb {
  background: #45484f !important;
  border-radius: 3px !important;
}

/* --- Each doulist item row */
[${THEME_ATTR}="dark"] .dui-dialog-content .bd .dl-item-wrap {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  padding: 8px 10px !important;
  border-radius: 8px !important;
  background: transparent !important;
  border: none !important;
  cursor: pointer !important;
  transition: background 0.12s !important;
  margin-bottom: 2px !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-content .bd .dl-item-wrap:hover {
  background: #2c2e33 !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-content .bd .dl-item-wrap:hover label b {
  color: #e8e8e8 !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-content .bd .dl-item-wrap:hover label span {
  color: #aaa !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-content .bd .dl-item-wrap:hover label {
  color: #e8e8e8 !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-content .bd .dl-item-wrap input[type="radio"] {
  accent-color: #6e8aff !important;
  flex-shrink: 0 !important;
  margin: 0 !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-content .bd .dl-item-wrap label {
  flex: 1 !important;
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  cursor: pointer !important;
  color: #c8c8c8 !important;
  font-size: 13px !important;
  min-width: 0 !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-content .bd .dl-item-wrap label span {
  flex-shrink: 0 !important;
  color: #888 !important;
  font-size: 11px !important;
  min-width: 64px !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-content .bd .dl-item-wrap label b {
  color: #c8c8c8 !important;
  font-weight: 400 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
}

/* --- Cancel-collect button (X on each doulist) */
[${THEME_ATTR}="dark"] .doulist-bd .cancel-collect-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 18px !important;
  height: 18px !important;
  font-style: normal !important;
  font-size: 12px !important;
  color: #555 !important;
  cursor: pointer !important;
  border-radius: 4px !important;
  transition: all 0.15s !important;
  flex-shrink: 0 !important;
}
[${THEME_ATTR}="dark"] .doulist-bd .cancel-collect-btn:hover {
  color: #e57373 !important;
  background: rgba(229, 115, 115, 0.1) !important;
}

/* --- Textarea (推荐语) */
[${THEME_ATTR}="dark"] .dui-dialog-content .bd textarea#doulist_item_comment {
  width: 100% !important;
  box-sizing: border-box !important;
  min-height: 80px !important;
  padding: 10px !important;
  background: #1a1b1e !important;
  border: 1px solid #373a40 !important;
  border-radius: 8px !important;
  color: #e8e8e8 !important;
  font-size: 13px !important;
  outline: none !important;
  font-family: inherit !important;
  resize: vertical !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-content .bd textarea#doulist_item_comment:focus {
  border-color: #6e8aff !important;
}
[${THEME_ATTR}="dark"] .dui-dialog-content .bd textarea::placeholder {
  color: #555 !important;
}

/* --- Loading text */
[${THEME_ATTR}="dark"] .doulist-bd .dl-loading {
  color: #666 !important;
  font-size: 12px !important;
  text-align: center !important;
  padding: 12px !important;
}

/* --- Footer */
[${THEME_ATTR}="dark"] .doulist-ft {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 8px !important;
  padding: 12px 20px !important;
  background: #2c2e33 !important;
  border-top: 1px solid #373a40 !important;
  border-radius: 0 0 14px 14px !important;
}
[${THEME_ATTR}="dark"] .doulist-ft .bn-flat {
  margin: 0 !important;
}
[${THEME_ATTR}="dark"] .doulist-ft .bn-flat input {
  height: 36px !important;
  padding: 0 24px !important;
  background: #373a40 !important;
  border: 1px solid #45484f !important;
  border-radius: 8px !important;
  color: #c8c8c8 !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  cursor: pointer !important;
  transition: all 0.15s !important;
}
[${THEME_ATTR}="dark"] .doulist-ft .bn-flat input:hover {
  background: #45484f !important;
}
[${THEME_ATTR}="dark"] .doulist-ft .bn-flat input.doulist_submit {
  background: #6e8aff !important;
  border-color: #6e8aff !important;
  color: #fff !important;
}
[${THEME_ATTR}="dark"] .doulist-ft .bn-flat input.doulist_submit:hover {
  background: #8aa0ff !important;
}
[${THEME_ATTR}="dark"] .doulist-ft .lnk-bookmarklet {
  color: #6e8aff !important;
  font-size: 12px !important;
  text-decoration: none !important;
  margin-right: auto !important;
}
[${THEME_ATTR}="dark"] .doulist-ft .lnk-bookmarklet:hover {
  text-decoration: underline !important;
}

/* ===== Legacy Douban #dialog system (fallback for older UIs) ===== */
[${THEME_ATTR}="dark"] #dialog {
  background: rgba(0, 0, 0, 0.55) !important;
}
[${THEME_ATTR}="dark"] #dialog .dialog {
  background: #25262b !important;
  border-color: #373a40 !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4) !important;
}
[${THEME_ATTR}="dark"] #dialog .dialog-hd {
  background: #2c2e33 !important;
  border-bottom: 1px solid #373a40 !important;
}
[${THEME_ATTR}="dark"] #dialog .dialog-hd h2,
[${THEME_ATTR}="dark"] #dialog .dialog-hd h3 {
  color: #e8e8e8 !important;
}
[${THEME_ATTR}="dark"] #dialog .dialog-close {
  color: #999 !important;
}
[${THEME_ATTR}="dark"] #dialog .dialog-close:hover {
  color: #e8e8e8 !important;
}
[${THEME_ATTR}="dark"] #dialog .dialog-bd {
  color: #c8c8c8 !important;
}
[${THEME_ATTR}="dark"] #dialog .dialog-bd input,
[${THEME_ATTR}="dark"] #dialog .dialog-bd select,
[${THEME_ATTR}="dark"] #dialog .dialog-bd textarea {
  background: #1a1b1e !important;
  border-color: #373a40 !important;
  color: #e8e8e8 !important;
}
[${THEME_ATTR}="dark"] #dialog .dialog-bd .bn-flat {
  background: #373a40 !important;
  border-color: #45484f !important;
  color: #c8c8c8 !important;
}
[${THEME_ATTR}="dark"] #dialog .dialog-bd .bn-flat:hover {
  background: #45484f !important;
}
[${THEME_ATTR}="dark"] #dialog .dialog-bd .bn-primary {
  background: #6e8aff !important;
  border-color: #6e8aff !important;
  color: #fff !important;
}
[${THEME_ATTR}="dark"] #dialog .dialog-bd .bn-primary:hover {
  background: #8aa0ff !important;
}
[${THEME_ATTR}="dark"] #dialog .dialog-ft {
  background: #2c2e33 !important;
  border-top: 1px solid #373a40 !important;
}
[${THEME_ATTR}="dark"] #dialog .dialog-ft .bn-flat {
  background: #373a40 !important;
  border-color: #45484f !important;
  color: #c8c8c8 !important;
}
[${THEME_ATTR}="dark"] #dialog .dialog-ft .bn-flat:hover {
  background: #45484f !important;
}
[${THEME_ATTR}="dark"] #dialog .dialog-ft .bn-primary {
  background: #6e8aff !important;
  border-color: #6e8aff !important;
  color: #fff !important;
}
[${THEME_ATTR}="dark"] #dialog .dialog-ft .bn-primary:hover {
  background: #8aa0ff !important;
}
`

/**
 * Inject detail page beautification CSS once per page
 */
function injectDetailBeautifyStyles(): void {
  if (document.getElementById(BEAUTIFY_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = BEAUTIFY_STYLE_ID
  style.textContent = DETAIL_BEAUTIFY_CSS
  document.documentElement.appendChild(style)
}

/**
 * Rebuild detail page search from scratch, matching homepage UmmDynamicIsland.
 * Features: type toggle (movie/music), debounced input normalization, loading state.
 */
function rebuildSubjectCard(shell?: HTMLElement): void {
  const wrap = document.querySelector('.subjectwrap')
  if (!wrap || document.getElementById('umm-subject-root')) return

  const posterImg = wrap.querySelector('#mainpic img') as HTMLImageElement | null
  const posterSrc = posterImg?.src || ''
  const posterAlt = posterImg?.alt || ''
  const posterLink = wrap.querySelector('#mainpic a')?.getAttribute('href') || ''

  const infoEl = wrap.querySelector('#info')
  const metaRows: { label: string; html: string }[] = []
  if (infoEl) {
    // Split by <br> — each part is one info row
    const parts = infoEl.innerHTML.split(/<br\s*\/?>/i)
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const temp = document.createElement('div')
      temp.innerHTML = trimmed
      const pl = temp.querySelector('.pl')
      const label = pl ? (pl.textContent?.replace(':', '').trim() || '') : ''
      if (pl) {
        const parent = pl.parentElement
        pl.remove()
        // Remove residual ": " text nodes left after .pl removal
        if (parent) {
          for (let i = parent.childNodes.length - 1; i >= 0; i--) {
            const node = parent.childNodes[i]
            if (node.nodeType === Node.TEXT_NODE && /^:\s*$/.test(node.textContent || '')) {
              node.remove()
            }
          }
        }
      }
      const text = temp.innerHTML.trim()
      metaRows.push({ label, html: text })
    }
  }

  const ratingNum = wrap.querySelector('.rating_num')?.textContent?.trim() || ''
  const ratingPeople = wrap.querySelector('.rating_people span')?.textContent?.trim() || ''
  const ratingStarEl = wrap.querySelector('.bigstar') as HTMLElement | null
  const bigstarNum = ratingStarEl?.className?.replace(/\D/g, '') || ''

  const ratingBars: { label: string; pct: string }[] = []
  wrap.querySelectorAll('.ratings-on-weight .item').forEach((item) => {
    const label = (item.querySelector('.starstop') as HTMLElement)?.textContent?.trim() || ''
    const pct = (item.querySelector('.rating_per') as HTMLElement)?.textContent?.trim() || ''
    if (label) ratingBars.push({ label, pct })
  })

  const betterThanLinks: string[] = []
  wrap.querySelectorAll('.rating_betterthan a').forEach((a: Element) => {
    const text = a.textContent?.trim() || ''
    if (text) betterThanLinks.push(text)
  })

  const h1El = document.querySelector('#content h1') as HTMLElement | null
  let titleText = ''
  let yearText = ''
  if (h1El) {
    const titleSpan = h1El.querySelector('[property="v:itemreviewed"]')
    const yearSpan = h1El.querySelector('.year')
    titleText = titleSpan?.textContent?.trim() || h1El.textContent?.trim() || ''
    yearText = yearSpan?.textContent?.trim() || ''
  }

  const root = document.createElement('div')
  root.id = 'umm-subject-root'
  root.className = 'umm-subject-root'

  const titleEl = document.createElement('div')
  titleEl.className = 'umm-subject-title'
  titleEl.textContent = titleText
  if (yearText) {
    const yearSpan = document.createElement('span')
    yearSpan.className = 'year'
    yearSpan.textContent = yearText
    titleEl.appendChild(yearSpan)
  }
  root.appendChild(titleEl)

  const ratingCard = document.createElement('div')
  ratingCard.className = 'umm-subject-rating-card'
  const ratingHeader = document.createElement('div')
  ratingHeader.className = 'umm-rating-header'
  if (ratingNum) {
    const score = document.createElement('span')
    score.className = 'umm-rating-score'
    score.textContent = ratingNum
    ratingHeader.appendChild(score)
  }
  const starsWrap = document.createElement('span')
  starsWrap.className = 'umm-rating-stars'
  if (bigstarNum) {
    const starEl = document.createElement('span')
    starEl.className = 'bigstar bigstar' + bigstarNum
    starsWrap.appendChild(starEl)
  }
  if (ratingPeople) {
    const people = document.createElement('span')
    people.className = 'umm-rating-stats'
    people.textContent = ratingPeople + '\u4EBA\u8BC4\u4EF7'
    starsWrap.appendChild(people)
  }
  ratingHeader.appendChild(starsWrap)
  ratingCard.appendChild(ratingHeader)

  if (betterThanLinks.length > 0) {
    const better = document.createElement('div')
    better.style.cssText = 'font-size:12px;color:#888;margin-bottom:8px;'
    better.textContent = '\u597D\u4E8E '
    betterThanLinks.forEach((t) => {
      const sp = document.createElement('span')
      sp.style.cssText = 'color:var(--link-color,#1757d6);'
      sp.textContent = t
      better.appendChild(document.createTextNode(' / '))
      better.appendChild(sp)
    })
    ratingCard.appendChild(better)
  }

  if (ratingBars.length > 0) {
    const bars = document.createElement('div')
    bars.className = 'umm-rating-bars'
    ratingBars.forEach((bar) => {
      const pctNum = parseFloat(bar.pct.replace('%', '')) || 0
      const row = document.createElement('div')
      row.className = 'umm-rating-bar-row'
      const label = document.createElement('span')
      label.className = 'umm-rating-bar-label'
      label.textContent = bar.label.replace(/\u661F/g, '') + '\u661F'
      const track = document.createElement('div')
      track.className = 'umm-rating-bar-track'
      const fill = document.createElement('div')
      fill.className = 'umm-rating-bar-fill'
      fill.style.width = pctNum + '%'
      track.appendChild(fill)
      const pct = document.createElement('span')
      pct.className = 'umm-rating-bar-pct'
      pct.textContent = bar.pct
      row.appendChild(label)
      row.appendChild(track)
      row.appendChild(pct)
      bars.appendChild(row)
    })
    ratingCard.appendChild(bars)
  }

  const leftCol = document.createElement('div')
  leftCol.className = 'umm-subject-left-col'

  const left = document.createElement('div')
  left.className = 'umm-subject-poster'
  left.className = 'umm-subject-poster'
  if (posterSrc) {
    const img = document.createElement('img')
    img.src = posterSrc
    img.alt = posterAlt
    if (posterLink) {
      const a = document.createElement('a')
      a.href = posterLink
      a.target = '_blank'
      a.appendChild(img)
      left.appendChild(a)
    } else { left.appendChild(img) }
  }

  const body = document.createElement('div')
  body.className = 'umm-subject-body'

  if (metaRows.length > 0) {
    const metaCard = document.createElement('div')
    metaCard.className = 'umm-subject-meta'
    metaRows.forEach((row) => {
      const rowEl = document.createElement('div')
      rowEl.className = 'umm-meta-row'
      const label = document.createElement('span')
      label.className = 'umm-meta-label'
      label.textContent = row.label
      const value = document.createElement('span')
      value.className = 'umm-meta-value'
      value.innerHTML = row.html
      rowEl.appendChild(label)
      rowEl.appendChild(value)
      metaCard.appendChild(rowEl)
    })
    body.appendChild(metaCard)
  }

  // Extract rank info (豆瓣排行榜) — rebuild in UMM style
  const rankLabel = document.querySelector('.rank-label')
  if (rankLabel) {
    const rankNo = rankLabel.querySelector('.rank-label-no')?.textContent?.trim() || ''
    const rankLink = rankLabel.querySelector('.rank-label-link a') as HTMLAnchorElement | null
    const rankText = rankLink?.textContent?.trim() || ''
    const rankHref = rankLink?.href || ''

    const targetCard = document.querySelector('.umm-subject-meta') || (() => {
      const c = document.createElement('div')
      c.className = 'umm-subject-meta'
      if (body.firstChild) body.insertBefore(c, body.firstChild); else body.appendChild(c)
      return c
    })()

    const rankRow = document.createElement('div')
    rankRow.className = 'umm-meta-row'
    const rankLabelSpan = document.createElement('span')
    rankLabelSpan.className = 'umm-meta-label'
    rankLabelSpan.textContent = '排行榜'
    const rankValueSpan = document.createElement('span')
    rankValueSpan.className = 'umm-meta-value'
    if (rankHref) {
      const a = document.createElement('a')
      a.href = rankHref
      a.target = '_blank'
      a.textContent = rankNo + ' ' + rankText
      rankValueSpan.appendChild(a)
    } else {
      rankValueSpan.textContent = rankNo + ' ' + rankText
    }
    rankRow.append(rankLabelSpan, rankValueSpan)
    targetCard.appendChild(rankRow)

    // Hide the original rank-label element now that data is extracted
    ;(rankLabel as HTMLElement).style.setProperty('display', 'none', 'important')
  }

  const actions = document.createElement('div')
  actions.id = 'umm-subject-actions'
  actions.className = 'umm-subject-actions'
  body.appendChild(actions)

  leftCol.appendChild(left)

  leftCol.appendChild(ratingCard)

  root.appendChild(leftCol)

  root.appendChild(body)

  const subjectwrap = wrap as HTMLElement
  subjectwrap.style.setProperty('display', 'none', 'important')

  // If a shell container is provided, append into shell instead of #content
  if (shell) {
    shell.appendChild(root)
  } else {
    const content = document.getElementById('content')
    if (content) {
      content.insertBefore(root, content.firstChild)
    } else {
      document.body.insertBefore(root, document.body.firstChild)
    }
  }
}

/**
 * Move subject page elements (status chip, NeoDB, actions) into the new card.
 * Must run AFTER all injections (status chip, NeoDB buttons) complete.
 */
function relocateSubjectElements(): void {
  const actions = document.getElementById('umm-subject-actions')
  if (!actions) return

  // Status chip — move above title instead of inside actions
  const statusChip = document.querySelector('.umm-status-chip')
  const titleEl = document.querySelector('.umm-subject-title')
  if (statusChip && titleEl && !document.querySelector('.umm-status-chip.umm-status-chip-placed')) {
    const clone = statusChip.cloneNode(true) as HTMLElement
    clone.classList.add('umm-status-chip-placed')
    clone.style.marginBottom = '8px'
    clone.style.gridColumn = '1 / -1'
    titleEl.parentNode?.insertBefore(clone, titleEl)
  }

  // NeoDB buttons — injected by injectNeoDBPushButtons()
  const neoDB = document.getElementById('umm-neodb-push-buttons')
  if (neoDB && !actions.contains(neoDB)) {
    neoDB.parentNode?.removeChild(neoDB)
    actions.appendChild(neoDB)
  }

  // Interest section (想看/看过/评星) — server-rendered or SPA-updated
  const interestLevel = document.getElementById('interest_sect_level')
  if (interestLevel && !actions.contains(interestLevel)) {
    interestLevel.parentNode?.removeChild(interestLevel)
    actions.appendChild(interestLevel)
  }

  // GT left (写短评/写影评/添加到片单/分享到)
  const gtleft = document.querySelector('.gtleft')
  if (gtleft && !actions.contains(gtleft)) {
    gtleft.parentNode?.removeChild(gtleft)
    actions.appendChild(gtleft)
    // Hide old lnk-doulist-add anchors — replaced by .umm-dl-trigger below
    gtleft.querySelectorAll('.lnk-doulist-add').forEach(el => {
      (el as HTMLElement).style.setProperty('display', 'none', 'important')
    })
  }

  // Create UMM-styled "添加到片单" button (replaces reliance on native link styling)
  const existingBtn = actions.querySelector('.umm-dl-trigger')
  if (!existingBtn) {
    const dark = document.documentElement.getAttribute('data-umm-theme') === 'dark'
    const dlBtn = document.createElement('button')
    dlBtn.className = 'umm-dl-trigger'
    dlBtn.textContent = '+ 添加到片单'
    dlBtn.style.cssText = [
      'display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 16px',
      'border:none;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      `background:${dark ? '#6e8aff' : '#4f6ef7'};color:#fff`,
      'transition:opacity 0.15s,transform 0.1s',
      'flex-shrink:0',
    ].join(';')
    dlBtn.onmouseenter = () => { dlBtn.style.opacity = '0.85' }
    dlBtn.onmouseleave = () => { dlBtn.style.opacity = '1' }
    dlBtn.onmousedown = () => { dlBtn.style.transform = 'scale(0.97)' }
    dlBtn.onmouseup = () => { dlBtn.style.transform = 'scale(1)' }
    actions.appendChild(dlBtn)
  }

  // Extract native Douban rating card from hidden subjectwrap and place at bottom of article
  const interestSectl = document.getElementById('interest_sectl')
  if (interestSectl && !document.querySelector('.umm-interest-sectl-placed')) {
    interestSectl.classList.add('umm-interest-sectl-placed')
    // Find the article's last logical section to insert before, or just append at the end
    const article = document.querySelector('.article')
    const relatedInfo = article?.querySelector('.related-info')
    if (relatedInfo && relatedInfo.parentNode) {
      relatedInfo.parentNode.insertBefore(interestSectl, relatedInfo.nextSibling)
    } else if (article) {
      article.appendChild(interestSectl)
    }
  }

  // Hide old <h1> (title now in new card)
  const h1 = document.querySelector('#content h1')
  if (h1) (h1 as HTMLElement).style.setProperty('display', 'none', 'important')

  // Hide .indent container (now empty after elements moved out)
  const indent = document.querySelector('.indent')
  if (indent) {
    const remaining = indent.querySelector(':scope > :not(.subjectwrap[style*="display: none"])')
    if (!remaining) (indent as HTMLElement).style.setProperty('display', 'none', 'important')
  }
}

/**
 * Rebuild detail page search from scratch, matching homepage UmmDynamicIsland.
 * Features: type toggle (movie/music), debounced input normalization, loading state.
 */
function createStandalonePill(shell?: HTMLElement): void {
  if (document.getElementById('umm-detail-pill-wrap')) return

  const isMusic = location.href.includes('music.douban.com')
  let currentType: 'movie' | 'music' = isMusic ? 'music' : 'movie'
  // searchTimeout stores the setTimeout ID so it can be cleared on rapid searches
let searchTimeout: ReturnType<typeof setTimeout> | undefined
  let isNormalizing = false
  let isSearching = false

  addNavTypeSwitcherStyles()

  const globalNav = document.getElementById('db-global-nav')
  const movieNav = document.getElementById('db-nav-movie')
  const musicNav = document.getElementById('db-nav-music')
  if (globalNav) globalNav.style.display = 'none'
  if (movieNav) movieNav.style.display = 'none'
  if (musicNav) musicNav.style.display = 'none'

  const PLACEHOLDERS: Record<'movie' | 'music', string> = {
    movie: '搜索电影、电视剧、影人',
    music: '搜索音乐、歌手、专辑',
  }
  const CATS: Record<'movie' | 'music', string> = { movie: '1002', music: '1003' }

  // Container
  const wrap = document.createElement('div')
  wrap.id = 'umm-detail-pill-wrap'
  wrap.className = 'umm-detail-pill-wrap'

  const inner = document.createElement('div')
  inner.className = 'umm-detail-pill-inner'

  // Type toggle buttons
  const movieBtn = document.createElement('button')
  movieBtn.className = 'umm-detail-pill-btn'
  movieBtn.textContent = '电影'
  const musicBtn = document.createElement('button')
  musicBtn.className = 'umm-detail-pill-btn'
  musicBtn.textContent = '音乐'

  function setType(type: 'movie' | 'music'): void {
    currentType = type
    movieBtn.classList.toggle('umm-detail-pill-btn--active', type === 'movie')
    musicBtn.classList.toggle('umm-detail-pill-btn--active', type === 'music')
    if (searchInput) {
      searchInput.placeholder = PLACEHOLDERS[type]
      searchInput.setAttribute('aria-label', type === 'movie' ? '搜索豆瓣电影' : '搜索豆瓣音乐')
    }
  }

  // Search form
  const form = document.createElement('form')
  form.className = 'umm-search-bar'
  Object.assign(form.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    width: 'auto',
    minWidth: '0',
    maxWidth: '680px',
    height: '40px',
    padding: '0 10px',
    background: 'rgba(255,255,255,0.92)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderRadius: '999px',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)',
    fontFamily: "-apple-system, BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
    position: 'relative',
    zIndex: '10000',
    boxSizing: 'border-box',
    transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
    flexShrink: '1',
    flex: '1',
  })

  const searchInput = document.createElement('input')
  searchInput.type = 'search'
  searchInput.name = 'search_text'
  searchInput.className = 'umm-search-bar-input'
  searchInput.placeholder = PLACEHOLDERS[currentType]
  searchInput.autocomplete = 'off'
  searchInput.setAttribute('aria-label', currentType === 'movie' ? '搜索豆瓣电影' : '搜索豆瓣音乐')
  Object.assign(searchInput.style, {
    flex: '1',
    minWidth: '0',
    border: 'none',
    background: 'transparent',
    fontSize: '14px',
    color: '#1a1a1a',
    outline: 'none',
    padding: '6px 4px',
    fontFamily: 'inherit',
  })

  // Debounced real-time normalization (matching homepage UmmDynamicIsland)
  function handleNormalize(): void {
    if (isNormalizing) return
    isNormalizing = true
    const raw = searchInput.value
    const normalized = normalizeSearchQuery(raw)
    if (normalized !== raw) {
      searchInput.value = normalized
    }
    setTimeout(() => { isNormalizing = false }, 0)
  }

  searchInput.addEventListener('input', handleNormalize)

  const submitBtn = document.createElement('button')
  submitBtn.type = 'submit'
  submitBtn.className = 'umm-search-bar-button'
  submitBtn.setAttribute('aria-label', '搜索')
  Object.assign(submitBtn.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '30px',
    height: '30px',
    border: 'none',
    background: 'transparent',
    color: '#666',
    cursor: 'pointer',
    borderRadius: '50%',
    transition: 'all 0.25s ease',
    flexShrink: '0',
    padding: '0',
  })

  function buildSearchSvg(): SVGElement {
    const svgNS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(svgNS, 'svg')
    svg.setAttribute('width', '16')
    svg.setAttribute('height', '16')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '2.5')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    const circle = document.createElementNS(svgNS, 'circle')
    circle.setAttribute('cx', '11')
    circle.setAttribute('cy', '11')
    circle.setAttribute('r', '8')
    const line = document.createElementNS(svgNS, 'line')
    line.setAttribute('x1', '21')
    line.setAttribute('y1', '21')
    line.setAttribute('x2', '16.65')
    line.setAttribute('y2', '16.65')
    svg.appendChild(circle)
    svg.appendChild(line)
    return svg
  }
  submitBtn.appendChild(buildSearchSvg())

  form.appendChild(searchInput)
  form.appendChild(submitBtn)

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    if (isSearching) return
    const raw = searchInput.value.trim()
    if (!raw) return
    const normalized = normalizeSearchQuery(raw)
    if (!normalized) return
    isSearching = true
    submitBtn.classList.add('umm-island-submit--loading')
    submitBtn.innerHTML = ''
    const spinner = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    spinner.setAttribute('class', 'umm-island-spinner')
    spinner.setAttribute('width', '16')
    spinner.setAttribute('height', '16')
    spinner.setAttribute('viewBox', '0 0 24 24')
    spinner.setAttribute('fill', 'none')
    spinner.setAttribute('stroke', 'currentColor')
    spinner.setAttribute('stroke-width', '2.5')
    spinner.setAttribute('stroke-linecap', 'round')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', 'M12 2a10 10 0 0 1 10 10')
    spinner.appendChild(path)
    submitBtn.appendChild(spinner)

    const cat = CATS[currentType]
    const url = `https://search.douban.com/${currentType}/subject_search?search_text=${encodeURIComponent(normalized)}&cat=${cat}`
    window.open(url, '_blank', 'noopener,noreferrer')

    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
      isSearching = false
      submitBtn.classList.remove('umm-island-submit--loading')
      submitBtn.innerHTML = ''
      submitBtn.appendChild(buildSearchSvg())
    }, 800)
  })

  movieBtn.addEventListener('click', () => setType('movie'))
  musicBtn.addEventListener('click', () => setType('music'))
  setType(currentType)

  inner.appendChild(movieBtn)
  inner.appendChild(musicBtn)
  inner.appendChild(form)
  wrap.appendChild(inner)

  if (shell) {
    shell.appendChild(wrap)
  } else {
    const wrapper = document.getElementById('wrapper')
    if (wrapper) {
      wrapper.parentNode?.insertBefore(wrap, wrapper)
    } else {
      document.body.insertBefore(wrap, document.body.firstChild)
    }
  }
}

function addNavTypeSwitcherStyles(): void {
  const id = 'umm-detail-nav-search-styles'
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = `
    .umm-island-spinner {
      animation: umm-island-spin 0.7s linear infinite;
    }
    @keyframes umm-island-spin {
      to { transform: rotate(360deg); }
    }
    .umm-island-submit--loading {
      pointer-events: none !important;
      opacity: 0.6 !important;
    }
  `
  document.documentElement.appendChild(style)
}

// ============================================================
// Theme sync — read UMM theme setting and apply to page
// ============================================================

// Guard flag to prevent duplicate storage listeners across SPA navigations
let _themeListenerAttached = false

/**
 * Resolve the effective theme from UMM settings + system preference
 */
function resolveThemeFromStorage(raw: Record<string, unknown> | undefined): 'dark' | 'light' {
  const mode = (raw?.theme as string) ?? 'auto'
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Apply resolved theme to <html> as data-umm-theme attribute
 */
function applyThemeToPage(theme: 'dark' | 'light'): void {
  document.documentElement.setAttribute(THEME_ATTR, theme)
}

/**
 * Read UMM theme setting from storage and sync to page.
 * Uses callback form (mirrors homepage overlay pattern).
 * Attaches storage change listener + visibilitychange fallback only once.
 */
function syncDetailPageTheme(): void {
  const apply = (raw: Record<string, unknown> | undefined): void => {
    applyThemeToPage(resolveThemeFromStorage(raw))
  }

  // Read initial theme
  try {
    chrome.storage.local.get([THEME_KEY], (result) => {
      if (chrome.runtime.lastError) {
        applyThemeToPage(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        return
      }
      apply(result[THEME_KEY] as Record<string, unknown> | undefined)
    })
  } catch {
    applyThemeToPage(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  }

  // Attach runtime listeners only once
  if (_themeListenerAttached) return
  _themeListenerAttached = true

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[THEME_KEY]) {
      applyThemeToPage(resolveThemeFromStorage(changes[THEME_KEY].newValue as Record<string, unknown> | undefined))
    }
  })

  // Fallback: re-sync when user returns to tab (catches missed storage events)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      try {
        chrome.storage.local.get([THEME_KEY], (result) => {
          if (!chrome.runtime.lastError) {
            applyThemeToPage(resolveThemeFromStorage(result[THEME_KEY] as Record<string, unknown> | undefined))
          }
        })
      } catch {
        // silent fallback
      }
    }
  })
}

// ============================================================
// Main handler
// ============================================================

/**
 * 处理豆瓣详情页面
 */
export async function handleDoubanDetailPage(identity: UrlIdentity): Promise<void> {
  console.log('[UMM] ========== handleDoubanDetailPage START ==========')
  console.log('[UMM] Handling Douban detail page:', identity)
  
  try {
    // ✅ P1-3: 添加全局错误边界
    // 等待 #interest_sect_level 元素加载
    await waitForElement('#interest_sect_level', 5000)

    enhanceDetailPageSearch()

    // Shared container isolates injected UI from legacy Douban CSS
    const shell = document.createElement('div')
    shell.id = 'umm-detail-shell'
    const content = document.getElementById('content')
    if (content) {
      content.insertBefore(shell, content.firstChild)
    } else {
      document.body.appendChild(shell)
    }

    // 合并导航栏为统一灵动岛（隐藏原生 db-global-nav + db-nav-movie）
    createStandalonePill(shell)
    rebuildSubjectCard(shell)

    // 注入详情页美化 CSS（只执行一次）
    injectDetailBeautifyStyles()

    // 同步主题
    syncDetailPageTheme()

    // ✅ 修复：先获取本地记录
    console.log('[UMM] Calling getLocalRecord...')
    const localRecord = await getLocalRecord(identity)
    console.log('[UMM] getLocalRecord returned:', localRecord ? 'record found' : 'null')
    const isLocalDone = localRecord?.status === STATUS_DONE  // 2 = 已看/已听
      
    // 扫描页面状态（检测"我看过"或"我听过"）
    const pageState = scanDoubanPageStatus(identity)
    const isPageDone = pageState.status === 'done'
      
    // ✅ 修复：数据优先级 - 页面状态优先，其次本地记录
    // 如果页面显示已看/已听，使用页面数据；否则使用本地数据
    let finalStatus: number
    let finalRating: number
    let note = ''
      
    if (isPageDone) {
      // 页面显示已看/已听，使用页面数据并同步到本地
      finalStatus = STATUS_DONE
      finalRating = Utils.clampRating10(pageState.rating)
        
      // ✅ P1: 传递已查询的记录，避免重复查询
      await syncToLocalStorage(identity, pageState.rating, localRecord)
    } else if (isLocalDone) {
      // 页面未显示，但本地有记录，使用本地数据并标记来源
      finalStatus = STATUS_DONE
      finalRating = Utils.clampRating10(localRecord?.rating || 0)
      note = t('common.cache_hint')
    } else {
      // 都没有，显示未看状态
      finalStatus = STATUS_NONE
      finalRating = 0
    }
      
    // 渲染状态标签
    renderDoubanStatusChip(identity, finalStatus, finalRating, note)

    // ✅ P1: 传递已查询的记录，避免重复查询
    await injectNeoDBPushButtons(identity, localRecord)

    // 移动状态标签、NeoDB、动作按钮到新卡片
    relocateSubjectElements()

    // Replace legacy content.ts neoDBInjector with handler-aware version
    setNeoDBInjector(() => { injectNeoDBPushButtons(identity, null) })

    // 初始化片单选择对话框替换（替换原生 dui-dialog 为自定义主题对话框）
    initDoulistReplacement(identity)

    // 主题同步（首次加载 + CSS 已由 early entrypoint 在 document_start 注入）
    injectDetailBeautifyStyles()
    syncDetailPageTheme()

    // 遮罩淡出移除 — 所有 UMM 注入已完成，页面可安全展示
    if (typeof (window as unknown as Record<string, unknown>).__ummDismissDetailMask === 'function') {
      ;(window as unknown as Record<string, (() => void)>).__ummDismissDetailMask()
    }
  } catch (error) {
    console.error('[UMM Douban] Failed to handle detail page:', error)
    // 可选：显示用户友好的错误提示
    showNotification(t('neodb.no_response'))
  }
}

// ============================================================
// Status chip rendering
// ============================================================

/**
 * 渲染豆瓣状态标签
 */
function renderDoubanStatusChip(
  identity: UrlIdentity,
  status: number,  // 0/1/2
  rating: number,
  note: string = ''
) {
  // ✅ P0-1 & P0-2: 优化的 DOM 元素查找逻辑 - 支持电影和音乐页面结构
  let anchor: Element | null = null
  
  // 策略 1: 最精确的选择器（电影/书籍标题 span）
  const titleSpan = document.querySelector('span[property="v:itemreviewed"]')
  if (titleSpan) {
    // 优先查找最近的 h1 祖先元素
    const h1Ancestor = titleSpan.closest('h1')
    if (h1Ancestor) {
      anchor = h1Ancestor
    } else {
      // 降级：检查父元素是否为 h1
      const parent = titleSpan.parentElement
      if (parent && parent.tagName === 'H1') {
        anchor = parent
      }
    }
  }
  
  // 策略 2: ID 选择器（最快）
  if (!anchor) {
    const contentElement = document.getElementById('content')
    const wrapperElement = document.getElementById('wrapper')
    anchor = contentElement?.querySelector('h1') || wrapperElement?.querySelector('h1') || null
  }
  
  // 策略 3: 降级方案（限制搜索范围）
  if (!anchor) {
    const firstH1 = document.querySelector('main h1, #content h1, #wrapper h1')
    if (firstH1) {
      anchor = firstH1
    }
  }
  
  if (!anchor) {
    console.warn('[UMM] Could not find anchor element for status chip')
    console.log('[UMM] Available h1 elements:', document.querySelectorAll('h1').length)
    return
  }
  
  // 检查是否已存在状态标签
  const existingChip = anchor.parentElement?.querySelector('.umm-status-chip[data-umm-owner]')
  
  // 创建新标签
  const chip = createDoubanStatusChip(identity, status, rating, note)
  chip.dataset.ummOwner = `douban-${identity.type}`
  
  if (existingChip) {
    // 替换现有标签
    existingChip.replaceWith(chip)
  } else {
    // 插入到锚点元素之后
    anchor.insertAdjacentElement('afterend', chip)
  }
}

/**
 * 创建豆瓣状态标签
 */
function createDoubanStatusChip(
  identity: UrlIdentity,
  status: number,  // 0/1/2
  rating: number,
  note: string = ''
): HTMLElement {
  const chip = document.createElement('div')
  chip.className = 'umm-status-chip'
  chip.dataset.status = status === 2 ? 'done' : 'none'
  
  const label = status === 2
    ? (note 
        ? t(identity.type === 'music' ? 'status.done_local_music' : 'status.done_local')
        : t(identity.type === 'music' ? 'status.done_music' : 'status.done'))
    : t(identity.type === 'music' ? 'status.none_music' : 'status.none')
  
  const ratingText = rating > 0 ? `${Utils.formatRating10(rating)}/10` : ''
  
  // XSS 防护：转义所有用户输入
  const escapedLabel = escapeHtml(label)
  const escapedRatingText = ratingText ? escapeHtml(ratingText) : ''
  // ✅ 修复：当 label 已包含"(本地)"标识时，不再显示 note，避免语义重复
  const shouldShowNote = note && !label.includes('(本地)')
  const escapedNote = shouldShowNote ? escapeHtml(note) : ''
  
  chip.innerHTML = `
    <span class="umm-label">${escapedLabel}</span>
    ${escapedRatingText ? `<span class="umm-rating">${escapedRatingText}</span>` : ''}
    ${escapedNote ? `<span class="umm-note">${escapedNote}</span>` : ''}
  `
  
  // 添加 ARIA 属性 - 提升无障碍性
  chip.setAttribute('role', 'status')
  chip.setAttribute('aria-live', 'polite')
  chip.setAttribute('aria-label', `${label}${ratingText ? `, ${ratingText}` : ''}${shouldShowNote && note ? `, ${note}` : ''}`)
  
  return chip
}
