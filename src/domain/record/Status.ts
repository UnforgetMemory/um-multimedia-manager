/**
 * Status Value Object
 *
 * Encapsulates the watch/listen/read status of a media record.
 * Four states are supported:
 *
 * | Code | Name     | Meaning                       |
 * |------|----------|-------------------------------|
 * |  0   | None     | Not yet tracked               |
 * |  1   | Wishlist | Want to watch/listen/read/play |
 * |  2   | Done     | Completed / watched / played  |
 * |  3   | Doing    | Currently in progress         |
 *
 * Code 3 (Doing) is used for statuses like "在玩" (playing a game),
 * "在读" (reading a book), "在听" (listening to music).
 *
 * @remarks
 * Immutable value object. Every mutation method returns a **new**
 * Status instance—the original is never modified.
 */
export type StatusCode = 0 | 1 | 2 | 3;

export class Status {
  static readonly NONE = new Status(0);
  static readonly WISHLIST = new Status(1);
  static readonly DONE = new Status(2);
  static readonly DOING = new Status(3);

  /** Numeric status code (0 | 1 | 2 | 3). */
  readonly code: StatusCode;

  private constructor(code: StatusCode) {
    this.code = code;
  }

  // ---- Factory ----

  /**
   * Create a Status from a numeric code.
   * Returns null for codes outside [0, 1, 2, 3].
   */
  static fromCode(code: number): Status | null {
    if (code === 0) return Status.NONE;
    if (code === 1) return Status.WISHLIST;
    if (code === 2) return Status.DONE;
    if (code === 3) return Status.DOING;
    return null;
  }

  /**
   * Create a Status from a string representation.
   * Accepts numeric strings ("0", "1", "2", "3") and legacy string
   * representations ("done", "wish", "none", "doing") for backward
   * compatibility.
   */
  static fromString(value: string): Status | null {
    const v = value.toLowerCase().trim();
    if (v === '0' || v === 'none') return Status.NONE;
    if (v === '1' || v === 'wish' || v === 'wishlist') return Status.WISHLIST;
    if (v === '2' || v === 'done') return Status.DONE;
    if (v === '3' || v === 'doing') return Status.DOING;
    return null;
  }

  /**
   * Create a Status from a code. Throws for invalid codes.
   */
  static require(value: number | string): Status {
    const num = typeof value === 'string' ? Number(value) : value;
    const status = Status.fromCode(num) ?? (typeof value === 'string' ? Status.fromString(value) : null);
    if (!status) {
      throw new RangeError(`Invalid status value: "${value}". Expected 0 (none), 1 (wishlist), 2 (done), or 3 (doing)`);
    }
    return status;
  }

  // ---- Transitions (all return NEW instances) ----

  /** Mark as done/watched. No-op if already done. */
  markAsDone(): Status {
    return Status.DONE;
  }

  /** Add to wishlist. No-op if already wishlisted. */
  markAsWishlist(): Status {
    return Status.WISHLIST;
  }

  /** Clear any status (back to none). */
  clear(): Status {
    return Status.NONE;
  }

  /** Toggle between wishlist and done. */
  toggleProgress(): Status {
    if (this.code === 0) return Status.DONE;
    if (this.code === 1) return Status.DONE;
    if (this.code === 2) return Status.WISHLIST;
    return this;
  }

  // ---- Queries ----

  /** True when the user has consumed this media (code === 2). */
  get isDone(): boolean {
    return this.code === 2;
  }

  /** True when the user wants to consume this media (code === 1). */
  get isWishlist(): boolean {
    return this.code === 1;
  }

  /** True when the user is currently consuming this media (code === 3). */
  get isDoing(): boolean {
    return this.code === 3;
  }

  /** True when no status has been set (code === 0). */
  get isNone(): boolean {
    return this.code === 0;
  }

  /** True when the record carries an active status (wishlist, doing, or done). */
  get isActive(): boolean {
    return this.code > 0;
  }

  /** Human-readable label. */
  get label(): string {
    switch (this.code) {
      case 0: return 'None';
      case 1: return 'Wishlist';
      case 2: return 'Done';
      case 3: return 'Doing';
    }
  }

  /** Legacy string value for backward compatibility. */
  get legacyString(): string {
    switch (this.code) {
      case 0: return 'none';
      case 1: return 'wish';
      case 2: return 'done';
      case 3: return 'doing';
    }
  }

  // ---- Equality ----

  equals(other: Status): boolean {
    return this.code === other.code;
  }

  /** Serialise to the numeric code used for storage. */
  toNumber(): StatusCode {
    return this.code;
  }

  toString(): string {
    return String(this.code);
  }

  toJSON(): number {
    return this.code;
  }
}
