import { test, expect } from '@playwright/test'
import { JSDOM } from 'jsdom'
import { getListPageConfig } from '@/entrypoints/content/enhancers/pt/config'
import { SITE_CONFIGS } from '@/entrypoints/content/enhancers/pt/config/sites'

/**
 * hhanclub.net（HHClub）PTDimmer 适配回归测试。
 *
 * 背景：HHClub 新版 Tailwind 主题弃用 NexusPHP 经典 <table> 布局——
 * 种子列表每行为 div.torrent-table-sub-info（容器 div.torrent-table-for-spider），
 * 且行内无豆瓣/IMDb 链接或 data 属性（评分仅为 img+文本），ID 匹配完全依赖
 * 后台扫描详情页（enableBackgroundScan）。旧配置 rowSelector 仅含
 * 'table.torrents > tbody > tr'，在新主题下匹配 0 行 → 淡化器整体失效。
 *
 * 本文件锁定三项契约：
 * 1. 参考列表页 URL 命中 hhanclub 精确配置（而非通用 NexusPHP 回退）；
 * 2. rowSelector 同时覆盖新主题 div 行与经典主题 table 行；
 * 3. extractDetailUrl 在真实行结构上提取详情 URL（跳过 userdetails 链接）。
 */

const REF_LIST_URL = 'https://hhanclub.net/torrents.php?cat[]=401'
const REF_DETAIL_URL = 'https://hhanclub.net/details.php?id=213423&hit=1'

test.beforeAll(() => {
  // extractDetailUrlFromLink 以 location.origin 为相对 URL 基准 —— Node 无 location 全局
  ;(globalThis as { location?: { origin: string } }).location = {
    origin: 'https://hhanclub.net',
  }
})

function getHhanConfig() {
  const config = SITE_CONFIGS.find((c) => c.domain === 'hhanclub.net')
  expect(config, 'SITE_CONFIGS 必须包含 hhanclub.net 条目').toBeTruthy()
  return config!
}

test.describe('hhanclub 路由与配置', () => {
  test('参考列表页 URL 命中精确配置（非通用回退）', () => {
    const config = getListPageConfig(REF_LIST_URL)
    expect(config).not.toBeNull()
    expect(config!.domain).toBe('hhanclub.net')
  })

  test('isListPage / isDetailPage 边界', () => {
    const config = getHhanConfig()
    expect(config.isListPage('https://hhanclub.net/torrents.php')).toBe(true)
    expect(config.isListPage(REF_LIST_URL)).toBe(true)
    expect(config.isListPage('https://hhanclub.net/details.php?id=1')).toBe(false)
    expect(config.isListPage('https://example.com/torrents.php')).toBe(false)
    expect(config.isDetailPage(REF_DETAIL_URL)).toBe(true)
    expect(config.isDetailPage(REF_LIST_URL)).toBe(false)
  })

  test('依赖后台扫描：enableBackgroundScan 开启且并发/延迟在风控安全范围', () => {
    const config = getHhanConfig()
    // 新主题行内无豆瓣/IMDb ID —— 后台扫描是唯一匹配路径
    expect(config.enableBackgroundScan).toBe(true)
    expect(config.scanConcurrency).toBeGreaterThanOrEqual(1)
    expect(config.scanConcurrency).toBeLessThanOrEqual(5)
    expect(config.scanDelayRange[0]).toBeGreaterThanOrEqual(500)
  })
})

test.describe('rowSelector 双主题兼容', () => {
  test('同时包含新主题 div 行分支与经典 table 行分支', () => {
    const config = getHhanConfig()
    expect(config.rowSelector).toContain('.torrent-table-sub-info')
    expect(config.rowSelector).toContain('table.torrents > tbody > tr')
  })

  test('新主题：组合选择器选中全部 div 行，skipRowSelector 不误伤', () => {
    const config = getHhanConfig()
    const html = `
      <div class="flex flex-col w-[95%] m-auto torrent-table-for-spider">
        <div class="w-full bg-[#11e5e380] flex z-10 !rounded-[3px] torrent-table-sub-info">
          <div class="torrent-cat"><a href="${REF_LIST_URL}"><img alt="类型"></a></div>
          <div class="flex torrent-table-for-spider-info torrent-title items-center gap-x-[15px] justify-between">
            <a href="${REF_DETAIL_URL}" class="torrent-info-text-name">Chompoo Lost and Forgotten 2026</a>
          </div>
        </div>
        <div class="w-full bg-[#FFFFFF] flex z-10 !rounded-[3px] torrent-table-sub-info">
          <div class="torrent-cat"><a href="${REF_LIST_URL}"><img alt="类型"></a></div>
          <div class="flex torrent-table-for-spider-info torrent-title items-center gap-x-[15px] justify-between">
            <a href="https://hhanclub.net/details.php?id=213422&hit=1" class="torrent-info-text-name">Another Torrent</a>
          </div>
        </div>
      </div>`
    const doc = new JSDOM(html).window.document

    const rows = doc.querySelectorAll(config.rowSelector)
    expect(rows.length).toBe(2)
    // div 行内不存在 td.colhead —— skipRowSelector 对新主题必须恒为否
    for (const row of rows) {
      expect(config.skipRowSelector ? row.querySelector(config.skipRowSelector) : null).toBeNull()
    }
  })

  test('经典主题：table 分支仍选中数据行且跳过表头行', () => {
    const config = getHhanConfig()
    const html = `
      <table class="torrents">
        <tbody>
          <tr><td class="colhead">类型</td><td class="colhead">标题</td></tr>
          <tr><td><a href="${REF_DETAIL_URL}">Classic Row</a></td></tr>
        </tbody>
      </table>`
    const doc = new JSDOM(html).window.document

    const rows = Array.from(doc.querySelectorAll(config.rowSelector))
    const dataRows = rows.filter(
      (row) => !(config.skipRowSelector && row.querySelector(config.skipRowSelector)),
    )
    expect(rows.length).toBe(2)
    expect(dataRows.length).toBe(1)
  })
})

test.describe('extractDetailUrl 行级提取', () => {
  test('新主题 div 行：提取标题详情链接并归一化（保留 search）', () => {
    const config = getHhanConfig()
    const html = `
      <div class="w-full bg-[#FFFFFF] flex z-10 !rounded-[3px] torrent-table-sub-info">
        <div class="torrent-manage">
          <a href="https://hhanclub.net/userdetails.php?id=12206">uploader</a>
        </div>
        <div class="flex torrent-table-for-spider-info torrent-title items-center">
          <a href="${REF_DETAIL_URL}" class="torrent-info-text-name">Title</a>
        </div>
      </div>`
    const doc = new JSDOM(html).window.document
    const row = doc.querySelector('.torrent-table-sub-info')!

    expect(config.extractDetailUrl(row)).toBe(REF_DETAIL_URL)
  })

  test('userdetails 链接被跳过，不误作详情页 URL', () => {
    const config = getHhanConfig()
    const html = `
      <div class="torrent-table-sub-info">
        <a href="https://hhanclub.net/userdetails.php?id=12206">uploader</a>
      </div>`
    const doc = new JSDOM(html).window.document
    const row = doc.querySelector('.torrent-table-sub-info')!

    expect(config.extractDetailUrl(row)).toBeNull()
  })
})
