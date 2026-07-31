import { test, expect } from '@playwright/test'
import { normalizeSearchQuery } from '@/utils/search-normalizer'

test.describe('normalizeSearchQuery', () => {
  test.describe('season/episode markers', () => {
    test('S03E1 → Season 3 (extracts actual season number)', () => {
      expect(normalizeSearchQuery('S03E1')).toBe('Season 3')
    })

    test('S03.E01 → Season 3', () => {
      expect(normalizeSearchQuery('S03.E01')).toBe('Season 3')
    })

    test('S3E1 → Season 3', () => {
      expect(normalizeSearchQuery('S3E1')).toBe('Season 3')
    })

    test('S01E01 → Season 1 (single-digit season)', () => {
      expect(normalizeSearchQuery('S01E01')).toBe('Season 1')
    })

    test('S1E1 → Season 1', () => {
      expect(normalizeSearchQuery('S1E1')).toBe('Season 1')
    })

    test('S01 → Season 1 (season-only marker)', () => {
      expect(normalizeSearchQuery('Game of Thrones S01')).toBe('Game of Thrones Season 1')
    })

    test('Season 01 / Episode 01 text form → Season 1', () => {
      expect(normalizeSearchQuery('Breaking Bad Season 01')).toBe('Breaking Bad Season 1')
      expect(normalizeSearchQuery('Breaking Bad Episode 01')).toBe('Breaking Bad Season 1')
    })
  })

  test.describe('CJK queries with resolution tokens (must be preserved)', () => {
    test('CJK remaster query is preserved (4K修复版)', () => {
      expect(normalizeSearchQuery('4K修复版')).toBe('4K修复版')
    })

    test('CJK remaster query with title prefix is preserved (大话西游 4K修复版)', () => {
      expect(normalizeSearchQuery('大话西游 4K修复版')).toBe('大话西游 4K修复版')
    })

    test('CJK query with 1080P token is preserved (1080P修复版)', () => {
      expect(normalizeSearchQuery('1080P修复版')).toBe('1080P修复版')
    })

    test('CJK title + resolution + English release tokens still cut correctly (蜘蛛侠 2021 1080p BluRay)', () => {
      expect(normalizeSearchQuery('蜘蛛侠.2021.1080p.BluRay')).toBe('蜘蛛侠 2021')
    })
  })

  test.describe('release metadata stripping', () => {
    test('full PT torrent filename without year → title + season only', () => {
      const input = 'A.Knight.of.the.Seven.Kingdoms.S01.1080p.WEB-DL.DDP5.1.x265.10bit-Yumi@FRDS'
      expect(normalizeSearchQuery(input)).toBe('A Knight of the Seven Kingdoms Season 1')
    })

    test('season + 2160p WEB-DL x265 → title + season', () => {
      expect(normalizeSearchQuery('Star.Trek.Picard.S03.2160p.WEB-DL.x265.10bit')).toBe(
        'Star Trek Picard Season 3',
      )
    })

    test('season + WEBRip → title + season', () => {
      expect(normalizeSearchQuery('Better.Call.Saul.S06E13.1080p.WEBRip.x264')).toBe(
        'Better Call Saul Season 6',
      )
    })

    test('season + BluRay + release group → title + season', () => {
      expect(normalizeSearchQuery('The.Mandalorian.S01.1080p.BluRay.x264-GROUP')).toBe(
        'The Mandalorian Season 1',
      )
    })

    test('title + year + 1080p BluRay → title + year', () => {
      expect(normalizeSearchQuery('The.Great.Escaper.2023.1080p.BluRay')).toBe(
        'The Great Escaper 2023',
      )
    })

    test('CJK title + year + 1080p → title + year (keeps tokens after year)', () => {
      expect(normalizeSearchQuery('记忆碎片[2000].Memento.1080p')).toBe('记忆碎片 2000 Memento')
    })

    test('plain title without release metadata is untouched', () => {
      expect(normalizeSearchQuery('Interstellar 2014')).toBe('Interstellar 2014')
    })

    test('year + audio-only garbage token → title + year (Dune TRUHD)', () => {
      expect(normalizeSearchQuery('Dune.Part.Two.2024.TRUHD')).toBe('Dune Part Two 2024')
    })

    test('year + dual-audio garbage token → title + year (Fight Club DUAL)', () => {
      expect(normalizeSearchQuery('Fight.Club.1999.DUAL')).toBe('Fight Club 1999')
    })
  })

  test.describe('idempotence', () => {
    const samples = [
      'A.Knight.of.the.Seven.Kingdoms.S01.1080p.WEB-DL.DDP5.1.x265.10bit-Yumi@FRDS',
      'S03E1',
      'The.Great.Escaper.2023.1080p.BluRay',
      '记忆碎片[2000].Memento.1080p',
      'Interstellar 2014',
      '4K修复版',
      '大话西游 4K修复版',
      'Dune.Part.Two.2024.TRUHD',
    ]

    for (const sample of samples) {
      test(`normalize(normalize("${sample}")) is stable`, () => {
        const once = normalizeSearchQuery(sample)
        expect(normalizeSearchQuery(once)).toBe(once)
      })
    }
  })
})
