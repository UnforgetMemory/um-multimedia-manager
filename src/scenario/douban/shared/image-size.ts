/**
 * Douban CDN image size — single source of truth for overlay upgrades.
 *
 * `xl` is unavailable for a large share of Douban CDN assets; `x` is the
 * maintained target. Change DOUBAN_IMAGE_SIZE only; call sites go through
 * upgradeDoubanImageSrc.
 */
export const DOUBAN_IMAGE_SIZE = 'x'

/**
 * Rewrite a Douban image URL to the maintained high-res size token.
 * Handles subject posters (s_ratio_poster), path prefixes (/s|/m|/l/pic),
 * and photo gallery paths (/view/photo/{size}/public/).
 */
export function upgradeDoubanImageSrc(src: string): string {
  if (!src) return src
  return src
    .replace(/s_ratio_poster/g, DOUBAN_IMAGE_SIZE)
    .replace(/\/([slm])(?:pic)?\//g, `/${DOUBAN_IMAGE_SIZE}/`)
    .replace(
      /\/view\/photo\/[^/]+\/public\//,
      `/view/photo/${DOUBAN_IMAGE_SIZE}/public/`,
    )
}
