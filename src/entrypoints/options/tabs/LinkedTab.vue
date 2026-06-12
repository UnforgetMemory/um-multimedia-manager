<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { Store } from '@/features/database'
import type { Domain, Provider } from '@/config'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Link, RefreshCw, Star } from 'lucide-vue-next'

const PLATFORM_OPTIONS = [
  { value: 'douban', label: '豆瓣' }, { value: 'imdb', label: 'IMDb' },
  { value: 'neodb', label: 'NeoDB' }, { value: 'tmdb', label: 'TMDB' },
] as const

const linkedInput = ref('')
const linkedSelectedPlatform = ref<string>('douban')
const linkedSelectedDomain = ref<Domain>('movie')
const isLinkedQuerying = ref(false)

interface LinkedQueryResult {
  source: { provider: string; type: string; providerId: string; url: string; status: number; rating: number; updatedAt: string }
  linked: Array<{ provider: string; type: string; providerId: string; url: string; status: number; rating: number; updatedAt: string; storeName: string }>
}

const linkedQueryResult = ref<LinkedQueryResult | null>(null)

function parseLinkedInput() {
  const input = linkedInput.value.trim()
  if (!input) return null
  const provider = linkedSelectedPlatform.value as Provider
  const type = linkedSelectedDomain.value

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

  if (/^tt\d+$/i.test(input)) return { type: 'movie', provider: 'imdb' as Provider, providerId: input.toLowerCase(), url: `https://www.imdb.com/title/${input.toLowerCase()}/`, valid: true }
  if (/^\d+$/.test(input)) { const subdomain = linkedSelectedDomain.value === 'music' ? 'music' : 'movie'; return { type: linkedSelectedDomain.value, provider: 'douban' as Provider, providerId: input, url: `https://${subdomain}.douban.com/subject/${input}/`, valid: true } }
  return { type, provider, providerId: input, url: '', valid: false, error: '无法解析输入的 ID 或 URL' }
}

async function queryLinkedData() {
  const parsed = parseLinkedInput()
  if (!parsed || !parsed.valid) { linkedQueryResult.value = null; return }
  isLinkedQuerying.value = true
  try {
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
  } catch { linkedQueryResult.value = null } finally { isLinkedQuerying.value = false }
}

let timer: ReturnType<typeof setTimeout> | null = null
watch(linkedInput, (v) => {
  const input = v.trim()
  if (!input) { linkedQueryResult.value = null; return }
  if (input.includes('douban.com')) { linkedSelectedPlatform.value = 'douban'; linkedSelectedDomain.value = input.includes('music.douban.com') ? 'music' : 'movie' }
  else if (input.includes('imdb.com') || /^tt\d+$/i.test(input)) { linkedSelectedPlatform.value = 'imdb'; linkedSelectedDomain.value = 'movie' }
  else if (input.includes('neodb.social')) { linkedSelectedPlatform.value = 'neodb'; linkedSelectedDomain.value = input.includes('/tv/') ? 'tv' : input.includes('/album/') ? 'music' : 'movie' }
  else if (input.includes('themoviedb.org')) { linkedSelectedPlatform.value = 'tmdb'; linkedSelectedDomain.value = input.includes('/tv/') ? 'tv' : 'movie' }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => queryLinkedData(), 500)
})
watch(linkedSelectedDomain, () => { if (linkedInput.value.trim()) queryLinkedData() })

function getPlatformLabel(p: string): string { return ({ douban: '豆瓣', imdb: 'IMDb', neodb: 'NeoDB', tmdb: 'TMDB' } as Record<string, string>)[p] || p }
function getStatusText(s: number, t: string): string { return ({ '-1': '未找到', 0: t === 'music' ? '未听' : '未看', 1: t === 'music' ? '在听' : '在看', 2: t === 'music' ? '已听' : '已看' } as Record<number, string>)[s] || '未知' }
function getStatusColor(s: number): string { return ({ '-1': '#9ca3af', 0: '#6b7280', 1: '#3b82f6', 2: '#10b981' } as Record<number, string>)[s] || '#6b7280' }

onUnmounted(() => { if (timer) clearTimeout(timer) })
</script>

