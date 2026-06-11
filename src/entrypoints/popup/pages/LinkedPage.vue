<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { Store } from '@/features/database'
import type { Domain, Provider } from '@/config'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Link, RefreshCw, Star } from 'lucide-vue-next'

const PLATFORM_OPTIONS = [
  { value: 'douban', label: '豆瓣' },
  { value: 'imdb', label: 'IMDb' },
  { value: 'neodb', label: 'NeoDB' },
  { value: 'tmdb', label: 'TMDB' },
] as const

const linkedInput = ref('')
const linkedSelectedPlatform = ref<string>('douban')
const linkedSelectedDomain = ref<Domain>('movie')
const isLinkedQuerying = ref(false)

interface LinkedQueryResult {
  source: {
    provider: string
    type: string
    providerId: string
    url: string
    status: number
    rating: number
    updatedAt: string
  }
  linked: Array<{
    provider: string
    type: string
    providerId: string
    url: string
    status: number
    rating: number
    updatedAt: string
    storeName: string
  }>
}

const linkedQueryResult = ref<LinkedQueryResult | null>(null)

function parseLinkedInput(): {
  type: string
  provider: Provider
  providerId: string
  url: string
  valid: boolean
  error?: string
} | null {
  const input = linkedInput.value.trim()
  if (!input) return null

  const provider = linkedSelectedPlatform.value as Provider
  const type = linkedSelectedDomain.value

  const doubanMatch = input.match(/(?:movie|book|music)\.douban\.com\/subject\/(\d+)/)
  if (doubanMatch) {
    const isBook = input.includes('book')
    const isMusic = input.includes('music')
    const id = doubanMatch[1]
    const subdomain = isBook ? 'book' : isMusic ? 'music' : 'movie'
    return {
      type: isBook || !isMusic ? 'movie' : 'music',
      provider: 'douban',
      providerId: id,
      url: `https://${subdomain}.douban.com/subject/${id}/`,
      valid: true,
    }
  }

  const imdbMatch = input.match(/imdb\.com\/title\/(tt\d+)/i)
  if (imdbMatch) {
    const id = imdbMatch[1].toLowerCase()
    return {
      type: 'movie',
      provider: 'imdb',
      providerId: id,
      url: `https://www.imdb.com/title/${id}/`,
      valid: true,
    }
  }

  const neodbMatch = input.match(/neodb\.social\/(movie|tv|album)\/([\w-]+)/)
  if (neodbMatch) {
    const [, pathType, id] = neodbMatch
    return {
      type: pathType === 'album' ? 'music' : pathType,
      provider: 'neodb',
      providerId: id,
      url: `https://neodb.social/${pathType}/${id}/`,
      valid: true,
    }
  }

  const tmdbMovieMatch = input.match(/themoviedb\.org\/movie\/(\d+)/)
  if (tmdbMovieMatch) {
    const id = tmdbMovieMatch[1]
    return {
      type: 'movie',
      provider: 'tmdb',
      providerId: id,
      url: `https://www.themoviedb.org/movie/${id}/`,
      valid: true,
    }
  }

  const tmdbTvMatch = input.match(/themoviedb\.org\/tv\/(\d+)/)
  if (tmdbTvMatch) {
    const id = tmdbTvMatch[1]
    return {
      type: 'tv',
      provider: 'tmdb',
      providerId: id,
      url: `https://www.themoviedb.org/tv/${id}/`,
      valid: true,
    }
  }

  let providerId = input.trim()

  if (/^tt\d+$/i.test(providerId)) {
    return {
      type: 'movie',
      provider: 'imdb',
      providerId: providerId.toLowerCase(),
      url: `https://www.imdb.com/title/${providerId.toLowerCase()}/`,
      valid: true,
    }
  }

  if (/^\d+$/.test(providerId)) {
    const subdomain = linkedSelectedDomain.value === 'music' ? 'music' : 'movie'
    return {
      type: linkedSelectedDomain.value,
      provider: 'douban',
      providerId,
      url: `https://${subdomain}.douban.com/subject/${providerId}/`,
      valid: true,
    }
  }

  return {
    type,
    provider,
    providerId,
    url: '',
    valid: false,
    error: '无法解析输入的 ID 或 URL',
  }
}

