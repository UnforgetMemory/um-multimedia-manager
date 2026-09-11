import { test, expect } from '@playwright/test'
import {
  SEHUATANG_OVERLAY_CSS,
  GRID_CSS,
  CONTROLS_CSS,
  EFFECTS_CSS,
  HOME_CSS,
  SEARCH_CSS,
  RISK_CSS,
  EMPTY_CSS,
  uslVarsForHost,
} from '@/content/sehuatang/styles'

/**
 * 色花堂 overlay Shadow DOM 样式表（src/content/sehuatang/styles.ts）断言。
 *
 * 样式单一事实源收编后（ADR-024 D4），原 controls/effects spec 内的
 * 运行时注入断言统一迁移至此：:host 变量重宿主、hide-viewed 运行时规则
 * 回归锚点、令牌基准（零调色板 hex）、动效关键规则。
 */

test.describe('uslVarsForHost — light-DOM 变量表重宿主 :host', () => {
  test(':host 与 :host(.umm-theme--dark) 作用域替换，无 html 选择器残留', () => {
    const css = uslVarsForHost()
    expect(css).toContain(':host {')
    expect(css).toContain(':host(.umm-theme--dark) {')
    expect(css).not.toMatch(/^\s*html\s*\{/m)
    expect(css).not.toContain('html[data-umm-theme="dark"]')
  })

  test('usl 令牌完整携带（表面/文本/边框/accent 双主题）', () => {
    const css = uslVarsForHost()
    for (const key of ['--usl-surface', '--usl-text-primary', '--usl-border', '--usl-accent', '--usl-fill-primary']) {
      expect(css).toContain(key)
    }
  })
})

test.describe('GRID_CSS — 网格与卡片', () => {
  test('骨架卡占位规则存在（hide-viewed 检查期占位 + reduced-motion 守卫）', () => {
    expect(GRID_CSS).toContain('.umm-card.umm-sht-skel')
    expect(GRID_CSS).toContain('umm-sht-skel-pulse')
    expect(GRID_CSS).toContain('prefers-reduced-motion')
  })

  test('灵动岛遮挡补偿作用所有挂岛页面（--island 修饰类，风控页无岛不留白）', () => {
    expect(GRID_CSS).toContain('.umm-sht-shell--island')
    expect(GRID_CSS).not.toContain('.umm-sht-shell--list')
    expect(GRID_CSS).toContain('padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px))')
  })
})

/** 任意 hex 字面量（3/4/6/8 位），非枚举具体旧值。 */
const PALETTE_HEX = /#[0-9a-fA-F]{3,8}\b/

/** 函数式色彩写法（color-mix 不算：其 "color" 后跟 "-"）。 */
const FUNCTIONAL_COLOR = /\b(?:hsla?|hwb|lab|lch|oklab|oklch|color)\(/i

/**
 * 命名色黑名单（调色板色值，禁）。前后必须不是 [\w-]，避免命中
 * 令牌名片段（如 --usl-...-white）；transparent / currentColor / inherit
 * 是合法关键字，刻意不在禁列。仅断言「不宜出现的常见调色板名」，
 * 新增命名色时同步扩充。
 */
const NAMED_COLOR = /(?<![\w-])(?:red|green|blue|black|white|gray|grey|silver|maroon|olive|lime|aqua|teal|navy|fuchsia|purple|orange|yellow|pink|brown|gold|violet|indigo|cyan|magenta|crimson|salmon|tomato|khaki|plum|orchid|beige|ivory|azure|tan|wheat|linen|coral|sienna|peru|chocolate|firebrick|dodgerblue|steelblue|royalblue|slateblue|seagreen|forestgreen|olivedrab|goldenrod|mediumpurple)(?![\w-])/i

/** styles.ts 文件头登记的 rgba 豁免：阴影 + 图片遮罩 scrim + 白墨叠层（物理光效 / 令牌派生）。 */
const ALLOWED_RGBA = [/^0,0,0,[\d.]+$/, /^255,255,255,[\d.]+$/, /^18,20,26,[\d.]+$/]

test.describe('CONTROLS_CSS — 令牌基准（原 controls spec 迁移）', () => {
  test('消费 --usl-* 语义令牌', () => {
    expect(CONTROLS_CSS).toContain('var(--usl-surface')
    expect(CONTROLS_CSS).toContain('var(--usl-fill-primary)')
  })
})

test.describe('CONTROLS_CSS — header 布局健壮化 + 搜索框', () => {
  test('row 可换行 + tabs 单行滚动带（多分区不再堆叠撑高 sticky header）+ 紧凑化基准', () => {
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-row \{[^}]*flex-wrap: wrap/)
    // 统计 box 面（.umm-header-info 与 .umm-sht-stats 共用选择器）保留 500 字重
    expect(CONTROLS_CSS).toMatch(/\.umm-header-info, \.umm-sht-stats \{[^}]*font-weight: 500/)
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-tabs \{[^}]*overflow-x: auto/)
    // tabs 由「换行堆叠」改为「单行滚动带」：不再 flex-wrap
    expect(CONTROLS_CSS).not.toMatch(/\.umm-sht-tabs \{[^}]*flex-wrap/)
    // 紧凑化：纵向留白与区域间距收紧（pad-y 0.9vw 档 / gap 1vw 档）。
    expect(CONTROLS_CSS).toMatch(/--sht-pad-y: clamp\(6px, 0\.9vw, 12px\)/)
    expect(CONTROLS_CSS).toMatch(/--sht-gap: clamp\(6px, 1vw, 12px\)/)
  })

  test('header 三列网格 + 顶部居中簇 + 摩天轮舞台/轮替控件', () => {
    // row--context 三列网格（真正的水平居中：1fr auto 1fr）
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-row--context \{[^}]*display: grid/)
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-row--context \{[^}]*grid-template-columns: 1fr auto 1fr/)
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-center \{[^}]*justify-content: center/)
    // 摩天轮舞台：两舱由 data-umm-slot 唯一决定位置（active / hidden-up / hidden-down）
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-island-stage > \[data-umm-slot="active"\]/)
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-island-stage > \[data-umm-slot="hidden-up"\]/)
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-island-stage > \[data-umm-slot="hidden-down"\]/)
    // 方向性过渡（transform + opacity）与 reduced-motion 降级
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-island-stage > \* \{[^}]*transition: opacity[^}]*transform/)
    expect(CONTROLS_CSS).toContain('.umm-sht-island-switch')
    // 岛内微调：控件胶囊圆角（与岛体外形收敛）
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-floatbar \.umm-sht-search-input,[^{]*\{[^}]*border-radius: 999px/)
    // 隐藏舱 visibility:hidden（不可聚焦/读屏不可达）+ 延迟过渡不打断动画
    expect(CONTROLS_CSS).toMatch(/\[data-umm-slot="hidden-up"\] \{[^}]*visibility: hidden/)
    expect(CONTROLS_CSS).toMatch(/\[data-umm-slot="hidden-up"\] \{[^}]*visibility 0s linear/)
    // 岛内键盘焦点环 + 舞台宽度稳定（min-width 收敛两舱宽度差）
    expect(CONTROLS_CSS).toContain('.umm-sht-floatbar :focus-visible')
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-island-stage \{[^}]*min-width: clamp\(172px/)
    // 岛为单轴裁切：overflow-x: clip（auto 会把 overflow-y 提升为 auto →
    // 岛变双向滚动容器、裁切摩天轮上下滚动）
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-floatbar \{[^}]*overflow-x: clip/)
    expect(CONTROLS_CSS).not.toMatch(/\.umm-sht-floatbar \{[^}]*overflow-x: auto/)
    // 隐藏舱 inset:0 铺满同一舱位 + 内部居中（与激活舱几何一致，切换不跳位；
    // left/top 锚定会让绝对定位子项失去居中对齐）
    expect(CONTROLS_CSS).toMatch(/\[data-umm-slot="hidden-up"\] \{[^}]*inset: 0/)
    expect(CONTROLS_CSS).toMatch(/\[data-umm-slot="hidden-up"\] \{[^}]*justify-content: center/)
  })

  test('dimmer 提速：过渡表统一 + 批量免过渡 + 已看 filter 缩短', () => {
    // opacity 并入基类过渡表（不再用 .umm-viewed 整条覆盖——那会顺带杀死悬停动效）
    expect(GRID_CSS).toMatch(/\.umm-card \{[^}]*transition:[^}]*opacity 0\.18s/)
    expect(GRID_CSS).not.toMatch(/\.umm-card\.umm-viewed \{[^}]*transition:/)
    // 批量上色免过渡类（withDimBatch 单帧挂类）
    expect(GRID_CSS).toMatch(/\.umm-sht-dim-batch \.umm-card[^{]*\{[^}]*transition: none/)
    // 已看态图片 filter 过渡缩短（最贵的插值段）
    expect(EFFECTS_CSS).toMatch(/\.umm-card\.umm-viewed \.umm-card-image img \{[^}]*transition-duration: 0\.22s/)
  })

  test('右上统计区两 box + 左侧上下文文本（统一 header 右上角）', () => {
    // 统计区容器把整组推至右上角
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-stat-area \{[^}]*margin-left: auto/)
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-stat-area \{[^}]*flex-wrap: wrap/)
    // 两 box 共用 box 面样式（本页状态 .umm-header-info + 全局三段 .umm-sht-stats）
    expect(CONTROLS_CSS).toMatch(/\.umm-header-info, \.umm-sht-stats \{[^}]*border-radius: 8px/)
    expect(CONTROLS_CSS).toMatch(/\.umm-header-info, \.umm-sht-stats \{[^}]*white-space: nowrap/)
    expect(CONTROLS_CSS).toMatch(/\.umm-header-info, \.umm-sht-stats \{[^}]*background: var\(--usl-surface-raised\)/)
    // 左侧上下文文本载体（非 box）
    expect(CONTROLS_CSS).toContain('.umm-sht-context')
  })

  test('搜索框 class 齐备 + 岛内收窄与 focus 动效自适应 + 窄屏防溢出', () => {
    expect(CONTROLS_CSS).toContain('.umm-sht-searchbox')
    expect(CONTROLS_CSS).toContain('.umm-sht-search-input')
    expect(CONTROLS_CSS).toContain('.umm-sht-search-btn')
    // 统一岛：搜索 + 分页同排，岛内搜索框静息收窄子规则。
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-floatbar \.umm-sht-search-input \{[^}]*clamp\(96px/)
    // focus 动效自适应：宽度平滑过渡 + :focus 展开档位。
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-floatbar \.umm-sht-search-input \{[^}]*transition: width/)
    expect(CONTROLS_CSS).toMatch(/\.umm-sht-floatbar \.umm-sht-search-input:focus \{[^}]*clamp\(140px/)
    // 窄屏防溢出：计数器与跳转输入 ≤640px 隐藏（页码 + 上下页图标保留）。
    expect(CONTROLS_CSS).toMatch(/@media \(max-width: 640px\) \{[^}]*umm-sht-pg-total[^}]*display: none/)
  })
})

