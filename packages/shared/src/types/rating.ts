export const RATING_MIN = 0;
export const RATING_MAX = 10;
export const RATING_STEP = 0.5;

export interface Rating {
  value: number;
}

export function ratingFromNumber(value: number): Rating {
  const clamped = Math.max(RATING_MIN, Math.min(RATING_MAX, value));
  const rounded = Math.round(clamped / RATING_STEP) * RATING_STEP;
  return { value: rounded };
}

export function isRated(rating: Rating): boolean {
  return rating.value > 0;
}

export function ratingToStars(rating: Rating): number {
  return rating.value / 2;
}