async function queryLinkedData() {
  const parsed = parseLinkedInput()
  if (!parsed || !parsed.valid) {
    linkedQueryResult.value = null
    return
  }

  isLinkedQuerying.value = true
  try {
    const storeName = `${parsed.provider}_records`
    const key = `${parsed.type}::${parsed.providerId}`
    const record = await Store.dbGet(storeName, key)

    if (!record) {
      linkedQueryResult.value = null
      return
    }

    const source = {
      provider: parsed.provider,
      type: parsed.type,
      providerId: parsed.providerId,
      url: record.url,
      status: record.status,
      rating: record.rating,
      updatedAt: record.updatedAt,
    }

    const linked: LinkedQueryResult['linked'] = []
    const linkedIds = record.linkedIds || {}

    for (const [linkedProvider, linkedKey] of Object.entries(linkedIds)) {
      if (!linkedKey) continue

      let linkedType: string
      let linkedProviderId: string

      if (linkedKey.includes('::')) {
        const parts = linkedKey.split('::')
        linkedType = parts[0]
        linkedProviderId = parts[1]
      } else {
        linkedType = parsed.type
        linkedProviderId = linkedKey
      }

      const linkedStoreName = `${linkedProvider}_records`
      const linkedRecord = await Store.dbGet(linkedStoreName, `${linkedType}::${linkedProviderId}`)

      if (linkedRecord) {
        linked.push({
          provider: linkedProvider,
          type: linkedType,
          providerId: linkedProviderId,
          url: linkedRecord.url,
          status: linkedRecord.status,
          rating: linkedRecord.rating,
          updatedAt: linkedRecord.updatedAt,
          storeName: linkedStoreName,
        })
      } else {
        linked.push({
          provider: linkedProvider,
          type: linkedType,
          providerId: linkedProviderId,
          url: '',
          status: -1,
          rating: 0,
          updatedAt: '',
          storeName: linkedStoreName,
        })
      }
    }

    linkedQueryResult.value = { source, linked }
  } catch (error) {
    console.error('[Linked] Query failed:', error)
    linkedQueryResult.value = null
  } finally {
    isLinkedQuerying.value = false
  }
}

let linkedQueryDebounceTimer: ReturnType<typeof setTimeout> | null = null
watch(linkedInput, (newValue: string) => {
  const input = newValue.trim()
  if (!input) {
    linkedQueryResult.value = null
    return
  }

  if (input.includes('douban.com')) {
    linkedSelectedPlatform.value = 'douban'
    if (input.includes('music.douban.com')) {
      linkedSelectedDomain.value = 'music'
    } else if (input.includes('book.douban.com')) {
      linkedSelectedDomain.value = 'movie'
    } else {
      linkedSelectedDomain.value = 'movie'
    }
  } else if (input.includes('imdb.com') || /^tt\d+$/i.test(input)) {
    linkedSelectedPlatform.value = 'imdb'
    linkedSelectedDomain.value = 'movie'
  } else if (input.includes('neodb.social')) {
    linkedSelectedPlatform.value = 'neodb'
    if (input.includes('/tv/')) {
      linkedSelectedDomain.value = 'tv'
    } else if (input.includes('/album/')) {
      linkedSelectedDomain.value = 'music'
    } else {
      linkedSelectedDomain.value = 'movie'
    }
  } else if (input.includes('themoviedb.org')) {
    linkedSelectedPlatform.value = 'tmdb'
    if (input.includes('/tv/')) {
      linkedSelectedDomain.value = 'tv'
    } else {
      linkedSelectedDomain.value = 'movie'
    }
  }

  if (linkedQueryDebounceTimer) clearTimeout(linkedQueryDebounceTimer)
  linkedQueryDebounceTimer = setTimeout(() => queryLinkedData(), 500)
})

watch(linkedSelectedDomain, () => {
  if (linkedInput.value.trim()) {
    queryLinkedData()
  }
})

function getPlatformLabel(provider: string): string {
  const labels: Record<string, string> = {
    douban: '豆瓣',
    imdb: 'IMDb',
    neodb: 'NeoDB',
    tmdb: 'TMDB',
  }
  return labels[provider] || provider
}

function getLinkedStatusText(status: number, type: string): string {
  const labels: Record<number, string> = {
    '-1': '未找到',
    0: type === 'music' ? '未听' : '未看',
    1: type === 'music' ? '在听' : '在看',
    2: type === 'music' ? '已听' : '已看',
  }
  return labels[status] || '未知'
}

function getLinkedStatusColor(status: number): string {
  const colors: Record<number, string> = {
    '-1': '#9ca3af',
    0: '#6b7280',
    1: '#3b82f6',
    2: '#10b981',
  }
  return colors[status] || '#6b7280'
}

