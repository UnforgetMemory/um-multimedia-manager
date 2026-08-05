import { test, expect } from '@playwright/test'
import { buildRowByUrl } from '@/entrypoints/content/enhancers/pt/dimmer/nexusphp-rowmap'

/**
 * NexusPHP PT 淡化器行索引单元测试。
 *
 * 背景（S5 二次扫描消除）：scanBatch 的扫描完成回调此前对每个结果重新
 * document.querySelectorAll(config.rowSelector) 并线性扫描全部行匹配详情 URL，
 * 每次回调 O(N) 查询 + O(N) 扫描 → 整体 O(N*M)。本 helper 在 process()
 * 开始时一次性构建 URL → 行 Map，把回调降为 O(1) 查找。
 *
 * 归一化契约：与扫描队列 result.url 完全一致 —— scanTasks 压入的就是
 * `${origin}${pathname}${search}`（去 hash），queue.ts 原样回传 task.url，
 * 因此 buildRowByUrl 的键必须采用相同归一化。
 */

/** Playwright 单测跑在 Node，无 location 全局 —— 桩一个 origin 供相对 URL 解析。 */
test.beforeAll(() => {
  ;(globalThis as { location?: { origin: string } }).location = {
    origin: 'https://pt.example.com',
  }
})

/** 结构桩行：仅暴露提取所需的 href 与标识。 */
function makeRow(href: string | null, id: string): Element {
  return { href, id } as unknown as Element
}

const hrefOf = (row: Element): string | null => (row as { href: string | null }).href

const idOf = (row: Element): string => (row as { id: string }).id

test.describe('buildRowByUrl', () => {
  test('按详情 URL 建索引：每行以其归一化 URL 为键', () => {
    const rows = [
      makeRow('https://pt.example.com/details.php?id=1001', 'r1'),
      makeRow('https://pt.example.com/details.php?id=1002', 'r2'),
    ]

    const map = buildRowByUrl(rows as unknown as NodeListOf<Element>, {
      extractDetailUrl: hrefOf,
    })

    expect(map.size).toBe(2)
    expect(idOf(map.get('https://pt.example.com/details.php?id=1001')!)).toBe('r1')
    expect(idOf(map.get('https://pt.example.com/details.php?id=1002')!)).toBe('r2')
  })

  test('无详情 URL 的行被跳过，不进索引', () => {
    const rows = [
      makeRow('https://pt.example.com/details.php?id=1001', 'r1'),
      makeRow(null, 'skip-me'),
      makeRow('', 'also-skip-me'),
    ]

    const map = buildRowByUrl(rows as unknown as NodeListOf<Element>, {
      extractDetailUrl: hrefOf,
    })

    expect(map.size).toBe(1)
    expect(idOf(map.get('https://pt.example.com/details.php?id=1001')!)).toBe('r1')
    expect(map.get('')).toBeUndefined()
  })

  test('重复归一化 URL：后出现的行覆盖先出现的行（last wins）', () => {
    const rows = [
      makeRow('https://pt.example.com/details.php?id=1001', 'first'),
      makeRow('https://pt.example.com/details.php?id=1001', 'second'),
    ]

    const map = buildRowByUrl(rows as unknown as NodeListOf<Element>, {
      extractDetailUrl: hrefOf,
    })

    expect(map.size).toBe(1)
    expect(idOf(map.get('https://pt.example.com/details.php?id=1001')!)).toBe('second')
  })

  test('URL 归一化与扫描队列 result.url 一致：相对路径补全、去 hash、保留 search', () => {
    const rows = [
      makeRow('/details.php?id=1001&page=2', 'relative-with-query'),
      makeRow('https://pt.example.com/details.php?id=1002#torrent', 'hash-stripped'),
    ]

    const map = buildRowByUrl(rows as unknown as NodeListOf<Element>, {
      extractDetailUrl: hrefOf,
    })

    // 相对 URL 以 location.origin 为基准补全为绝对 URL
    expect(idOf(map.get('https://pt.example.com/details.php?id=1001&page=2')!)).toBe(
      'relative-with-query'
    )
    // hash 被剥离（result.url 只含 origin+pathname+search）
    expect(map.get('https://pt.example.com/details.php?id=1002#torrent')).toBeUndefined()
    expect(idOf(map.get('https://pt.example.com/details.php?id=1002')!)).toBe('hash-stripped')
  })

  test('非法 URL 回退为原始字符串（与扫描入队路径同语义）', () => {
    // new URL 对畸形 host（如非法百分号编码）抛错 → 键回退为原始字符串
    const rows = [makeRow('http://%zz', 'raw-fallback')]

    const map = buildRowByUrl(rows as unknown as NodeListOf<Element>, {
      extractDetailUrl: hrefOf,
    })

    expect(map.has('http://%zz')).toBe(true)
    expect(idOf(map.get('http://%zz')!)).toBe('raw-fallback')
  })

  test('空行集 → 空 Map', () => {
    const map = buildRowByUrl([] as unknown as NodeListOf<Element>, {
      extractDetailUrl: hrefOf,
    })

    expect(map.size).toBe(0)
  })

  test('non-http(s) schemes (javascript:/data:) are skipped — scheme guard matches the scanner origin allowlist', () => {
    const rows = [
      makeRow('javascript:alert(1)', 'js-scheme'),
      makeRow('data:text/html,hi', 'data-scheme'),
      makeRow('https://pt.example.com/details.php?id=1001', 'ok'),
    ]

    const map = buildRowByUrl(rows as unknown as NodeListOf<Element>, {
      extractDetailUrl: hrefOf,
    })

    expect(map.size).toBe(1)
    expect(map.get('javascript:alert(1)')).toBeUndefined()
    expect(map.get('data:text/html,hi')).toBeUndefined()
    expect(idOf(map.get('https://pt.example.com/details.php?id=1001')!)).toBe('ok')
  })
})