test.describe('令牌基准 — 全段零调色板色值（通用守卫）', () => {
  const segments: Array<[string, string]> = [
    ['GRID_CSS', GRID_CSS],
    ['CONTROLS_CSS', CONTROLS_CSS],
    ['EFFECTS_CSS', EFFECTS_CSS],
    ['HOME_CSS', HOME_CSS],
    ['SEARCH_CSS', SEARCH_CSS],
    ['RISK_CSS', RISK_CSS],
    ['EMPTY_CSS', EMPTY_CSS],
  ]

  test('七段组件 CSS 均无任何 hex 字面量', () => {
    for (const [name, css] of segments) {
      expect(css, `${name} 含 hex 字面量`).not.toMatch(PALETTE_HEX)
    }
  })

  test('rgba() 仅限已登记的物理光效豁免面（阴影 / scrim / 白墨叠层）', () => {
    for (const [name, css] of segments) {
      for (const match of css.matchAll(/rgba?\(([^)]*)\)/g)) {
        const channels = match[1]!.replace(/\s+/g, '')
        const allowed = ALLOWED_RGBA.some((re) => re.test(channels))
        expect(allowed, `${name} 含未登记色值的 rgba: ${match[0]}`).toBe(true)
      }
    }
  })

  test('无函数式色彩写法（hsl/hwb/lab/oklch/color()）', () => {
    for (const [name, css] of segments) {
      expect(css, `${name} 含函数式色彩`).not.toMatch(FUNCTIONAL_COLOR)
    }
  })

  test('无命名色（transparent / currentColor / inherit 为合法关键字，不在禁列）', () => {
    for (const [name, css] of segments) {
      const hits = css.match(NAMED_COLOR) ?? []
      expect(hits, `${name} 含命名色: ${hits.join(', ')}`).toEqual([])
    }
  })

  test('声明的 rgba 豁免面都必须真的出现（防死声明）', () => {
    // 归一化空白后按「族前缀」反查（与 ALLOWED_RGBA 一一对应）。
    const all = segments.map(([, css]) => css).join('\n').replace(/\s+/g, '')
    for (const family of ['0,0,0,', '255,255,255,', '18,20,26,']) {
      expect(all, `豁免族 ${family} 在组件 CSS 中不存在（应删除对应登记）`).toContain(family)
    }
  })
})

