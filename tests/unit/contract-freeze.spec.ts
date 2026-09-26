import { test, expect } from '@playwright/test'
import { IDBFactory } from 'fake-indexeddb'
import {
  ADULT_STORES,
  BACKUP_STORES,
  DB_NAME,
  DB_VERSION,
  MediaDatabase,
  RECORD_STORES,
  STORE_NAMES,
} from '@/engine/database/models'
import {
  SEHUATANG_IDS_STORE_NAME,
  USAV_IDS_STORE_NAME,
  JAV_IDS_STORE_NAME,
  classifyAvId,
  extractBaseId,
  isTidTrackKey,
  isUsAvId,
  normalizeAvId,
  storeForAvIdKind,
} from '@/provider/adult-av/models'
import {
  DETAIL_STORE_NAME,
  SEHUATANG_CACHE_DB_NAME,
  SEHUATANG_CACHE_DB_VERSION,
} from '@/provider/sehuatang-cache/models'
import type {
  MessagePayloadMap,
  MessageType,
  ResponseMessageMap,
  SuccessDataMap,
} from '@/types/messages'

/**
 * 行为契约冻结（umpp W0.3 · ADR-026 D5）
 *
 * 全项目重写前锁死「对外可观测契约」。任何契约漂移——消息类型增删改名、
 * IDB store/index 变更、番号分类器行为变化、备份表清单变化——都会在此失败。
 * 这是 474 文件重写不丢行为的唯一保险。
 *
 * 与既有 spec 的分工（不重复）：
 * - `adult-av-models.spec.ts` 覆盖 normalizeAvId / extractBaseId / isTidTrackKey 的行为向量；
 * - `backup-stores.spec.ts` 覆盖 BACKUP_STORES 的长度与成员；
 * - `db-migration.spec.ts` 覆盖 v12→v14 的迁移行为与数据搬迁。
 *   本 spec 补的是**缺口**：完整的 MessageType 清单（原先零覆盖）、
 *   ADR-025 写入侧分类器矩阵（原先零覆盖）、v14 完整 schema 快照。
 *
 * 期望值全部来自**实测**（`.um.agents/tmp/contract-probe-adult-av.ts`），非推理得到。
 */

// ==================== 编译期断言工具 ====================

/** 编译期断言：T 必须为 true，否则本文件 type-check 失败（= 质量门禁失败） */
type Assert<T extends true> = T

// ==================== 1. 消息契约（wire contract） ====================

/**
 * 冻结的消息类型清单（33 项）。
 * 顺序与 `src/types/messages.ts` 的 `MessageType` 联合保持一致，便于人工比对。
 */
const FROZEN_MESSAGE_TYPES = [
  'SHOW_TOAST',
  'DB_GET',
  'DB_PUT',
  'DB_DELETE',
  'DB_GET_ALL',
  'DB_GET_BULK',
  'DB_GET_WATCHED_IDS',
  'DB_SYNC_PAGE_RECORD',
  'PT_ID_CACHE_GET',
  'PT_ID_CACHE_PUT',
  'PT_ID_CACHE_GET_BULK',
  'GET_SETTINGS',
  'UPDATE_SETTINGS',
  'EXPORT_DATA',
  'IMPORT_DATA',
  'GET_ALL_RECORDS',
  'GET_STATISTICS',
  'HEALTH_CHECK',
  'GET_MIGRATION_STATUS',
  'ADULT_AV_CHECK',
  'ADULT_AV_CHECK_BATCH',
  'ADULT_AV_ADD',
  'ADULT_AV_BATCH_ADD',
  'ADULT_AV_GET_ALL',
  'ADULT_AV_STATS',
  'DOWNLOAD_FILE',
  'WEBDAV_TEST',
  'WEBDAV_UPLOAD',
  'WEBDAV_DOWNLOAD',
  'WEBDAV_SYNC',
  'NEODB_PUSH_RATING',
  'SEHUATANG_CACHE_GET_BATCH',
  'SEHUATANG_CACHE_PUT',
] as const

