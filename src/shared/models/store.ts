/**
 * Store 存储层（Legacy）
 * 
 * 负责管理所有数据的持久化和缓存
 * - chrome.storage.local/sync 适配
 * - 内存缓存机制
 * - 数据集管理
 * - 隔离区管理
 * - 设置管理
 * - TTL 过期缓存
 * 
 * @note 此文件保留用于向后兼容，新项目建议使用 StoreAdapter
 */

import { DATASETS, VERSION } from '../config';
import type { Domain, Provider } from '../config';
import type { MediaRecord, QuarantineEntry, AppSettings, ExportData, StorageValue } from '../types';
import { RecordModel } from './record';

// ==================== 内部类型定义 ====================

interface CacheItem<T> {
  value: T;
  expiresAt?: number;
}

type DatasetKey = `${string}:${Provider}`;

// ==================== 常量定义 ====================

const STORAGE_KEYS = {
  SETTINGS: 'umm:v2:settings',
  QUARANTINE: 'umm:v2:quarantine',
  EXPORT_TIMESTAMP: 'umm:v2:exportTimestamp',
} as const;

// ==================== 密码加密工具函数 ====================

/**
 * 简单加密 WebDAV 密码
 * 注意：当前使用 Base64 编码作为过渡方案，防止明文存储
 * TODO: 未来应升级为真正的加密（如 Web Crypto API AES-GCM）
 */
function encryptPassword(password: string): string {
  if (!password) return ''
  // Base64 编码（非加密，但可防止肉眼直接看到明文）
  try {
    return btoa(encodeURIComponent(password))
  } catch (e) {
    console.error('[Store] Password encryption failed:', e)
    return password // 降级：返回原始值
  }
}

/**
 * 解密 WebDAV 密码
 * 向后兼容：如果密码未加密，则直接返回
 */