<template>
  <div class="space-y-[var(--section-gap)]">
    <h2 class="font-h1 text-primary-content flex items-center gap-2"><Link class="h-5 w-5" />关联查询</h2>

    <div class="space-y-4 p-[var(--card-padding)] border border-border rounded-lg">
      <div><Label>选择平台</Label><Select v-model="linkedSelectedPlatform" class="mt-2"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="p in PLATFORM_OPTIONS" :key="p.value" :value="p.value">{{ p.label }}</SelectItem></SelectContent></Select></div>
      <div><Label>媒体类型</Label><Select v-model="linkedSelectedDomain" class="mt-2"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="movie">电影</SelectItem><SelectItem value="tv">剧集</SelectItem><SelectItem value="music">音乐</SelectItem></SelectContent></Select></div>
      <div><Label>平台 ID 或 URL</Label><Input v-model="linkedInput" placeholder="例如: 35401245 或 URL" class="mt-2" /><p class="text-xs text-muted-foreground mt-2">支持豆瓣、IMDb、NeoDB、TMDB 的 ID 或完整 URL</p></div>
    </div>

    <Alert v-if="isLinkedQuerying"><RefreshCw class="h-4 w-4 animate-spin" /><AlertTitle>查询中...</AlertTitle></Alert>

    <div v-if="linkedQueryResult && !isLinkedQuerying" class="space-y-4">
      <div class="p-[var(--card-padding)] border border-border rounded-lg bg-muted/30">
        <div class="flex items-center justify-between mb-3"><h4 class="font-h2 text-primary-content">查询结果</h4><Badge variant="outline" class="text-xs">{{ getPlatformLabel(linkedQueryResult.source.provider) }}</Badge></div>
        <div class="space-y-2 text-sm">
          <div class="flex items-center justify-between"><span class="text-secondary-content">类型</span><span class="font-medium">{{ linkedQueryResult.source.type }}</span></div>
          <div class="flex items-center justify-between"><span class="text-secondary-content">ID</span><span class="font-mono text-xs">{{ linkedQueryResult.source.providerId }}</span></div>
          <div class="flex items-center justify-between"><span class="text-secondary-content">状态</span><Badge :style="{ backgroundColor: getStatusColor(linkedQueryResult.source.status), color: 'white' }" class="text-xs">{{ getStatusText(linkedQueryResult.source.status, linkedQueryResult.source.type) }}</Badge></div>
          <div v-if="linkedQueryResult.source.rating > 0" class="flex items-center justify-between"><span class="text-secondary-content">评分</span><span class="font-medium flex items-center gap-1"><Star class="h-3 w-3 text-yellow-500" />{{ linkedQueryResult.source.rating }}/10</span></div>
        </div>
      </div>
      <div v-if="linkedQueryResult.linked.length > 0">
        <Separator class="my-4" /><h4 class="font-h2 text-primary-content mb-3">关联平台数据</h4>
        <div class="space-y-3">
          <div v-for="(item, i) in linkedQueryResult.linked" :key="i" class="p-3 border border-border rounded-lg" :class="{ 'bg-muted/20': item.status === -1 }">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2"><Badge variant="secondary" class="text-xs">{{ getPlatformLabel(item.provider) }}</Badge><span class="text-xs text-secondary-content">{{ item.type }}</span></div>
              <Badge :style="{ backgroundColor: getStatusColor(item.status), color: 'white' }" class="text-xs">{{ getStatusText(item.status, item.type) }}</Badge>
            </div>
            <div class="space-y-1 text-sm">
              <div class="flex items-center justify-between"><span class="text-secondary-content">ID</span><span class="font-mono text-xs">{{ item.providerId }}</span></div>
              <div v-if="item.rating > 0" class="flex items-center justify-between"><span class="text-secondary-content">评分</span><span class="font-medium flex items-center gap-1"><Star class="h-3 w-3 text-yellow-500" />{{ item.rating }}/10</span></div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="p-4 text-center text-sm text-secondary-content border border-dashed border-border rounded-lg">暂无关联数据</div>
    </div>
    <div v-if="linkedInput && !isLinkedQuerying && !linkedQueryResult" class="p-4 text-center text-sm text-secondary-content border border-dashed border-border rounded-lg">未找到匹配的记录</div>
  </div>
</template>
