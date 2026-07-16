/**
 * URL 身份识别与路由模式共享模块
 *
 * Consolidates URL handling for the UMM extension:
 * - Identity extraction (fromUrl / buildUrl / canonicalizeUrl)
 * - Route pattern constants used by content script router and matches
 *
 * URL parsing logic delegates to the domain Identity class
 * (src/domain/identity/Identity.ts) to eliminate duplication.
 * This file provides the UrlIdentity DTO adapter + PT site helpers
 * for backward compatibility with content script consumers.
 */

import { Identity as DomainIdentity } from '@/domain/identity/Identity';
import { Platform } from '@/domain/platform/Platform';
import { MediaType } from '@/domain/platform/MediaType';
import type { Provider } from '@/config';
import type { UrlIdentity } from '@/types';

// ==================== Route Pattern Constants ====================

/** PT site hostnames used in both route matching and Dimmer */
export const PT_HOSTS = [
  'audiences.me',
  'hdhome.org',
  'hdarea.club',
  'ourbits.club',
  'pterclub.net',
  'pthome.net',
  'haidan.cc',
  'ptsbao.club',
  'pt.btschool.club',
  'discfan.net',
  'hhanclub.net',
  'hddolby.com',
  'hdfans.org',
  'pt.soulvoice.club',
  'hdtime.org',
  'piggo.me',
] as const;

/** M-Team subdomains */
export const MTEAM_HOSTS = ['kp.m-team.cc', 'next.m-team.cc', 'www.m-team.cc'] as const;

/**
 * Check whether a URL belongs to any PT site.
 */
export function isPTSite(url: string): boolean {
  return PT_HOSTS.some(h => url.includes(h)) || MTEAM_HOSTS.some(h => url.includes(h));
}

/**
 * Check whether a URL is a PT detail page.
 */
export function isPTDetailPage(url: string): boolean {
  if (url.includes('m-team.cc/detail') && !url.includes('/browse')) return true;
  return PT_HOSTS.some(h => url.includes(h)) && url.includes('details.php');
}

/**
 * Check whether a URL is a PT torrent listing page.
 */
export function isPTListPage(url: string): boolean {
  if (url.includes('m-team.cc') && (url.includes('/browse') || url.includes('#/browse'))) return true;
  return PT_HOSTS.some(h => url.includes(`/${h}/torrents.php`) || url.includes(`/${h}/videos.php`));
}

// ==================== Identity Object (UrlIdentity DTO adapter) ====================

export const Identity = {
  /**
   * 创建身份信息对象
   */
  make(
    type: string,
    provider: Provider,
    providerId: string,
    urlOverride = '',
  ): UrlIdentity | null {
    if (!type || !provider || !providerId) {
      return null;
    }
    const url = this.canonicalizeUrl(urlOverride || this.buildUrl(type, provider, providerId));
    if (!url) {
      return null;
    }
    return { type, provider, providerId, url };
  },

  /**
   * URL 标准化处理
   * Delegates to the domain Identity class for canonicalization.
   */
  canonicalizeUrl(rawUrl: string): string {
    return DomainIdentity.canonicalizeUrl(rawUrl);
  },

  /**
   * Build a NeoDB URL from a type and catalog UUID, handling prefixed UUIDs.
   * NeoDB TV catalog UUIDs use prefixes: show:, season:, episode:
   * These must be converted to path segments: /tv/{id}/, /tv/season/{id}/
   * Delegates to the domain Identity.buildNeoDBUrl().
   */
  buildNeoDBUrl(type: string, catalogUuid: string): string {
    return DomainIdentity.buildNeoDBUrl(type, catalogUuid);
  },

  /**
   * 根据 type/provider/providerId 构建标准 URL
   * Delegates to the domain Identity.buildCanonicalUrl().
   */
  buildUrl(type: string, provider: Provider, providerId: string): string {
    if (!providerId) {
      return '';
    }

    const platform = Platform.fromString(provider);
    const mediaType = MediaType.fromString(type);
    if (!platform || !mediaType) {
      return '';
    }

    return DomainIdentity.buildCanonicalUrl(platform, mediaType, providerId);
  },

  /**
   * 从 URL 解析身份信息
   * Delegates to the domain Identity.fromUrl(), then converts to UrlIdentity DTO.
   */
  fromUrl(url: string): UrlIdentity | null {
    const identity = DomainIdentity.fromUrl(url);
    if (!identity) {
      return null;
    }
    return {
      type: identity.type.id,
      provider: identity.platform.id,
      providerId: identity.providerId,
      url: identity.url,
    };
  },
};
