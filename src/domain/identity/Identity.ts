/**
 * Identity Aggregate Root
 *
 * Uniquely identifies a piece of media on a specific platform.
 * Every Identity carries:
 *  - A **platform** (douban, imdb, neodb, tmdb)
 *  - A **media type** (movie, tv, music, book)
 *  - A **platform-specific ID** (e.g. "tt1375666", "37332784")
 *  - A **canonical URL** derived from those components
 *
 * @remarks
 * This is the primary aggregate root for the identity sub-domain.
 * Equality is determined by platform + type + providerId.
 * The canonical URL is always derived and consistent.
 */
import { Platform } from '@/domain/platform/Platform';
import { MediaType } from '@/domain/platform/MediaType';

export class Identity {
  /** The platform this identity belongs to. */
  readonly platform: Platform;

  /** The media type (movie, tv, music, book). */
  readonly type: MediaType;

  /** Platform-specific media ID — e.g. "tt1375666" for IMDb, "37332784" for Douban. */
  readonly providerId: string;

  /** Canonical URL for this identity (always normalised). */
  readonly url: string;

  constructor(platform: Platform, type: MediaType, providerId: string, url: string) {
    if (!providerId) {
      throw new RangeError('Identity requires a non-empty providerId');
    }
    this.platform = platform;
    this.type = type;
    this.providerId = providerId;
    this.url = url;
    Object.freeze(this);
  }

  // ---- Factory: from components ----

  /**
   * Create an Identity from raw components.
   * Validates all inputs and returns null on failure.
   */
  static create(
    platform: string,
    type: string,
    providerId: string,
  ): Identity | null {
    const p = Platform.fromString(platform);
    const t = MediaType.fromString(type);
    if (!p || !t || !providerId) return null;

    const url = Identity.buildCanonicalUrl(p, t, providerId);
    if (!url) return null;

    return new Identity(p, t, providerId, url);
  }

  // ---- Factory: from URL ----

  /**
   * Parse a URL and return the corresponding Identity.
   * Returns null when the URL is unrecognised or malformed.
   *
   * Supports:
   *  - movie.douban.com/subject/{id}/
   *  - music.douban.com/subject/{id}/
   *  - book.douban.com/subject/{id}/
   *  - www.imdb.com/title/tt{id}/
   *  - neodb.social/movie/{id}/
   *  - neodb.social/tv/{path}/
   *  - neodb.social/album/{id}/
   *  - www.themoviedb.org/movie/{id}/
   *  - www.themoviedb.org/tv/{path}/
   *  - www.douban.com/personage/{id}/
   */
  static fromUrl(rawUrl: string): Identity | null {
    const canonical = Identity.canonicalizeUrl(rawUrl);
    if (!canonical) return null;

    try {
      const parsed = new URL(canonical);
      const host = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname;

      // Douban movie
      const doubanMovie = pathname.match(/^\/subject\/(\d+)/i);
      if (host === 'movie.douban.com' && doubanMovie) {
        return Identity.create('douban', 'movie', doubanMovie[1]);
      }

      // Douban music
      const doubanMusic = pathname.match(/^\/subject\/(\d+)/i);
      if (host === 'music.douban.com' && doubanMusic) {
        return Identity.create('douban', 'music', doubanMusic[1]);
      }

      // Douban book
      const doubanBook = pathname.match(/^\/subject\/(\d+)/i);
      if (host === 'book.douban.com' && doubanBook) {
        return Identity.create('douban', 'book', doubanBook[1]);
      }

      // IMDb
      const imdb = pathname.match(/^\/title\/(tt\d+)\/$/i);
      if (host.endsWith('imdb.com') && imdb) {
        return Identity.create('imdb', 'movie', imdb[1].toLowerCase());
      }

      // NeoDB movie
      const neodbMovie = pathname.match(/^\/movie\/([a-zA-Z0-9_-]+)\/$/i);
      if (host === 'neodb.social' && neodbMovie) {
        return Identity.create('neodb', 'movie', neodbMovie[1]);
      }

      // NeoDB TV (season / episode / show)
      if (host === 'neodb.social' && pathname.startsWith('/tv/')) {
        const tvId = Identity.parseNeoDbTvPath(pathname);
        if (tvId) return Identity.create('neodb', 'tv', tvId);
        return null;
      }

      // NeoDB album
      const neodbAlbum = pathname.match(/^\/album\/([a-zA-Z0-9_-]+)\/$/i);
      if (host === 'neodb.social' && neodbAlbum) {
        return Identity.create('neodb', 'music', neodbAlbum[1]);
      }

      // Douban personage
      const doubanPersonage = pathname.match(/^\/personage\/(\d+)\/$/i);
      if (host === 'www.douban.com' && doubanPersonage) {
        return Identity.create('douban', 'movie', doubanPersonage[1]);
      }

      // TMDB movie
      const tmdbMovie = pathname.match(/^\/movie\/(\d+)\/$/i);
      if (host.endsWith('themoviedb.org') && tmdbMovie) {
        return Identity.create('tmdb', 'movie', tmdbMovie[1]);
      }

      // TMDB TV
      if (host.endsWith('themoviedb.org') && pathname.startsWith('/tv/')) {
        const tvId = Identity.parseTmdbTvPath(pathname);
        if (tvId) return Identity.create('tmdb', 'tv', tvId);
        return null;
      }
    } catch {
      // Invalid URL — return null
    }

    return null;
  }

  // ---- URL normalisation ----

