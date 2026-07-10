/**
 * StoreRecord Aggregate Root
 *
 * The central aggregate for a media item that a user has tracked.
 * Every StoreRecord belongs to a specific platform+type combination
 * (identified by a composite store key) and carries:
 *  - Current **watch status** (none / wishlist / done)
 *  - A **rating** (0–10, 0.5-step granularity)
 *  - An optional **comment**
 *  - Cross-platform **links** (e.g. a Douban record linked to the same
 *    movie on IMDb)
 *  - Optimistic concurrency version for safe concurrent writes
 *
 * @remarks
 * All mutation methods return a **new** StoreRecord instance — the
 * original is never modified. Use {@link toSnapshot} to serialise
 * for persistence.
 */
import { Status } from '@/domain/record/Status';
import { Rating } from '@/domain/record/Rating';

export class StoreRecord {
  /** Canonical URL of the media on this platform. */
  readonly url: string;

  /** Watch/listen/read status. */
  readonly status: Status;

  /** User rating (0 = unrated). */
  readonly rating: Rating;

  /** Optional user comment. */
  readonly comment: string | undefined;

  /** ISO-8601 timestamp of the last update. */
  readonly updatedAt: string;

  /**
   * Cross-platform links: maps platform name → store key.
   * e.g. { "imdb": "movie::tt1375666", "douban": "movie::37332784" }
   */
  readonly linkedIds: Readonly<Record<string, string>>;

  /** Schema version for migration support. */
  readonly schemaVersion: number | undefined;

  /**
   * Optimistic concurrency version.
   * Passed through unchanged by domain mutations; incremented by the
   * repository layer on write to detect conflicting concurrent updates.
   */
  readonly recordVersion: number | undefined;

  constructor(params: StoreRecordParams) {
    this.url = params.url;
    this.status = params.status instanceof Status ? params.status : Status.require(params.status);
    this.rating = params.rating instanceof Rating ? params.rating : Rating.require(params.rating);
    this.comment = params.comment;
    this.updatedAt = params.updatedAt ?? new Date().toISOString();
    this.linkedIds = Object.freeze({ ...params.linkedIds }) as Readonly<Record<string, string>>;
    this.schemaVersion = params.schemaVersion;
    this.recordVersion = params.recordVersion;
    Object.freeze(this);
  }

  // ---- Factories ----

