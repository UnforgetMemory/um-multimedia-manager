<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { Store } from '@/features/database'
import type { Domain, Provider } from '@/config'
import type { StoreRecord } from '@/types'
import { useI18n } from 'vue-i18n'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Star, CheckCircle2, XCircle, Database, RefreshCw } from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import { JAV_IDS_STORE_NAME, normalizeAvId } from '@/features/adult-av/models'
import { JAV_ID_REGEX, autoDetectPlatform } from '@/features/adult-av/auto-detect'
import SectionContainer from '@/shared/ui/section-container/SectionContainer.vue'

import FormField from '@/shared/ui/form-field/FormField.vue'
import { PLATFORM_OPTIONS, JAV_SOURCE_OPTIONS } from '../constants'

const { t } = useI18n()
const toast = useToast()

interface RatingQueryRecord extends StoreRecord {
  type: string
  provider: Provider
  providerId: string
}

const ratingInput = ref('')
const ratingValue = ref<number | null>(null)
const ratingComment = ref('')
const selectedPlatform = ref<string>('douban')
const selectedDomain = ref<Domain>('movie')
const selectedJavSource = ref<string>('local')
const ratingQueryResult = ref<RatingQueryRecord | null>(null)
const isQuerying = ref(false)
const hasQueryed = ref(false)
let queryDebounceTimer: ReturnType<typeof setTimeout> | null = null

const parseResult = computed(() => {
  if (!ratingInput.value.trim()) return null
  return parseRatingInput()
})

function validateAndNormalizeProviderId(provider: Provider, _type: Domain, rawId: string): { valid: boolean; normalizedId: string; error?: string } {
  const trimmed = rawId.trim()
  if (!trimmed) return { valid: false, normalizedId: '', error: t('validation.idRequired') }
  if (provider === 'imdb') {
    if (/^tt\d+$/i.test(trimmed)) return { valid: true, normalizedId: trimmed.toLowerCase() }
    if (/^\d+$/.test(trimmed)) return { valid: true, normalizedId: `tt${trimmed}` }
    return { valid: false, normalizedId: '', error: t('validation.imdbFormat') }
  }
  if (provider === 'douban') {
    if (/^\d+$/.test(trimmed)) return { valid: true, normalizedId: trimmed }
    return { valid: false, normalizedId: '', error: t('validation.doubanFormat') }
  }
  if (provider === 'neodb') {
    if (/^[\w-]+$/.test(trimmed)) return { valid: true, normalizedId: trimmed }
    return { valid: false, normalizedId: '', error: t('validation.neodbFormat') }
  }
  if (provider === 'tmdb') {
    if (/^\d+$/.test(trimmed)) return { valid: true, normalizedId: trimmed }
    return { valid: false, normalizedId: '', error: t('validation.tmdbFormat') }
  }
  if (provider === 'jav_ids') {
    if (JAV_ID_REGEX.test(trimmed)) return { valid: true, normalizedId: normalizeAvId(trimmed) }
    return { valid: false, normalizedId: '', error: t('validation.javFormat') }
  }
  return { valid: false, normalizedId: '', error: t('validation.unknownPlatform') }
}

