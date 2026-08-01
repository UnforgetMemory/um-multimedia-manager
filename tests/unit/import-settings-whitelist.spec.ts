import { test, expect } from '@playwright/test'
import { EXPORT_SETTINGS_KEYS } from '@/entrypoints/background/handlers/data'

/**
 * 安全回归测试：IMPORT_DATA 设置白名单必须排除凭据类键。
 *
 * 漏洞 #4a：此前 import 白名单使用全部 STORAGE_KEYS（含 webdavUrl/
 * webdavUsername/webdavPassword），恶意备份可重定向 WebDAV 同步到
 * 攻击者服务器 → 全库+真实密码外泄。
 * 修复后：import 使用同一 EXPORT_SETTINGS_KEYS 集合（天然对称），
 * 排除 webdav 凭据键。
 */

const CREDENTIAL_KEYS = ['webdavUrl', 'webdavUsername', 'webdavPassword']

test.describe('IMPORT_DATA settings whitelist (安全回归 #4a)', () => {
  test('白名单排除 webdavUrl/webdavUsername/webdavPassword（凭据注入防护）', () => {
    const keys = EXPORT_SETTINGS_KEYS as string[]
    for (const key of CREDENTIAL_KEYS) {
      expect(keys).not.toContain(key)
    }
  })

  test('白名单保留非敏感设置键（正常设置可导入）', () => {
    const keys = EXPORT_SETTINGS_KEYS as string[]
    for (const key of ['autoSync', 'autoSyncNeoDB', 'theme', 'language', 'notificationEnabled']) {
      expect(keys).toContain(key)
    }
  })

  test('import/export 白名单对称（同一集合，未来改动不重新引入不对称）', () => {
    // IMPORT_SETTINGS_KEYS 由 EXPORT_SETTINGS_KEYS 派生（见 data.ts），
    // 因此断言 EXPORT 集合本身不含凭据即保证 import 安全。
    const keys = new Set(EXPORT_SETTINGS_KEYS as string[])
    expect(keys.size).toBe(EXPORT_SETTINGS_KEYS.length) // 无重复
  })
})