/**
 * 冻结的「无 payload」消息类型（8 项）。
 *
 * 注意 `ADULT_AV_STATS` 的 payload 声明为 `Record<never, never>` 而非 `void`，
 * 因此 `RuntimeMessageEnvelope` 会要求它带 `payload`；`WEBDAV_TEST` 声明为
 * `{…} | undefined` 同理。二者**不是** void 成员——这是既有形态，冻结不改。
 */
const FROZEN_VOID_PAYLOAD_TYPES = [
  'GET_SETTINGS',
  'GET_ALL_RECORDS',
  'GET_STATISTICS',
  'HEALTH_CHECK',
  'GET_MIGRATION_STATUS',
  'WEBDAV_UPLOAD',
  'WEBDAV_DOWNLOAD',
  'WEBDAV_SYNC',
] as const

type FrozenMessageType = (typeof FROZEN_MESSAGE_TYPES)[number]
type FrozenVoidPayloadType = (typeof FROZEN_VOID_PAYLOAD_TYPES)[number]

/** payload 声明为 void 的消息类型（由类型系统推导，用于与冻结清单对账）。 */
type VoidPayloadMessageType = {
  [K in MessageType]: [MessagePayloadMap[K]] extends [void] ? K : never
}[MessageType]

// —— 类型级契约断言（新增/删除任何一个 MessageType 都会在此编译失败）——
type TMsgNoMissing = Assert<[Exclude<MessageType, FrozenMessageType>] extends [never] ? true : false>
type TMsgNoExtra = Assert<[Exclude<FrozenMessageType, MessageType>] extends [never] ? true : false>
type TPayloadCoverage = Assert<
  [Exclude<MessageType, keyof MessagePayloadMap>] extends [never] ? true : false
>
type TResponseCoverage = Assert<
  [Exclude<MessageType, keyof ResponseMessageMap>] extends [never] ? true : false
>
type TSuccessCoverage = Assert<
  [Exclude<MessageType, keyof SuccessDataMap>] extends [never] ? true : false
>
type TVoidNoMissing = Assert<
  [Exclude<VoidPayloadMessageType, FrozenVoidPayloadType>] extends [never] ? true : false
>
type TVoidNoExtra = Assert<
  [Exclude<FrozenVoidPayloadType, VoidPayloadMessageType>] extends [never] ? true : false
>
// —— 反向包含：映射表不得存在 MessageType 之外的「多余键」 ——
// （只做 MessageType ⊆ keyof Map 是单向的，遗留/多余的映射项不会被发现）
type TPayloadNoExtra = Assert<
  [Exclude<keyof MessagePayloadMap, MessageType>] extends [never] ? true : false
>
type TResponseNoExtra = Assert<
  [Exclude<keyof ResponseMessageMap, MessageType>] extends [never] ? true : false
>
type TSuccessNoExtra = Assert<
  [Exclude<keyof SuccessDataMap, MessageType>] extends [never] ? true : false
>

test.describe('契约冻结 · 消息协议', () => {
  test('编译期断言：MessageType 与三张映射表双向严格对齐（失败即 type-check 不通过）', () => {
    const typeChecks: [
      TMsgNoMissing,
      TMsgNoExtra,
      TPayloadCoverage,
      TPayloadNoExtra,
      TResponseCoverage,
      TResponseNoExtra,
      TSuccessCoverage,
      TSuccessNoExtra,
      TVoidNoMissing,
      TVoidNoExtra,
    ] = [true, true, true, true, true, true, true, true, true, true]
    expect(typeChecks.every((v) => v === true)).toBe(true)
  })

  test('MessageType 清单冻结为 33 项且无重复', () => {
    expect(FROZEN_MESSAGE_TYPES).toHaveLength(33)
    expect(new Set<string>(FROZEN_MESSAGE_TYPES).size).toBe(33)
  })

  test('无 payload 的消息类型冻结为 8 项', () => {
    expect(FROZEN_VOID_PAYLOAD_TYPES).toHaveLength(8)
    expect(new Set<string>(FROZEN_VOID_PAYLOAD_TYPES).size).toBe(8)
  })
})

// ==================== 2. ADR-025 写入侧分类器（三表互斥） ====================

/**
 * 分类矩阵（实测值）。
 * `classifyAvId` 的输入契约 = `normalizeAvId` 之后的**裸 id**（无 `source::` 前缀）；
 * `isTidTrackKey` 的输入契约 = **完整 store 键**（含 `source::` 前缀）。
 * 两者域不同，不可互换——这是最容易误用的地方，故在此显式锁定。
 */
