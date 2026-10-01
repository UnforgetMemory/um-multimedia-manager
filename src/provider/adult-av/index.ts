/**
 * Adult-AV provider — public surface.
 *
 * Seams: `./transport` (chrome.runtime message RPC), `./models` (pure id
 * domain: normalization/classification/matching), `./auto-detect` (pure
 * input → platform detection).
 */

export * from './transport';
export * from './models';
export * from './auto-detect';
