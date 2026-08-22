import { test, expect } from '@playwright/test'
import type { MinimalStorageArea } from '@/features/settings/items'

/**
 * settings items（W1 重构）兼容契约测试。
 *
 * 锁定 docs/audit/refactor-plan-wxt-alignment-2026-08-21.md §3.1-D5 的两条硬承诺：
 * 1. 物理键不变 —— v5.x 写入的 flat key 被原地读取，item 写入的值可被
 *    legacy `chrome.storage.local.get` 直接读回（双向兼容，零数据迁移）；
 * 2. v1 不产生 `$` 元数据行 —— 迁移机制存在但不污染存储布局。
 *
 * 环境隔离策略：items 通过 `__bindSettingsAreaForTests` 显式绑定本文件的
 * area 实例，不读取任何全局 —— Playwright 复用 worker 且其他 spec 可能
 * 中途改写全局 chrome，显式绑定使被测行为按构造确定。globalThis.chrome
 * stub 仅服务于 SettingsCache 的 onChanged 监听与 session 缺席降级路径。
 */

interface AreaMock extends MinimalStorageArea {
  map: Map<string, unknown>
  emit(key: string, newValue: unknown): void
}

function createArea(): AreaMock {
  const map = new Map<string, unknown>()
  const listeners = new Set<(changes: Record<string, { newValue?: unknown }>, area: string) => void>()
  return {
    map,
    async get(keys) {
      if (keys === null) return Object.fromEntries(map)
      const ks = Array.isArray(keys) ? keys : [keys]
      const out: Record<string, unknown> = {}
      for (const k of ks) if (map.has(k)) out[k] = map.get(k)
      return out
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) {
        if (v === undefined) continue
        map.set(k, v)
      }
    },
    async remove(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) map.delete(k)
    },
    onChanged: {
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
    },
    emit(key, newValue) {
      for (const fn of listeners) fn({ [key]: { newValue } }, 'local')
    },
  }
}

const area = createArea()

let items!: typeof import('@/features/settings/items')
let cacheMod!: typeof import('@/features/settings/cache')

test.beforeAll(async () => {
  // chrome 全局仅供 SettingsCache 的 onChanged / session-cache 降级路径使用
  ;(globalThis as { chrome?: unknown }).chrome = {
    runtime: { id: 'test-extension-id' },
    storage: { onChanged: (area as unknown as { onChanged: unknown }).onChanged, local: area },
  }
  items = await import('@/features/settings/items')
  items.__bindSettingsAreaForTests(area)
  cacheMod = await import('@/features/settings/cache')
})

test.afterAll(() => {
  ;(globalThis as { chrome?: unknown }).chrome = undefined
})

function seed(entries: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(entries)) area.map.set(k, v)
}

// ==================== resolveAppSettings ====================

test.describe('resolveAppSettings', () => {
  test('空存储 → 全部 fallback 默认值', async () => {
    area.map.clear()
    const s = await items.resolveAppSettings()
    expect(s.webdavUrl).toBe('')
    expect(s.autoSync).toBe(false)
    expect(s.syncInterval).toBe(30)
    expect(s.theme).toBe('auto')
    expect(s.language).toBe('zh-CN')
    expect(s.notificationEnabled).toBe(true)
    expect(s.accentColor).toBe('blue')
    expect(s.grayColor).toBe('slate')
    expect(s.debugEnabled).toBe(false)
    expect(s.logLevel).toBe('info')
  })

  test('legacy flat key 原地读取（v5.x 存量数据兼容）', async () => {
    seed({
      webdavUrl: 'https://dav.example.com',
      syncInterval: 60,
      debugEnabled: true,
      logLevel: 'debug',
      theme: 'dark',
    })
    const s = await items.resolveAppSettings()
    expect(s.webdavUrl).toBe('https://dav.example.com')
    expect(s.syncInterval).toBe(60)
    expect(s.debugEnabled).toBe(true)
    expect(s.logLevel).toBe('debug')
    expect(s.theme).toBe('dark')
    // 未 seed 的字段仍取默认
    expect(s.neodbToken).toBe('')
  })

  test('v1 不产生 $ 元数据行', async () => {
    seed({ webdavUsername: 'alice' })
    await items.settingsItems().webdavUsername.getValue()
    await items.persistAppSettings({ webdavUsername: 'bob' })
    const metaKeys = [...area.map.keys()].filter((k) => k.endsWith('$'))
    expect(metaKeys).toEqual([])
  })
})

// ==================== persistAppSettings ====================

test.describe('persistAppSettings', () => {
  test('写入物理 flat key，legacy chrome.storage.get 可直接读回', async () => {
    await items.persistAppSettings({ autoSync: true, theme: 'light', accentColor: 'green' })
    // 走 legacy 形态的原生 get 读回（与 items API 无关）
    const raw = await area.get(['autoSync', 'theme', 'accentColor'])
    expect(raw).toEqual({ autoSync: true, theme: 'light', accentColor: 'green' })
  })

  test('undefined 字段被跳过（不落盘、不删除已有值）', async () => {
    seed({ language: 'en-US' })
    await items.persistAppSettings({ webdavUrl: 'https://x', language: undefined })
    expect(area.map.get('language')).toBe('en-US')
    expect(area.map.get('webdavUrl')).toBe('https://x')
  })

  test('defaultAppSettings 与 item fallback 同源', () => {
    const d = items.defaultAppSettings()
    expect(d.theme).toBe(items.settingsItems().theme.defaultValue)
    expect(d.syncInterval).toBe(30)
  })
})

// ==================== SettingsCache 门面 ====================
// （迁移链语义：当前所有 item 均为 v1 无迁移，<key>$ 元数据行为由
//   「v1 不产生 $ 元数据行」用例锁定；首个真实 v2 迁移落地时补专项用例。）

test.describe('SettingsCache（API 保持）', () => {
  test('init → get → updateAll 全链路 + 未初始化 get 回退默认', async () => {
    const cache = new cacheMod.settingsCache.constructor()
    // 未初始化 → 同步回退默认值
    expect(cache.get().syncInterval).toBe(30)

    seed({ syncInterval: 45 })
    await cache.init()
    expect(cache.get().syncInterval).toBe(45)

    await cache.updateAll({ autoSyncNeoDB: true, neodbToken: 'tok-1' })
    expect(cache.get().autoSyncNeoDB).toBe(true)
    expect(cache.get().neodbToken).toBe('tok-1')
    // 持久化到物理键
    expect(area.map.get('neodbToken')).toBe('tok-1')
    expect(cache.get().syncInterval).toBe(45)
  })

  test('startListening：onChanged 合并进缓存（含 umm:appearance shim + 杂键排除）', async () => {
    const cache = new cacheMod.settingsCache.constructor()
    await cache.init()
    cache.startListening()
    area.emit('theme', 'dark')
    expect(cache.get().theme).toBe('dark')
    area.emit('umm:appearance', { theme: 'light' })
    expect(cache.get().theme).toBe('light')
    // 非设置键不得混入缓存（否则会随 L1.5 快照持久化脏形状）
    area.emit('some:foreign:key', { junk: true })
    expect(Object.keys(cache.get())).not.toContain('some:foreign:key')
  })
})