const CLASSIFY_MATRIX: ReadonlyArray<readonly [id: string, kind: 'jp' | 'us' | 'tid', store: string]> = [
  ['SSIS-001', 'jp', JAV_IDS_STORE_NAME],
  ['FC2PPV-44580', 'jp', JAV_IDS_STORE_NAME],
  ['YAG-1233-UC', 'jp', JAV_IDS_STORE_NAME],
  ['TID-3664524', 'tid', SEHUATANG_IDS_STORE_NAME],
  ['BIGTITSROUNDASSES.23.06.10', 'us', USAV_IDS_STORE_NAME],
  ['BLACKED.RAW.21.03.09', 'us', USAV_IDS_STORE_NAME],
]

test.describe('契约冻结 · 番号三表分类器（ADR-025 写入侧单一分类点）', () => {
  for (const [id, kind, store] of CLASSIFY_MATRIX) {
    test(`classifyAvId(${id}) → ${kind} → ${store}`, () => {
      expect(classifyAvId(id)).toBe(kind)
      expect(storeForAvIdKind(classifyAvId(id))).toBe(store)
    })
  }

  test('分类器的输入契约是归一化裸 id，不是完整 store 键', () => {
    // 裸 TID 键 → tid 表
    expect(classifyAvId('TID-3664524')).toBe('tid')
    // 带 source 前缀的完整键**不是**分类器域，会被判为默认 jp（文档化行为，勿改）
    expect(classifyAvId('sehuatang::TID-1')).toBe('jp')
    // TID-abc 非数字后缀 → 不构成 TID 键
    expect(classifyAvId('TID-abc')).toBe('jp')
  })

  test('isTidTrackKey 的输入契约是完整 store 键', () => {
    expect(isTidTrackKey('sehuatang::TID-3664524')).toBe(true)
    expect(isTidTrackKey('javdb::TID-1')).toBe(true)
    expect(isTidTrackKey('TID-3664524')).toBe(false)
  })

  test('isUsAvId 边界（实测：无月/日范围校验）', () => {
    // 正向
    expect(isUsAvId('BIGTITSROUNDASSES.23.06.10')).toBe(true)
    expect(isUsAvId('BLACKED.RAW.21.03.09')).toBe(true)
    expect(isUsAvId('V2.23.06.10')).toBe(true)
    // 反向
    expect(isUsAvId('SSIS-001')).toBe(false)
    expect(isUsAvId('23.06.10')).toBe(false) // 首段必须含字母/数字且非纯日期起始
    expect(isUsAvId('.23.06.10')).toBe(false)
    expect(isUsAvId('X.23.6.10')).toBe(false) // 段宽必须 2 位
    // ⚠️ 已确认的既有语义：仅校验段宽，**不校验**月 01-12 / 日 01-31
    //    （与 .um.agents 决策日志中「月/日校验挡误报」的记载不符，属文档漂移）
    expect(isUsAvId('X.23.13.10')).toBe(true) // 月 13 仍通过
    expect(isUsAvId('X.23.06.32')).toBe(true) // 日 32 仍通过
    expect(isUsAvId('X.99.99.99')).toBe(true)
  })

  test('normalizeAvId 是分类器的前置归一化（大写 + 空格转连字符）', () => {
    expect(normalizeAvId(' ssIS 001 ')).toBe('SSIS-001')
    expect(normalizeAvId('A  B')).toBe('A-B')
  })

  test('extractBaseId 去除版本后缀（大小写不敏感，保留原大小写）', () => {
    expect(extractBaseId('YAG-1233')).toBe('YAG-1233')
    expect(extractBaseId('YAG-1233-UC')).toBe('YAG-1233')
    expect(extractBaseId('YAG-1233-U')).toBe('YAG-1233')
    expect(extractBaseId('YAG-1233-CU')).toBe('YAG-1233')
    expect(extractBaseId('YAG-1233-C')).toBe('YAG-1233')
    expect(extractBaseId('YAG-1233-UX')).toBe('YAG-1233-UX')
    // 已知行为：不做大写归一（输入小写则输出小写）——冻结，勿在重写中"顺手修正"
    expect(extractBaseId('yag-1233-u')).toBe('yag-1233')
  })
})

