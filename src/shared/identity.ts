/**
 * URL 身份识别与路由模式共享模块
 *
 * Consolidates URL handling for the UMM extension:
 * - Identity extraction (fromUrl / buildUrl / canonicalizeUrl)
 * - Route pattern constants used by content script router and matches
 *
 * Previously split across src/features/identity/models.ts and inline in router.ts.
 */

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

// ==================== Identity Object ====================

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
   * - 移除 hash 和 search 参数
   * - 规范化路径(去除多余斜杠)
   * - 确保以 / 结尾
   */
  canonicalizeUrl(rawUrl: string): string {
    if (!rawUrl) {
      return '';
    }
    try {
      const url = new URL(String(rawUrl));
      url.hash = '';
      url.search = '';
      url.pathname = url.pathname.replace(/\/{2,}/g, '/');
      if (!url.pathname.endsWith('/')) {
        url.pathname += '/';
      }
      return url.toString();
    } catch (_error) {
      // 如果 URL 解析失败,尝试简单规范化
      return this.normalizeUrlFallback(rawUrl);
    }
  },

  /**
   * URL 解析失败的降级处理
   */
  normalizeUrlFallback(rawUrl: string): string {
    let url = String(rawUrl).trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    return url;
  },

  /**
   * 根据 type/provider/providerId 构建标准 URL
   */
  buildUrl(type: string, provider: Provider, providerId: string): string {
    if (!providerId) {
      return '';
    }

    // 豆瓣电影
    if (provider === 'douban' && type === 'movie') {
      return `https://movie.douban.com/subject/${providerId}/`;
    }

    // 豆瓣音乐
    if (provider === 'douban' && type === 'music') {
      return `https://music.douban.com/subject/${providerId}/`;
    }

    // IMDB
    if (provider === 'imdb' && type === 'movie') {
      return `https://www.imdb.com/title/${providerId}/`;
    }

    // NeoDB 电影
    if (provider === 'neodb' && type === 'movie') {
      return `https://neodb.social/movie/${providerId}/`;
    }

    // NeoDB 剧集
    if (provider === 'neodb' && type === 'tv') {
      if (providerId.startsWith('show:')) {
        return `https://neodb.social/tv/${providerId.slice(5)}/`;
      }
      if (providerId.startsWith('season:')) {
        return `https://neodb.social/tv/season/${providerId.slice(7)}/`;
      }
      if (providerId.startsWith('episode:')) {
        return `https://neodb.social/tv/episode/${providerId.slice(8)}/`;
      }
      if (providerId.startsWith('path:')) {
        return `https://neodb.social/tv/${providerId.slice(5)}/`;
      }
      return `https://neodb.social/tv/${providerId}/`;
    }

    // NeoDB 音乐
    if (provider === 'neodb' && type === 'music') {
      return `https://neodb.social/album/${providerId}/`;
    }

    // TMDB 电影
    if (provider === 'tmdb' && type === 'movie') {
      return `https://www.themoviedb.org/movie/${providerId}/`;
    }

    // TMDB 剧集
    if (provider === 'tmdb' && type === 'tv') {
      if (providerId.startsWith('show:')) {
        return `https://www.themoviedb.org/tv/${providerId.slice(5)}/`;
      }
      if (providerId.startsWith('season:')) {
        const [, showId, seasonNo] = providerId.split(':');
        return showId && seasonNo
          ? `https://www.themoviedb.org/tv/${showId}/season/${seasonNo}/`
          : '';
      }
      if (providerId.startsWith('episode:')) {
        const [, showId, seasonNo, episodeNo] = providerId.split(':');
        return showId && seasonNo && episodeNo
          ? `https://www.themoviedb.org/tv/${showId}/season/${seasonNo}/episode/${episodeNo}/`
          : '';
      }
      return `https://www.themoviedb.org/tv/${providerId}/`;
    }

    return '';
  },

  /**
   * 解析 NeoDB TV 路径
   */
  parseNeoDbTvPath(pathname: string): { providerId?: string; invalid?: string } | null {
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'tv') {
      return null;
    }

    const relative = parts.slice(1);
    if (!relative.length) {
      return { invalid: 'empty-tv-path' };
    }

    if (relative[0] === 'season') {
      if (!relative[1]) {
        return { invalid: 'broken-neodb-season-path' };
      }
      return { providerId: `season:${relative[1]}` };
    }

    if (relative[0] === 'episode') {
      if (!relative[1]) {
        return { invalid: 'broken-neodb-episode-path' };
      }
      return { providerId: `episode:${relative[1]}` };
    }

    if (relative.length === 1) {
      return { providerId: `show:${relative[0]}` };
    }

    return { providerId: `path:${relative.join('/')}` };
  },

  /**
   * 解析 TMDB TV 路径
   */
  parseTmdbTvPath(pathname: string): { providerId?: string; invalid?: string } | null {
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'tv') {
      return null;
    }

    const [, showId, ...rest] = parts;
    if (!showId || !/^\d+$/.test(showId)) {
      return { invalid: 'broken-tmdb-tv-path' };
    }

    if (!rest.length) {
      return { providerId: `show:${showId}` };
    }

    if (rest.length === 2 && rest[0] === 'season' && /^\d+$/.test(rest[1])) {
      return { providerId: `season:${showId}:${rest[1]}` };
    }

    if (
      rest.length === 4
      && rest[0] === 'season'
      && /^\d+$/.test(rest[1])
      && rest[2] === 'episode'
      && /^\d+$/.test(rest[3])
    ) {
      return { providerId: `episode:${showId}:${rest[1]}:${rest[3]}` };
    }

    return { invalid: 'unsupported-tmdb-tv-path' };
  },

  /**
   * 从 URL 解析身份信息
   */
  fromUrl(url: string): UrlIdentity | null {
    const normalized = this.canonicalizeUrl(url);
    if (!normalized) {
      return null;
    }

    try {
      const parsed = new URL(normalized);
      const host = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname;

      // 豆瓣电影 — also matches sub-paths like /subject/{id}/celebrities, /subject/{id}/photos
      const doubanMovie = pathname.match(/^\/subject\/(\d+)/i);
      if (host === 'movie.douban.com' && doubanMovie) {
        return this.make('movie', 'douban', doubanMovie[1], normalized);
      }

      // 豆瓣音乐
      const doubanMusic = pathname.match(/^\/subject\/(\d+)/i);
      if (host === 'music.douban.com' && doubanMusic) {
        return this.make('music', 'douban', doubanMusic[1], normalized);
      }

      // IMDB
      const imdb = pathname.match(/^\/title\/(tt\d+)\/$/i);
      if (host.endsWith('imdb.com') && imdb) {
        return this.make('movie', 'imdb', imdb[1].toLowerCase(), normalized);
      }

      // NeoDB 电影
      const neodbMovie = pathname.match(/^\/movie\/([a-zA-Z0-9_-]+)\/$/i);
      if (host === 'neodb.social' && neodbMovie) {
        return this.make('movie', 'neodb', neodbMovie[1], normalized);
      }

      // NeoDB 剧集
      if (host === 'neodb.social' && pathname.startsWith('/tv/')) {
        const parsedTv = this.parseNeoDbTvPath(pathname);
        if (!parsedTv?.providerId) {
          return null;
        }
        return this.make('tv', 'neodb', parsedTv.providerId, normalized);
      }

      // NeoDB 音乐专辑
      const neodbAlbum = pathname.match(/^\/album\/([a-zA-Z0-9_-]+)\/$/i);
      if (host === 'neodb.social' && neodbAlbum) {
        return this.make('music', 'neodb', neodbAlbum[1], normalized);
      }

      // 豆瓣影人 (personage)
      const doubanPersonage = pathname.match(/^\/personage\/(\d+)\/$/i);
      if (host === 'www.douban.com' && doubanPersonage) {
        return this.make('movie', 'douban', doubanPersonage[1], normalized);
      }

      // TMDB 电影
      const tmdbMovie = pathname.match(/^\/movie\/(\d+)\/$/i);
      if (host.endsWith('themoviedb.org') && tmdbMovie) {
        return this.make('movie', 'tmdb', tmdbMovie[1], normalized);
      }

      // TMDB 剧集
      if (host.endsWith('themoviedb.org') && pathname.startsWith('/tv/')) {
        const parsedTv = this.parseTmdbTvPath(pathname);
        if (!parsedTv?.providerId) {
          return null;
        }
        return this.make('tv', 'tmdb', parsedTv.providerId, normalized);
      }
    } catch (_error) {
      return null;
    }

    return null;
  },
};
