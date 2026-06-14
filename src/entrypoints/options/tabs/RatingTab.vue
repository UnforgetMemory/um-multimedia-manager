<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { Store } from '@/features/database'
import type { Domain, Provider } from '@/config'
import type { StoreRecord } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Star, CheckCircle2, XCircle, Database, RefreshCw } from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import { JAV_IDS_STORE_NAME, normalizeAvId } from '@/features/adult-av/models'
import { JAV_ID_REGEX, autoDetectPlatform } from '@/features/adult-av/auto-detect'

const toast = useToast()

interface RatingQueryRecord extends StoreRecord {
  type: string
  provider: Provider
  providerId: string
}

const PLATFORM_OPTIONS = [
  { value: 'douban', label: '豆瓣' },
  { value: 'imdb', label: 'IMDb' },
  { value: 'neodb', label: 'NeoDB' },
  { value: 'tmdb', label: 'TMDB' },
  { value: 'jav_ids', label: '成人视频' },
] as const

const JAV_SOURCE_OPTIONS = [
  { value: 'javdb', label: 'JavDB' },
  { value: 'sehuatang', label: '色花堂' },
  { value: 'local', label: '本地' },
] as const

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
  if (!trimmed) return { valid: false, normalizedId: '', error: 'ID不能为空' }
  if (provider === 'imdb') {
    if (/^tt\d+$/i.test(trimmed)) return { valid: true, normalizedId: trimmed.toLowerCase() }
    if (/^\d+$/.test(trimmed)) return { valid: true, normalizedId: `tt${trimmed}` }
    return { valid: false, normalizedId: '', error: 'IMDb ID必须是数字或tt开头的格式' }
  }
  if (provider === 'douban') {
    if (/^\d+$/.test(trimmed)) return { valid: true, normalizedId: trimmed }
    return { valid: false, normalizedId: '', error: '豆瓣ID必须是纯数字' }
  }
  if (provider === 'neodb') {
    if (/^[\w-]+$/.test(trimmed)) return { valid: true, normalizedId: trimmed }
    return { valid: false, normalizedId: '', error: 'NeoDB ID格式无效' }
  }
  if (provider === 'tmdb') {
    if (/^\d+$/.test(trimmed)) return { valid: true, normalizedId: trimmed }
    return { valid: false, normalizedId: '', error: 'TMDB ID必须是纯数字' }
  }
  if (provider === 'jav_ids') {
    if (JAV_ID_REGEX.test(trimmed)) return { valid: true, normalizedId: normalizeAvId(trimmed) }
    return { valid: false, normalizedId: '', error: '成人视频ID格式无效 (例: FC2-PPV-1234567, ABP-123)' }
  }
  return { valid: false, normalizedId: '', error: '未知平台' }
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
  const labels: Record<number, string> = { 0: type === 'music' ? '未听' : '未看', 1: type === 'music' ? '在听' : '在看', 2: type === 'music' ? '已听' : '已看' }
  return labels[status] || '未知'
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
  if (!ratingInput.value.trim()) { toast.error('请输入平台 ID/URL'); return }
  if (!ratingValue.value || ratingValue.value < 1 || ratingValue.value > 10) { toast.error('请选择有效的评分(1-10)'); return }
  const parsed = parseRatingInput()
  if (!parsed) { toast.error('无法解析输入的 ID 或 URL'); return }
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
    toast.success(`评分已保存(${parsed.provider}/${parsed.providerId})`)
    ratingInput.value = ''; ratingValue.value = null; ratingComment.value = ''; ratingQueryResult.value = null
  } catch (e) { toast.error('保存评分失败', (e as Error).message) }
}

onUnmounted(() => { if (queryDebounceTimer) clearTimeout(queryDebounceTimer) })
</script>

