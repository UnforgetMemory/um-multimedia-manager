<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { Store } from '@/shared'
import type { Domain, Provider, MediaRecord } from '@/shared'
import { CACHE_CONFIG } from '@/shared/config'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'vue-sonner'
import { 
  Moon, Sun, Settings, Database, RefreshCw,
  CheckCircle2, XCircle, Star, Download, Upload
} from '@lucide/vue'

// ==================== 页面状态管理 ====================
type Page = 'records' | 'platforms' | 'ratings' | 'settings'
const currentPage = ref<Page>('records')

// 导航页面配置
const pages = [
  { id: 'records', label: '概览', icon: Database },
  { id: 'platforms', label: '平台分布', icon: Settings },
  { id: 'ratings', label: '评分', icon: Star },
  { id: 'settings', label: '设置', icon: Settings },
] as const

// ==================== 记录列表页面 ====================
const loading = ref(true)
const records = ref<MediaRecord[]>([])
const stats = ref({
  total: 0,
  movie: 0,
  tv: 0,
  music: 0,
})

// ✅ 优化：添加缓存，避免重复加载
let cachedRecords: MediaRecord[] | null = null
let lastLoadTime = 0
const CACHE_TTL = CACHE_CONFIG.POPUP_TTL // 30秒缓存有效期

// 加载数据
async function loadData(forceRefresh = false) {
  const now = Date.now()
  
  // ✅ 优化：使用缓存，避免不必要的网络请求
  if (!forceRefresh && cachedRecords && (now - lastLoadTime) < CACHE_TTL) {
    console.log('[Popup] Using cached data')
    records.value = cachedRecords
    updateStats()
    loading.value = false
    return
  }
  
  loading.value = true
  try {
    console.log('[Popup] Fetching all records from Background...')
    
    // ✅ 修复：添加超时保护(5秒)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Timeout: Background did not respond within 5s')), 5000)
    })
    
    // ✅ 优化：一次性获取所有记录，避免多次消息传递
    const allRecords = await Promise.race([
      Store.getAllRecords(),
      timeoutPromise
    ])
    
    console.log('[Popup] Records loaded:', allRecords.length)
    records.value = allRecords
    
    // ✅ 优化：更新缓存
    cachedRecords = allRecords
    lastLoadTime = now
    
    updateStats()
  } catch (error) {
    console.error('[Popup] Failed to load data:', error)
    toast.error(`加载数据失败: ${error instanceof Error ? error.message : '未知错误'}`)
    // ✅ 修复：确保即使失败也清除 loading 状态
    records.value = []
    updateStats()
  } finally {
    loading.value = false
  }
}

// 更新统计（单次遍历优化）
function updateStats() {
  let movie = 0
  let tv = 0
  let music = 0
  
  for (const record of records.value) {
    switch (record.type) {
      case 'movie': movie++; break
      case 'tv': tv++; break
      case 'music': music++; break
    }
  }
  
  stats.value = {
    total: records.value.length,
    movie,
    tv,
    music,
  }
}

// 按平台统计
const platformStats = computed(() => {
  const stats: Record<string, number> = {}
  
  for (const record of records.value) {
    const key = `${record.type} / ${record.provider}`
    stats[key] = (stats[key] || 0) + 1
  }
  
  // 按数量降序排序
  return Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .reduce((obj, [key, value]) => {
      obj[key] = value
      return obj
    }, {} as Record<string, number>)
})

// 统计卡片列表
const statsList = computed(() => [
  { label: '总计', value: stats.value.total },
  { label: '电影', value: stats.value.movie },
  { label: '剧集', value: stats.value.tv },
  { label: '音乐', value: stats.value.music },
])

// ==================== 评分管理页面 ====================
const ratingInput = ref('')
const ratingValue = ref<number | null>(null)

// 支持的平台选项
const PLATFORM_OPTIONS = [
  { value: 'douban', label: '豆瓣' },
  { value: 'imdb', label: 'IMDb' },
  { value: 'neodb', label: 'NeoDB' },
  { value: 'tmdb', label: 'TMDB' },
] as const

// 当前选择的平台
const selectedPlatform = ref<string>('douban')

