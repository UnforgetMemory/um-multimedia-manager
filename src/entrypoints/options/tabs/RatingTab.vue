<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { Store } from '@/features/database'
import type { Domain, Provider } from '@/config'
import type { StoreRecord } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Star, CheckCircle2, XCircle, Database, RefreshCw } from 'lucide-vue-next'

function showPageToast(type: 'success' | 'error' | 'info' | 'loading', title: string, message?: string) {
  try {
    chrome.runtime.sendMessage(
      { type: 'SHOW_TOAST', payload: { type, title, message } },
      () => { void chrome.runtime.lastError }
    )
  } catch { /* silent */ }
}

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
] as const

const ratingInput = ref('')
const ratingValue = ref<number | null>(null)
const ratingComment = ref('')
const selectedPlatform = ref<string>('douban')
const selectedDomain = ref<Domain>('movie')
const ratingQueryResult = ref<RatingQueryRecord | null>(null)
const isQuerying = ref(false)
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
  return { valid: false, normalizedId: '', error: '未知平台' }
}

function parseRatingInput() {
  const input = ratingInput.value.trim()
  if (!input) return null
  const provider = selectedPlatform.value as Provider
  const type = selectedDomain.value

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
  if (!parsed) { ratingQueryResult.value = null; isQuerying.value = false; return }
  isQuerying.value = true
  try {
    const storeName = `${parsed.provider}_records`
    const key = `${parsed.type}::${parsed.providerId}`
    const record = await Store.dbGet(storeName, key)
    ratingQueryResult.value = record ? { ...record, type: parsed.type, provider: parsed.provider, providerId: parsed.providerId } : null
  } catch { ratingQueryResult.value = null } finally { isQuerying.value = false }
}

watch(ratingInput, (v) => {
  const input = v.trim()
  if (!input) { ratingQueryResult.value = null; return }
  if (input.includes('douban.com')) { selectedPlatform.value = 'douban'; selectedDomain.value = input.includes('music.douban.com') ? 'music' : 'movie' }
  else if (input.includes('imdb.com') || /^tt\d+$/i.test(input)) { selectedPlatform.value = 'imdb'; selectedDomain.value = 'movie' }
  else if (input.includes('neodb.social')) { selectedPlatform.value = 'neodb'; selectedDomain.value = input.includes('/tv/') ? 'tv' : input.includes('/album/') ? 'music' : 'movie' }
  else if (input.includes('themoviedb.org')) { selectedPlatform.value = 'tmdb'; selectedDomain.value = input.includes('/tv/') ? 'tv' : 'movie' }
  if (queryDebounceTimer) clearTimeout(queryDebounceTimer)
  queryDebounceTimer = setTimeout(() => queryRecordFromDB(), 500)
})

watch(selectedDomain, () => { if (ratingInput.value.trim()) queryRecordFromDB() })

async function saveRating() {
  if (!ratingInput.value.trim()) { await showPageToast('error', '请输入平台 ID/URL'); return }
  if (!ratingValue.value || ratingValue.value < 1 || ratingValue.value > 10) { await showPageToast('error', '请选择有效的评分(1-10)'); return }
  const parsed = parseRatingInput()
  if (!parsed) { await showPageToast('error', '无法解析输入的 ID 或 URL'); return }
  try {
    const storeName = `${parsed.provider}_records`
    const key = `${parsed.type}::${parsed.providerId}`
    const existing = await Store.dbGet(storeName, key)
    await Store.dbPut(storeName, key, { url: parsed.url, status: existing?.status ?? 1, rating: ratingValue.value, comment: ratingComment.value || undefined, updatedAt: new Date().toISOString(), linkedIds: existing?.linkedIds ?? {} })
    await showPageToast('success', `评分已保存(${parsed.provider}/${parsed.providerId})`)
    ratingInput.value = ''; ratingValue.value = null; ratingComment.value = ''; ratingQueryResult.value = null
  } catch (e) { await showPageToast('error', '保存评分失败', (e as Error).message) }
}

onUnmounted(() => { if (queryDebounceTimer) clearTimeout(queryDebounceTimer) })
</script>

<template>
  <div class="space-y-[var(--section-gap)]">
    <h2 class="font-h1 text-primary-content">评分管理</h2>

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
        <Select v-model="selectedDomain" class="mt-2">
          <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="movie">电影</SelectItem>
            <SelectItem value="tv">剧集</SelectItem>
            <SelectItem value="music">音乐</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>平台 ID 或 URL</Label>
        <Input v-model="ratingInput" placeholder="例如: 1299004 或 URL" class="mt-2" />
      </div>

      <Alert v-if="ratingInput && !isQuerying" :variant="parseResult?.valid ? 'default' : 'destructive'">
        <CheckCircle2 v-if="parseResult?.valid" class="h-4 w-4" /><XCircle v-else class="h-4 w-4" />
        <AlertTitle>{{ parseResult?.valid ? '✅ 解析成功' : '❌ 解析失败' }}</AlertTitle>
        <AlertDescription v-if="parseResult">
          <div v-if="parseResult.valid" class="mt-2 space-y-1 text-sm">
            <div class="flex items-center gap-2"><strong>平台:</strong><Badge variant="outline" class="text-xs">{{ parseResult.provider }} / {{ parseResult.type }}</Badge></div>
            <div><strong>ID:</strong> {{ parseResult.providerId }}</div>
          </div>
          <div v-else class="text-sm-scaled text-destructive">{{ parseResult.error }}</div>
        </AlertDescription>
      </Alert>

      <Alert v-if="isQuerying"><RefreshCw class="h-4 w-4 animate-spin" /><AlertTitle>查询中...</AlertTitle></Alert>

      <Alert v-else-if="ratingQueryResult && ratingQueryResult.status === 2" variant="default">
        <CheckCircle2 class="h-4 w-4" />
        <AlertTitle class="font-semibold">✅ {{ ratingQueryResult.type === 'music' ? '已听' : '已看' }}</AlertTitle>
        <AlertDescription>
          <div class="mt-2 space-y-1 text-sm">
            <div v-if="ratingQueryResult.rating" class="flex items-center gap-2"><strong>评分:</strong><Badge variant="default"><Star class="mr-1 h-3 w-3" />{{ ratingQueryResult.rating }}/10</Badge></div>
            <div v-if="ratingQueryResult.comment" class="flex items-start gap-2"><strong class="shrink-0">评语:</strong><span class="italic">"{{ ratingQueryResult.comment }}"</span></div>
          </div>
        </AlertDescription>
      </Alert>

      <Alert v-else-if="ratingQueryResult" variant="default">
        <Database class="h-4 w-4" /><AlertTitle>找到记录</AlertTitle>
        <AlertDescription>
          <div class="mt-2 space-y-1 text-sm">
            <div class="flex items-center gap-2"><strong>状态:</strong><Badge :variant="ratingQueryResult.status === 1 ? 'default' : 'secondary'" class="text-xs">{{ getStatusLabel(ratingQueryResult.status, ratingQueryResult.type) }}</Badge></div>
            <div v-if="ratingQueryResult.rating" class="flex items-center gap-2"><strong>评分:</strong><Badge variant="outline"><Star class="mr-1 h-3 w-3" />{{ ratingQueryResult.rating }}/10</Badge></div>
          </div>
        </AlertDescription>
      </Alert>

      <Alert v-else-if="ratingInput && !isQuerying"><Database class="h-4 w-4" /><AlertTitle>未找到记录</AlertTitle><AlertDescription>数据库中暂无此记录</AlertDescription></Alert>

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
