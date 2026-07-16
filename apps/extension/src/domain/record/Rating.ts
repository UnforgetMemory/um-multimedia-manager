/**
 * Rating Value Object
 *
 * Represents a user's rating for a media item on a 0–10 scale with
 * 0.5-point increments. A value of 0 means "unrated" / "no rating".
 *
 * @remarks
 * Immutable — every operation returns a new Rating instance.
 */
export class Rating {
  /** Maximum possible rating value. */
  static readonly MAX = 10;

  /** Minimum possible rating value (0 = unrated). */
  static readonly MIN = 0;

  /** Step size for valid ratings (0.5 granularity). */
  static readonly STEP = 0.5;

  /** Unrated sentinel. */
  static readonly UNRATED = new Rating(0);

  private readonly _value: number;

  private constructor(value: number) {
    this._value = value;
  }

  // ---- Factory ----

  /**
   * Create a Rating from a numeric value.
   * Returns null if the value is outside the valid range or
   * does not align with the 0.5 step.
   */
  static fromNumber(value: number): Rating | null {
    if (!Number.isFinite(value)) return null;
    if (value < Rating.MIN || value > Rating.MAX) return null;
    // Must align to STEP (e.g. 0, 0.5, 1, 1.5, … 10)
    if (Math.abs(value % Rating.STEP) > Number.EPSILON * 10) return null;
    return new Rating(value);
  }

  /**
   * Create a Rating from a number. Throws for invalid values.
   */
  static require(value: number): Rating {
    const rating = Rating.fromNumber(value);
    if (!rating) {
      throw new RangeError(
        `Invalid rating: ${value}. Must be between ${Rating.MIN} and ${Rating.MAX} in ${Rating.STEP} increments.`
      );
    }
    return rating;
  }

  // ---- Operations ----

  /**
   * Return a new Rating with the given value.
   * Returns null if the value is invalid.
   */
  withValue(value: number): Rating | null {
    return Rating.fromNumber(value);
  }

  /** Round to the nearest valid step. */
  round(): Rating {
    const rounded = Math.round(this._value / Rating.STEP) * Rating.STEP;
    const clamped = Math.max(Rating.MIN, Math.min(Rating.MAX, rounded));
    return new Rating(clamped);
  }

  // ---- Queries ----

  /** Numeric value. */
  get value(): number {
    return this._value;
  }

  /** True when no rating has been given. */
  get isUnrated(): boolean {
    return this._value === 0;
  }

  /** True when the user has given a rating (value > 0). */
  get isRated(): boolean {
    return this._value > 0;
  }

  /** Rating as a fraction of max (0.0 – 1.0). Useful for visualisations. */
  get fraction(): number {
    return this._value / Rating.MAX;
  }

  /** Star count on a 0–5 scale (used in some UIs). */
  get stars(): number {
    return this._value / 2;
  }

  /** Human-readable label, e.g. "7.5 / 10". */
  get label(): string {
    if (this._value === 0) return 'Unrated';
    return `${this._value.toFixed(1)} / ${Rating.MAX}`;
  }

  // ---- Equality ----

  equals(other: Rating): boolean {
    return this._value === other._value;
  }

  toNumber(): number {
    return this._value;
  }

  toString(): string {
    return this._value.toFixed(1);
  }

  toJSON(): number {
    return this._value;
  }
}
