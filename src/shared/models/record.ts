/**
 * 记录模型模块
 * 负责媒体记录的验证、标准化、合并和隔离区管理
 */

import { Identity } from './identity';
import { Utils } from '../utils';
import type { Domain, Provider } from '../config';
import type { MediaRecord, QuarantineEntry } from '../types';

export const RecordModel = {
  /**
   * 获取隔离原因(仅针对 TV 记录)
   */
  getQuarantineReason(
    input: unknown,
    forcedDomain?: Domain | null,
    forcedProvider?: Provider | null,
  ): string {
    if (!input || typeof input !== 'object') {
      return 'invalid-record';
    }

    const obj = input as Record<string, unknown>
    const rawUrl = obj.url ? Identity.canonicalizeUrl(obj.url as string) : '';
    const inferred = rawUrl ? Identity.fromUrl(rawUrl) : null;
    const domain = forcedDomain || (obj.type as string) || inferred?.type || null;
    const provider = forcedProvider || (obj.provider as Provider) || inferred?.provider || null;

    // 只有 TV 域需要隔离检查
    if (domain !== 'tv') {
      return '';
    }

    if (!provider) {
      return 'missing-provider';
    }

    if (!rawUrl) {
      return 'missing-tv-url';
    }

    if (!inferred) {
      return 'unparseable-tv-url';
    }

    if (inferred.type !== 'tv' || inferred.provider !== provider) {
      return 'provider-url-mismatch';
    }

    // NeoDB TV 特殊检查
    if (provider === 'neodb' && (obj.providerId === 'season' || obj.providerId === 'episode')) {
      return 'broken-neodb-tv-provider-id';
    }

    if (/https:\/\/neodb\.social\/tv\/(?:season|episode)\/$/i.test(rawUrl)) {
      return 'broken-neodb-tv-url';
    }

    return '';
  },

  /**
   * 标准化记录
   * @returns 标准化的记录或 null(如果无效)
   */
  normalize(
    input: any,
    forcedDomain?: Domain | null,
    forcedProvider?: Provider | null,
  ): MediaRecord | null {
    if (!input || typeof input !== 'object') {
      return null;
    }

    const quarantineReason = this.getQuarantineReason(input, forcedDomain, forcedProvider);
    if (quarantineReason) {
      return null;
    }

    const canonicalUrl = input.url ? Identity.canonicalizeUrl(input.url) : '';
    const inferredIdentity = canonicalUrl ? Identity.fromUrl(canonicalUrl) : null;

    const domain = forcedDomain || input.type || inferredIdentity?.type || null;
    const provider = forcedProvider || input.provider || inferredIdentity?.provider || null;

    const providerId =
      inferredIdentity?.providerId
      || input.providerId
      || this.extractProviderId(domain as Domain, provider as Provider, canonicalUrl);

    // 添加输入验证：长度限制
    if (providerId && providerId.length > 200) {
      console.warn('[RecordModel] providerId too long, truncating')
      return null
    }

    // 验证 providerId 只包含安全字符（字母、数字、下划线、连字符、冒号）
    if (providerId && !/^[a-zA-Z0-9:_-]+$/.test(providerId)) {
      console.warn('[RecordModel] providerId contains invalid characters')
      return null
    }

    if (!domain || !provider || !providerId) {
      return null;
    }

    const url = canonicalUrl || Identity.buildUrl(domain as Domain, provider as Provider, providerId);
    if (!url) {
      return null;
    }

    // 验证 URL 长度
    if (url.length > 2048) {
      console.warn('[RecordModel] URL too long')
      return null
    }

    return {
      type: domain as string,
      provider: provider as Provider,
      providerId,
      url,
      status: Utils.normalizeStatus(input.status),
      rating: Utils.clampRating10(input.rating10 ?? input.rating ?? 0),
      updatedAt: input.updatedAt || input.lastUpdated || Utils.nowISO(),
    };
  },

  /**
   * 从 URL 提取 providerId
   */
  extractProviderId(domain: Domain | null, provider: Provider | null, url: string): string {
    if (!domain || !provider || !url) {
      return '';
    }
    return Identity.fromUrl(url)?.providerId || '';
  },

  /**
   * 转换为隔离区条目
   */
  toQuarantineEntry(
    input: any,
    forcedDomain?: Domain | null,
    forcedProvider?: Provider | null,
  ): QuarantineEntry | null {
    const quarantineReason = this.getQuarantineReason(input, forcedDomain, forcedProvider);
    if (!quarantineReason) {
      return null;
    }

    return {
      type: (forcedDomain || input?.type || 'tv') as string,
      provider: forcedProvider || input?.provider || '',
      providerId: String(input?.providerId || ''),
      url: input?.url ? Identity.canonicalizeUrl(input.url) : '',
      status: Utils.normalizeStatus(input?.status),
      rating: Utils.clampRating10(input?.rating10 ?? input?.rating ?? 0),
      updatedAt: input?.updatedAt || input?.lastUpdated || Utils.nowISO(),
      quarantineReason,
    };
  },

  /**
   * 将记录数组转换为 Map(providerId -> record)
   * 自动去重,保留最新的记录
   */
  toMap(
    records: any,
    forcedDomain?: Domain | null,
    forcedProvider?: Provider | null,
  ): Map<string, MediaRecord> {
    const map = new Map<string, MediaRecord>();
    const items = Utils.toArrayOfObjects(records);

    for (const item of items) {
      const normalized = this.normalize(item, forcedDomain, forcedProvider);
      if (!normalized) {
        continue;
      }

      const existing = map.get(normalized.providerId);
      if (!existing || (normalized.updatedAt && existing.updatedAt && normalized.updatedAt > existing.updatedAt)) {
        map.set(normalized.providerId, normalized);
      }
    }

    return map;
  },

  /**
   * 合并两个 Map
   * 对于相同的 providerId,保留更新时间更晚的记录
   */
  mergeMap(
    baseMap: Map<string, MediaRecord> | Iterable<readonly [string, MediaRecord]>,
    incoming: Map<string, MediaRecord> | any,
  ): Map<string, MediaRecord> {
    const merged = new Map(baseMap instanceof Map ? baseMap : []);
    const incomingMap = incoming instanceof Map ? incoming : this.toMap(incoming);

    for (const [providerId, record] of incomingMap.entries()) {
      const existing = merged.get(providerId);
      if (!existing || (record.updatedAt && existing.updatedAt && record.updatedAt >= existing.updatedAt)) {
        merged.set(providerId, record);
      }
    }

    return merged;
  },
};
