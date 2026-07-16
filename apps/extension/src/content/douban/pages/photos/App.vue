<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { ASPECT_RATIO } from '@/content/douban/shared/constants'
import type { PhotosPageData, PhotoItem } from './photos-data'

const props = defineProps<{ data: PhotosPageData }>()
const d = props.data

const aspectRatio = computed(() => d.photoType === 'R' ? ASPECT_RATIO.POSTER : ASPECT_RATIO.WIDE)

// Gallery state
const galleryOpen = ref(false)
const galleryIndex = ref(0)
const galleryZoom = ref(1)
const galleryPanX = ref(0)
const galleryPanY = ref(0)
const isDragging = ref(false)
const imageSize = ref('')
let dragStartX = 0
let dragStartY = 0
let panStartX = 0
let panStartY = 0

const currentPhoto = computed<PhotoItem | null>(() =>
  galleryOpen.value ? (d.photos[galleryIndex.value] ?? null) : null,
)

const photoCount = computed(() => d.photos.length)

function onImgLoad(e: Event): void {
  const img = e.target as HTMLImageElement
  imageSize.value = `${img.naturalWidth} × ${img.naturalHeight}`
}

function openGallery(index: number): void {
  galleryIndex.value = index
  galleryZoom.value = 1
  galleryPanX.value = 0
  galleryPanY.value = 0
  imageSize.value = ''
  galleryOpen.value = true
}

function closeGallery(): void {
  galleryOpen.value = false
}

function prevPhoto(): void {
  if (galleryIndex.value > 0) {
    galleryIndex.value--
    resetZoom()
    imageSize.value = ''
  }
}

function nextPhoto(): void {
  if (galleryIndex.value < photoCount.value - 1) {
    galleryIndex.value++
    resetZoom()
    imageSize.value = ''
  }
}

function resetZoom(): void {
  galleryZoom.value = 1
  galleryPanX.value = 0
  galleryPanY.value = 0
}

function onWheel(e: WheelEvent): void {
  if (!galleryOpen.value) return
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.15 : 0.15
  galleryZoom.value = Math.max(1, Math.min(4, galleryZoom.value + delta))
  // Clamp pan so image doesn't drift off-screen when zooming out
  clampPan()
}

function onMouseDown(e: MouseEvent): void {
  if (!galleryOpen.value || galleryZoom.value <= 1) return
  isDragging.value = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  panStartX = galleryPanX.value
  panStartY = galleryPanY.value
}

function onMouseMove(e: MouseEvent): void {
  if (!isDragging.value) return
  galleryPanX.value = panStartX + (e.clientX - dragStartX) * 0.4
  galleryPanY.value = panStartY + (e.clientY - dragStartY) * 0.4
}

function onMouseUp(): void {
  isDragging.value = false
}

function onKeyDown(e: KeyboardEvent): void {
  if (!galleryOpen.value) return
  if (e.key === 'Escape') closeGallery()
  if (e.key === 'ArrowLeft') prevPhoto()
  if (e.key === 'ArrowRight') nextPhoto()
}

function clampPan(): void {
  const maxPan = (galleryZoom.value - 1) * 200
  galleryPanX.value = Math.max(-maxPan, Math.min(maxPan, galleryPanX.value))
  galleryPanY.value = Math.max(-maxPan, Math.min(maxPan, galleryPanY.value))
}

function goToPage(url: string): void {
  if (url) window.location.href = url
}

function openLink(href: string): void {
  window.open(href, '_blank')
}

function downloadPhoto(photo: PhotoItem): void {
  const ext = photo.src.split('.').pop()?.split('?')[0] || 'jpg'
  chrome.runtime.sendMessage({
    type: 'DOWNLOAD_FILE',
    payload: { url: photo.src, filename: `${photo.id}.${ext}` },
  })
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('mousemove', onMouseMove)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('mouseup', onMouseUp)
  window.removeEventListener('mousemove', onMouseMove)
})
</script>

