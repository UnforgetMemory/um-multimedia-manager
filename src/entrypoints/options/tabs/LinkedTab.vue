<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { Store } from '@/features/database'
import type { Domain, Provider } from '@/config'
import { Badge } from '@/shared/ui/badge'
import { Separator } from '@/shared/ui/separator'
import { RefreshCw, Star } from 'lucide-vue-next'
import { JAV_IDS_STORE_NAME, normalizeAvId } from '@/features/adult-av/models'
import { autoDetectPlatform } from '@/features/adult-av/auto-detect'
import SectionContainer from '@/shared/ui/section-container/SectionContainer.vue'

import { PlatformSearchForm } from '@/shared/ui/platform-search-form'
import { PLATFORM_OPTIONS, JAV_SOURCE_OPTIONS } from '../constants'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const linkedInput = ref('')
const linkedSelectedPlatform = ref<string>('douban')
const linkedSelectedDomain = ref<Domain>('movie')
const linkedSelectedJavSource = ref<string>('local')
const isLinkedQuerying = ref(false)

interface LinkedQueryResult {
  source: { provider: string; type: string; providerId: string; url: string; status: number; rating: number; updatedAt: string }
  linked: Array<{ provider: string; type: string; providerId: string; url: string; status: number; rating: number; updatedAt: string; storeName: string }>
}

const linkedQueryResult = ref<LinkedQueryResult | null>(null)
const hasQueryed = ref(false)

function parseLinkedInput() {
  const input = linkedInput.value.trim()
  if (!input) return null
  const provider = linkedSelectedPlatform.value as Provider
  const type = linkedSelectedDomain.value

  // URL-based parsing
  const doubanMatch = input.match(/(?:movie|book|music)\.douban\.com\/subject\/(\d+)/)
  if (doubanMatch) { const isBook = input.includes('book'); const isMusic = input.includes('music'); const id = doubanMatch[1]; const subdomain = isBook ? 'book' : isMusic ? 'music' : 'movie'; return { type: isBook ? 'book' : isMusic ? 'music' : 'movie', provider: 'douban' as Provider, providerId: id, url: `https://${subdomain}.douban.com/subject/${id}/`, valid: true } }
  const imdbMatch = input.match(/imdb\.com\/title\/(tt\d+)/i)
  if (imdbMatch) { const id = imdbMatch[1].toLowerCase(); return { type: 'movie', provider: 'imdb' as Provider, providerId: id, url: `https://www.imdb.com/title/${id}/`, valid: true } }
  const neodbMatch = input.match(/neodb\.social\/(movie|tv|album)\/([\w-]+)/)
  if (neodbMatch) { const [, pathType, id] = neodbMatch; return { type: pathType === 'album' ? 'music' : pathType, provider: 'neodb' as Provider, providerId: id, url: `https://neodb.social/${pathType}/${id}/`, valid: true } }
  const tmdbMovieMatch = input.match(/themoviedb\.org\/movie\/(\d+)/)
  if (tmdbMovieMatch) { const id = tmdbMovieMatch[1]; return { type: 'movie', provider: 'tmdb' as Provider, providerId: id, url: `https://www.themoviedb.org/movie/${id}/`, valid: true } }
  const tmdbTvMatch = input.match(/themoviedb\.org\/tv\/(\d+)/)
  if (tmdbTvMatch) { const id = tmdbTvMatch[1]; return { type: 'tv', provider: 'tmdb' as Provider, providerId: id, url: `https://www.themoviedb.org/tv/${id}/`, valid: true } }
  const bilibiliMatch = input.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/i)
  if (bilibiliMatch) { const id = bilibiliMatch[1]; return { type: 'video', provider: 'bilibili' as Provider, providerId: id, url: `https://www.bilibili.com/video/${id}/`, valid: true } }
  const youtubeMatch = input.match(/(?:youtube\.com|youtu\.be)\/watch\?v=([a-zA-Z0-9_-]{11})/i)
  if (youtubeMatch) { const id = youtubeMatch[1]; return { type: 'video', provider: 'youtube' as Provider, providerId: id, url: `https://www.youtube.com/watch?v=${id}/`, valid: true } }

  // Auto-detect jav_id format — only if platform is jav_ids
  if (provider === 'jav_ids' && /^[A-Za-z0-9]+-[\w-]+(-[UCuc]{1,2})?$/i.test(input)) {
    const key = `${linkedSelectedJavSource.value}::${normalizeAvId(input)}`
    return { type: 'jav_ids', provider: 'jav_ids' as Provider, providerId: key, url: '', valid: true }
  }

  // ID-based parsing for jav_ids
  if (provider === 'jav_ids') {
    return { type, provider, providerId: input, url: '', valid: false, error: t('validation.javFormat') }
  }

  if (/^tt\d+$/i.test(input)) return { type: 'movie', provider: 'imdb' as Provider, providerId: input.toLowerCase(), url: `https://www.imdb.com/title/${input.toLowerCase()}/`, valid: true }
  if (/^BV[a-zA-Z0-9]+$/.test(input)) return { type: 'video', provider: 'bilibili' as Provider, providerId: input, url: `https://www.bilibili.com/video/${input}/`, valid: true }
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return { type: 'video', provider: 'youtube' as Provider, providerId: input, url: `https://www.youtube.com/watch?v=${input}/`, valid: true }
  if (/^\d+$/.test(input)) { const subdomain = linkedSelectedDomain.value === 'music' ? 'music' : linkedSelectedDomain.value === 'book' ? 'book' : linkedSelectedDomain.value === 'game' ? 'www' : 'movie'; const path = linkedSelectedDomain.value === 'game' ? `game` : 'subject'; return { type: linkedSelectedDomain.value, provider: 'douban' as Provider, providerId: input, url: `https://${subdomain}.douban.com/${path}/${input}/`, valid: true } }
  return { type, provider, providerId: input, url: '', valid: false, error: t('validation.cannotParse') }
}