// 当前选择的媒体类型
const selectedDomain = ref<Domain>('movie')

// 评分查询状态
const ratingQueryResult = ref<MediaRecord | null>(null)
const isQuerying = ref(false)
let queryDebounceTimer: ReturnType<typeof setTimeout> | null = null

// 实时解析结果 (计算属性)
const parseResult = computed(() => {
  if (!ratingInput.value.trim()) return null
  return parseRatingInput()
})



// 校验并补全 Provider ID
function validateAndNormalizeProviderId(
  provider: Provider,
  _type: Domain,  // 豆瓣图书归类为movie域,但此参数预留
  rawId: string
): { valid: boolean; normalizedId: string; error?: string } {
  const trimmed = rawId.trim()
  
  if (!trimmed) {
    return { valid: false, normalizedId: '', error: 'ID不能为空' }
  }
  
  // IMDb ID 校验和补全
  if (provider === 'imdb') {
    // 如果已有tt前缀,验证格式
    if (/^tt\d+$/i.test(trimmed)) {
      return { valid: true, normalizedId: trimmed.toLowerCase() }
    }
    // 纯数字,自动添加tt前缀
    if (/^\d+$/.test(trimmed)) {
      return { valid: true, normalizedId: `tt${trimmed}` }
    }
    return { valid: false, normalizedId: '', error: 'IMDb ID必须是数字或tt开头的格式' }
  }
  
  // 豆瓣 ID 校验 (纯数字)
  if (provider === 'douban') {
    if (/^\d+$/.test(trimmed)) {
      return { valid: true, normalizedId: trimmed }
    }
    return { valid: false, normalizedId: '', error: '豆瓣ID必须是纯数字' }
  }
  
  // NeoDB ID 校验 (支持 xxx-yyy 格式)
  if (provider === 'neodb') {
    if (/^[\w-]+$/.test(trimmed)) {
      return { valid: true, normalizedId: trimmed }
    }
    return { valid: false, normalizedId: '', error: 'NeoDB ID格式无效' }
  }
  
  // TMDB ID 校验 (纯数字)
  if (provider === 'tmdb') {
    if (/^\d+$/.test(trimmed)) {
      return { valid: true, normalizedId: trimmed }
    }
    return { valid: false, normalizedId: '', error: 'TMDB ID必须是纯数字' }
  }
  
  return { valid: false, normalizedId: '', error: '未知平台' }
}

// 解析评分输入 (增强版 - 支持ID校验和URL生成)
function parseRatingInput(): {
  type: string        // movie/tv/music/book
  provider: Provider
  providerId: string
  url: string
  valid: boolean
  error?: string
} | null {
  const input = ratingInput.value.trim()
  if (!input) return null
  
  const provider = selectedPlatform.value as Provider
  const type = selectedDomain.value
  
  // 1. 尝试从 URL 解析
  // 豆瓣 URL
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
  
  // IMDb URL
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
  
  // NeoDB URL
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
  
  // TMDB URL
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
  
  // 2. 尝试作为纯 ID 处理 (需要校验)
  const validation = validateAndNormalizeProviderId(provider, type, input)
  
  if (!validation.valid) {
    return {
      type,
      provider,
      providerId: input,
      url: '',
      valid: false,
      error: validation.error,
    }
  }
  
  // ID 有效,生成 URL
  const normalizedId = validation.normalizedId
  let url = ''
  
  if (provider === 'douban') {
    // 豆瓣: book归类为movie域,但URL使用book子域名
    url = type === 'music'
      ? `https://music.douban.com/subject/${normalizedId}/`
      : `https://movie.douban.com/subject/${normalizedId}/`  // movie和book都用movie.douban.com
  } else if (provider === 'imdb') {
    url = `https://www.imdb.com/title/${normalizedId}/`
  } else if (provider === 'neodb') {
    const path = type === 'tv' ? 'tv' : type === 'music' ? 'album' : 'movie'
    url = `https://neodb.social/${path}/${normalizedId}/`
  } else if (provider === 'tmdb') {
    url = type === 'tv'
      ? `https://www.themoviedb.org/tv/${normalizedId}/`
      : `https://www.themoviedb.org/movie/${normalizedId}/`
  }
  
  return {
    type,
    provider,
    providerId: normalizedId,
    url,
    valid: true,
  }
}

