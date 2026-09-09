import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import {
  extractAvIdFromTitle,
  partitionInitialVisible,
  parseThreadRow,
  collectNewThreadRows,
  extractThreadIdFromUrl,
} from '@/entrypoints/content/handlers/sehuatang-extract'

/**
 * 色花堂标题番号提取（sehuatang-extract）纯函数测试。
 *
 * 回归锚点：FC2 混排前缀（FC2PPV-44580）——旧正则 `[a-zA-Z]{2,6}[-\s]?\d{2,5}`
 * 字母段无法跨越数字，只能截到 "PPV-44580"，导致历史已看标记查不到、
 * dimmer 永不触发。新正则形态：1 字母开头 + 1–7 字母/数字/连字符 +
 * 可选连字符/空格 + ≥2 位数字。
 */

test.describe('extractAvIdFromTitle', () => {
  test('FC2 混排前缀：FC2PPV-44580 完整捕获（历史已看标记回归锚点）', () => {
    expect(extractAvIdFromTitle('【新作】FC2PPV-44580 巨乳新人デビュー')).toBe('FC2PPV-44580')
  })

  test('FC2 连字符形态：FC2-PPV-44580 完整捕获', () => {
    expect(extractAvIdFromTitle('FC2-PPV-44580 素人初撮り')).toBe('FC2-PPV-44580')
  })

  test('常规形态：连字符 / 无连字符 / 小写转大写', () => {
    expect(extractAvIdFromTitle('SSIS-001 新人NO.1STYLE')).toBe('SSIS-001')
    expect(extractAvIdFromTitle('HND-882 ドリームウーマン')).toBe('HND-882')
    expect(extractAvIdFromTitle('yag-1233 标题')).toBe('YAG-1233')
    expect(extractAvIdFromTitle('ABC123 标题')).toBe('ABC123')
  })

  test('空格形态：ABC 123 → 归一化 ABC-123（与后台保存键往返一致）', () => {
    expect(extractAvIdFromTitle('ABC 123 新人')).toBe('ABC-123')
  })

  test('分辨率守卫：HD-1080/FHD-2160 等候选整体跳过，优先真番号', () => {
    expect(extractAvIdFromTitle('高清HD-1080P版')).toBeNull()
    expect(extractAvIdFromTitle('[高清HD-1080P版] SSIS-001 新人')).toBe('SSIS-001')
    expect(extractAvIdFromTitle('4K UHD-2160 原版')).toBeNull()
    // 非标准分辨率数字组合不受守卫影响（普通番号形态）
    expect(extractAvIdFromTitle('HD-999 罕见编号')).toBe('HD-999')
  })

  test('标题前缀干扰下仍提取首个番号', () => {
    expect(extractAvIdFromTitle('[有码高清] SSIS-001 新人')).toBe('SSIS-001')
  })

  test('无番号：纯中文标题 / 数字开头分辨率文本 / 空串 → null', () => {
    expect(extractAvIdFromTitle('这是一个没有番号的标题')).toBeNull()
    expect(extractAvIdFromTitle('1080P 高清原版')).toBeNull()
    expect(extractAvIdFromTitle('')).toBeNull()
    expect(extractAvIdFromTitle('   ')).toBeNull()
  })
})

test.describe('partitionInitialVisible — 初始进程已看分离（初始只隐藏/非初始只 dim）', () => {
  interface T { trackId: string | null }

  test('空已看集合 → 全部可见，隐藏 0', () => {
    const threads: T[] = [{ trackId: 'ABC-123' }, { trackId: 'TID-9' }, { trackId: 'SSIS-001' }]
    const { visible, hiddenCount } = partitionInitialVisible(threads, new Set<string>())
    expect(visible).toEqual(threads)
    expect(hiddenCount).toBe(0)
  })

  test('已看键（大小写不敏感，含 TID 兜底键）分离到隐藏计数', () => {
    const threads: T[] = [{ trackId: 'ABC-123' }, { trackId: 'TID-77' }, { trackId: 'SSIS-001' }, { trackId: 'FC2PPV-44580' }]
    const { visible, hiddenCount } = partitionInitialVisible(threads, new Set(['abc-123', 'FC2PPV-44580', 'tid-77']))
    expect(visible.map((t) => t.trackId)).toEqual(['SSIS-001'])
    expect(hiddenCount).toBe(3)
  })

  test('无跟踪键线程永不被隐藏（无法判定已看）', () => {
    const threads: T[] = [{ trackId: null }, { trackId: 'A-1' }]
    const { visible, hiddenCount } = partitionInitialVisible(threads, new Set(['A-1']))
    expect(visible.map((t) => t.trackId)).toEqual([null])
    expect(hiddenCount).toBe(1)
  })

  test('全部已看 → 可见集合为空，隐藏=总数', () => {
    const threads: T[] = [{ trackId: 'A-1' }, { trackId: 'B-2' }]
    const { visible, hiddenCount } = partitionInitialVisible(threads, new Set(['A-1', 'B-2']))
    expect(visible).toEqual([])
    expect(hiddenCount).toBe(2)
  })
})