test.describe('uslVarsForHost — 重宿主不变量', () => {
  test('两个作用域替换必须都生效（源作用域变更时静默失效会被此断言拦下）', () => {
    const css = uslVarsForHost()
    expect(css).toContain(':host {')
    expect(css).toContain(':host(.umm-theme--dark) {')
  })
})

test.describe('EFFECTS_CSS — 动效关键规则', () => {
  test('模糊揭示 + 入场级联 + reduced-motion 降级', () => {
    expect(EFFECTS_CSS).toContain('blur(14px)')
    expect(EFFECTS_CSS).toContain('umm-sht-card-in')
    expect(EFFECTS_CSS).toContain('umm-sht-float-in')
    expect(EFFECTS_CSS).toContain('prefers-reduced-motion')
  })
})

test.describe('SEHUATANG_OVERLAY_CSS — 组合完整性', () => {
  test('变量表与三个组件段全部在内', () => {
    expect(SEHUATANG_OVERLAY_CSS).toContain(':host {')
    expect(SEHUATANG_OVERLAY_CSS).toContain('.umm-preview-grid')
    expect(SEHUATANG_OVERLAY_CSS).toContain('.umm-sehuatang-header')
    expect(SEHUATANG_OVERLAY_CSS).toContain('.umm-sht-floatbar')
    expect(SEHUATANG_OVERLAY_CSS).toContain('umm-sht-card-in')
  })

  test('首页 + 搜索段都已并入（覆盖扩展后的全量 CSS）', () => {
    expect(SEHUATANG_OVERLAY_CSS).toContain('.umm-sht-home-section')
    expect(SEHUATANG_OVERLAY_CSS).toContain('.umm-sht-home-card')
    expect(SEHUATANG_OVERLAY_CSS).toContain('.umm-sht-search-grid')
    expect(SEHUATANG_OVERLAY_CSS).toContain('.umm-sht-search-card')
  })

  test('风控段已并入（年龄门重建 CSS 随 overlay 表注入）', () => {
    expect(SEHUATANG_OVERLAY_CSS).toContain('.umm-sht-shell--risk')
    expect(SEHUATANG_OVERLAY_CSS).toContain('.umm-sht-risk-enter')
  })

  test('空态段已并入（全部已看过 empty state 随 overlay 表注入）', () => {
    expect(SEHUATANG_OVERLAY_CSS).toContain('.umm-sht-empty')
    expect(SEHUATANG_OVERLAY_CSS).toContain('umm-sht-empty-in')
  })
})

