<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { Store } from '@/features/database'
import type { Domain, Provider } from '@/config'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from 'vue-i18n'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RefreshCw, Star } from 'lucide-vue-next'
import { JAV_IDS_STORE_NAME, normalizeAvId } from '@/features/adult-av/models'
import { autoDetectPlatform } from '@/features/adult-av/auto-detect'

const { t } = useI18n()

const PLATFORM_OPTIONS = [
  { value: 'douban', labelKey: 'platform.douban' as const }, { value: 'imdb', labelKey: 'platform.imdb' as const },
  { value: 'neodb', labelKey: 'platform.neodb' as const }, { value: 'tmdb', labelKey: 'platform.tmdb' as const },
  { value: 'jav_ids', labelKey: 'platform.jav' as const },
] as const

const JAV_SOURCE_OPTIONS = [
  { value: 'javdb', labelKey: 'platform.javdb' as const },
  { value: 'sehuatang', labelKey: 'platform.sehuatang' as const },
  { value: 'local', labelKey: 'platform.local' as const },
] as const

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
  if (doubanMatch) { const isBook = input.includes('book'); const isMusic = input.includes('music'); const id = doubanMatch[1]; const subdomain = isBook ? 'book' : isMusic ? 'music' : 'movie'; return { type: isBook || !isMusic ? 'movie' : 'music', provider: 'douban' as Provider, providerId: id, url: `https://${subdomain}.douban.com/subject/${id}/`, valid: true } }
  const imdbMatch = input.match(/imdb\.com\/title\/(tt\d+)/i)
  if (imdbMatch) { const id = imdbMatch[1].toLowerCase(); return { type: 'movie', provider: 'imdb' as Provider, providerId: id, url: `https://www.imdb.com/title/${id}/`, valid: true } }
  const neodbMatch = input.match(/neodb\.social\/(movie|tv|album)\/([\w-]+)/)
  if (neodbMatch) { const [, pathType, id] = neodbMatch; return { type: pathType === 'album' ? 'music' : pathType, provider: 'neodb' as Provider, providerId: id, url: `https://neodb.social/${pathType}/${id}/`, valid: true } }
  const tmdbMovieMatch = input.match(/themoviedb\.org\/movie\/(\d+)/)
  if (tmdbMovieMatch) { const id = tmdbMovieMatch[1]; return { type: 'movie', provider: 'tmdb' as Provider, providerId: id, url: `https://www.themoviedb.org/movie/${id}/`, valid: true } }
  const tmdbTvMatch = input.match(/themoviedb\.org\/tv\/(\d+)/)
  if (tmdbTvMatch) { const id = tmdbTvMatch[1]; return { type: 'tv', provider: 'tmdb' as Provider, providerId: id, url: `https://www.themoviedb.org/tv/${id}/`, valid: true } }

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
  if (/^\d+$/.test(input)) { const subdomain = linkedSelectedDomain.value === 'music' ? 'music' : 'movie'; return { type: linkedSelectedDomain.value, provider: 'douban' as Provider, providerId: input, url: `https://${subdomain}.douban.com/subject/${input}/`, valid: true } }
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
    tmdb: t('platform.tmdb'), local: t('platform.local'), jav_ids: t('platform.jav'),
  }
  return labels[p] || p
}
function getStatusText(s: number, _type: string): string {
  const labels: Record<number, string> = {
    [-1]: t('common.noData'),
    0: t('common.unwatched'),
    1: t('common.rating'),
    2: t('common.watched'),
  }
  return labels[s] || ''
}
function getStatusColor(s: number): string { return ({ '-1': '#9ca3af', 0: '#6b7280', 1: '#3b82f6', 2: '#10b981' } as Record<number, string>)[s] || '#6b7280' }

onUnmounted(() => { if (timer) clearTimeout(timer) })
</script>