// 防抖查询数据库记录
async function queryRecordFromDB() {
  const parsed = parseRatingInput()
  if (!parsed) {
    ratingQueryResult.value = null
    return
  }
  
  isQuerying.value = true
  try {
    const map = await Store.getDatasetMap(parsed.type as Domain, parsed.provider)
    const record = map.get(parsed.providerId) || null
    ratingQueryResult.value = record
  } catch (error) {
    console.error('[Query] Failed:', error)
    ratingQueryResult.value = null
  } finally {
    isQuerying.value = false
  }
}

// 监听输入变化 - 防抖查询 + 自动识别平台
watch(ratingInput, (newValue: string) => {
  const input = newValue.trim()
  
  // 清空时重置
  if (!input) {
    ratingQueryResult.value = null
    return
  }
  
  // 自动识别平台
  if (input.includes('douban.com')) {
    selectedPlatform.value = 'douban'
  } else if (input.includes('imdb.com') || /^tt\d+$/i.test(input)) {
    selectedPlatform.value = 'imdb'
  } else if (input.includes('neodb.social')) {
    selectedPlatform.value = 'neodb'
  } else if (input.includes('themoviedb.org')) {
    selectedPlatform.value = 'tmdb'
  }
  
  // 防抖查询(500ms)
  if (queryDebounceTimer) clearTimeout(queryDebounceTimer)
  queryDebounceTimer = setTimeout(() => queryRecordFromDB(), 500)
})

// 监听类型选择变化，重新查询
watch(selectedDomain, () => {
  if (ratingInput.value.trim()) {
    queryRecordFromDB()
  }
})

// 保存评分
async function saveRating() {
  if (!ratingInput.value.trim()) {
    toast.error('请输入平台 ID/URL')
    return
  }
  
  // 验证评分值
  if (!ratingValue.value || ratingValue.value < 1 || ratingValue.value > 10) {
    toast.error('请选择有效的评分(1-10)')
    return
  }
  
  const parsed = parseRatingInput()
  if (!parsed) {
    toast.error('无法解析输入的 ID 或 URL')
    return
  }
  
  try {
    console.log('[Rating] Saving rating:', parsed)
    
    // 直接调用 updateRecordRating,内部会自动创建记录如果不存在
    await Store.updateRecordRating(
      parsed.type,
      parsed.provider,
      parsed.providerId,
      ratingValue.value
    )
    
    console.log('[Rating] ✅ Saved')
    toast.success(`评分已保存(${parsed.provider}/${parsed.providerId})`)
    
    // 清空输入
    ratingInput.value = ''
    ratingValue.value = null
    ratingQueryResult.value = null
  } catch (error) {
    console.error('[Rating] ❌ Failed:', error)
    toast.error('保存评分失败: ' + (error as Error).message)
  }
}



// ==================== 主题配置 ====================
// 使用手动管理方式，避免 useColorMode 的配置问题
const currentTheme = ref<'light' | 'dark' | 'auto'>('dark')
console.log('[Theme] Component initialized, currentTheme:', currentTheme.value)

// 应用主题到 DOM
function applyTheme(theme: 'light' | 'dark' | 'auto') {
  console.log('[Theme] applyTheme called with:', theme)
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
    console.log('[Theme] Added dark class to html')
  } else {
    document.documentElement.classList.remove('dark')
    console.log('[Theme] Removed dark class from html')
  }
  currentTheme.value = theme
  console.log('[Theme] currentTheme updated to:', currentTheme.value)
}

// 计算属性：显示给用户的主题名称
const themeLabel = computed(() => {
  switch (currentTheme.value) {
    case 'light': return '亮色'
    case 'dark': return '暗色'
    case 'auto': return '跟随系统'
    default: return '未知'
  }
})