test.describe('EMPTY_CSS — 全部已看过空态', () => {
  test('空态布局 + 插图尺寸 + 双行文案 + reduced-motion 守卫 class 齐备', () => {
    expect(EMPTY_CSS).toContain('.umm-sht-empty')
    expect(EMPTY_CSS).toContain('.umm-sht-empty-title')
    expect(EMPTY_CSS).toContain('.umm-sht-empty-hint')
    expect(EMPTY_CSS).toContain('umm-sht-empty-in')
    expect(EMPTY_CSS).toContain('prefers-reduced-motion')
  })

  test('消费 --usl-* 令牌（无裸色）', () => {
    expect(EMPTY_CSS).toContain('var(--usl-text-primary)')
    expect(EMPTY_CSS).toContain('var(--usl-text-muted)')
  })
})

test.describe('HOME_CSS — 首页分区网格', () => {
  test('分区标题 + 卡片网格 + 入口 class 齐备', () => {
    expect(HOME_CSS).toContain('.umm-sht-home-section')
    expect(HOME_CSS).toContain('.umm-sht-home-cat')
    expect(HOME_CSS).toContain('.umm-sht-home-grid')
    expect(HOME_CSS).toContain('.umm-sht-home-card')
    expect(HOME_CSS).toContain('.umm-sht-home-icon')
    expect(HOME_CSS).toContain('.umm-sht-home-pill')
    // 整卡可点击区（卡片 a 链接充当整卡热区，设计关键类）
    expect(HOME_CSS).toContain('.umm-sht-home-link')
  })

  test('消费 --usl-* 令牌（无裸色）', () => {
    expect(HOME_CSS).toContain('var(--usl-text-primary)')
    expect(HOME_CSS).toContain('var(--usl-fill-primary)')
    expect(HOME_CSS).toContain('var(--usl-accent)')
  })
})