function decryptPassword(encoded: string): string {
  if (!encoded) return ''
  try {
    // 尝试解码
    return decodeURIComponent(atob(encoded))
  } catch (e) {
    // 如果解码失败，可能是未加密的旧数据，直接返回
    console.warn('[Store] Password decryption failed, assuming plaintext')
    return encoded
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  webdavUrl: '',
  webdavUsername: '',
  webdavPassword: '',
  neodbToken: '',
  autoSync: false,  // ✅ 默认禁用自动同步，所有同步操作由用户手动触发
  syncInterval: 30,
  theme: 'auto',
  language: 'zh-CN',
  notificationEnabled: true,
  quarantineAutoClean: true,
  quarantineRetentionDays: 7,
};

// ==================== 状态变量 ====================

let _datasetCache: Map<DatasetKey, Map<string, MediaRecord>> = new Map()
let _quarantineCache: Map<string, QuarantineEntry> = new Map()
let _settingsCache: AppSettings | null = null
let _ttlCache: Map<string, CacheItem<any>> = new Map()
let _initialized = false

// 并发写入锁
const writeLocks = new Map<string, Promise<void>>()

// ==================== 辅助函数 ====================

/**
 * 生成数据集键
 */
function makeDatasetKey(type: string, provider: Provider): DatasetKey {
  return `${type}:${provider}`;
}

/**
 * 从 chrome.storage 读取数据
 */
async function storageGet<T>(key: string): Promise<T | undefined> {
  try {
    if (!chrome.storage?.local) {
      console.warn('[Store] chrome.storage not available (not running in extension context)');
      return undefined;
    }
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  } catch (error) {
    console.error(`[Store] Failed to get ${key}:`, error);
    return undefined;
  }
}

/**
 * 向 chrome.storage 写入数据
 */
async function storageSet(key: string, value: StorageValue): Promise<void> {
  try {
    if (!chrome.storage?.local) {
      console.warn('[Store] chrome.storage not available (not running in extension context)');
      return;
    }
    await chrome.storage.local.set({ [key]: value });
  } catch (error) {
    console.error(`[Store] Failed to set ${key}:`, error);
    throw error;
  }
}

/**
 * 从 chrome.storage 移除数据
 */
async function storageRemove(key: string): Promise<void> {
  try {
    if (!chrome.storage?.local) {
      console.warn('[Store] chrome.storage not available (not running in extension context)');
      return;
    }
    await chrome.storage.local.remove(key);
  } catch (error) {
    console.error(`[Store] Failed to remove ${key}:`, error);
  }
}

/**
 * 将 Map 转换为可序列化的对象
 */
function mapToSerializable<K extends string, V>(map: Map<K, V>): Record<K, V> {
  const obj: any = {};
  map.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}

/**
 * 将可序列化对象转换为 Map
 */
function serializableToMap<K extends string, V>(obj: Record<K, V> | undefined): Map<K, V> {
  const map = new Map<K, V>();
  if (obj) {
    Object.entries(obj).forEach(([key, value]) => {
      map.set(key as K, value as V);
    });
  }
  return map;
}

// ==================== 初始化 ====================

/**
 * 初始化 Store
 */
export async function initialize(): Promise<void> {
  if (_initialized) return;

  // 加载设置
  const settings = await storageGet<AppSettings>(STORAGE_KEYS.SETTINGS);
  _settingsCache = settings ? { ...DEFAULT_SETTINGS, ...settings } : { ...DEFAULT_SETTINGS };

  // 加载隔离区
  const quarantine = await storageGet<Record<string, QuarantineEntry>>(STORAGE_KEYS.QUARANTINE);
  _quarantineCache = serializableToMap(quarantine);

  _initialized = true;
  console.log('[Store] Initialized');
}

// ==================== 数据集操作 ====================

/**
 * 获取数据集 Map
 */
export async function getDatasetMap(
  type: string,
  provider: Provider
): Promise<Map<string, MediaRecord>> {
  await ensureInitialized();

  const key = makeDatasetKey(type, provider);
    
  // 检查缓存
  if (_datasetCache.has(key)) {
    return _datasetCache.get(key)!
  }
  
  // 从 storage 加载
  const domainDatasets = DATASETS[type as keyof typeof DATASETS];
  const storageKey = (domainDatasets as any)[provider];
  const data = await storageGet<Record<string, MediaRecord>>(storageKey);
  const map = serializableToMap(data);

  // 更新缓存
  _datasetCache.set(key, map);

  return map;
}

/**
 * 设置数据集 Map
 */
export async function setDatasetMap(
  type: string,
  provider: Provider,
  value: Map<string, MediaRecord>
): Promise<Map<string, MediaRecord>> {
  await ensureInitialized();

  const key = makeDatasetKey(type, provider);
  const domainDatasets = DATASETS[type as keyof typeof DATASETS];
  const storageKey = (domainDatasets as any)[provider];

  // 保存到 storage
  await storageSet(storageKey, mapToSerializable(value));

  // 更新缓存
  _datasetCache.set(key, value);

  return value;
}

/**
 * 清空数据集缓存
 */
export function clearDatasetCache(): void {
  _datasetCache.clear();
}

// ==================== 隔离区操作 ====================

/**
 * 获取隔离区 Map
 */
export async function getQuarantineMap(): Promise<Map<string, QuarantineEntry>> {
  await ensureInitialized();
  return _quarantineCache;
}

/**
 * 添加记录到隔离区
 */
export async function addQuarantineRecords(
  records: Array<{ record: any; reason: string }>
): Promise<Map<string, QuarantineEntry>> {
  await ensureInitialized();

  for (const { record, reason } of records) {
    const entry = RecordModel.toQuarantineEntry(record, (reason || '') as any);
    if (entry) {
      _quarantineCache.set(entry.providerId, entry);
    }
  }

  // 持久化
  await saveQuarantine();

  return _quarantineCache;
}

/**
 * 保存隔离区到 storage
 */
async function saveQuarantine(): Promise<void> {
  await storageSet(STORAGE_KEYS.QUARANTINE, mapToSerializable(_quarantineCache));
}

/**
 * 清空隔离区
 */
export async function clearQuarantine(): Promise<void> {
  await ensureInitialized();
  _quarantineCache.clear();
  await storageRemove(STORAGE_KEYS.QUARANTINE);
}

// ==================== 批量操作 ====================

/**
 * 批量合并记录
 */
export async function bulkMerge(
  domain: Domain,
  provider: Provider,
  incoming: any[]
): Promise<Map<string, MediaRecord>> {
  await ensureInitialized();

  // 标准化输入(仅用于验证)
  incoming.map((item) => RecordModel.normalize(item));

  // 分离有效记录和隔离记录
  const validRecords: MediaRecord[] = [];
  const quarantineRecords: Array<{ record: any; reason: string }> = [];

  for (const item of incoming) {
    const normalized = RecordModel.normalize(item);
    if (normalized) {
      validRecords.push(normalized);
    } else {
      const reason = RecordModel.getQuarantineReason(item, domain);
      if (reason) {
        quarantineRecords.push({ record: item, reason });
      }
    }
  }

  // 添加到隔离区
  if (quarantineRecords.length > 0) {
    await addQuarantineRecords(quarantineRecords);
  }

  // 合并到现有数据集
  const existingMap = await getDatasetMap(domain, provider);
  const mergedMap = RecordModel.mergeMap(existingMap, validRecords);

  // 保存
  await setDatasetMap(domain, provider, mergedMap);

  return mergedMap;
}

/**
 * 插入或更新单条记录
 */
export async function upsertRecord(record: MediaRecord): Promise<boolean> {
  await ensureInitialized()

  // 验证记录
  const normalized = RecordModel.normalize(record)
  if (!normalized) {
    return false
  }

  const lockKey = `${normalized.type}:${normalized.provider}`
  
  // 等待之前的写操作完成
  if (writeLocks.has(lockKey)) {
    await writeLocks.get(lockKey)
  }

  // 创建新的写锁
  const writePromise = (async () => {
    // 获取当前数据集
    const map = await getDatasetMap(normalized.type, normalized.provider)
    map.set(normalized.providerId, normalized)

    // 保存
    await setDatasetMap(normalized.type, normalized.provider, map)
  })()

  writeLocks.set(lockKey, writePromise)
  
  try {
    await writePromise
    return true
  } finally {
    writeLocks.delete(lockKey)
  }
}

// ==================== 设置管理 ====================

/**
 * 获取设置
 */
export async function getSettings(): Promise<AppSettings> {
  await ensureInitialized();
  
  // 返回副本，并解密密码
  const settings = { ..._settingsCache! };
  if (settings.webdavPassword) {
    settings.webdavPassword = decryptPassword(settings.webdavPassword);
  }
  
  return settings;
}

/**
 * 更新设置
 */
export async function setSettings(nextSettings: Partial<AppSettings>): Promise<AppSettings> {
  await ensureInitialized();

  const updated = { ..._settingsCache!, ...nextSettings };
  
  // 如果更新了密码，进行加密处理
  if (nextSettings.webdavPassword !== undefined) {
    updated.webdavPassword = encryptPassword(nextSettings.webdavPassword);
  }
  
  _settingsCache = updated;

  // 持久化
  await storageSet(STORAGE_KEYS.SETTINGS, updated);

  return updated;
}

// ==================== ID Set 管理 ====================

/**
 * 获取 ID Set
 */
export async function getIdSet(
  domain: Domain,
  provider: Provider
): Promise<Set<string>> {
  const map = await getDatasetMap(domain, provider);
  return new Set(map.keys());
}

/**
 * 设置 ID Set
 */
export async function setIdSet(
  domain: Domain,
  provider: Provider,
  ids: Set<string>
): Promise<void> {
  const map = await getDatasetMap(domain, provider);
  
  // 清除不在新集合中的记录
  for (const key of map.keys()) {
    if (!ids.has(key)) {
      map.delete(key);
    }
  }

  // 添加新记录（占位）
  for (const id of ids) {
    if (!map.has(id)) {
      map.set(id, {
        type: domain,
        provider,
        providerId: id,
        url: '',
        status: 0,  // CONFIG.STATUS.NONE = 0
        rating: 0,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  await setDatasetMap(domain, provider, map);
}

// ==================== 导入导出 ====================

/**
 * 导出结构化数据
 */
export async function exportStructuredData(): Promise<ExportData> {
  await ensureInitialized();

  const exportData: ExportData = {
    schema: 'umm-export',
    version: VERSION,
    exportedAt: new Date().toISOString(),
    datasets: {},
    quarantine: [],
    settings: await getSettings(),
  };

  // 导出所有数据集
  for (const domain of Object.keys(DATASETS) as Domain[]) {
    (exportData.datasets as any)[domain] = {};
    const providers = DATASETS[domain as keyof typeof DATASETS];
    for (const provider of Object.keys(providers) as Provider[]) {
      const map = await getDatasetMap(domain, provider);
      (exportData.datasets as any)[domain][provider] = Array.from(map.values());
    }
  }

  // 导出隔离区
  exportData.quarantine = Array.from(_quarantineCache.values());

  // 记录导出时间
  await storageSet(STORAGE_KEYS.EXPORT_TIMESTAMP, exportData.exportedAt);

  return exportData;
}

/**
 * 导入结构化数据
 */
export async function importStructuredData(payload: ExportData): Promise<void> {
  await ensureInitialized();

  // 验证版本
  if (payload.version !== VERSION) {
    console.warn(`[Store] Version mismatch: expected ${VERSION}, got ${payload.version}`);
  }

  // 导入数据集
  for (const [domain, providers] of Object.entries(payload.datasets)) {
    for (const [provider, records] of Object.entries(providers)) {
      const map = RecordModel.toMap(records);
      await setDatasetMap(domain as Domain, provider as Provider, map);
    }
  }

  // 导入隔离区
  if (payload.quarantine && payload.quarantine.length > 0) {
    _quarantineCache = RecordModel.toMap(payload.quarantine) as any;
    await saveQuarantine();
  }

  // 导入设置
  if (payload.settings) {
    _settingsCache = { ...DEFAULT_SETTINGS, ...payload.settings };
    await storageSet(STORAGE_KEYS.SETTINGS, _settingsCache);
  }

  console.log('[Store] Data imported successfully');
}

// ==================== 工具函数 ====================

/**
 * 确保已初始化
 */
async function ensureInitialized(): Promise<void> {
  if (!_initialized) {
    await initialize();
  }
}

/**
 * 清空所有缓存
 */
export async function invalidateAll(): Promise<void> {
  _datasetCache.clear();
  _quarantineCache.clear();
  _settingsCache = null;
  _ttlCache.clear();
  _initialized = false;
}

/**
 * 获取存储使用情况
 */
export async function getStorageUsage(): Promise<{
  local: number;
  sync: number;
}> {
  try {
    if (!chrome.storage?.local) {
      console.warn('[Store] chrome.storage not available');
      return { local: 0, sync: 0 };
    }
    const usage = await chrome.storage.local.getBytesInUse();
    return {
      local: usage,
      sync: 0, // Manifest V3 中 sync 存储可能不可用
    };
  } catch (error) {
    console.error('[Store] Failed to get storage usage:', error);
    return { local: 0, sync: 0 };
  }
}

// ==================== TTL 过期缓存 ====================

/**
 * 添加 ID 到集合
 */
export async function addIdToSet(key: string, id: string): Promise<void> {
  await ensureInitialized();
  
  const raw = await storageGet<string[]>(key);
  const set = new Set(raw || []);
  set.add(id);
  
  await storageSet(key, Array.from(set));
}

/**
 * 获取 ID 集合
 */
export async function getIdSetByKey(key: string): Promise<Set<string>> {
  await ensureInitialized();
  
  const raw = await storageGet<string[]>(key);
  return new Set(raw || []);
}

/**
 * 添加带 TTL 的 ID（用于未看缓存）
 */
export async function addExpiringId(
  key: string,
  id: string,
  ttlMs: number
): Promise<void> {
  await ensureInitialized();
  
  const expiresAt = Date.now() + ttlMs;
  _ttlCache.set(`${key}:${id}`, { value: id, expiresAt });
  
  // 持久化到 storage
  const raw = await storageGet<Record<string, number>>(key);
  const map = raw || {};
  map[id] = expiresAt;
  await storageSet(key, map);
}

/**
 * 获取过期 Map
 */
export async function getExpiringMap(key: string): Promise<Map<string, number>> {
  await ensureInitialized();
  
  // 先检查内存缓存
  const result = new Map<string, number>();
  const now = Date.now();
  
  for (const [cacheKey, item] of _ttlCache.entries()) {
    if (cacheKey.startsWith(`${key}:`)) {
      if (item.expiresAt && item.expiresAt > now) {
        const id = cacheKey.substring(key.length + 1);
        result.set(id, item.expiresAt);
      } else {
        // 已过期，删除
        _ttlCache.delete(cacheKey);
      }
    }
  }
  
  // 从 storage 加载
  const raw = await storageGet<Record<string, number>>(key);
  if (raw) {
    for (const [id, expiresAt] of Object.entries(raw)) {
      if (expiresAt > now) {
        result.set(id, expiresAt);
        _ttlCache.set(`${key}:${id}`, { value: id, expiresAt });
      }
    }
  }
  
  return result;
}

/**
 * 删除过期 ID
 */
export async function deleteExpiringId(key: string, id: string): Promise<void> {
  await ensureInitialized();
  
  _ttlCache.delete(`${key}:${id}`);
  
  const raw = await storageGet<Record<string, number>>(key);
  if (raw) {
    delete raw[id];
    await storageSet(key, raw);
  }
}