// 切换主题
function toggleTheme() {
  console.log('[Theme] toggleTheme called, current value:', currentTheme.value)
  if (currentTheme.value === 'light') {
    applyTheme('dark')
  } else if (currentTheme.value === 'dark') {
    applyTheme('auto')
  } else {
    applyTheme('light')
  }
  
  // 持久化到 chrome.storage（如果可用）
  if (chrome.storage?.local) {
    chrome.storage.local.set({
      settings: {
        appearance: currentTheme.value
      }
    })
  } else {
    console.log('[Theme] Cannot save to storage (not running in extension context)')
  }
  
  console.log('[Theme] Switched to:', currentTheme.value)
}

// ==================== 设置页面 ====================
const webdavConfig = ref({
  url: '',
  username: '',
  password: '',
})

async function loadSettings() {
  const settings = await Store.getSettings()
  webdavConfig.value = {
    url: settings.webdavUrl || '',
    username: settings.webdavUsername || '',
    password: settings.webdavPassword || '',
  }
}

async function saveWebDAVConfig() {
  // 验证 WebDAV URL
  if (webdavConfig.value.url && !webdavConfig.value.url.startsWith('https://')) {
    toast.error('⚠️ WebDAV URL 必须使用 HTTPS 协议以保证安全')
    return
  }
  
  try {
    await Store.setSettings({
      webdavUrl: webdavConfig.value.url,
      webdavUsername: webdavConfig.value.username,
      webdavPassword: webdavConfig.value.password,
    })
    toast.success('WebDAV 配置已保存')
  } catch (error) {
    console.error('Failed to save WebDAV config:', error)
    toast.error('保存失败：' + String(error))
  }
}

async function testWebDAVConnection() {
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'WEBDAV_TEST',
      payload: webdavConfig.value,
    })
    
    if (!result) {
      throw new Error('Service worker 未响应，请重试')
    }
    
    if (result.success) {
      toast.success('连接成功！')
    } else {
      toast.error('连接失败：' + result.message)
    }
  } catch (error) {
    toast.error('测试失败：' + String(error))
  }
}