test.describe('SEARCH_CSS — 搜索结果卡片', () => {
  test('结果卡片 + 站点摘要位 + 元信息布局（内嵌分页容器已废除——分页入岛）', () => {
    expect(SEARCH_CSS).toContain('.umm-sht-search-card')
    expect(SEARCH_CSS).toContain('.umm-sht-search-title')
    expect(SEARCH_CSS).toContain('.umm-sht-search-meta')
    // 摘要位（隐藏提示/内容预览透传，两行截断）
    expect(SEARCH_CSS).toContain('.umm-sht-search-preview')
    // 分页入岛（buildFloatbar 统一合成）：旧内嵌分页容器规则不得回流。
    expect(SEARCH_CSS).not.toContain('.umm-sht-search-pager')
  })

  test('消费 --usl-* 令牌（与 HOME 对称）', () => {
    expect(SEARCH_CSS).toContain('var(--usl-text-')
    expect(SEARCH_CSS).toContain('var(--usl-accent)')
  })
})

test.describe('RISK_CSS — 风控页（年龄门）', () => {
  test('居中面板 + 域名大字 + 主/次进入按钮 + 分隔线 + 警告块 class 齐备', () => {
    expect(RISK_CSS).toContain('.umm-sht-shell--risk')
    expect(RISK_CSS).toContain('.umm-sht-risk-panel')
    expect(RISK_CSS).toContain('.umm-sht-risk-domain')
    expect(RISK_CSS).toContain('.umm-sht-risk-enter--primary')
    expect(RISK_CSS).toContain('.umm-sht-risk-enter--secondary')
    expect(RISK_CSS).toContain('.umm-sht-risk-line')
    expect(RISK_CSS).toContain('.umm-sht-risk-warn-title')
    expect(RISK_CSS).toContain('.umm-sht-risk-warn')
  })

  test('消费 --usl-* 令牌（按钮主/次面 + 文本层级，无裸色）', () => {
    expect(RISK_CSS).toContain('var(--usl-fill-primary)')
    expect(RISK_CSS).toContain('var(--usl-ink-on-fill)')
    expect(RISK_CSS).toContain('var(--usl-surface-raised)')
    expect(RISK_CSS).toContain('var(--usl-border-strong)')
    expect(RISK_CSS).toContain('var(--usl-text-secondary)')
  })
})
