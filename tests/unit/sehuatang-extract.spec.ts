import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import {
  extractAvIdFromTitle,
  extractUsAvIdFromTitle,
  partitionInitialVisible,
  parseThreadRow,
  collectNewThreadRows,
  collectThreadTrackKeys,
  resolveThreadWatchKey,
  extractThreadIdFromUrl,
  shouldDimOnNavigate,
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

test.describe('extractUsAvIdFromTitle — 美/欧厂牌番号（Studio.YY.MM.DD）', () => {
  test('真实样例回归锚点：BigTitsRoundAsses.23.06.10 / MommyGotBoobs.21.03.09', () => {
    expect(extractUsAvIdFromTitle('BigTitsRoundAsses.23.06.10')).toBe('BIGTITSROUNDASSES.23.06.10')
    expect(extractUsAvIdFromTitle('MommyGotBoobs.21.03.09')).toBe('MOMMYGOTBOOBS.21.03.09')
  })

  test('小写归一 + 包围文本 + 厂牌内部点分段', () => {
    expect(extractUsAvIdFromTitle('bigtitsroundasses.23.06.10')).toBe('BIGTITSROUNDASSES.23.06.10')
    expect(extractUsAvIdFromTitle('[欧美] BigTitsRoundAsses.23.06.10 高清 1080p')).toBe('BIGTITSROUNDASSES.23.06.10')
    expect(extractUsAvIdFromTitle('Blacked.Raw.23.01.15 标题')).toBe('BLACKED.RAW.23.01.15')
  })

  test('日期段校验：非法月/日 → null（挡版本号类误报）', () => {
    expect(extractUsAvIdFromTitle('Studio.23.13.01')).toBeNull()
    expect(extractUsAvIdFromTitle('Studio.23.06.32')).toBeNull()
    expect(extractUsAvIdFromTitle('Studio.23.00.10')).toBeNull()
  })

  test('已知取舍（固化）：末两段合法的版本串仍被误判为番号', () => {
    // 月/日只校验最后两段：v2.23.06.10 的末两段是 06/10（合法）→ 命中，
    // 而 Studio.23.13.01 的末两段 13 月越界 → 被挡。此误报面为有意保留
    // （与 x265-10bit 同类）。若将来收紧正则，必须同步改本断言与源码注释。
    expect(extractUsAvIdFromTitle('v2.23.06.10')).toBe('V2.23.06.10')
    expect(extractUsAvIdFromTitle('Studio.23.13.01')).toBeNull()
  })

  test('纯日期无厂牌前缀 → null（2023.06.10 数字段起始不命中）', () => {
    expect(extractUsAvIdFromTitle('2023.06.10 合集')).toBeNull()
  })

  test('日系优先：同标题含两类形态时返回日系番号', () => {
    expect(extractAvIdFromTitle('SSIS-001 BigTitsRoundAsses.23.06.10')).toBe('SSIS-001')
  })

  test('extractAvIdFromTitle 集成：美系兜底（日系无命中时）', () => {
    expect(extractAvIdFromTitle('[欧美] MommyGotBoobs.21.03.09 标题')).toBe('MOMMYGOTBOOBS.21.03.09')
    expect(extractAvIdFromTitle('Studio.23.13.01 非法日期')).toBeNull()
  })

  test('parseThreadRow 集成：美系标题行 → avId/trackId = 美系番号（不再回退 TID）', () => {
    const dom = new JSDOM(
      '<body><table><tbody id="normalthread_88"><tr><th><a class="s xst" href="https://www.sehuatang.net/thread-88-1-1.html">[欧美] BigTitsRoundAsses.23.06.10 标题</a></th></tr><tr><td class="by"><em><span>2026-9-8</span></em></td></tr></tbody></table></body>',
      { url: 'https://www.sehuatang.net/forum-103-1.html' },
    )
    const thread = parseThreadRow(dom.window.document.querySelector('tbody')!)!
    expect(thread.avId).toBe('BIGTITSROUNDASSES.23.06.10')
    expect(thread.trackId).toBe('BIGTITSROUNDASSES.23.06.10')
    // 美系行同样携带 TID 兜底键（双键 dimmer 可用）
    expect(thread.tid).toBe('TID-88')
  })
})

test.describe('resolveThreadWatchKey — 帖子页静默记录键（番号优先 / TID 兜底）', () => {
  const THREAD_URL = 'https://www.sehuatang.net/thread-3664524-1-1.html'

  test('标题含番号 → 番号（分类落 jav_ids/usav_ids）', () => {
    expect(resolveThreadWatchKey('【新作】SSIS-001 新人', THREAD_URL)).toBe('SSIS-001')
    expect(resolveThreadWatchKey('[欧美] BigTitsRoundAsses.23.06.10 标题', THREAD_URL)).toBe('BIGTITSROUNDASSES.23.06.10')
  })

  test('提取失败 → TID 兜底（落 sehuatang_ids 帖子浏览记录）', () => {
    expect(resolveThreadWatchKey('这是一个没有番号的标题', THREAD_URL)).toBe('TID-3664524')
  })

  test('动态 viewthread URL 同样可取 TID 兜底', () => {
    expect(resolveThreadWatchKey('无番号标题', 'https://www.sehuatang.net/forum.php?mod=viewthread&tid=99')).toBe('TID-99')
  })

  test('无番号且 URL 无 tid → null（不落垃圾键）', () => {
    expect(resolveThreadWatchKey('无番号标题', 'https://www.sehuatang.net/forum-103-1.html')).toBeNull()
  })

  test('与列表行 parseThreadRow 同优先级：两处写键一致', () => {
    const dom = new JSDOM(
      '<body><table><tbody id="normalthread_3664524"><tr><th><a class="s xst" href="https://www.sehuatang.net/thread-3664524-1-1.html">【新作】SSIS-001 标题</a></th></tr></tbody></table></body>',
      { url: 'https://www.sehuatang.net/forum-103-1.html' },
    )
    const row = parseThreadRow(dom.window.document.querySelector('tbody')!)!
    expect(resolveThreadWatchKey(row.title, row.url)).toBe(row.trackId)
  })
})

test.describe('collectThreadTrackKeys — 双键候选集合（dimmer 兜底链输入）', () => {
  test('番号 + TID 双键全部收集、去重大写', () => {
    const keys = collectThreadTrackKeys([
      { avId: 'SSIS-001', tid: 'TID-1', trackId: 'SSIS-001' },
      { avId: null, tid: 'TID-2', trackId: 'TID-2' },
    ])
    expect(new Set(keys)).toEqual(new Set(['SSIS-001', 'TID-1', 'TID-2']))
  })

  test('全空线程 → 空集合', () => {
    expect(collectThreadTrackKeys([{ avId: null, tid: null, trackId: null }])).toEqual([])
  })

  test('重复键只保留一份', () => {
    expect(collectThreadTrackKeys([{ avId: 'A-1', tid: 'A-1', trackId: 'A-1' }])).toEqual(['A-1'])
  })
})

test.describe('partitionInitialVisible — 初始进程已看分离（初始只隐藏/非初始只 dim）', () => {
  interface T { trackId: string | null; tid?: string | null }

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

  test('双键兜底：番号未命中但 TID 命中 → 仍判定已看（sehuatang_ids 记录生效）', () => {
    // 同一帖子：列表标题有番号（trackId = 番号），但帖子页访问时标题无番号
    // → 记录落在 sehuatang_ids 的 TID 键；双键命中保证 dimmer 不失效。
    const threads: T[] = [
      { trackId: 'SSIS-001', tid: 'TID-100' },
      { trackId: 'SSIS-002', tid: 'TID-200' },
    ]
    const { visible, hiddenCount } = partitionInitialVisible(threads, new Set(['TID-100']))
    expect(hiddenCount).toBe(1)
    expect(visible.map((t) => t.trackId)).toEqual(['SSIS-002'])
  })

  test('双键大小写不敏感：TID 键小写输入同样命中', () => {
    const threads: T[] = [{ trackId: 'SSIS-003', tid: 'TID-300' }]
    const { visible, hiddenCount } = partitionInitialVisible(threads, new Set(['tid-300']))
    expect(visible).toEqual([])
    expect(hiddenCount).toBe(1)
  })
})

test.describe('parseThreadRow — 帖子行 → 线程数据（AJAX 分页行解析）', () => {
  const ROW_HTML = `
    <tbody id="normalthread_3664524">
      <tr><th><a class="s xst" href="https://www.sehuatang.net/thread-3664524-1-1.html">【新作】SSIS-001 标题</a></th></tr>
      <tr><td class="by"><em><span>2026-9-5</span></em></td></tr>
    </tbody>`

  test('完整行 → url/title/avId/tid/trackId/日期齐备', () => {
    const dom = new JSDOM(`<body><table>${ROW_HTML}</table></body>`, { url: 'https://www.sehuatang.net/forum-103-1.html' })
    const row = dom.window.document.querySelector('tbody')!
    expect(parseThreadRow(row)).toEqual({
      url: 'https://www.sehuatang.net/thread-3664524-1-1.html',
      title: '【新作】SSIS-001 标题',
      avId: 'SSIS-001',
      tid: 'TID-3664524',
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
    expect(thread.tid).toBe('TID-77')
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

test.describe('shouldDimOnNavigate — 点击跳转即 dimmer 的适用面', () => {
  test('仅提取到 TID → 适用（无番号，无自然落库路径）', () => {
    expect(shouldDimOnNavigate({ trackId: 'TID-3664524', detailSettled: false, hasMagnet: false })).toBe(true)
    // 即使有磁力也适用：TID 键本就走「点进帖子」的语义
    expect(shouldDimOnNavigate({ trackId: 'TID-3664524', detailSettled: true, hasMagnet: true })).toBe(true)
  })

  test('番号 + 详情已结束 + 无磁力 → 适用', () => {
    expect(shouldDimOnNavigate({ trackId: 'ABC-123', detailSettled: true, hasMagnet: false })).toBe(true)
    expect(shouldDimOnNavigate({ trackId: 'BIGTITSROUNDASSES.23.06.10', detailSettled: true, hasMagnet: false })).toBe(true)
  })

  test('详情子请求未结束 → 不适用（此刻还不能断言无磁力）', () => {
    expect(shouldDimOnNavigate({ trackId: 'ABC-123', detailSettled: false, hasMagnet: false })).toBe(false)
  })

  test('番号 + 有磁力 → 不适用（走复制磁力落库路径）', () => {
    expect(shouldDimOnNavigate({ trackId: 'ABC-123', detailSettled: true, hasMagnet: true })).toBe(false)
    expect(shouldDimOnNavigate({ trackId: 'ABC-123', detailSettled: false, hasMagnet: true })).toBe(false)
  })

  test('无任何跟踪键 → 不适用', () => {
    expect(shouldDimOnNavigate({ trackId: null, detailSettled: true, hasMagnet: false })).toBe(false)
    expect(shouldDimOnNavigate({ trackId: '', detailSettled: true, hasMagnet: false })).toBe(false)
  })

  test('TID 形态严格匹配：TID-abc / 内嵌 TID- 不算仅 TID', () => {
    expect(shouldDimOnNavigate({ trackId: 'TID-abc', detailSettled: false, hasMagnet: false })).toBe(false)
    expect(shouldDimOnNavigate({ trackId: 'ABC-TID-1', detailSettled: false, hasMagnet: false })).toBe(false)
  })
})