function parseRatingInput() {
  const input = ratingInput.value.trim()
  if (!input) return null
  const provider = selectedPlatform.value as Provider
  const type = selectedDomain.value

  // URL-based parsing
  const doubanMatch = input.match(/(?:movie|book|music)\.douban\.com\/subject\/(\d+)/)
  if (doubanMatch) {
    const isBook = input.includes('book'); const isMusic = input.includes('music')
    const id = doubanMatch[1]; const subdomain = isBook ? 'book' : isMusic ? 'music' : 'movie'
    return { type: isBook || !isMusic ? 'movie' : 'music', provider: 'douban' as Provider, providerId: id, url: `https://${subdomain}.douban.com/subject/${id}/`, valid: true }
  }
  const imdbMatch = input.match(/imdb\.com\/title\/(tt\d+)/i)
  if (imdbMatch) { const id = imdbMatch[1].toLowerCase(); return { type: 'movie', provider: 'imdb' as Provider, providerId: id, url: `https://www.imdb.com/title/${id}/`, valid: true } }
  const neodbMatch = input.match(/neodb\.social\/(movie|tv|album)\/([\w-]+)/)
  if (neodbMatch) { const [, pathType, id] = neodbMatch; return { type: pathType === 'album' ? 'music' : pathType, provider: 'neodb' as Provider, providerId: id, url: `https://neodb.social/${pathType}/${id}/`, valid: true } }
  const tmdbMovieMatch = input.match(/themoviedb\.org\/movie\/(\d+)/)
  if (tmdbMovieMatch) { const id = tmdbMovieMatch[1]; return { type: 'movie', provider: 'tmdb' as Provider, providerId: id, url: `https://www.themoviedb.org/movie/${id}/`, valid: true } }
  const tmdbTvMatch = input.match(/themoviedb\.org\/tv\/(\d+)/)
  if (tmdbTvMatch) { const id = tmdbTvMatch[1]; return { type: 'tv', provider: 'tmdb' as Provider, providerId: id, url: `https://www.themoviedb.org/tv/${id}/`, valid: true } }

  // Auto-detect jav_id format — only if platform is jav_ids
  if (provider === 'jav_ids' && JAV_ID_REGEX.test(input)) {
    const key = `${selectedJavSource.value}::${normalizeAvId(input)}`
    return { type: 'jav_ids', provider: 'jav_ids' as Provider, providerId: key, url: '', valid: true }
  }

  // ID-based parsing for jav_ids
  if (provider === 'jav_ids') {
    const validation = validateAndNormalizeProviderId(provider, type, input)
    if (!validation.valid) return { type, provider, providerId: input, url: '', valid: false, error: validation.error }
    const key = `${selectedJavSource.value}::${validation.normalizedId}`
    return { type: 'jav_ids', provider: 'jav_ids' as Provider, providerId: key, url: '', valid: true }
  }

  const validation = validateAndNormalizeProviderId(provider, type, input)
  if (!validation.valid) return { type, provider, providerId: input, url: '', valid: false, error: validation.error }

  const nId = validation.normalizedId
  let url = ''
  if (provider === 'douban') url = type === 'music' ? `https://music.douban.com/subject/${nId}/` : `https://movie.douban.com/subject/${nId}/`
  else if (provider === 'imdb') url = `https://www.imdb.com/title/${nId}/`
  else if (provider === 'neodb') { const p = type === 'tv' ? 'tv' : type === 'music' ? 'album' : 'movie'; url = `https://neodb.social/${p}/${nId}/` }
  else if (provider === 'tmdb') url = type === 'tv' ? `https://www.themoviedb.org/tv/${nId}/` : `https://www.themoviedb.org/movie/${nId}/`
  return { type, provider, providerId: nId, url, valid: true }
}

function getStatusLabel(status: number, type: string): string {
  if (type === 'music') {
    const labels: Record<number, string> = { 0: t('common.unwatched'), 1: t('common.rating'), 2: t('common.watched') }
    return labels[status] || ''
  }
  const labels: Record<number, string> = { 0: t('common.unwatched'), 1: t('common.rating'), 2: t('common.watched') }
  return labels[status] || ''
}

async function queryRecordFromDB() {
  const parsed = parseRatingInput()
  if (!parsed) { ratingQueryResult.value = null; hasQueryed.value = false; isQuerying.value = false; return }
  isQuerying.value = true
  hasQueryed.value = false
  try {
    if (parsed.provider === 'jav_ids') {
      const record = await Store.dbGet(JAV_IDS_STORE_NAME, parsed.providerId)
      ratingQueryResult.value = record ? { ...record, type: 'jav_ids', provider: 'jav_ids', providerId: parsed.providerId } : null
    } else {
      const storeName = `${parsed.provider}_records`
      const key = `${parsed.type}::${parsed.providerId}`
      const record = await Store.dbGet(storeName, key)
      ratingQueryResult.value = record ? { ...record, type: parsed.type, provider: parsed.provider, providerId: parsed.providerId } : null
    }
  } catch { ratingQueryResult.value = null } finally { hasQueryed.value = true; isQuerying.value = false }
}

function debouncedQuery() {
  if (isQuerying.value) return
  if (queryDebounceTimer) clearTimeout(queryDebounceTimer)
  queryDebounceTimer = setTimeout(() => queryRecordFromDB(), 500)
}

watch(ratingInput, (v) => {
  const input = v.trim()
  if (!input) { ratingQueryResult.value = null; hasQueryed.value = false; return }
  hasQueryed.value = false
  ratingQueryResult.value = null
  autoDetectPlatform(input, selectedPlatform.value, {
    setPlatform: (p) => { selectedPlatform.value = p },
    setDomain: (d) => { selectedDomain.value = d as Domain },
  })
  debouncedQuery()
})

