import { test, expect } from '@playwright/test'
import { DOUBAN_IMAGE_SIZE, upgradeDoubanImageSrc } from '@/content/douban/shared/image-size'

/**
 * Douban CDN size upgrade (5.16.1). Pure helper — regression lock so a
 * DOUBAN_IMAGE_SIZE change cannot silently break the three URL shapes.
 */

test.describe('DOUBAN_IMAGE_SIZE', () => {
  test('is the maintained x token', () => {
    expect(DOUBAN_IMAGE_SIZE).toBe('x')
  })
})

test.describe('upgradeDoubanImageSrc', () => {
  test('s_ratio_poster → size token', () => {
    expect(
      upgradeDoubanImageSrc('https://img2.doubanio.com/view/photo/s_ratio_poster/public/p1.jpg'),
    ).toBe(`https://img2.doubanio.com/view/photo/${DOUBAN_IMAGE_SIZE}/public/p1.jpg`)
  })

  test('/[slm](pic)?/ path prefixes upgrade to /x/', () => {
    // /subject/s/pic/ → /subject/x/pic/ (size segment only; pic kept)
    expect(upgradeDoubanImageSrc('https://img2.doubanio.com/view/subject/s/pic/public/p2.jpg'))
      .toBe('https://img2.doubanio.com/view/subject/x/pic/public/p2.jpg')
    expect(upgradeDoubanImageSrc('https://img2.doubanio.com/view/photo/m/public/p3.jpg')).toContain('/x/')
    expect(upgradeDoubanImageSrc('https://img2.doubanio.com/view/photo/l/public/p4.jpg')).toContain('/x/')
    // bare /m/pic/ form → /x/pic/
    expect(upgradeDoubanImageSrc('https://img2.doubanio.com/m/pic/p5.jpg'))
      .toBe('https://img2.doubanio.com/x/pic/p5.jpg')
  })

  test('/view/photo/{size}/public/ gallery path upgrades size segment', () => {
    expect(
      upgradeDoubanImageSrc('https://img2.doubanio.com/view/photo/xl/public/p6.jpg'),
    ).toBe(`https://img2.doubanio.com/view/photo/${DOUBAN_IMAGE_SIZE}/public/p6.jpg`)
    expect(
      upgradeDoubanImageSrc('https://img2.doubanio.com/view/photo/m/public/p7.jpg'),
    ).toBe(`https://img2.doubanio.com/view/photo/${DOUBAN_IMAGE_SIZE}/public/p7.jpg`)
  })

  test('already-upgraded x URLs stay stable (idempotent)', () => {
    const src = `https://img2.doubanio.com/view/photo/${DOUBAN_IMAGE_SIZE}/public/p8.jpg`
    expect(upgradeDoubanImageSrc(src)).toBe(src)
  })

  test('empty / non-Douban URLs pass through', () => {
    expect(upgradeDoubanImageSrc('')).toBe('')
    expect(upgradeDoubanImageSrc('https://example.com/a/b.jpg')).toBe('https://example.com/a/b.jpg')
  })

  test('data: URLs pass through', () => {
    expect(upgradeDoubanImageSrc('data:image/png;base64,xx')).toBe('data:image/png;base64,xx')
  })
})