  /**
   * Normalise a URL by stripping hash/query, collapsing slashes,
   * and ensuring a trailing slash.
   */
  static canonicalizeUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    try {
      const url = new URL(String(rawUrl));
      url.hash = '';
      url.search = '';
      url.pathname = url.pathname.replace(/\/{2,}/g, '/');
      if (!url.pathname.endsWith('/')) {
        url.pathname += '/';
      }
      return url.toString();
    } catch {
      // Fallback: ensure protocol
      let u = String(rawUrl).trim();
      if (!u.startsWith('http://') && !u.startsWith('https://')) {
        u = `https://${u}`;
      }
      return u;
    }
  }

  // ---- URL building ----

  /**
   * Build a canonical URL for the given platform, type, and ID.
   * Returns empty string when a mapping is not recognised.
   */
  static buildCanonicalUrl(platform: Platform, type: MediaType, providerId: string): string {
    const p = platform.id;
    const t = type.id;

    // Douban
    if (p === 'douban' && t === 'movie') return `https://movie.douban.com/subject/${providerId}/`;
    if (p === 'douban' && t === 'book') return `https://book.douban.com/subject/${providerId}/`;
    if (p === 'douban' && t === 'music') return `https://music.douban.com/subject/${providerId}/`;

    // IMDb
    if (p === 'imdb' && t === 'movie') return `https://www.imdb.com/title/${providerId}/`;

    // NeoDB
    if (p === 'neodb') {
      return Identity.buildNeoDBUrl(t, providerId);
    }

    // TMDB
    if (p === 'tmdb') {
      return Identity.buildTmdbUrl(t, providerId);
    }

    return '';
  }

  private static buildNeoDBUrl(type: string, catalogUuid: string): string {
    if (catalogUuid.startsWith('show:')) return `https://neodb.social/tv/${catalogUuid.slice(5)}/`;
    if (catalogUuid.startsWith('season:')) return `https://neodb.social/tv/season/${catalogUuid.slice(7)}/`;
    if (catalogUuid.startsWith('episode:')) return `https://neodb.social/tv/episode/${catalogUuid.slice(8)}/`;
    const base = type === 'music' ? 'album' : type;
    return `https://neodb.social/${base}/${catalogUuid}/`;
  }

  private static buildTmdbUrl(type: string, providerId: string): string {
    if (type === 'movie') return `https://www.themoviedb.org/movie/${providerId}/`;

    if (type === 'tv') {
      if (providerId.startsWith('show:')) return `https://www.themoviedb.org/tv/${providerId.slice(5)}/`;
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
  }

  // ---- Path parsing ----

  /**
   * Parse a NeoDB TV path into a provider ID with prefix.
   * e.g. "/tv/some-uuid/" → "show:some-uuid"
   *      "/tv/season/uuid/" → "season:uuid"
   */
  private static parseNeoDbTvPath(pathname: string): string | null {
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'tv') return null;

    const relative = parts.slice(1);
    if (!relative.length) return null;

    if (relative[0] === 'season') {
      if (!relative[1]) return null;
      return `season:${relative[1]}`;
    }
    if (relative[0] === 'episode') {
      if (!relative[1]) return null;
      return `episode:${relative[1]}`;
    }
    if (relative.length === 1) {
      return `show:${relative[0]}`;
    }
    return `path:${relative.join('/')}`;
  }

  /**
   * Parse a TMDB TV path into a provider ID with prefix.
   * e.g. "/tv/123/" → "show:123"
   *      "/tv/123/season/1/" → "season:123:1"
   */
  private static parseTmdbTvPath(pathname: string): string | null {
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] !== 'tv') return null;

    const [, showId, ...rest] = parts;
    if (!showId || !/^\d+$/.test(showId)) return null;

    if (!rest.length) return `show:${showId}`;
    if (rest.length === 2 && rest[0] === 'season' && /^\d+$/.test(rest[1])) {
      return `season:${showId}:${rest[1]}`;
    }
    if (rest.length === 4 && rest[0] === 'season' && /^\d+$/.test(rest[1])
        && rest[2] === 'episode' && /^\d+$/.test(rest[3])) {
      return `episode:${showId}:${rest[1]}:${rest[3]}`;
    }

    return null;
  }

  // ---- Keys ----

  /**
   * Composite store key in the form "{type}::{providerId}".
   * Used as the IndexedDB record key.
   */
  get storeKey(): string {
    return `${this.type.id}::${this.providerId}`;
  }

  // ---- Equality ----

  equals(other: Identity): boolean {
    return (
      this.platform.equals(other.platform)
      && this.type.equals(other.type)
      && this.providerId === other.providerId
    );
  }

  /** Identity objects with the same providerId (cross-platform) are considered linked. */
  isLinkedTo(other: Identity): boolean {
    return this.providerId === other.providerId && !this.platform.equals(other.platform);
  }

  // ---- Serialisation ----

  /** Serialise to a plain object suitable for storage. */
  toSnapshot(): IdentitySnapshot {
    return {
      platform: this.platform.id,
      type: this.type.id,
      providerId: this.providerId,
      url: this.url,
    };
  }

  toString(): string {
    return `[Identity ${this.platform.id}:${this.type.id}:${this.providerId}]`;
  }

  toJSON(): IdentitySnapshot {
    return this.toSnapshot();
  }
}

/** Plain serialisable form of Identity. */
export interface IdentitySnapshot {
  platform: string;
  type: string;
  providerId: string;
  url: string;
}