watch(selectedDomain, () => { if (ratingInput.value.trim() && !isQuerying.value) debouncedQuery() })
watch(selectedJavSource, () => { if (selectedPlatform.value === 'jav_ids' && ratingInput.value.trim() && !isQuerying.value) debouncedQuery() })
watch(selectedPlatform, () => { if (ratingInput.value.trim() && !isQuerying.value) debouncedQuery() })

  async function saveRating() {
    if (!ratingInput.value.trim()) { toast.error(t('validation.cannotParse')); return }
    if (!ratingValue.value || ratingValue.value < 1 || ratingValue.value > 10) { toast.error(t('common.ratingRequired')); return }
    const parsed = parseRatingInput()
    if (!parsed) { toast.error(t('validation.cannotParse')); return }
  try {
    if (parsed.provider === 'jav_ids') {
      const existing = await Store.dbGet(JAV_IDS_STORE_NAME, parsed.providerId)
      await Store.dbPut(JAV_IDS_STORE_NAME, parsed.providerId, {
        url: parsed.url || existing?.url || '',
        status: existing?.status ?? 2,
        rating: ratingValue.value,
        comment: ratingComment.value || undefined,
        updatedAt: new Date().toISOString(),
        linkedIds: existing?.linkedIds ?? {},
      })
    } else {
      const storeName = `${parsed.provider}_records`
      const key = `${parsed.type}::${parsed.providerId}`
      const existing = await Store.dbGet(storeName, key)
      await Store.dbPut(storeName, key, { url: parsed.url, status: existing?.status ?? 1, rating: ratingValue.value, comment: ratingComment.value || undefined, updatedAt: new Date().toISOString(), linkedIds: existing?.linkedIds ?? {} })
    }
    toast.success(t('toast.saved'))
    ratingInput.value = ''; ratingValue.value = null; ratingComment.value = ''; ratingQueryResult.value = null
  } catch (e) { toast.error(t('toast.saveFailed'), (e as Error).message) }
}

onUnmounted(() => { if (queryDebounceTimer) clearTimeout(queryDebounceTimer) })
</script>

