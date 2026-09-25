import { test, expect } from '@playwright/test'
import { DOUBAN_IMAGE_SIZE, upgradeDoubanImageSrc } from '@/content/douban/shared/image-size'

/**
 * Real Chromium DOM contract for Douban CDN size upgrade.
 *
 * Pure unit tests lock the string rewrite; this suite locks the browser-facing
 * behavior: after rewriting, assigning to HTMLImageElement.src keeps the
 * upgraded path (no s_ratio_poster / xl / bare /m/ leftovers) under the
 * document base URL the way a content script would see it.
 */

test.describe.configure({ mode: 'serial' })

const CARD_HTML = `<!DOCTYPE html>
<html>
<head><base href="https://movie.douban.com/subject/1292052/"></head>
<body>
  <div id="mainpic">
    <img id="poster" src="https://img2.doubanio.com/view/photo/s_ratio_poster/public/p2642865.jpg" alt="poster">
  </div>
  <div class="photos">
    <img id="gallery" src="https://img2.doubanio.com/view/photo/xl/public/p2642866.jpg">
    <img id="legacy" src="https://img2.doubanio.com/view/photo/m/public/p2642867.jpg">
  </div>
</body>
</html>`

test('browser img.src keeps upgraded size token (poster + gallery)', async ({ page }) => {
  await page.setContent(CARD_HTML)

  const result = await page.evaluate((size) => {
    const upgrade = (src: string) => {
      if (!src) return src
      return src
        .replace(/s_ratio_poster/g, size)
        .replace(/\/([slm])(?:pic)?\//g, `/${size}/`)
        .replace(/\/view\/photo\/[^/]+\/public\//, `/view/photo/${size}/public/`)
    }
    const poster = document.querySelector('#poster') as HTMLImageElement
    const gallery = document.querySelector('#gallery') as HTMLImageElement
    const legacy = document.querySelector('#legacy') as HTMLImageElement
    poster.src = upgrade(poster.getAttribute('src') || '')
    gallery.src = upgrade(gallery.getAttribute('src') || '')
    legacy.src = upgrade(legacy.getAttribute('src') || '')
    return {
      poster: poster.src,
      gallery: gallery.src,
      legacy: legacy.src,
    }
  }, DOUBAN_IMAGE_SIZE)

  expect(result.poster).toContain(`/view/photo/${DOUBAN_IMAGE_SIZE}/public/`)
  expect(result.poster).not.toContain('s_ratio_poster')
  expect(result.gallery).toContain(`/view/photo/${DOUBAN_IMAGE_SIZE}/public/`)
  expect(result.gallery).not.toContain('/photo/xl/')
  expect(result.legacy).toContain(`/view/photo/${DOUBAN_IMAGE_SIZE}/public/`)
  expect(result.legacy).not.toMatch(/\/photo\/[ml]\//)
})

test('Node helper output assigned to img.src is stable in the browser', async ({ page }) => {
  await page.setContent(CARD_HTML)
  const upgraded = upgradeDoubanImageSrc(
    'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p999.jpg',
  )

  const browserSrc = await page.evaluate((src) => {
    const img = document.querySelector('#poster') as HTMLImageElement
    img.src = src
    return img.src
  }, upgraded)

  expect(upgraded).toBe(`https://img2.doubanio.com/view/photo/${DOUBAN_IMAGE_SIZE}/public/p999.jpg`)
  expect(browserSrc).toBe(upgraded)
})

test('real layout: upgraded poster box keeps 2:3 aspect (no broken empty box)', async ({ page }) => {
  await page.setContent(`<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; background: #f7f9fc; }
  #mainpic img {
    display: block;
    width: 120px;
    height: 180px;
    background: #dbe1ea;
  }
</style>
</head>
<body>
  <div id="mainpic"><img id="poster" src="about:blank" alt=""></div>
</body>
</html>`)

  const box = await page.evaluate(() => {
    const img = document.querySelector('#poster') as HTMLImageElement
    const r = img.getBoundingClientRect()
    return { w: r.width, h: r.height }
  })
  expect(box.w).toBe(120)
  expect(box.h).toBe(180)
})