<template>
  <div class="space-y-[var(--section-gap)]">
    <div class="space-y-4 p-[var(--card-padding)] border border-border rounded-lg">
      <div>
        <Label>选择平台</Label>
        <Select v-model="selectedPlatform" class="mt-2">
          <SelectTrigger><SelectValue placeholder="选择平台" /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="p in PLATFORM_OPTIONS" :key="p.value" :value="p.value">{{ p.label }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>媒体类型</Label>
        <Select v-model="selectedDomain" class="mt-2" :disabled="selectedPlatform === 'jav_ids'">
          <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="movie">电影</SelectItem>
            <SelectItem value="tv">剧集</SelectItem>
            <SelectItem value="music">音乐</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div v-if="selectedPlatform === 'jav_ids'">
        <Label>来源</Label>
        <Select v-model="selectedJavSource" class="mt-2">
          <SelectTrigger><SelectValue placeholder="选择来源" /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="s in JAV_SOURCE_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>{{ selectedPlatform === 'jav_ids' ? '成人视频 ID' : '平台 ID 或 URL' }}</Label>
        <Input v-model="ratingInput" :placeholder="selectedPlatform === 'jav_ids' ? '例如: FC2-PPV-1234567' : '例如: 1299004 或 URL'" class="mt-2" />
      </div>

      <div class="space-y-2 min-h-[40px]">
        <!-- Parse result -->
        <Transition name="fade" mode="out-in">
          <div v-if="ratingInput && parseResult && parseResult.valid" key="parse-ok" class="flex items-center gap-2 p-2 rounded-md bg-green-50/50 dark:bg-green-950/20 text-xs">
            <CheckCircle2 class="h-3.5 w-3.5 text-green-500 shrink-0" />
            <span class="text-green-700 dark:text-green-300">{{ parseResult.provider }} / {{ parseResult.type }}</span>
            <span class="text-green-600/70 dark:text-green-400/70 font-mono">{{ parseResult.providerId }}</span>
          </div>
          <div v-else-if="ratingInput && parseResult && !parseResult.valid" key="parse-err" class="flex items-center gap-2 p-2 rounded-md bg-red-50/50 dark:bg-red-950/20 text-xs">
            <XCircle class="h-3.5 w-3.5 text-red-500 shrink-0" />
            <span class="text-red-600 dark:text-red-400">{{ parseResult.error }}</span>
          </div>
        </Transition>

        <!-- Query state -->
        <Transition name="fade" mode="out-in">
          <div v-if="isQuerying" key="querying" class="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-xs">
            <RefreshCw class="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <span class="text-muted-foreground">查询数据库...</span>
          </div>

          <div v-else-if="ratingQueryResult && ratingQueryResult.status === 2" key="viewed" class="flex items-center gap-2 p-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-xs">
            <CheckCircle2 class="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
            <span class="text-green-800 dark:text-green-200 font-medium">已{{ ratingQueryResult.type === 'music' ? '听' : '看' }}</span>
            <span v-if="ratingQueryResult.rating" class="text-green-700 dark:text-green-300">· {{ ratingQueryResult.rating }}/10</span>
            <span v-if="ratingQueryResult.comment" class="text-green-600/70 dark:text-green-400/70 italic">· "{{ ratingQueryResult.comment }}"</span>
          </div>

          <div v-else-if="ratingQueryResult" key="found" class="flex items-center gap-2 p-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs">
            <Database class="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span class="text-blue-800 dark:text-blue-200 font-medium">已收录</span>
            <span class="text-blue-700 dark:text-blue-300">· {{ getStatusLabel(ratingQueryResult.status, ratingQueryResult.type) }}</span>
            <span v-if="ratingQueryResult.rating" class="text-blue-600 dark:text-blue-300">· {{ ratingQueryResult.rating }}/10</span>
          </div>

          <div v-else-if="ratingInput && hasQueryed && !isQuerying" key="notfound" class="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-dashed border-muted-foreground/20 text-xs">
            <Database class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span class="text-muted-foreground">数据库中暂无此记录</span>
          </div>
        </Transition>
      </div>

      <div>
        <Label>评分 (1-10)</Label>
        <div class="grid grid-cols-5 gap-2 mt-2">
          <Button v-for="i in 10" :key="i" variant="outline" :class="{ 'bg-primary text-primary-foreground': ratingValue === i }" @click="ratingValue = i" class="h-9">{{ i }}</Button>
        </div>
      </div>

      <div>
        <Label>评语</Label>
        <textarea v-model="ratingComment" placeholder="添加评论..." class="mt-2 w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
      </div>

      <Button @click="saveRating" class="w-full"><Star class="mr-2 h-4 w-4" />保存评分</Button>
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
