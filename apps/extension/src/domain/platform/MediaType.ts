/**
 * MediaType Value Object
 *
 * Categorises a piece of media into one of the known types that UMM
 * tracks: movie, tv, music, or book.  Each type maps to specific URL
 * patterns and platform behaviour.
 *
 * @remarks
 * Immutable value object—equality is by string identity only.
 */
export class MediaType {
  /** Canonical type identifiers. */
  static readonly MOVIE = new MediaType('movie');
  static readonly TV = new MediaType('tv');
  static readonly MUSIC = new MediaType('music');
  static readonly BOOK = new MediaType('book');
  static readonly GAME = new MediaType('game');

  /** Ordered list of all known types. */
  static readonly KNOWN: readonly MediaType[] = [
    MediaType.MOVIE,
    MediaType.TV,
    MediaType.MUSIC,
    MediaType.BOOK,
    MediaType.GAME,
  ];

  /** String identifier — always lowercase. */
  readonly id: string;

  private constructor(id: string) {
    this.id = id;
  }

  // ---- Factory ----

  /**
   * Parse a string into a MediaType.
   * Returns null for unknown type names.
   *
   * @param id - Type identifier (case-insensitive).
   */
  static fromString(id: string): MediaType | null {
    const normalized = id.toLowerCase().trim();
    const found = MediaType.KNOWN.find(t => t.id === normalized);
    return found ?? null;
  }

  /**
   * Parse a string into a MediaType.
   * Throws for unknown type names.
   *
   * @param id - Type identifier.
   */
  static require(id: string): MediaType {
    const type = MediaType.fromString(id);
    if (!type) {
      throw new RangeError(`Unknown media type: "${id}". Expected one of: movie, tv, music, book`);
    }
    return type;
  }

  // ---- Queries ----

  /** Human-readable label. */
  get label(): string {
    return this.id.charAt(0).toUpperCase() + this.id.slice(1);
  }

  /** Returns true when this type is a video medium (movie or tv). */
  get isVideo(): boolean {
    return this.id === 'movie' || this.id === 'tv';
  }

  /** Returns true when this type is an audio medium (music). */
  get isAudio(): boolean {
    return this.id === 'music';
  }

  /** Returns true when this type is a reading medium (book). */
  get isReadable(): boolean {
    return this.id === 'book';
  }

  // ---- Equality ----

  equals(other: MediaType): boolean {
    return this.id === other.id;
  }

  toString(): string {
    return this.id;
  }

  toJSON(): string {
    return this.id;
  }
}