onUnmounted(() => {
  if (linkedQueryDebounceTimer) {
    clearTimeout(linkedQueryDebounceTimer)
    linkedQueryDebounceTimer = null
  }
})
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Link class="h-5 w-5" />
        关联查询
      </CardTitle>
      <CardDescription>查询跨平台关联数据，支持 ID 和 URL 自动解析</CardDescription>
    </CardHeader>
    <CardContent>
      <div class="space-y-6">
        <div class="space-y-4 p-4 border border-border rounded-lg">
          <div>
            <Label for="linked-platform-select">选择平台</Label>
            <Select v-model="linkedSelectedPlatform" class="mt-2">
              <SelectTrigger id="linked-platform-select">
                <SelectValue placeholder="选择平台" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="platform in PLATFORM_OPTIONS" :key="platform.value" :value="platform.value">
                  {{ platform.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label for="linked-domain-select">媒体类型</Label>
            <Select v-model="linkedSelectedDomain" class="mt-2">
              <SelectTrigger id="linked-domain-select">
                <SelectValue placeholder="选择类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="movie">电影</SelectItem>
                <SelectItem value="tv">剧集</SelectItem>
                <SelectItem value="music">音乐</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label for="linked-input">平台 ID 或 URL</Label>
            <Input
              id="linked-input"
              v-model="linkedInput"
              placeholder="例如: 35401245 或 https://movie.douban.com/subject/35401245/"
              class="mt-2"
            />
            <p class="text-xs text-muted-foreground mt-2">
              支持豆瓣、IMDb、NeoDB、TMDB 的 ID 或完整 URL
            </p>
          </div>
        </div>

        <Alert v-if="isLinkedQuerying" variant="default">
          <RefreshCw class="h-4 w-4 animate-spin" />
          <AlertTitle>查询中...</AlertTitle>
          <AlertDescription>
            正在查询关联数据
          </AlertDescription>
        </Alert>

        <div v-if="linkedQueryResult && !isLinkedQuerying" class="space-y-4">
          <div class="p-4 border border-border rounded-lg bg-muted/30">
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-sm font-semibold text-foreground">查询结果</h4>
              <Badge variant="outline" class="text-xs">
                {{ getPlatformLabel(linkedQueryResult.source.provider) }}
              </Badge>
            </div>

            <div class="space-y-2 text-sm">
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">类型</span>
                <span class="font-medium">{{ linkedQueryResult.source.type }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">ID</span>
                <span class="font-mono text-xs">{{ linkedQueryResult.source.providerId }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">状态</span>
                <Badge
                  :style="{ backgroundColor: getLinkedStatusColor(linkedQueryResult.source.status), color: 'white' }"
                  class="text-xs"
                >
                  {{ getLinkedStatusText(linkedQueryResult.source.status, linkedQueryResult.source.type) }}
                </Badge>
              </div>
              <div v-if="linkedQueryResult.source.rating > 0" class="flex items-center justify-between">
                <span class="text-muted-foreground">评分</span>
                <span class="font-medium flex items-center gap-1">
                  <Star class="h-3 w-3 text-yellow-500" />
                  {{ linkedQueryResult.source.rating }}/10
                </span>
              </div>
              <div v-if="linkedQueryResult.source.url" class="flex items-center justify-between">
                <span class="text-muted-foreground">链接</span>
                <a
                  :href="linkedQueryResult.source.url"
                  target="_blank"
                  class="text-primary text-xs hover:underline truncate max-w-[200px]"
                >
                  {{ linkedQueryResult.source.url }}
                </a>
              </div>
            </div>
          </div>

          <div v-if="linkedQueryResult.linked.length > 0">
            <Separator class="my-4" />
            <h4 class="text-sm font-semibold text-foreground mb-3">关联平台数据</h4>

            <div class="space-y-3">
              <div
                v-for="(item, index) in linkedQueryResult.linked"
                :key="index"
                class="p-3 border border-border rounded-lg"
                :class="{ 'bg-muted/20': item.status === -1 }"
              >
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <Badge variant="secondary" class="text-xs">
                      {{ getPlatformLabel(item.provider) }}
                    </Badge>
                    <span class="text-xs text-muted-foreground">{{ item.type }}</span>
                  </div>
                  <Badge
                    :style="{ backgroundColor: getLinkedStatusColor(item.status), color: 'white' }"
                    class="text-xs"
                  >
                    {{ getLinkedStatusText(item.status, item.type) }}
                  </Badge>
                </div>

                <div class="space-y-1 text-sm">
                  <div class="flex items-center justify-between">
                    <span class="text-muted-foreground">ID</span>
                    <span class="font-mono text-xs">{{ item.providerId }}</span>
                  </div>
                  <div v-if="item.rating > 0" class="flex items-center justify-between">
                    <span class="text-muted-foreground">评分</span>
                    <span class="font-medium flex items-center gap-1">
                      <Star class="h-3 w-3 text-yellow-500" />
                      {{ item.rating }}/10
                    </span>
                  </div>
                  <div v-if="item.url" class="flex items-center justify-between">
                    <span class="text-muted-foreground">链接</span>
                    <a
                      :href="item.url"
                      target="_blank"
                      class="text-primary text-xs hover:underline truncate max-w-[200px]"
                    >
                      {{ item.url }}
                    </a>
                  </div>
                  <div v-if="item.updatedAt" class="flex items-center justify-between">
                    <span class="text-muted-foreground">更新</span>
                    <span class="text-xs text-muted-foreground">
                      {{ new Date(item.updatedAt).toLocaleDateString() }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="p-4 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
            暂无关联数据
          </div>
        </div>

        <div
          v-if="linkedInput && !isLinkedQuerying && !linkedQueryResult"
          class="p-4 text-center text-sm text-muted-foreground border border-dashed border-border rounded-lg"
        >
          未找到匹配的记录，请检查输入的 ID 或 URL
        </div>
      </div>
    </CardContent>
  </Card>
</template>