test.describe('parseThreadRow — 帖子行 → 线程数据（AJAX 分页行解析）', () => {
  const ROW_HTML = `
    <tbody id="normalthread_3664524">
      <tr><th><a class="s xst" href="https://www.sehuatang.net/thread-3664524-1-1.html">【新作】SSIS-001 标题</a></th></tr>
      <tr><td class="by"><em><span>2026-9-5</span></em></td></tr>
    </tbody>`

  test('完整行 → url/title/avId/trackId/日期齐备', () => {
    const dom = new JSDOM(`<body><table>${ROW_HTML}</table></body>`, { url: 'https://www.sehuatang.net/forum-103-1.html' })
    const row = dom.window.document.querySelector('tbody')!
    expect(parseThreadRow(row)).toEqual({
      url: 'https://www.sehuatang.net/thread-3664524-1-1.html',
      title: '【新作】SSIS-001 标题',
      avId: 'SSIS-001',
      trackId: 'SSIS-001',
      releaseDate: '2026-9-5',
    })
  })

  test('无番号标题 → trackId 回退 TID-<tid>（usavid 等未知形态同样被覆盖）', () => {
    const dom = new JSDOM(
      '<body><table><tbody id="normalthread_77"><tr><th><a class="s xst" href="https://www.sehuatang.net/thread-77-1-1.html">这是一个没有番号的标题</a></th></tr></tbody></table></body>',
      { url: 'https://www.sehuatang.net/forum-103-1.html' },
    )
    const thread = parseThreadRow(dom.window.document.querySelector('tbody')!)!
    expect(thread.avId).toBeNull()
    expect(thread.trackId).toBe('TID-77')
  })

  test('extractThreadIdFromUrl：thread URL 提取 / 无 tid → null', () => {
    expect(extractThreadIdFromUrl('https://www.sehuatang.net/thread-3664524-1-1.html')).toBe('TID-3664524')
    expect(extractThreadIdFromUrl('https://www.sehuatang.net/forum-103-1.html')).toBeNull()
    expect(extractThreadIdFromUrl('')).toBeNull()
  })

  test('缺标题链接 → null；缺日期 → N/A', () => {
    const dom = new JSDOM('<body><table><tbody id="normalthread_1"><tr><th>无链接</th></tr></tbody></table></body>')
    expect(parseThreadRow(dom.window.document.querySelector('tbody')!)).toBeNull()

    const dom2 = new JSDOM(
      '<body><table><tbody id="normalthread_2"><tr><th><a class="s xst" href="https://x.test/t">ABC-123</a></th></tr></tbody></table></body>',
      { url: 'https://www.sehuatang.net/forum-103-1.html' },
    )
    expect(parseThreadRow(dom2.window.document.querySelector('tbody')!)!.releaseDate).toBe('N/A')
  })
})

test.describe('collectNewThreadRows — MutationRecord 新行收集（静态地址分页）', () => {
  function rec(...nodes: Node[]): MutationRecord {
    return { addedNodes: nodes as unknown as NodeList } as unknown as MutationRecord
  }

  test('tboby 直接追加 → 收集一次；同 ID 重复追加 → 去重', () => {
    const dom = new JSDOM('<body><table></table></body>')
    const table = dom.window.document.querySelector('table')!
    const tb = dom.window.document.createElement('tbody')
    tb.id = 'normalthread_101'
    const processed = new Set<string>()

    expect(collectNewThreadRows([rec(tb)], processed).map((r) => r.id)).toEqual(['normalthread_101'])
    expect(collectNewThreadRows([rec(tb)], processed)).toEqual([])
    expect(processed.has('normalthread_101')).toBe(true)
    expect(table.querySelector('tbody')).toBeNull() // 收集不改变 DOM
  })

  test('容器节点内嵌多行 → 全部收集；文本节点忽略', () => {
    const dom = new JSDOM('<body></body>')
    const wrapper = dom.window.document.createElement('div')
    for (const id of ['normalthread_1', 'normalthread_2']) {
      const tb = dom.window.document.createElement('tbody')
      tb.id = id
      wrapper.appendChild(tb)
    }
    const processed = new Set<string>()
    const rows = collectNewThreadRows([rec(wrapper, dom.window.document.createTextNode('x'))], processed)
    expect(rows.map((r) => r.id)).toEqual(['normalthread_1', 'normalthread_2'])
  })

  test('tr 级追加 → 经 closest(tbody) 归属收集（防御性粒度）', () => {
    const dom = new JSDOM('<body><table><tbody id="normalthread_9"></tbody></table></body>')
    const tr = dom.window.document.createElement('tr')
    const tb = dom.window.document.querySelector('tbody')!
    tb.appendChild(tr)
    const processed = new Set<string>()
    const rows = collectNewThreadRows([rec(tr)], processed)
    expect(rows.map((r) => r.id)).toEqual(['normalthread_9'])
  })

  test('非 normalthread_ 前缀 → 不收集', () => {
    const dom = new JSDOM('<body></body>')
    const tb = dom.window.document.createElement('tbody')
    tb.id = 'separator_9'
    expect(collectNewThreadRows([rec(tb)], new Set<string>())).toEqual([])
  })
})
