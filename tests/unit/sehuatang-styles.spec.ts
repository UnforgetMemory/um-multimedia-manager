import { test, expect } from '@playwright/test'
import {
  SEHUATANG_OVERLAY_CSS,
  GRID_CSS,
  CONTROLS_CSS,
  EFFECTS_CSS,
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

test.describe('令牌基准 — 全段零调色板色值（通用守卫）', () => {
  const segments: Array<[string, string]> = [
    ['GRID_CSS', GRID_CSS],
    ['CONTROLS_CSS', CONTROLS_CSS],
    ['EFFECTS_CSS', EFFECTS_CSS],
  ]

  test('三段组件 CSS 均无任何 hex 字面量', () => {
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
})
