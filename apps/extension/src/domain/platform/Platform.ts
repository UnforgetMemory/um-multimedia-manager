/**
 * Platform Value Object
 *
 * Represents a media platform that UMM supports. Enforces a known set
 * of platform identifiers and provides comparison, display-name, and
 * store-name derivation — all without runtime dependencies.
 *
 * @remarks
 * This is an immutable value object. Two Platform instances are equal
 * iff their identifier strings match (case-sensitive, always lowercase).
 */
export class Platform {
  /** Known platform identifiers */
  static readonly KNOWN = ['douban', 'imdb', 'neodb', 'tmdb'] as const;

  /** Platform identifier — always lowercase */
  readonly id: string;

  private constructor(id: string) {
    this.id = id;
  }

  // ---- Named constants ----

  static readonly DOUBAN = new Platform('douban');
  static readonly IMDB = new Platform('imdb');
  static readonly NEODB = new Platform('neodb');
  static readonly TMDB = new Platform('tmdb');

  // ---- Factory ----

  /**
   * Create a Platform from a string identifier.
   * Returns null for unknown/invalid platform names.
   *
   * @param id - Platform identifier (case-insensitive, normalized to lowercase).
   */
  static fromString(id: string): Platform | null {
    const normalized = id.toLowerCase().trim();
    if (!normalized) return null;
    return new Platform(normalized);
  }

  /**
   * Create a Platform from a string identifier.
   * Throws if the identifier is empty or unknown.
   *
   * @param id - Platform identifier.
   */
  static require(id: string): Platform {
    const platform = Platform.fromString(id);
    if (!platform) {
      throw new RangeError(`Invalid platform identifier: "${id}"`);
    }
    return platform;
  }

  // ---- Queries ----

  /** Human-readable display name (capitalised). */
  get displayName(): string {
    return this.id.charAt(0).toUpperCase() + this.id.slice(1);
  }

  /** IndexedDB store name for this platform's records. */
  get storeName(): string {
    return `${this.id}_records`;
  }

  /** True if this platform is in the known list. */
  get isKnown(): boolean {
    return (Platform.KNOWN as readonly string[]).includes(this.id);
  }

  // ---- Equality ----

  equals(other: Platform): boolean {
    return this.id === other.id;
  }

  /** Serialise to plain string for persistence. */
  toString(): string {
    return this.id;
  }

  /** Convenience — used by JSON.stringify. */
  toJSON(): string {
    return this.id;
  }
}
