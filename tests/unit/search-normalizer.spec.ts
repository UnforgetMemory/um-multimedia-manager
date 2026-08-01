import { test, expect } from '@playwright/test'
import { collapseInputSpaces, normalizeSearchQuery } from '@/utils/search-normalizer'

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

  test.describe('version markers (V2/V3/REPACK) stripping', () => {
    test('V2 version marker stripped (Wrinkles case)', () => {
      const input = 'Wrinkles.2011.V2.1080p.BluRay.x265.10bit.DTS.2Audio-ADE'
      expect(normalizeSearchQuery(input)).toBe('Wrinkles 2011')
    })

    test('V3 version marker stripped', () => {
      expect(normalizeSearchQuery('Inception.2010.V3.1080p.BluRay.x264')).toBe('Inception 2010')
    })

    test('version marker without resolution still stripped (release group kept)', () => {
      // Without a resolution marker, release-group vs title word is ambiguous — keep ADE.
      expect(normalizeSearchQuery('Movie.2019.V2-ADE')).toBe('Movie 2019 ADE')
    })

    test('idempotence: V2 already normalized stays stable', () => {
      const once = normalizeSearchQuery('Wrinkles.2011.V2.1080p.BluRay')
      expect(normalizeSearchQuery(once)).toBe(once)
    })
  })

  test.describe('IMDb URL input normalization', () => {
    test('full IMDb URL → extracted tt-id', () => {
      expect(normalizeSearchQuery('https://www.imdb.com/title/tt22084616/')).toBe('tt22084616')
    })

    test('IMDb URL without trailing slash', () => {
      expect(normalizeSearchQuery('https://www.imdb.com/title/tt22084616')).toBe('tt22084616')
    })

    test('imdb.com short URL form', () => {
      expect(normalizeSearchQuery('https://imdb.com/title/tt0111161')).toBe('tt0111161')
    })

    test('plain tt-id stays unchanged', () => {
      expect(normalizeSearchQuery('tt22084616')).toBe('tt22084616')
    })

    test('idempotence: extracted tt-id stable', () => {
      const once = normalizeSearchQuery('https://www.imdb.com/title/tt22084616/')
      expect(normalizeSearchQuery(once)).toBe(once)
    })
  })

  test.describe('CJK 连字符标题（回归保护）', () => {
    test('X-战警 → X 战警（连字符转空格，不破坏搜索）', () => {
      expect(normalizeSearchQuery('X-战警')).toBe('X 战警')
    })

    test('蜘蛛侠-英雄归来 → 空格分隔', () => {
      expect(normalizeSearchQuery('蜘蛛侠-英雄归来')).toBe('蜘蛛侠 英雄归来')
    })
  })

  test.describe('special release markers (CC/Criterion/UNCUT/DC/...) stripping', () => {
    test('CC marker stripped (Mean Streets case)', () => {
      const input = 'Mean.Streets.1973.CC.2160p.UHD.BluRay.x265.10bit.DV.FLAC.1.0-ADE'
      expect(normalizeSearchQuery(input)).toBe('Mean Streets 1973')
    })

    test('CC marker without resolution marker stripped', () => {
      expect(normalizeSearchQuery('The.Fisher.King.CC.1991')).toBe('The Fisher King 1991')
    })

    test('Criterion Collection phrase stripped', () => {
      expect(normalizeSearchQuery('The.Fisher.King.Criterion.Collection.2160p.BluRay.x265')).toBe(
        'The Fisher King',
      )
    })

    test('standalone Criterion token stripped', () => {
      expect(normalizeSearchQuery('The.Fisher.King.Criterion.1991.2160p')).toBe('The Fisher King 1991')
    })

    test('UNCUT is NOT stripped (Uncut Gems is a real title)', () => {
      expect(normalizeSearchQuery('Uncut.Gems.2019.1080p.BluRay.x264')).toBe('Uncut Gems 2019')
    })

    test('UNCUT after year stays when no real-title conflict (release flag residue accepted)', () => {
      expect(normalizeSearchQuery('The.Exorcist.1973.UNCUT.1080p.BluRay.x264')).toBe(
        'The Exorcist 1973 UNCUT',
      )
    })

    test('DC is NOT stripped (AC/DC band, DC League of Super-Pets are real titles)', () => {
      expect(normalizeSearchQuery('AC.DC.Live.at.River.Plate.2009.BluRay.x264')).toBe(
        'AC DC Live at River Plate 2009',
      )
      expect(normalizeSearchQuery('DC.League.of.Super-Pets.2022.1080p.BluRay.x265')).toBe(
        'DC League of Super Pets 2022',
      )
    })

    test('RESTORED marker stripped', () => {
      expect(normalizeSearchQuery('The.Exorcist.1973.RESTORED.2160p.BluRay')).toBe('The Exorcist 1973')
    })

    test('THEATRICAL marker stripped', () => {
      expect(normalizeSearchQuery('Dune.2021.THEATRICAL.2160p.BluRay.x265')).toBe('Dune 2021')
    })

    test('CJK guard on strip list: CC字幕 preserved (no CJK tail guard bypass)', () => {
      expect(normalizeSearchQuery('CC字幕')).toBe('CC字幕')
    })

    test('CJK guard on strip list: space-separated Chinese phrase preserved (CC 字幕)', () => {
      expect(normalizeSearchQuery('CC 字幕')).toBe('CC 字幕')
    })

    test('CJK guard on strip list: DC动画电影宇宙 preserved', () => {
      expect(normalizeSearchQuery('DC动画电影宇宙')).toBe('DC动画电影宇宙')
    })

    test('UHD before resolution marker cut', () => {
      expect(normalizeSearchQuery('Movie.2023.UHD.BluRay.x265')).toBe('Movie 2023')
    })

    test('IMAX before resolution marker cut', () => {
      expect(normalizeSearchQuery('Oppenheimer.2023.IMAX.2160p.BluRay.x265')).toBe('Oppenheimer 2023')
    })

    test('DV before resolution marker cut', () => {
      expect(normalizeSearchQuery('Movie.2023.DV.2160p.HDR')).toBe('Movie 2023')
    })

    test('WEB-DL without resolution still cut (space-form match)', () => {
      expect(normalizeSearchQuery('Movie.2023.WEB-DL.x265')).toBe('Movie 2023')
    })

    test('CJK phrase with new cut marker still preserved (HDR修复版)', () => {
      expect(normalizeSearchQuery('HDR修复版')).toBe('HDR修复版')
    })

    test('idempotence: CC-normalized query stays stable', () => {
      const once = normalizeSearchQuery('Mean.Streets.1973.CC.2160p.UHD.BluRay.x265.10bit.DV.FLAC.1.0-ADE')
      expect(normalizeSearchQuery(once)).toBe(once)
    })
  })

  test.describe('collapseInputSpaces (live typing space handling)', () => {
    test('single trailing space preserved while typing', () => {
      expect(collapseInputSpaces('Mean Streets ')).toBe('Mean Streets ')
    })

    test('two trailing spaces collapsed to one', () => {
      expect(collapseInputSpaces('Mean Streets  ')).toBe('Mean Streets ')
    })

    test('three trailing spaces collapsed to one', () => {
      expect(collapseInputSpaces('Mean Streets   ')).toBe('Mean Streets ')
    })

    test('internal double space collapsed', () => {
      expect(collapseInputSpaces('Mean  Streets')).toBe('Mean Streets')
    })

    test('leading spaces collapsed to one, not trimmed', () => {
      expect(collapseInputSpaces('  Mean Streets')).toBe(' Mean Streets')
    })

    test('input without double spaces unchanged', () => {
      expect(collapseInputSpaces('Mean.Streets.1973')).toBe('Mean.Streets.1973')
    })

    test('trigger-time trim still strips trailing space (doSearch path)', () => {
      expect(normalizeSearchQuery('Mean Streets ')).toBe('Mean Streets')
    })
  })
