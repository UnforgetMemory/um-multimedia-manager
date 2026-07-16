<template>
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
            <button class="umm-detail-btn" @click="goToListing">
              &gt; {{ listingBtnText }}
            </button>
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
          <span class="umm-trailer-count">{{ totalCount }} 个视频</span>
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
            <img
              v-if="item.thumbnail"
              class="umm-trailer-img"
              :src="item.thumbnail"
              :alt="item.title"
              loading="lazy"
              @error="onImgError"
            />
            <div class="umm-trailer-cover-fallback" v-else>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            </div>
            <span class="umm-trailer-duration">{{ item.duration }}</span>
            <span class="umm-trailer-type">{{ item.type === 'trailer' ? '预告片' : '视频评论' }}</span>
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
import { ref } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'

const props = defineProps<{ data: import('./trailer-data').TrailerPageData }>()
const d = props.data

const totalCount = d.items.length
const videoRef = ref<HTMLVideoElement | null>(null)

// Extract native links text from the page's aside.links
const nativeLinks = document.querySelectorAll<HTMLAnchorElement>('.aside .links a')
const listingBtnText = nativeLinks[0]?.textContent?.trim().replace(/^>\s*/, '') || '去 本片全部视频的页面'
const subjectBtnText = nativeLinks[1]?.textContent?.trim().replace(/^>\s*/, '') || `去 ${d.subjectTitle} 的页面`

function openTrailer(item: import('./trailer-data').TrailerItem): void {
  window.open(item.link, '_blank')
}

function pauseVideo(): void {
  videoRef.value?.pause()
}

function goToListing(): void {
  pauseVideo()
  const link = document.querySelector<HTMLAnchorElement>('.aside .links a')
  if (link) {
    window.open(link.getAttribute('href') || '', '_blank')
  }
}

function goToSubject(): void {
  pauseVideo()
  const links = document.querySelectorAll<HTMLAnchorElement>('.aside .links a')
  const link = links.length >= 2 ? links[1] : null
  if (link) {
    window.open(link.getAttribute('href') || '', '_blank')
  }
}

function onImgError(e: Event): void {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
  const fallback = img.nextElementSibling as HTMLElement | null
  if (fallback) fallback.style.display = 'flex'
}
</script>