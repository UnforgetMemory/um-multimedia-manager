<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRecordCache } from '../../shared/composables/useRecordCache'
import { useDoubanSection } from '../homepage/composables/useDoubanSection'
import { usePageObserver } from '../homepage/composables/useHomepageObserver'
import { UmmPageLayout } from '@/content/douban/components/UmmPageLayout'
import { UmmMediaCard } from '@/content/douban/components/UmmMediaCard'
import { UmmImageWrapper } from '@/content/douban/components/UmmImageWrapper'
import { extractNewAlbums, extractGenreTags, extractPopularArtists } from './extractors'
import type { GenreTag, PopularArtistItem } from './types'

const { records, load } = useRecordCache()

const { items: newAlbums, refresh: refreshNewAlbums } = useDoubanSection(extractNewAlbums, records)
const genreTags = ref<GenreTag[]>([])
const popularArtists = ref<PopularArtistItem[]>([])

function refreshFromDom() {
  refreshNewAlbums()
  const artists = extractPopularArtists()
  if (artists.length > 0) popularArtists.value = artists
}

const { start } = usePageObserver(refreshFromDom, { containerSelectors: '.popular-artists, .new-albums, [data-react-component="NewAlbums"], .album-content' })

onMounted(async () => {
  await load()
  genreTags.value = extractGenreTags()
  popularArtists.value = extractPopularArtists()
  start()
  // Staggered re-parses for React-injected content
  setTimeout(refreshFromDom, 800)
  setTimeout(refreshFromDom, 2500)
  setTimeout(refreshFromDom, 6000)
  // Dedicated retry for popular artists (SPA renders asynchronously)
  ;(async function retryPopularArtists() {
    for (const delay of [1000, 2000, 3000, 5000]) {
      await new Promise(r => setTimeout(r, delay))
      if (popularArtists.value.length > 0) return
      const artists = extractPopularArtists()
      if (artists.length > 0) { popularArtists.value = artists; return }
    }
  })()
})

function recordFor(item: { subjectId: string }) {
  const rec = records.value.get(item.subjectId)
  return { status: rec?.status ?? 0, rating: rec?.rating ?? 0 }
}
</script>

<template>
  <UmmPageLayout type="music">
    <div class="umm-top-panel">
      <div v-if="genreTags.length > 0" class="umm-section">
        <div class="umm-section-hd">
          <h2>热门音乐人分类</h2>
        </div>
        <div class="umm-genre-tags">
          <a
            v-for="tag in genreTags"
            :key="tag.name"
            :href="tag.href"
            target="_blank"
            rel="noopener noreferrer"
            class="umm-genre-tag"
          >{{ tag.name }}</a>
        </div>
      </div>

      <div class="umm-section">
        <div class="umm-section-hd">
          <h2>新碟榜</h2>
        </div>
        <div v-if="newAlbums.length > 0" class="umm-album-grid">
          <UmmMediaCard
            v-for="item in newAlbums"
            :key="`${item.subjectId}-${recordFor(item).status}-${recordFor(item).rating}`"
            mode="grid"
            :poster-url="item.posterUrl"
            :title="item.title"
            :href="item.href"
            :rating="item.rate"
            :badge-status="recordFor(item).status"
            :badge-rating="recordFor(item).rating"
            type="music"
          />
        </div>
      </div>

      <div v-if="popularArtists.length > 0" class="umm-section">
        <div class="umm-section-hd">
          <h2>流行音乐人</h2>
        </div>
        <div class="umm-artist-grid">
          <a
            v-for="(artist, i) in popularArtists"
            :key="i"
            :href="artist.href"
            target="_blank"
            rel="noopener noreferrer"
            class="umm-artist-card"
          >
            <div class="umm-artist-avatar">
              <UmmImageWrapper
                :src="artist.photoUrl"
                :alt="artist.name"
                aspect-ratio="1"
              />
            </div>
            <span class="umm-artist-name">{{ artist.name }}</span>
            <span class="umm-artist-genre">{{ artist.genre }}</span>
          </a>
        </div>
      </div>
    </div>
  </UmmPageLayout>
</template>
