import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import locales from '@/entrypoints/content/i18n/locales';
import {
  ASPECT_RATIO,
  MEDIA_FORMATS,
  FORMAT_LABEL_KEYS,
  FORMAT_COLORS,
} from '@/scenario/douban/shared/media-formats';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * media-formats — shared media-format + aspect-ratio constants (rehomed from
 * the deleted shared/constants.ts).
 *
 * Locks the contract: every recognised MEDIA_FORMATS entry must have a chip
 * colour class after label normalisation (FORMAT_LABELS → FORMAT_COLORS), so
 * album pages never render a format chip without a colour.
 */
test.describe('ASPECT_RATIO', () => {
  test('poster 2:3 portrait (movie/tv/album covers, celeb avatars)', () => {
    expect(ASPECT_RATIO.POSTER).toBe('2/3');
  });

  test('square 1:1 (music homepage album art)', () => {
    expect(ASPECT_RATIO.SQUARE).toBe('1');
  });

  test('wide 16:9 landscape (stills, trailers)', () => {
    expect(ASPECT_RATIO.WIDE).toBe('16/9');
  });
});

test.describe('MEDIA_FORMATS', () => {
  test('recognises physical formats (CD/DVD/vinyl/SACD/Blu-ray/VCD/LD)', () => {
    for (const fmt of [
      'CD',
      'DVD',
      'CD/DVD',
      '磁带',
      '黑胶',
      'LP',
      'SACD',
      'Blu-ray',
      'VCD',
      'LD',
    ]) {
      expect(MEDIA_FORMATS.has(fmt), `missing ${fmt}`).toBe(true);
    }
  });

  test('recognises digital formats (both CN and EN spellings)', () => {
    expect(MEDIA_FORMATS.has('数字(Digital)')).toBe(true);
    expect(MEDIA_FORMATS.has('Digital')).toBe(true);
    expect(MEDIA_FORMATS.has('流媒体')).toBe(true);
  });

  test('every format has a chip colour (keyed by the host string itself)', () => {
    for (const fmt of MEDIA_FORMATS) {
      expect(FORMAT_COLORS[fmt], `no chip colour for ${fmt}`).toBeTruthy();
    }
  });

  test('normalised display names are i18n keys; verbose Douban strings shorten to one key', () => {
    // X108：展示名不再写字面量——数据层发键，渲染层 t() 解析（列值由词典配对钉住）。
    expect(FORMAT_LABEL_KEYS['数字(Digital)']).toBe('douban.format.digital');
    expect(FORMAT_LABEL_KEYS['Digital']).toBe('douban.format.digital');
    expect(locales['zh-CN']['douban.format.digital']).toBe('数字');
  });

  test('消费端必须以宿主串查色表（X108 复审：显示名查表会让 zh 的「数字」chip 丢色）', () => {
    const card = fs.readFileSync(
      path.join(REPO, 'src/scenario/douban/pages/search/components/UmmSearchCard.vue'),
      'utf8',
    );
    expect(card, 'UmmSearchCard 必须用宿主串查 FORMAT_COLORS').toContain(
      'FORMAT_COLORS[mediaFormat.hostFormat]',
    );
    expect(card, '不得再用本地化显示名查色表').not.toContain('FORMAT_COLORS[mediaFormat]');
    const albums = fs.readFileSync(
      path.join(REPO, 'src/scenario/douban/pages/albums/App.vue'),
      'utf8',
    );
    expect(albums, 'albums 页同样按宿主串查色表').toContain('FORMAT_COLORS[trimmed]');
  });
});
