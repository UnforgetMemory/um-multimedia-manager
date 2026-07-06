/**
 * 豆瓣搜索栏增强器
 * 功能：在详情页和搜索页中增强原生搜索栏，使用 UMM 样式
 * 参考：UmmDynamicIsland 组件的 pill-shaped 设计
 */

import { normalizeSearchQuery } from '@/utils/search-normalizer'

/**
 * 注入搜索栏样式（只执行一次）
 */
export function injectSearchBarStyles(): void {
  if (document.getElementById('umm-search-bar-styles')) return

  const style = document.createElement('style')
  style.id = 'umm-search-bar-styles'
  style.textContent = `
    /* === Pseudo-classes (cannot be inlined) === */
    .umm-search-bar:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06),
                  0 8px 24px rgba(0, 0, 0, 0.06);
      border-color: rgba(0, 0, 0, 0.12) !important;
    }

    .umm-search-bar:focus-within {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06),
                  0 8px 24px rgba(0, 0, 0, 0.1);
      border-color: rgba(59, 130, 246, 0.35) !important;
    }

    /* === Responsive overrides (supplement inline base) === */
    @media (min-width: 640px) {
      .umm-search-bar {
        max-width: 560px !important;
        height: 42px !important;
      }
    }

    @media (min-width: 1024px) {
      .umm-search-bar {
        max-width: 680px !important;
      }
    }

    /* === Dark mode === */
    @media (prefers-color-scheme: dark) {
      .umm-search-bar {
        background: rgba(44, 44, 46, 0.95) !important;
        border-color: rgba(255, 255, 255, 0.1) !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25),
                    0 4px 12px rgba(0, 0, 0, 0.2) !important;
      }

      .umm-search-bar:hover {
        border-color: rgba(255, 255, 255, 0.18) !important;
      }

      .umm-search-bar:focus-within {
        border-color: rgba(96, 165, 250, 0.45) !important;
      }

      .umm-search-bar-input {
        color: #e5e5e5 !important;
      }

      .umm-search-bar-input::placeholder {
        color: #666 !important;
      }

      .umm-search-bar-button {
        color: #999 !important;
      }

      .umm-search-bar-button:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.1) !important;
        color: #ccc !important;
      }
    }
  `
  document.head.appendChild(style)
}

/**
 * 创建 UMM 风格搜索栏
 */
export function createUmmSearchBar(type: 'movie' | 'music', prefillQuery?: string): HTMLElement {
  injectSearchBarStyles()

  const container = document.createElement('form')
  container.className = 'umm-search-bar'
  container.setAttribute('role', 'search')

  // Inline styles for CSS isolation from Douban cascade
  Object.assign(container.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    width: 'auto',
    minWidth: '0',
    maxWidth: '680px',
    height: '40px',
    padding: '0 10px',
    background: 'rgba(255, 255, 255, 0.92)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderRadius: '999px',
    border: '1px solid rgba(0, 0, 0, 0.06)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    position: 'relative',
    zIndex: '100',
    boxSizing: 'border-box',
    transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
    flexShrink: '1',
  })

  const input = document.createElement('input')
  input.type = 'search'
  input.name = 'search_text'
  input.className = 'umm-search-bar-input'
  input.placeholder = type === 'movie' ? '搜索电影、电视剧、影人' : '搜索音乐、歌手、专辑'
  input.autocomplete = 'off'
  input.setAttribute('aria-label', type === 'movie' ? '搜索豆瓣电影' : '搜索豆瓣音乐')

  Object.assign(input.style, {
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

  if (prefillQuery != null) {
    input.value = prefillQuery
  }

  const button = document.createElement('button')
  button.type = 'submit'
  button.className = 'umm-search-bar-button'
  button.setAttribute('aria-label', '搜索')

  Object.assign(button.style, {
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
  button.appendChild(svg)

  container.appendChild(input)
  container.appendChild(button)

  const cat = type === 'movie' ? '1002' : '1003'

  // 失焦时标准化（避免输入过程中修改 value 导致光标跳转）
  function handleBlur(): void {
    const raw = input.value
    const normalized = normalizeSearchQuery(raw)
    if (normalized !== raw) {
      input.value = normalized
    }
  }

  input.addEventListener('blur', handleBlur)

  container.addEventListener('submit', (e) => {
    e.preventDefault()
    const query = input.value.trim()
    if (!query) return

    const normalized = normalizeSearchQuery(query)
    const url = `https://search.douban.com/${type}/subject_search?search_text=${encodeURIComponent(normalized)}&cat=${cat}`
    location.href = url
  })

  return container
}

/**
 * 查找原生豆瓣搜索表单（详情页和搜索页共用同一位置）
 */
function findNativeSearchForm(): HTMLElement | null {
  return (
    document.querySelector('#db-nav-movie .nav-search form') ||
    document.querySelector('#db-nav-music .nav-search form') ||
    document.querySelector('form[action*="search.douban.com"]')
  )
}

/**
 * 增强详情页搜索栏
 */
export function enhanceDetailPageSearch(): void {
  const nativeForm = findNativeSearchForm()
  if (!nativeForm) return

  if (nativeForm.hasAttribute('data-umm-enhanced')) return

  // 推断页面类型
  const isMusic = location.href.includes('music.douban.com')
  const type: 'movie' | 'music' = isMusic ? 'music' : 'movie'

  // 突破父容器 .nav-search 的宽度限制
  const parent = nativeForm.parentElement
  if (parent) {
    parent.style.maxWidth = 'none'
    parent.style.width = 'auto'
  }

  nativeForm.setAttribute('data-umm-hidden', 'true')
  nativeForm.style.display = 'none'

  const ummBar = createUmmSearchBar(type)
  ummBar.setAttribute('data-umm-search-bar', 'detail')
  nativeForm.parentNode?.insertBefore(ummBar, nativeForm)
  nativeForm.setAttribute('data-umm-enhanced', 'true')
}

/**
 * 增强搜索页搜索栏
 */
export function enhanceSearchPageSearch(): void {
  const nativeForm = findNativeSearchForm()
  if (!nativeForm) return

  if (nativeForm.hasAttribute('data-umm-enhanced')) return

  // 推断页面类型
  const isMusic = location.href.includes('search.douban.com/music')
  const type: 'movie' | 'music' = isMusic ? 'music' : 'movie'

  // 从 URL 提取 search_text 预填充
  const params = new URLSearchParams(location.search)
  const searchText = params.get('search_text') || undefined

  // 突破父容器 .nav-search 的宽度限制
  const parent = nativeForm.parentElement
  if (parent) {
    parent.style.maxWidth = 'none'
    parent.style.width = 'auto'
  }

  nativeForm.setAttribute('data-umm-hidden', 'true')
  nativeForm.style.display = 'none'

  const ummBar = createUmmSearchBar(type, searchText)
  ummBar.setAttribute('data-umm-search-bar', 'search')
  nativeForm.parentNode?.insertBefore(ummBar, nativeForm)
  nativeForm.setAttribute('data-umm-enhanced', 'true')
}