async function queryLinkedData() {
  const parsed = parseLinkedInput()
  if (!parsed || !parsed.valid) { linkedQueryResult.value = null; hasQueryed.value = false; return }
  isLinkedQuerying.value = true
  hasQueryed.value = false
  try {
    if (parsed.provider === 'jav_ids') {
      // Query jav_ids store
      const record = await Store.dbGet(JAV_IDS_STORE_NAME, parsed.providerId)
      if (!record) { linkedQueryResult.value = null; return }
      const source = { provider: 'jav_ids', type: 'jav_ids', providerId: parsed.providerId, url: record.url || '', status: record.status ?? 2, rating: record.rating || 0, updatedAt: record.updatedAt || '' }
      linkedQueryResult.value = { source, linked: [] }
    } else {
      // Query regular record store
      const storeName = `${parsed.provider}_records`
      const key = `${parsed.type}::${parsed.providerId}`
      const record = await Store.dbGet(storeName, key)
      if (!record) { linkedQueryResult.value = null; return }
      const source = { provider: parsed.provider, type: parsed.type, providerId: parsed.providerId, url: record.url, status: record.status, rating: record.rating, updatedAt: record.updatedAt }
      const linked: LinkedQueryResult['linked'] = []
      for (const [lp, lk] of Object.entries(record.linkedIds || {})) {
        if (!lk) continue
        let lt: string, lpid: string
        if (lk.includes('::')) { [lt, lpid] = lk.split('::') } else { lt = parsed.type; lpid = lk }
        const lr = await Store.dbGet(`${lp}_records`, `${lt}::${lpid}`)
        linked.push({ provider: lp, type: lt, providerId: lpid, url: lr?.url || '', status: lr?.status ?? -1, rating: lr?.rating || 0, updatedAt: lr?.updatedAt || '', storeName: `${lp}_records` })
      }
      linkedQueryResult.value = { source, linked }
    }
  } catch { linkedQueryResult.value = null } finally { hasQueryed.value = true; isLinkedQuerying.value = false }
}