<template>
  <SectionContainer>
    <div class="umm:flex umm:flex-col umm:gap-4 umm:p-[var(--umm-card-padding)] umm:border umm:border-border umm:rounded-lg">
      <FormField :label="t('common.selectPlatform')">
        <Select v-model="selectedPlatform">
          <SelectTrigger><SelectValue :placeholder="t('common.selectPlatform')" /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="p in PLATFORM_OPTIONS" :key="p.value" :value="p.value">{{ t(p.labelKey) }}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <FormField :label="t('common.mediaType')">
        <Select v-model="selectedDomain" :disabled="selectedPlatform === 'jav_ids'">
          <SelectTrigger><SelectValue :placeholder="t('common.mediaType')" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="movie">{{ t('stats.movie') }}</SelectItem>
            <SelectItem value="tv">{{ t('stats.tv') }}</SelectItem>
            <SelectItem value="music">{{ t('stats.music') }}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <FormField v-if="selectedPlatform === 'jav_ids'" :label="t('common.source')">
        <Select v-model="selectedJavSource">
          <SelectTrigger><SelectValue :placeholder="t('common.source')" /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="s in JAV_SOURCE_OPTIONS" :key="s.value" :value="s.value">{{ t(s.labelKey) }}</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <FormField :label="selectedPlatform === 'jav_ids' ? t('platform.jav') : t('common.search') + ' ID / URL'">
        <Input v-model="ratingInput" :placeholder="selectedPlatform === 'jav_ids' ? 'FC2-PPV-1234567' : '1299004 / URL'" />
      </FormField>

      <div class="umm:flex umm:flex-col umm:gap-2 umm:min-h-[40px]">
        <!-- Parse result -->
        <Transition name="fade" mode="out-in">
          <div v-if="ratingInput && parseResult && parseResult.valid" key="parse-ok" class="umm:flex umm:items-center umm:gap-2 umm:p-2 umm:rounded-md umm:bg-state-success/10/50 umm:dark:bg-state-success/20 umm:text-xs">
            <CheckCircle2 class="umm:h-3.5 umm:w-3.5 umm:text-state-success umm:shrink-0" />
            <span class="umm:text-state-success">{{ parseResult.provider }} / {{ parseResult.type }}</span>
            <span class="umm:text-state-success/70 umm:dark:text-state-success/70 umm:font-mono">{{ parseResult.providerId }}</span>
          </div>
          <div v-else-if="ratingInput && parseResult && !parseResult.valid" key="parse-err" class="umm:flex umm:items-center umm:gap-2 umm:p-2 umm:rounded-md umm:bg-state-error/10 umm:dark:bg-state-error/20 umm:text-xs">
            <XCircle class="umm:h-3.5 umm:w-3.5 umm:text-state-error umm:shrink-0" />
            <span class="umm:text-state-error">{{ parseResult.error }}</span>
          </div>
        </Transition>

        <!-- Query state -->
        <Transition name="fade" mode="out-in">
          <div v-if="isQuerying" key="querying" class="umm:flex umm:items-center umm:gap-2 umm:p-2 umm:rounded-md umm:bg-muted/50 umm:text-xs">
            <RefreshCw class="umm:h-3.5 umm:w-3.5 umm:animate-spin umm:text-muted-foreground" />
            <span class="umm:text-muted-foreground">{{ t('common.loading') }}</span>
          </div>

          <div v-else-if="ratingQueryResult && ratingQueryResult.status === 2" key="viewed" class="umm:flex umm:items-center umm:gap-2 umm:p-2 umm:rounded-md umm:bg-state-success/10 umm:dark:bg-state-success/30 umm:border umm:border-state-success/30 umm:dark:border-state-success/30 umm:text-xs">
            <CheckCircle2 class="umm:h-3.5 umm:w-3.5 umm:text-state-success umm:dark:text-state-success umm:shrink-0" />
            <span class="umm:text-state-success umm:dark:text-state-success umm:font-medium">{{ t('common.savedToDb') }}</span>
            <span v-if="ratingQueryResult.rating" class="umm:text-state-success">· {{ ratingQueryResult.rating }}/10</span>
            <span v-if="ratingQueryResult.comment" class="umm:text-state-success/70 umm:dark:text-state-success/70 umm:italic">· "{{ ratingQueryResult.comment }}"</span>
          </div>

          <div v-else-if="ratingQueryResult" key="found" class="umm:flex umm:items-center umm:gap-2 umm:p-2 umm:rounded-md umm:bg-blue-50 umm:dark:bg-blue-950/30 umm:border umm:border-blue-200 umm:dark:border-blue-800 umm:text-xs">
            <Database class="umm:h-3.5 umm:w-3.5 umm:text-blue-600 umm:dark:text-blue-400 umm:shrink-0" />
            <span class="umm:text-blue-800 umm:dark:text-blue-200 umm:font-medium">{{ t('common.recordFound') }}</span>
            <span class="umm:text-blue-700 umm:dark:text-blue-300">· {{ getStatusLabel(ratingQueryResult.status, ratingQueryResult.type) }}</span>
            <span v-if="ratingQueryResult.rating" class="umm:text-blue-600 umm:dark:text-blue-300">· {{ ratingQueryResult.rating }}/10</span>
          </div>

          <div v-else-if="ratingInput && hasQueryed && !isQuerying" key="notfound" class="umm:flex umm:items-center umm:gap-2 umm:p-2 umm:rounded-md umm:bg-muted/30 umm:border umm:border-dashed umm:border-muted-foreground/20 umm:text-xs">
            <Database class="umm:h-3.5 umm:w-3.5 umm:text-muted-foreground umm:shrink-0" />
            <span class="umm:text-muted-foreground">{{ t('common.noData') }}</span>
          </div>
        </Transition>
      </div>

      <FormField :label="t('common.rating') + ' (1-10)'">
        <div class="umm:grid umm:grid-cols-5 umm:gap-2">
          <Button v-for="i in 10" :key="i" variant="outline" :class="{ 'umm:bg-primary umm:text-primary-foreground': ratingValue === i }" @click="ratingValue = i" class="umm:h-9">{{ i }}</Button>
        </div>
      </FormField>

      <FormField :label="t('common.comment')">
        <textarea v-model="ratingComment" :placeholder="t('common.comment')" class="umm:w-full umm:min-h-[60px] umm:rounded-md umm:border umm:border-input umm:bg-transparent umm:px-3 umm:py-2 umm:text-sm umm:shadow-sm umm:placeholder:text-muted-foreground umm:focus-visible:outline-none umm:focus-visible:ring-1 umm:focus-visible:ring-ring" />
      </FormField>

      <Button @click="saveRating" class="umm:w-full umm:gap-2"><Star class="umm:h-4 umm:w-4" />{{ t('common.saveRating') }}</Button>
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