async function exportData() {
  try {
    // ✅ 立即显示"正在准备..."提示
    const toastId = toast.loading('正在准备导出数据...')
    
    const response = await chrome.runtime.sendMessage({ type: 'EXPORT_DATA' })
    
    if (!response?.success) {
      toast.dismiss(toastId)
      throw new Error(response?.error || '导出失败')
    }
    
    // 更新提示为"正在生成文件..."
    toast.loading('正在生成文件...', { id: toastId })
    
    const jsonString = JSON.stringify(response.data, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = `umm-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    // ✅ 更新为成功提示
    toast.success('导出成功！', { id: toastId })
  } catch (error) {
    console.error('[Popup] Export failed:', error)
    toast.error('导出失败：' + String(error))
  }
}

function triggerImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    
    // ✅ 立即显示"正在读取文件..."
    const toastId = toast.loading(`正在读取文件: ${file.name}...`)
    
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        // 更新为"正在解析数据..."
        toast.loading('正在解析数据...', { id: toastId })
        
        const payload = JSON.parse(event.target?.result as string)
        
        // 更新为"正在导入到数据库..."，并显示记录数
        let recordCount = 0
        for (const provider in payload.datasets || {}) {
          for (const type in payload.datasets[provider]) {
            recordCount += payload.datasets[provider][type].length
          }
        }
        toast.loading(`正在导入 ${recordCount.toLocaleString()} 条记录...`, { id: toastId })
        
        await chrome.runtime.sendMessage({
          type: 'IMPORT_DATA',
          payload,
        })
        
        // ✅ 显示成功提示和记录数
        toast.success(`导入成功！共 ${recordCount.toLocaleString()} 条记录`, { id: toastId })
        loadData() // 刷新数据
      } catch (error) {
        toast.error('导入失败：' + String(error), { id: toastId })
      }
    }
    reader.onerror = () => {
      toast.error('文件读取失败', { id: toastId })
    }
    reader.readAsText(file)
  }
  input.click()
}

async function syncWithCloud() {
  // ✅ 立即显示"正在同步..."
  const toastId = toast.loading('正在连接 WebDAV 服务器...')
  
  try {
    const result = await chrome.runtime.sendMessage({ type: 'WEBDAV_SYNC' })
    if (!result) {
      toast.dismiss(toastId)
      throw new Error('Service worker 未响应')
    }
    
    if (result.success) {
      // ✅ 根据同步方向显示不同提示
      const direction = result.direction === 'upload' ? '上传' : '下载'
      toast.success(`同步成功！已${direction}数据`, { id: toastId })
      loadData() // 刷新数据
    } else {
      toast.error('同步失败：' + result.message, { id: toastId })
    }
  } catch (error) {
    toast.error('同步失败：' + String(error), { id: toastId })
  }
}

// ✅ 优化：防抖刷新，避免频繁请求
let refreshTimer: ReturnType<typeof setTimeout> | null = null
function handleRefresh() {
  // ✅ 修复：取消之前的定时器，避免竞态条件
  if (refreshTimer) {
    clearTimeout(refreshTimer)
  }
  
  refreshTimer = setTimeout(() => {
    loadData(true) // 强制刷新
    refreshTimer = null
  }, 300)
}

// ==================== 生命周期 ====================
onMounted(() => {
  // 1. 初始化主题
  if (chrome.storage?.local) {
    chrome.storage.local.get(['settings'], (result: any) => {
      if (result.settings?.appearance) {
        applyTheme(result.settings.appearance)
      } else {
        applyTheme('dark')
      }
    })
  } else {
    applyTheme('dark')
  }
  
  // 2. 加载数据
  loadData()
  loadSettings()
  
  // 3. 注册统一的 Storage 监听器
  const storageListener = (changes: any, namespace: string) => {
    // 监听数据版本变化
    if (namespace === 'local' && changes.umm_data_version) {
      console.log('[Popup] Data version changed, reloading...')
      loadData()
    }
    // 监听数据变化通知
    if (namespace === 'local' && changes.umm_data_changed) {
      console.log('[Popup] Data changed detected, refreshing...')
      loadData(true) // 强制刷新
    }
  }
  
  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(storageListener)
  }
  
  // 4. 统一的清理逻辑
  onUnmounted(() => {
    if (chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(storageListener)
    }
    
    // 清理刷新定时器
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
    
    // 清理查询防抖定时器
    if (queryDebounceTimer) {
      clearTimeout(queryDebounceTimer)
      queryDebounceTimer = null
    }
  })
})
</script>

<template>
  <div class="flex flex-col bg-background text-foreground" style="width: 600px; height: 500px;">
    <!-- 顶部导航栏 -->
    <header class="border-b border-border px-4 py-3">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold tracking-tight">UMM 媒体管理器</h1>
        <Button
          variant="ghost"
          size="icon"
          @click="toggleTheme"
          :title="`当前主题: ${themeLabel}`"
        >
          <Sun v-if="currentTheme === 'light'" class="h-5 w-5" />
          <Moon v-else-if="currentTheme === 'dark'" class="h-5 w-5" />
          <RefreshCw v-else class="h-5 w-5" />
        </Button>
      </div>
      
      <!-- 页面导航 -->
      <nav class="mt-3 flex gap-2">
        <Button
          v-for="page in pages"
          :key="page.id"
          variant="outline"
          :class="{ 'bg-primary text-primary-foreground': currentPage === page.id }"
          @click="currentPage = page.id"
          class="flex-1"
        >
          <component :is="page.icon" class="mr-2 h-4 w-4" />
          {{ page.label }}
        </Button>
      </nav>
    </header>

    <!-- 主内容区域 -->
    <main class="flex-1 overflow-y-auto p-4">
      <!-- 记录概览页面 -->
      <Card v-if="currentPage === 'records'">
        <CardHeader>
          <div class="flex items-center justify-between">
            <div>
              <CardTitle>记录概览</CardTitle>
              <CardDescription>您的媒体收藏统计</CardDescription>
            </div>
            <!-- ✅ 优化：添加手动刷新按钮 -->
            <Button 
              variant="ghost" 
              size="sm"
              @click="handleRefresh"
              :disabled="loading"
              title="刷新数据"
            >
              <RefreshCw :class="['h-4 w-4', loading && 'animate-spin']" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div v-if="loading" class="py-8 text-center text-muted-foreground">
            加载中...
          </div>
          
          <div v-else>
            <!-- 统计卡片 -->
            <div class="grid grid-cols-2 gap-4 mb-6">
              <Card v-for="stat in statsList" :key="stat.label" class="p-4">
                <div class="text-center">
                  <div class="text-3xl font-bold tracking-tight">{{ stat.value }}</div>
                  <div class="text-sm font-medium text-muted-foreground mt-1">{{ stat.label }}</div>
                </div>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 平台分布页面 -->
      <Card v-if="currentPage === 'platforms'">
        <CardHeader>
          <CardTitle>平台分布</CardTitle>
          <CardDescription>各媒体平台的详细统计</CardDescription>
        </CardHeader>
        <CardContent>
          <div v-if="loading" class="py-8 text-center text-muted-foreground">
            加载中...
          </div>
          
          <div v-else class="space-y-3">
            <div
              v-for="[platform, count] in Object.entries(platformStats)"
              :key="platform"
              class="flex items-center justify-between rounded-md border border-border p-4"
            >
              <span class="text-lg font-medium">{{ platform }}</span>
              <Badge variant="secondary" class="text-lg font-medium px-3 py-1">
                {{ count }}
              </Badge>
            </div>
            
            <div v-if="Object.keys(platformStats).length === 0" class="text-center py-8 text-muted-foreground">
              暂无数据
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 评分管理页面 -->
      <Card v-if="currentPage === 'ratings'">
        <CardHeader>
          <CardTitle>评分管理</CardTitle>
          <CardDescription>为媒体作品添加和管理评分</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-6">
            <!-- 添加评分表单 -->
            <div class="space-y-4 p-4 border border-border rounded-lg">
              <div>
                <Label for="platform-select">选择平台</Label>
                <Select v-model="selectedPlatform" class="mt-2">
                  <SelectTrigger id="platform-select">
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
                <Label for="domain-select">媒体类型</Label>
                <Select v-model="selectedDomain" class="mt-2">
                  <SelectTrigger id="domain-select">
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
                <Label for="rating-input">平台 ID 或 URL</Label>
                <Input
                  id="rating-input"
                  v-model="ratingInput"
                  placeholder="例如: 1299004 或 https://movie.douban.com/subject/1299004/"
                  class="mt-2"
                />
              </div>
              
              <!-- 实时解析结果 -->
              <Alert v-if="ratingInput && !isQuerying" :variant="parseResult?.valid ? 'default' : 'destructive'">
                <CheckCircle2 v-if="parseResult?.valid" class="h-4 w-4" />
                <XCircle v-else class="h-4 w-4" />
                <AlertTitle>{{ parseResult?.valid ? '✅ 解析成功' : '❌ 解析失败' }}</AlertTitle>
                <AlertDescription v-if="parseResult">
                  <div v-if="parseResult.valid" class="mt-2 space-y-1 text-sm">
                    <div class="flex items-center gap-2">
                      <strong>平台:</strong>
                      <Badge variant="outline" class="text-xs">
                        {{ parseResult.provider }} / {{ parseResult.type }}
                      </Badge>
                    </div>
                    <div><strong>ID:</strong> {{ parseResult.providerId }}</div>
                    <div><strong>URL:</strong> <code class="text-xs bg-muted px-1 py-0.5 rounded">{{ parseResult.url }}</code></div>
                  </div>
                  <div v-else class="text-sm text-destructive">
                    {{ parseResult.error }}
                  </div>
                </AlertDescription>
              </Alert>
              
              <!-- 查询结果显示 -->
              <Alert v-if="isQuerying">
                <RefreshCw class="h-4 w-4 animate-spin" />
                <AlertTitle>查询中...</AlertTitle>
                <AlertDescription>
                  正在从数据库中查找记录
                </AlertDescription>
              </Alert>
              
              <Alert v-else-if="ratingQueryResult" variant="default">
                <CheckCircle2 class="h-4 w-4" />
                <AlertTitle class="font-semibold">找到记录</AlertTitle>
                <AlertDescription>
                  <div class="mt-2 space-y-1 text-sm">
                    <div class="flex items-center gap-2">
                      <strong class="font-medium">平台:</strong>
                      <Badge variant="outline" class="text-xs font-medium">
                        {{ ratingQueryResult.provider }} / {{ ratingQueryResult.type }}
                      </Badge>
                    </div>
                    <div><strong class="font-medium">ID:</strong> {{ ratingQueryResult.providerId }}</div>
                    <div v-if="ratingQueryResult.rating" class="flex items-center gap-2">
                      <strong class="font-medium">当前评分:</strong>
                      <Badge variant="default" class="font-medium">
                        <Star class="mr-1 h-3 w-3" />
                        {{ ratingQueryResult.rating }}/10
                      </Badge>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
              
              <Alert v-else-if="ratingInput && !isQuerying">
                <Database class="h-4 w-4" />
                <AlertTitle>未找到记录</AlertTitle>
                <AlertDescription>
                  数据库中暂无此记录,请先在对应平台页面标记“已看”,然后再来评分
                </AlertDescription>
              </Alert>
              
              <div>
                <Label>评分 (1-10)</Label>
                <div class="grid grid-cols-5 gap-2 mt-2">
                  <Button
                    v-for="i in 10"
                    :key="i"
                    variant="outline"
                    :class="{ 'bg-primary text-primary-foreground': ratingValue === i }"
                    @click="ratingValue = i"
                    class="h-9"
                  >
                    {{ i }}
                  </Button>
                </div>
              </div>

              <Button @click="saveRating" class="w-full">
                <Star class="mr-2 h-4 w-4" />
                保存评分
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 设置页面 -->
      <Card v-if="currentPage === 'settings'">
        <CardHeader>
          <CardTitle>设置与同步</CardTitle>
          <CardDescription>配置 WebDAV 和数据管理</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-6">
            <!-- WebDAV 配置 -->
            <div class="space-y-4">
              <h3 class="text-sm font-semibold">WebDAV 配置</h3>
              
              <div>
                <Label for="webdav-url" class="font-medium">服务器地址</Label>
                <Input
                  id="webdav-url"
                  v-model="webdavConfig.url"
                  placeholder="https://example.com/dav/"
                  class="mt-2"
                />
              </div>
              
              <div>
                <Label for="webdav-username" class="font-medium">用户名</Label>
                <Input
                  id="webdav-username"
                  v-model="webdavConfig.username"
                  class="mt-2"
                />
              </div>
              
              <div>
                <Label for="webdav-password" class="font-medium">密码</Label>
                <Input
                  id="webdav-password"
                  v-model="webdavConfig.password"
                  type="password"
                  class="mt-2"
                />
              </div>

              <div class="flex gap-2">
                <Button @click="saveWebDAVConfig" class="flex-1 font-medium">
                  保存配置
                </Button>
                <Button @click="testWebDAVConnection" variant="outline" class="flex-1 font-medium">
                  测试连接
                </Button>
              </div>
            </div>

            <Separator />

            <!-- 数据管理 -->
            <div class="space-y-4">
              <h3 class="text-sm font-semibold">数据管理</h3>
              
              <div class="grid grid-cols-2 gap-3">
                <Button @click="exportData" variant="outline">
                  <Download class="mr-2 h-4 w-4" />
                  导出数据
                </Button>
                <Button @click="triggerImport" variant="outline">
                  <Upload class="mr-2 h-4 w-4" />
                  导入数据
                </Button>
              </div>
              
              <Button @click="syncWithCloud" class="w-full">
                <RefreshCw class="mr-2 h-4 w-4" />
                云端同步
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>

    <!-- 底部状态栏 -->
    <footer class="border-t border-border px-4 py-2 text-xs font-medium text-muted-foreground">
      <div class="flex items-center justify-between">
        <span>v2.0.0</span>
        <span>{{ records.length }} 条记录</span>
      </div>
    </footer>

    <Toaster />
  </div>
</template>

<style scoped>
/* shadcn-vue 官方设计不需要额外样式 */
/* 所有样式通过 Tailwind CSS 类名实现 */
</style>
