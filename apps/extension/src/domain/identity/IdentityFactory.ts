/**
 * IdentityFactory
 *
 * Central factory for creating Identity aggregates. While Identity
 * provides static factory methods, this factory adds:
 *  - Extensible URL parser registration (for future platform support)
 *  - Batch URL parsing
 *  - Normalised error reporting for URL parse failures
 *
 * @remarks
 * This is a **domain service** — it coordinates creation logic that
 * doesn't naturally belong on the aggregate itself. Use it when you
 * need to parse URLs from user input, link multiple identities, or
 * extend the supported platform set at runtime.
 */
import { Identity } from '@/domain/identity/Identity';

/** A URL parser that can extract an Identity from a URL. */
export type UrlParser = (url: string) => Identity | null;

export class IdentityFactory {
  /** Registered custom parsers (checked before built-in parsers). */
  private readonly customParsers: UrlParser[] = [];

  // ---- Registration ----

  /**
   * Register a custom URL parser.
   * Custom parsers are tried before built-in parsers, in registration order.
   */
  registerParser(parser: UrlParser): void {
    this.customParsers.push(parser);
  }

  /** Remove all custom parsers. */
  resetParsers(): void {
    this.customParsers.length = 0;
  }

  // ---- Creation ----

  /**
   * Parse a URL into an Identity.
   * Tries custom parsers first, then falls back to built-in parsing.
   * Returns null on failure.
   */
  fromUrl(url: string): Identity | null {
    if (!url) return null;

    // Custom parsers first, then fall back to built-in parsing
    for (const parser of this.customParsers) {
      const identity = parser(url);
      if (identity) return identity;
    }

    return Identity.fromUrl(url);
  }

  /**
   * Parse multiple URLs into identities.
   * Returns a map of original URL → Identity (or null for failures).
   */
  fromUrls(urls: string[]): Map<string, Identity | null> {
    const results = new Map<string, Identity | null>();
    for (const url of urls) {
      results.set(url, this.fromUrl(url));
    }
    return results;
  }

  /**
   * Create an Identity from raw components.
   * Delegates to Identity.create for validation.
   */
  create(platform: string, type: string, providerId: string): Identity | null {
    return Identity.create(platform, type, providerId);
  }

  // ---- Bulk operations ----

  /**
   * Build the set of identities that are likely the same media across
   * platforms, given one known identity. Uses the providerId as the
   * linking key.
   */
  buildLinkedIdentities(
    source: Identity,
    links: Array<{ platform: string; type: string; providerId: string }>,
  ): Identity[] {
    const identities: Identity[] = [source];

    for (const link of links) {
      const id = Identity.create(link.platform, link.type, link.providerId);
      if (id) identities.push(id);
    }

    return identities;
  }

  // ---- Validation ----

  /**
   * Attempt to parse a URL and return a human-readable error message
   * if parsing fails. Useful for surfacing parse errors in forms or
   * import UIs without swallowing the failure.
   */
  tryParse(url: string): { identity: Identity } | { error: string } {
    if (!url) return { error: 'URL is empty' };

    const identity = this.fromUrl(url);
    if (identity) return { identity };

    return {
      error: `Unrecognised URL: "${url}". Supported platforms: Douban, IMDb, NeoDB, TMDB.`,
    };
  }
}