let timer: ReturnType<typeof setTimeout> | null = null

function debouncedQuery() {
  if (isLinkedQuerying.value) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => queryLinkedData(), 500)
}

watch(linkedInput, (v) => {
  const input = v.trim()
  if (!input) { linkedQueryResult.value = null; hasQueryed.value = false; return }
  hasQueryed.value = false
  linkedQueryResult.value = null
  autoDetectPlatform(input, linkedSelectedPlatform.value, {
    setPlatform: (p) => { linkedSelectedPlatform.value = p },
    setDomain: (d) => { linkedSelectedDomain.value = d as Domain },
  })
  debouncedQuery()
})

watch(linkedSelectedDomain, () => { if (linkedInput.value.trim() && !isLinkedQuerying.value) debouncedQuery() })
watch(linkedSelectedJavSource, () => { if (linkedSelectedPlatform.value === 'jav_ids' && linkedInput.value.trim() && !isLinkedQuerying.value) debouncedQuery() })
watch(linkedSelectedPlatform, () => { if (linkedInput.value.trim() && !isLinkedQuerying.value) debouncedQuery() })

function getPlatformLabel(p: string): string {
  const labels: Record<string, string> = {
    douban: t('platform.douban'), imdb: t('platform.imdb'), neodb: t('platform.neodb'),
    tmdb: t('platform.tmdb'), bilibili: t('platform.bilibili'), youtube: t('platform.youtube'),
    local: t('platform.local'), jav_ids: t('platform.jav'),
  }
  return labels[p] || p
}
function getStatusText(s: number, type: string): string {
  const isMusic = type === 'music'
  const labels: Record<number, string> = {
    [-1]: t('common.noData'),
    0: isMusic ? t('common.unlistened') : t('common.unwatched'),
    1: t('common.rating'),
    2: isMusic ? t('common.listened') : t('common.watched'),
  }
  return labels[s] || ''
}
function getStatusColor(s: number): string {
  const map: Record<number, string> = {
    '-1': 'var(--umm-color-status-unknown)',
    0: 'var(--umm-color-status-unwatched)',
    1: 'var(--umm-color-status-watched)',
    2: 'var(--umm-color-status-done)',
  }
  return map[s] || map[0]
}

onUnmounted(() => { if (timer) clearTimeout(timer) })
</script>