<template>
  <div class="space-y-[var(--section-gap)]">
    <div class="space-y-4 p-[var(--card-padding)] border border-border rounded-lg">
      <div><Label>{{ t('common.selectPlatform') }}</Label><Select v-model="linkedSelectedPlatform" class="mt-2"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="p in PLATFORM_OPTIONS" :key="p.value" :value="p.value">{{ t(p.labelKey) }}</SelectItem></SelectContent></Select></div>
      <div><Label>{{ t('common.mediaType') }}</Label><Select v-model="linkedSelectedDomain" class="mt-2" :disabled="linkedSelectedPlatform === 'jav_ids'"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="movie">{{ t('stats.movie') }}</SelectItem><SelectItem value="tv">{{ t('stats.tv') }}</SelectItem><SelectItem value="music">{{ t('stats.music') }}</SelectItem></SelectContent></Select></div>
      <div v-if="linkedSelectedPlatform === 'jav_ids'"><Label>{{ t('common.source') }}</Label><Select v-model="linkedSelectedJavSource" class="mt-2"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="s in JAV_SOURCE_OPTIONS" :key="s.value" :value="s.value">{{ t(s.labelKey) }}</SelectItem></SelectContent></Select></div>
      <div><Label>{{ linkedSelectedPlatform === 'jav_ids' ? t('platform.jav') : t('common.search') }} ID / URL</Label><Input v-model="linkedInput" :placeholder="linkedSelectedPlatform === 'jav_ids' ? 'FC2-PPV-1234567' : '35401245 / URL'" class="mt-2" /><p class="text-xs-scaled text-muted-foreground mt-2">{{ linkedSelectedPlatform === 'jav_ids' ? t('validation.javFormat') : t('validation.cannotParse') }}</p></div>
    </div>

    <div class="min-h-[60px]">
      <Transition name="fade" mode="out-in">
        <!-- Querying state -->
        <div v-if="isLinkedQuerying" key="querying" class="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
          <RefreshCw class="h-4 w-4 animate-spin text-muted-foreground" />
          <span class="text-sm text-muted-foreground">{{ t('common.loading') }}</span>
        </div>

        <!-- Query result -->
        <div v-else-if="linkedQueryResult" key="result" class="space-y-4">
          <div class="p-[var(--card-padding)] border border-border rounded-lg bg-muted/30">
            <div class="flex items-center justify-between mb-3"><h4 class="font-h2 text-primary-content">{{ t('common.search') }}</h4><Badge variant="outline" class="text-xs">{{ getPlatformLabel(linkedQueryResult.source.provider) }}</Badge></div>
            <div class="space-y-2 text-sm">
              <div class="flex items-center justify-between"><span class="text-secondary-content">{{ t('common.mediaType') }}</span><span class="font-medium">{{ linkedQueryResult.source.type }}</span></div>
              <div class="flex items-center justify-between"><span class="text-secondary-content">ID</span><span class="font-mono text-xs">{{ linkedQueryResult.source.providerId }}</span></div>
              <div class="flex items-center justify-between"><span class="text-secondary-content">{{ t('common.status') }}</span><Badge :style="{ backgroundColor: getStatusColor(linkedQueryResult.source.status), color: 'white' }" class="text-xs">{{ getStatusText(linkedQueryResult.source.status, linkedQueryResult.source.type) }}</Badge></div>
              <div v-if="linkedQueryResult.source.rating > 0" class="flex items-center justify-between"><span class="text-secondary-content">{{ t('common.rating') }}</span><span class="font-medium flex items-center gap-1"><Star class="h-3 w-3 text-yellow-500" />{{ linkedQueryResult.source.rating }}/10</span></div>
            </div>
          </div>
          <div v-if="linkedQueryResult.linked.length > 0">
            <Separator class="my-4" /><h4 class="font-h2 text-primary-content mb-3">{{ t('nav.linked') }}</h4>
            <div class="space-y-3">
              <div v-for="(item, i) in linkedQueryResult.linked" :key="i" class="p-3 border border-border rounded-lg" :class="{ 'bg-muted/20': item.status === -1 }">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2"><Badge variant="secondary" class="text-xs">{{ getPlatformLabel(item.provider) }}</Badge><span class="text-xs-scaled text-secondary-content">{{ item.type }}</span></div>
                  <Badge :style="{ backgroundColor: getStatusColor(item.status), color: 'white' }" class="text-xs">{{ getStatusText(item.status, item.type) }}</Badge>
                </div>
                <div class="space-y-1 text-sm">
                  <div class="flex items-center justify-between"><span class="text-secondary-content">ID</span><span class="font-mono text-xs">{{ item.providerId }}</span></div>
                  <div v-if="item.rating > 0" class="flex items-center justify-between"><span class="text-secondary-content">{{ t('common.rating') }}</span><span class="font-medium flex items-center gap-1"><Star class="h-3 w-3 text-yellow-500" />{{ item.rating }}/10</span></div>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="p-4 text-center text-sm text-secondary-content border border-dashed border-border rounded-lg">{{ t('common.noData') }}</div>
        </div>

        <!-- Not found -->
        <div v-else-if="linkedInput && hasQueryed && !isLinkedQuerying" key="notfound" class="p-4 text-center text-sm text-secondary-content border border-dashed border-border rounded-lg">{{ t('common.noRecordInDb') }}</div>
      </Transition>
    </div>
  </div>
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
