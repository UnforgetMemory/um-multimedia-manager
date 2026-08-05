import { test, expect } from '@playwright/test'
import { autoDetectPlatform } from '@/features/adult-av/auto-detect'

/**
 * autoDetectPlatform — options page platform auto-detection (RatingTab/LinkedTab).
 *
 * Locks the Bangumi URL-detection branch (bgm.tv / bangumi.tv / chii.in)
 * and guards regressions for every pre-existing platform branch.
 */
function runDetect(input: string, currentPlatform = 'douban') {
  const calls: Array<{ platform?: string; domain?: string }> = []
  const result = autoDetectPlatform(input, currentPlatform, {
    setPlatform: (p) => calls.push({ platform: p }),
    setDomain: (d) => calls.push({ domain: d }),
  })
  return { result, platform: calls.find((c) => c.platform)?.platform ?? null, domain: calls.find((c) => c.domain)?.domain ?? null }
}

test.describe('autoDetectPlatform — Bangumi URL detection', () => {
  test('bgm.tv /subject/{id} → bangumi + tv', () => {
    const r = runDetect('https://bgm.tv/subject/12345')
    expect(r.result).toBe(true)
    expect(r.platform).toBe('bangumi')
    expect(r.domain).toBe('tv')
  })

  test('bangumi.tv /subject/{id} → bangumi + tv', () => {
    const r = runDetect('https://bangumi.tv/subject/164671')
    expect(r.result).toBe(true)
    expect(r.platform).toBe('bangumi')
    expect(r.domain).toBe('tv')
  })

  test('chii.in /subject/{id} → bangumi + tv', () => {
    const r = runDetect('https://chii.in/subject/12345')
    expect(r.result).toBe(true)
    expect(r.platform).toBe('bangumi')
    expect(r.domain).toBe('tv')
  })

  test('trailing slash + query params still detected', () => {
    const r = runDetect('https://bgm.tv/subject/12345/?source=umm')
    expect(r.platform).toBe('bangumi')
    expect(r.domain).toBe('tv')
  })

  test('uppercase host not detected (consistent with other platforms\' case-sensitive includes())', () => {
    const r = runDetect('https://BGM.TV/subject/12345/')
    expect(r.result).toBe(false)
  })

  test('bangumi non-subject path (e.g. /anime) is NOT detected', () => {
    const r = runDetect('https://bgm.tv/anime/browser')
    expect(r.result).toBe(false)
    expect(r.platform).toBeNull()
  })

  test('plain numeric ID is NOT auto-detected as bangumi (respects current platform)', () => {
    const r = runDetect('12345', 'bangumi')
    expect(r.result).toBe(false)
    expect(r.platform).toBeNull()
  })

  test('plain numeric ID with douban selected stays undetected (no false positive)', () => {
    const r = runDetect('12345', 'douban')
    expect(r.result).toBe(false)
  })
})

test.describe('autoDetectPlatform — pre-existing branch regressions', () => {
  test('douban URL still detected with correct subdomain-derived type', () => {
    const r = runDetect('https://movie.douban.com/subject/1292052/')
    expect(r.platform).toBe('douban')
    expect(r.domain).toBe('movie')
  })

  test('imdb URL + tt ID still detected as imdb/movie', () => {
    expect(runDetect('https://www.imdb.com/title/tt1375666/').platform).toBe('imdb')
    expect(runDetect('tt1375666').platform).toBe('imdb')
  })

  test('neodb URL still detected (movie/tv/album routing)', () => {
    expect(runDetect('https://neodb.social/tv/abc123/').platform).toBe('neodb')
    expect(runDetect('https://neodb.social/tv/abc123/').domain).toBe('tv')
    expect(runDetect('https://neodb.social/album/xyz/').domain).toBe('music')
  })

  test('tmdb URL still detected', () => {
    expect(runDetect('https://www.themoviedb.org/movie/550/').platform).toBe('tmdb')
  })

  test('bilibili URL + BV ID still detected as bilibili/video', () => {
    expect(runDetect('https://www.bilibili.com/video/BV1xx411c7mD/').platform).toBe('bilibili')
    expect(runDetect('BV1xx411c7mD').platform).toBe('bilibili')
  })

  test('youtube watch URL + 11-char ID still detected as youtube/video', () => {
    expect(runDetect('https://www.youtube.com/watch?v=dQw4w9WgXcQ').platform).toBe('youtube')
    expect(runDetect('dQw4w9WgXcQ').platform).toBe('youtube')
  })

  test('jav_id format only detected when current platform is jav_ids', () => {
    expect(runDetect('ABP-123', 'jav_ids').platform).toBe('jav_ids')
    expect(runDetect('ABP-123', 'douban').result).toBe(false)
  })

  test('unrecognised input returns false with no callbacks', () => {
    expect(runDetect('random text').result).toBe(false)
  })
})