<template>
  <SectionContainer>
    <PlatformSearchForm
      v-model:platform="linkedSelectedPlatform"
      v-model:domain="linkedSelectedDomain"
      v-model:javSource="linkedSelectedJavSource"
      v-model:search="linkedInput"
      :platform-options="PLATFORM_OPTIONS"
      :jav-source-options="JAV_SOURCE_OPTIONS"
      search-description=""
    />

    <div class="umm:min-h-[60px]">
      <Transition name="fade" mode="out-in">
        <!-- Querying state -->
        <div v-if="isLinkedQuerying" key="querying" class="umm:flex umm:items-center umm:gap-2 umm:p-3 umm:rounded-lg umm:bg-muted/50">
          <RefreshCw class="umm:h-4 umm:w-4 umm:animate-spin umm:text-muted-foreground" />
          <span class="umm:text-sm umm:text-muted-foreground">{{ t('common.loading') }}</span>
        </div>

        <!-- Query result -->
        <div v-else-if="linkedQueryResult" key="result" class="umm:flex umm:flex-col umm:gap-4">
          <div class="umm:p-[var(--umm-card-padding)] umm:border umm:border-border umm:rounded-lg umm:bg-muted/30">
            <div class="umm:flex umm:items-center umm:justify-between umm:mb-3"><h4 class="umm:font-h2 umm:text-primary-content">{{ t('common.search') }}</h4><Badge variant="outline" class="umm:text-xs">{{ getPlatformLabel(linkedQueryResult.source.provider) }}</Badge></div>
            <div class="umm:flex umm:flex-col umm:gap-2 umm:text-sm">
              <div class="umm:flex umm:items-center umm:justify-between"><span class="umm:text-secondary-content">{{ t('common.mediaType') }}</span><span class="umm:font-medium">{{ linkedQueryResult.source.type }}</span></div>
              <div class="umm:flex umm:items-center umm:justify-between"><span class="umm:text-secondary-content">ID</span><span class="umm:font-mono umm:text-xs">{{ linkedQueryResult.source.providerId }}</span></div>
              <div class="umm:flex umm:items-center umm:justify-between"><span class="umm:text-secondary-content">{{ t('common.status') }}</span><Badge :style="{ backgroundColor: getStatusColor(linkedQueryResult.source.status), color: 'hsl(var(--primary-foreground))' }" class="umm:text-xs">{{ getStatusText(linkedQueryResult.source.status, linkedQueryResult.source.type) }}</Badge></div>
              <div v-if="linkedQueryResult.source.rating > 0" class="umm:flex umm:items-center umm:justify-between"><span class="umm:text-secondary-content">{{ t('common.rating') }}</span><span class="umm:font-medium umm:flex umm:items-center umm:gap-1"><Star class="umm:h-3 umm:w-3 umm:text-yellow-500" />{{ linkedQueryResult.source.rating }}/10</span></div>
            </div>
          </div>
          <div v-if="linkedQueryResult.linked.length > 0">
            <Separator class="umm:my-4" /><h4 class="umm:font-h2 umm:text-primary-content umm:mb-3">{{ t('nav.linked') }}</h4>
            <div class="umm:flex umm:flex-col umm:gap-3">
              <div v-for="(item, i) in linkedQueryResult.linked" :key="i" class="umm:p-3 umm:border umm:border-border umm:rounded-lg" :class="{ 'umm:bg-muted/20': item.status === -1 }">
                <div class="umm:flex umm:items-center umm:justify-between umm:mb-2">
                  <div class="umm:flex umm:items-center umm:gap-2"><Badge variant="secondary" class="umm:text-xs">{{ getPlatformLabel(item.provider) }}</Badge><span class="umm:text-xs umm:text-secondary-content">{{ item.type }}</span></div>
                  <Badge :style="{ backgroundColor: getStatusColor(item.status), color: 'hsl(var(--primary-foreground))' }" class="umm:text-xs">{{ getStatusText(item.status, item.type) }}</Badge>
                </div>
                <div class="umm:flex umm:flex-col umm:gap-1 umm:text-sm">
                  <div class="umm:flex umm:items-center umm:justify-between"><span class="umm:text-secondary-content">ID</span><span class="umm:font-mono umm:text-xs">{{ item.providerId }}</span></div>
                  <div v-if="item.rating > 0" class="umm:flex umm:items-center umm:justify-between"><span class="umm:text-secondary-content">{{ t('common.rating') }}</span><span class="umm:font-medium umm:flex umm:items-center umm:gap-1"><Star class="umm:h-3 umm:w-3 umm:text-yellow-500" />{{ item.rating }}/10</span></div>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="umm:p-4 umm:text-center umm:text-sm umm:text-secondary-content umm:border umm:border-dashed umm:border-border umm:rounded-lg">{{ t('common.noData') }}</div>
        </div>

        <!-- Not found -->
        <div v-else-if="linkedInput && hasQueryed && !isLinkedQuerying" key="notfound" class="umm:p-4 umm:text-center umm:text-sm umm:text-secondary-content umm:border umm:border-dashed umm:border-border umm:rounded-lg">{{ t('common.noRecordInDb') }}</div>
      </Transition>
    </div>
  </SectionContainer>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
.fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
