<template vapor>
  <UmmPageLayout :type="'movie'" :newTab="true">
    <div :class="['umm-trailer-root', d.isDetail ? 'umm-trailer-root--detail' : '']">
      <!-- Detail page: video player -->
      <template v-if="d.isDetail">
        <div class="umm-trailer-detail">
          <div class="umm-detail-header">
            <h1 class="umm-trailer-title">{{ d.title }}</h1>
            <span v-if="d.date" class="umm-detail-date">{{ d.date }}</span>
          </div>

          <div class="umm-detail-video-wrap">
            <video
              ref="videoRef"
              class="umm-detail-video"
              :src="d.videoUrl"
              controls
              playsinline
            ></video>
          </div>

          <p v-if="d.description" class="umm-detail-desc">{{ d.description }}</p>

          <div class="umm-detail-btns">
            <button class="umm-detail-btn" @click="goToListing">&gt; {{ listingBtnText }}</button>
            <button class="umm-detail-btn umm-detail-btn--secondary" @click="goToSubject">
              &gt; {{ subjectBtnText }}
            </button>
          </div>
        </div>
      </template>

      <!-- Listing page: header + grid -->
      <template v-else>
        <div class="umm-trailer-header">
          <h1 class="umm-trailer-title">{{ d.subjectTitle }}</h1>
          <span class="umm-trailer-count">{{
            t('douban.trailer.count', { count: totalCount })
          }}</span>
        </div>
      </template>

      <!-- Grid (shown for both, but on detail page it's sidebar) -->
      <div :class="d.isDetail ? 'umm-trailer-sidebar' : 'umm-trailer-grid'">
        <div
          v-for="(item, i) in d.items"
          :key="i"
          class="umm-trailer-card"
          @click="openTrailer(item)"
        >
          <div class="umm-trailer-cover">
            <!-- The placeholder is unconditional, not `v-else`: a thumbnail URL
                 can be present and still fail to load, and `@error` below needs
                 something to reveal. The image paints over it (see
                 `.umm-trailer-img` in styles/trailer.css) and `@load` retires the
                 placeholder once real pixels exist — otherwise an alpha thumbnail
                 would show the play icon through itself. `loading="lazy"` is what
                 makes the listener-before-load order safe: the fetch cannot start
                 (so `load` cannot fire) while the element is still detached. -->
            <img
              v-if="item.thumbnail"
              class="umm-trailer-img"
              :src="item.thumbnail"
              :alt="item.title"
              loading="lazy"
              @error="onImgError"
              @load="onImgLoad"
            />
            <div class="umm-trailer-cover-fallback">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
            <span class="umm-trailer-duration">{{ item.duration }}</span>
            <span class="umm-trailer-type">{{
              item.type === 'trailer' ? t('douban.trailer_word') : t('douban.video_review')
            }}</span>
          </div>
          <div class="umm-trailer-info">
            <div class="umm-trailer-name">{{ item.title }}</div>
            <div class="umm-trailer-meta">
              <span v-if="item.date">{{ item.date }}</span>
              <span v-if="item.author">· {{ item.author }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </UmmPageLayout>
</template>

<script setup lang="ts">
import { openExternalUrl } from '@/libraries/utils/safe-url';
import { useTemplateRef } from 'vue';
import { UmmPageLayout } from '@/scenario/douban/components/umm-page-layout';
import { t } from '../../shared/legacy-bridge';

const props = defineProps<{ data: import('./trailer-data').TrailerPageData }>();
const d = props.data;

const totalCount = d.items.length;
const videoRef = useTemplateRef<HTMLVideoElement>('videoRef');

// Extract native links text from the page's aside.links
const nativeLinks = document.querySelectorAll<HTMLAnchorElement>('.aside .links a');
const listingBtnText =
  nativeLinks[0]?.textContent?.trim().replace(/^>\s*/, '') || t('douban.trailer.go_all');
const subjectBtnText =
  nativeLinks[1]?.textContent?.trim().replace(/^>\s*/, '') ||
  t('douban.trailer.go_subject', { title: d.subjectTitle });

function openTrailer(item: import('./trailer-data').TrailerItem): void {
  openExternalUrl(item.link);
}

function pauseVideo(): void {
  videoRef.value?.pause();
}

function goToListing(): void {
  pauseVideo();
  const link = document.querySelector<HTMLAnchorElement>('.aside .links a');
  if (link) {
    openExternalUrl(link.getAttribute('href'));
  }
}

function goToSubject(): void {
  pauseVideo();
  const links = document.querySelectorAll<HTMLAnchorElement>('.aside .links a');
  const link = links.length >= 2 ? links[1] : null;
  if (link) {
    openExternalUrl(link.getAttribute('href'));
  }
}

function onImgError(e: Event): void {
  const img = e.target as HTMLImageElement;
  img.style.display = 'none';
  const fallback = img.nextElementSibling as HTMLElement | null;
  if (fallback) fallback.style.display = 'flex';
}

function onImgLoad(e: Event): void {
  const img = e.target as HTMLImageElement;
  const fallback = img.nextElementSibling as HTMLElement | null;
  if (fallback) fallback.style.display = 'none';
}
</script>