  /**
   * Create a fresh (empty) record for the given URL.
   * Status is set to NONE, rating to UNRATED.
   */
  static fresh(url: string, linkedIds?: Record<string, string>): StoreRecord {
    return new StoreRecord({
      url,
      status: Status.NONE,
      rating: Rating.UNRATED,
      linkedIds: linkedIds ?? {},
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Reconstruct a StoreRecord from a previously-serialised snapshot.
   * This is the inverse of {@link toSnapshot}.
   */
  static fromSnapshot(snapshot: StoreRecordSnapshot): StoreRecord {
    return new StoreRecord({
      url: snapshot.url,
      status: Status.fromCode(snapshot.status) ?? Status.NONE,
      rating: Rating.fromNumber(snapshot.rating) ?? Rating.UNRATED,
      comment: snapshot.comment,
      updatedAt: snapshot.updatedAt,
      linkedIds: snapshot.linkedIds,
      schemaVersion: snapshot.schemaVersion,
      recordVersion: snapshot.recordVersion,
    });
  }

  // ---- Status transitions (all return NEW instances) ----

  /** Mark as watched/done. */
  markAsWatched(): StoreRecord {
    return this.withStatus(this.status.markAsDone());
  }

  /** Add to wishlist. */
  markAsWishlisted(): StoreRecord {
    return this.withStatus(this.status.markAsWishlist());
  }

  /** Clear any status (back to none). */
  clearStatus(): StoreRecord {
    return this.withStatus(this.status.clear());
  }

  private withStatus(newStatus: Status): StoreRecord {
    if (this.status.equals(newStatus)) return this;
    return new StoreRecord({
      ...this.toSnapshot(),
      status: newStatus,
      updatedAt: new Date().toISOString(),
      recordVersion: this.recordVersion,
    });
  }

  // ---- Rating ----

  /**
   * Update the rating. Returns a new record.
   * Accepts a number (validated through Rating) or a Rating instance.
   */
  updateRating(value: number | Rating): StoreRecord {
    const newRating = value instanceof Rating ? value : Rating.fromNumber(value);
    if (!newRating) throw new RangeError(`Invalid rating value: ${value}`);
    if (this.rating.equals(newRating)) return this;
    return new StoreRecord({
      ...this.toSnapshot(),
      rating: newRating,
      updatedAt: new Date().toISOString(),
      recordVersion: this.recordVersion,
    });
  }

  // ---- Comment ----

  /** Update the comment. Pass undefined to clear it. */
  withComment(comment: string | undefined): StoreRecord {
    if (this.comment === comment) return this;
    return new StoreRecord({
      ...this.toSnapshot(),
      comment,
      updatedAt: new Date().toISOString(),
      recordVersion: this.recordVersion,
    });
  }

  // ---- Links ----

  /**
   * Add a cross-platform link.
   *
   * @param platform - Target platform name (e.g. "imdb").
   * @param storeKey - Store key on that platform (e.g. "movie::tt1375666").
   */
  addLink(platform: string, storeKey: string): StoreRecord {
    const next = { ...this.linkedIds, [platform]: storeKey };
    return new StoreRecord({
      ...this.toSnapshot(),
      linkedIds: next,
      updatedAt: new Date().toISOString(),
      recordVersion: this.recordVersion,
    });
  }

  /** Remove a cross-platform link for the given platform. */
  removeLink(platform: string): StoreRecord {
    if (!(platform in this.linkedIds)) return this;
    const next = { ...this.linkedIds };
    delete next[platform];
    return new StoreRecord({
      ...this.toSnapshot(),
      linkedIds: next,
      updatedAt: new Date().toISOString(),
      recordVersion: this.recordVersion,
    });
  }

  /** Merge links from another record. Existing keys are overwritten. */
  mergeLinks(other: StoreRecord): StoreRecord {
    const next = { ...this.linkedIds, ...other.linkedIds };
    if (Object.keys(next).length === Object.keys(this.linkedIds).length
        && Object.entries(next).every(([k, v]) => this.linkedIds[k] === v)) {
      return this;
    }
    return new StoreRecord({
      ...this.toSnapshot(),
      linkedIds: next,
      updatedAt: new Date().toISOString(),
      recordVersion: this.recordVersion,
    });
  }

  // ---- Queries ----

  /** True when this record has been watched/done. */
  get isWatched(): boolean {
    return this.status.isDone;
  }

  /** True when this record is on the wishlist. */
  get isWishlisted(): boolean {
    return this.status.isWishlist;
  }

  /** True when carries an active status (wishlist or done). */
  get isActive(): boolean {
    return this.status.isActive;
  }

  /** True when the user has given a rating > 0. */
  get isRated(): boolean {
    return this.rating.isRated;
  }

  /** Number of cross-platform links. */
  get linkCount(): number {
    return Object.keys(this.linkedIds).length;
  }

  // ---- Serialisation ----

  /** Serialise to a plain object suitable for IndexedDB storage. */
  toSnapshot(): StoreRecordSnapshot {
    return {
      url: this.url,
      status: this.status.toNumber(),
      rating: this.rating.toNumber(),
      comment: this.comment,
      updatedAt: this.updatedAt,
      linkedIds: { ...this.linkedIds },
      schemaVersion: this.schemaVersion,
      recordVersion: this.recordVersion,
    };
  }

  toString(): string {
    const s = this.status.isActive ? this.status.label : 'No status';
    return `[StoreRecord ${this.url}] ${s}, rating=${this.rating}`;
  }
}

/** Plain serialisable form of StoreRecord (matches IndexedDB schema). */
export interface StoreRecordSnapshot {
  url: string;
  status: number;
  rating: number;
  comment?: string;
  updatedAt: string;
  linkedIds: Record<string, string>;
  schemaVersion?: number;
  recordVersion?: number;
}

/** Parameters for constructing a StoreRecord. */
export interface StoreRecordParams {
  url: string;
  status: Status | number;
  rating: Rating | number;
  comment?: string;
  updatedAt?: string;
  linkedIds?: Record<string, string>;
  schemaVersion?: number;
  recordVersion?: number;
}