// ==================== 3. 主库 schema（IndexedDB v14） ====================

const EXPECTED_FRESH_SCHEMA: ReadonlyArray<readonly [store: string, indexes: string[]]> = [
  ['bangumi_records', ['status', 'updatedAt']],
  ['bilibili_records', ['status', 'updatedAt']],
  ['douban_records', ['status', 'updatedAt']],
  ['imdb_records', ['status', 'updatedAt']],
  ['jav_ids', ['updatedAt']],
  ['neodb_records', ['status', 'updatedAt']],
  ['pt_id_cache', ['updatedAt']],
  ['sehuatang_ids', ['updatedAt']],
  ['tmdb_records', ['status', 'updatedAt']],
  ['ttl_cache', ['expiry']],
  ['usav_ids', ['updatedAt']],
  ['youtube_records', ['status', 'updatedAt']],
]

interface StoreSnapshot {
  name: string
  indexes: string[]
}

/** 以同版本另开一条连接读取 schema（MediaDatabase.db 为 private，故走独立连接）。 */
function readSchemaSnapshot(): Promise<StoreSnapshot[]> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      reject(new Error('快照必须观测已存在的 v14 库，不应触发 upgrade'))
    }
    req.onsuccess = () => {
      const db = req.result
      const snapshot = Array.from(db.objectStoreNames)
        .sort()
        .map((name) => {
          const tx = db.transaction(name, 'readonly')
          return { name, indexes: Array.from(tx.objectStore(name).indexNames).sort() }
        })
      db.close()
      resolve(snapshot)
    }
    req.onerror = () => reject(req.error)
  })
}

test.describe('契约冻结 · 主库 schema（v14）', () => {
  test('库名与版本常量冻结', () => {
    expect(DB_NAME).toBe('umm-media-db')
    expect(DB_VERSION).toBe(14)
  })

  test('store 分组常量冻结：记录表 7 + 成人表 3 + 备份白名单 10', () => {
    expect(RECORD_STORES).toHaveLength(7)
    expect(ADULT_STORES).toEqual([STORE_NAMES.JAV_IDS, STORE_NAMES.USAV_IDS, STORE_NAMES.SEHUATANG_IDS])
    expect(BACKUP_STORES).toHaveLength(10)
  })

  test('fresh v14 完整 schema 快照（12 store + 各自索引集合）', async () => {
    ;(globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()

    const mdb = new MediaDatabase()
    await mdb.init()
    mdb.close()

    const snapshot = await readSchemaSnapshot()
    const expected = EXPECTED_FRESH_SCHEMA.map(([name, indexes]) => ({ name, indexes }))

    expect(snapshot).toEqual(expected)
    expect(snapshot).toHaveLength(12)
  })

  test('fresh 安装不携带遗留死 store（sehuatang_avids / sync_logs）', async () => {
    ;(globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()

    const mdb = new MediaDatabase()
    await mdb.init()
    mdb.close()

    const snapshot = await readSchemaSnapshot()
    const names = snapshot.map((s) => s.name)
    expect(names).not.toContain('sehuatang_avids')
    expect(names).not.toContain('sync_logs')
  })
})

// ==================== 4. 色花堂详情缓存库 schema ====================

test.describe('契约冻结 · 色花堂详情缓存库（可重建，不进备份）', () => {
  test('库名/版本/store 名与主键冻结', () => {
    expect(SEHUATANG_CACHE_DB_NAME).toBe('umm-sehuatang-cache')
    expect(SEHUATANG_CACHE_DB_VERSION).toBe(1)
    expect(DETAIL_STORE_NAME).toBe('details')
  })

  test('缓存库不得进入备份白名单（与 sehuatang_ids 用户数据严格区分）', () => {
    expect(BACKUP_STORES).not.toContain(SEHUATANG_CACHE_DB_NAME)
    expect(BACKUP_STORES).not.toContain(DETAIL_STORE_NAME)
    // 而站点内已看记录（用户数据）必须在白名单内
    expect(BACKUP_STORES).toContain(STORE_NAMES.SEHUATANG_IDS)
  })
})
