import { test, expect } from '@playwright/test';
import { defineGlobal } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { silenceNativePlayers } from '@/scenario/douban/pages/trailer/video-silence';

/**
 * Trailer native-player silencing must be reversible.
 *
 * The old beforeMount mutated the host unconditionally before the Vue app
 * could even resolve/mount: if anything downstream threw, the native player
 * was already gone. silenceNativePlayers() now returns a rollback that
 * restores the removed containers (same parents, same positions) and the
 * stripped video src attributes.
 */

const dom = new JSDOM(
  '<!doctype html><html><body>' +
    '<div id="db-global-nav">nav</div>' +
    '<div id="content">' +
    '<div id="player"><div class="html5-video-container">' +
    '<video src="https://moviestream.doubanio.com/trailer.mp4"></video>' +
    '</div></div>' +
    '<div id="movie_player">flash fallback</div>' +
    '<div class="stage-cont"><video src="https://mo.doubanio.com/clip.webm"></video></div>' +
    '<div class="aside"><div class="links"><a href="/subject/1292052/trailer">全部视频</a></div></div>' +
    '</div>' +
    '<div class="footer-3d">unrelated</div>' +
    '</body></html>',
  { url: 'https://movie.douban.com/subject/1292052/trailer' },
);

defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('location', dom.window.location);
defineGlobal('Node', dom.window.Node);
defineGlobal('HTMLElement', dom.window.HTMLElement);

const doc = dom.window.document;

function snapshotBody(): string {
  return doc.body.innerHTML;
}

test.describe('silenceNativePlayers capture/restore', () => {
  test('silencing pauses, strips src and removes player containers', () => {
    const restore = silenceNativePlayers();
    const videos = [...doc.querySelectorAll('video')];
    for (const v of videos) {
      expect(v.getAttribute('src')).toBeNull();
      expect(v.paused).toBe(true);
    }
    expect(doc.getElementById('player')).toBeNull();
    expect(doc.getElementById('movie_player')).toBeNull();
    expect(doc.querySelector('.stage-cont')).toBeNull();
    restore();
  });

  test('rollback restores containers in place and video src attributes', () => {
    const before = snapshotBody();
    const restore = silenceNativePlayers();
    expect(doc.body.innerHTML).not.toBe(before);
    restore();
    expect(snapshotBody()).toBe(before);
  });

  test('rollback is position-exact among siblings', () => {
    const restore = silenceNativePlayers();
    restore();
    const content = doc.getElementById('content');
    const kids = [...content!.children].map((c) => c.id || c.className);
    expect(kids).toEqual(['player', 'movie_player', 'stage-cont', 'aside']);
  });
});

test.describe('trailer config wiring', () => {
  test('config.ts registers a rollback instead of raw destructive removes', () => {
    const configPath = path.resolve(
      import.meta.dirname,
      '../../src/scenario/douban/pages/trailer/config.ts',
    );
    const src = readFileSync(configPath, 'utf8');
    expect(src).toContain('silenceNativePlayers');
    expect(src).toContain('registerRollback');
    expect(src).not.toMatch(/\.remove\(\)/);
    expect(src).not.toMatch(/removeAttribute\('src'\)/);
  });
});
