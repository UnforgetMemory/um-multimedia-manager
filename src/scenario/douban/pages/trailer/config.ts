import { definePageMount } from '../../mount-factory';
import { createApp } from 'vue';
import { hideNavForPage } from '../../shared/hide-nav';
import { silenceNativePlayers } from './video-silence';

export const mountTrailer = definePageMount({
  cssPreset: 'trailer',
  overlayId: 'umm-trailer-overlay',
  importApp: () => import('./App.vue'),
  async beforeMount(_shadow, registerRollback) {
    const { extractTrailerData } = await import('./trailer-data');
    const data = extractTrailerData();
    if (!data) throw new Error('[UMM] Could not extract trailer data');
    hideNavForPage({ type: 'trailer' });

    // Disable native video player to prevent auto-play / audio bleed.
    // Reversible: if the mount fails afterwards, the host player is restored.
    registerRollback(silenceNativePlayers());

    return data;
  },
  createApp: (RootCmp, data) => createApp(RootCmp, { data }),
});