<template>
  <UmmPageLayout type="movie">
    <div class="umm-photos-root">
      <!-- Header -->
      <div class="umm-photos-header">
        <h1 class="umm-photos-title">{{ d.title }}</h1>
        <span class="umm-photos-count">共 {{ d.pageInfo.totalCount }} 张</span>

        <div class="umm-photos-nav">
          <span
            class="umm-nav-btn"
            :class="{ 'umm-nav-btn--disabled': !d.pageInfo.prevUrl }"
            @click="goToPage(d.pageInfo.prevUrl)"
          >‹ 上一页</span>
          <span class="umm-nav-page">第 {{ d.pageInfo.currentPage }} / {{ d.pageInfo.totalPages }} 页</span>
          <span
            class="umm-nav-btn"
            :class="{ 'umm-nav-btn--disabled': !d.pageInfo.nextUrl }"
            @click="goToPage(d.pageInfo.nextUrl)"
          >下一页 ›</span>
        </div>
      </div>

      <!-- Photo grid -->
      <div class="umm-photo-section">
        <div v-if="d.filterTabs.length" class="umm-photo-filters">
          <span
            v-for="tab in d.filterTabs"
            :key="tab.label"
            class="umm-filter-tab"
            :class="{ 'umm-filter-tab--active': tab.isCurrent }"
            @click="goToPage(tab.url)"
          >{{ tab.label }}</span>
        </div>

        <div v-if="d.subFilters.length" class="umm-photo-subfilters">
          <span
            v-for="tab in d.subFilters"
            :key="tab.label"
            class="umm-filter-tab umm-filter-tab--sub"
            @click="goToPage(tab.url)"
          >{{ tab.label }}</span>
        </div>

        <div v-if="d.photos.length === 0" class="umm-photo-empty">
          暂无筛选结果
        </div>
        <div v-else class="umm-photo-grid" :class="'umm-photo-grid--' + (d.photoType === 'R' ? 'poster' : 'stills')">
          <div
            v-for="(photo, i) in d.photos"
            :key="photo.id"
            class="umm-photo-card"
            @click="openGallery(i)"
          >
            <div class="umm-photo-cover">
              <UmmImageWrapper
                :src="photo.src"
                :alt="photo.caption || '照片'"
                :aspect-ratio="aspectRatio"
              />
              <span class="umm-dl-btn" title="下载" @click.stop="downloadPhoto(photo)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7,10 12,15 17,10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </span>
            </div>
            <div v-if="photo.caption" class="umm-photo-caption">{{ photo.caption }}</div>
          </div>
        </div>
      </div>

      <!-- Footer pagination -->
      <div class="umm-photo-footer">
        <span
          class="umm-nav-btn"
          :class="{ 'umm-nav-btn--disabled': !d.pageInfo.prevUrl }"
          @click="goToPage(d.pageInfo.prevUrl)"
        >‹ 上一页</span>
        <span class="umm-nav-page">第 {{ d.pageInfo.currentPage }} / {{ d.pageInfo.totalPages }} 页</span>
        <span
          class="umm-nav-btn"
          :class="{ 'umm-nav-btn--disabled': !d.pageInfo.nextUrl }"
          @click="goToPage(d.pageInfo.nextUrl)"
        >下一页 ›</span>
      </div>

      <!-- Sidebar navigation buttons (all_photos page) -->
      <div v-if="d.sidebarLinks.length" class="umm-photo-sidebar-btns">
        <button
          v-for="(link, i) in d.sidebarLinks"
          :key="i"
          class="umm-photo-sidebar-btn"
          @click="openLink(link.href)"
        >&gt; {{ link.text }}</button>
      </div>
    </div>

    <!-- Fullscreen gallery overlay -->
    <div v-if="galleryOpen" class="umm-gallery-overlay" @wheel.prevent="onWheel" @mousedown="onMouseDown" @dblclick="resetZoom">
        <!-- Close button: top-right -->
        <button class="umm-gallery-close" @click="closeGallery">&times;</button>

        <!-- Download button: top-left -->
        <button class="umm-gallery-dl" title="下载" @click="currentPhoto && downloadPhoto(currentPhoto)">下载</button>

        <!-- Image container -->
        <div class="umm-gallery-stage">
          <!-- Left nav -->
          <button
            v-if="galleryIndex > 0"
            class="umm-gallery-nav umm-gallery-nav--prev"
            @click="prevPhoto"
          >‹</button>

          <div class="umm-gallery-viewport">
            <img
              v-if="currentPhoto"
              :src="currentPhoto.src"
              :alt="currentPhoto.caption || '照片'"
              class="umm-gallery-img"
              :style="{
                transform: `scale(${galleryZoom}) translate(${galleryPanX}px, ${galleryPanY}px)`,
                cursor: galleryZoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
              }"
              draggable="false"
              @load="onImgLoad"
            />
          </div>

          <!-- Right nav -->
          <button
            v-if="galleryIndex < photoCount - 1"
            class="umm-gallery-nav umm-gallery-nav--next"
            @click="nextPhoto"
          >›</button>
        </div>

        <!-- Bottom bar: res left, zoom center, counter right -->
        <div class="umm-gallery-bottombar">
          <span class="umm-gallery-res">{{ imageSize }}</span>
          <div class="umm-gallery-btm-center">
            <div v-if="galleryZoom > 1" class="umm-gallery-zoom-badge">{{ galleryZoom.toFixed(1) }}x</div>
          </div>
          <span class="umm-gallery-counter">
            <Transition name="counter-num" mode="out-in">
              <span :key="galleryIndex" class="umm-gallery-counter-num">{{ galleryIndex + 1 }}</span>
            </Transition>
            <span class="umm-gallery-counter-total"> / {{ photoCount }}</span>
          </span>
        </div>
      </div>
  </UmmPageLayout>
</template>