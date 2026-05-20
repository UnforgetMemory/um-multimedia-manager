<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { Store } from '@/shared'
import type { Domain, Provider, MediaRecord } from '@/shared'
import { safeSendMessage } from '@/shared/utils/context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { 
  Moon, Sun, Settings, Database, RefreshCw,
  CheckCircle2, XCircle, Star, Download, Upload, AlertCircle
} from 'lucide-vue-next'

// ✅ 辅助函数：通过 Background 向当前活动页面发送 Toast
async function showPageToast(type: 'success' | 'error' | 'info', title: string, message?: string) {
  try {
    await safeSendMessage(
      {
        type: 'SHOW_TOAST',
        payload: { type, title, message }
      },
      {
        timeout: 3000,
        fallback: () => {
          // ✅ 不再回退到 Popup Toast，仅记录日志
          console.warn('[Popup] Failed to send page toast:', type, title, message)
        }
      }
    )
  } catch (error) {
    console.warn('[Popup] Failed to send page toast:', error)
  }
}

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

// ✅ 修复：添加加载超时保护，防止 loading 永远卡住
let loadTimeout: ReturnType<typeof setTimeout> | null = null

// 加载数据
async function loadData() {
  console.log('[Popup] ===== loadData START =====')
  console.log('[Popup] current loading:', loading.value)
  
  // ✅ 修复：如果正在加载，直接返回（防止竞态）
  if (loading.value) {
    console.log('[Popup] ⚠️ Already loading, SKIP duplicate request')
    return
  }
  
  // 清除之前的超时保护
  if (loadTimeout) clearTimeout(loadTimeout)
  
  loading.value = true
  console.log('[Popup] loading set to TRUE')
  
  // ✅ 新增：10 秒超时保护
  loadTimeout = setTimeout(() => {
    if (loading.value) {
      console.warn('[Popup] ⏱️ Load timeout after 10s, resetting loading state')
      loading.value = false
    }
  }, 10000)
  
  try {
    console.log('[Popup] Sending GET_ALL_RECORDS message...')
    
    const response = await safeSendMessage(
      { type: 'GET_ALL_RECORDS' },
      {
        timeout: 20000,  // ✅ 降低至 20 秒
        retries: 2,      // ✅ 降低至 2 次重试
        fallback: () => {
          console.error('[Popup] ⚠️ Connection failed after retries')
        }
      }
    )
    
    console.log('[Popup] Response received:', {
      success: response?.success,
      recordCount: response?.records?.length,
      error: response?.error
    })
    
    if (!response?.success) {
      const errorMsg = response?.error || '获取数据失败'
      console.error('[Popup] ❌ Response not successful:', errorMsg)
      throw new Error(errorMsg)
    }
    
    console.log('[Popup] ✅ Records loaded:', response.records.length)
    records.value = response.records
    console.log('[Popup] Records updated:', records.value.length)
    
    updateStats()
    console.log('[Popup] Stats updated:', stats.value)
  } catch (error) {
    console.error('[Popup] ❌ Failed to load data:', error)
    // ✅ 修复：确保即使失败也清除 loading 状态
    records.value = []
    updateStats()
    
    // ✅ 改进：提供更详细的错误提示
    const errorMessage = (error as Error).message
    if (errorMessage.includes('timeout') || errorMessage.includes('Message timeout')) {
      console.warn('[Popup] ⏱️ Request timed out. This may happen when:')
      console.warn('  1. Service Worker was terminated by Chrome')
      console.warn('  2. Database query is too slow (', records.value.length, 'records)')
      console.warn('  3. System is under heavy load')
      console.warn('[Popup] 💡 Try closing and reopening the Popup')
    }
  } finally {
    // ✅ 修复：确保 always 清除 loading 和超时
    if (loadTimeout) {
      clearTimeout(loadTimeout)
      loadTimeout = null
    }
    loading.value = false
    console.log('[Popup] ===== loadData END (loading=false) =====')
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

// 获取状态标签文本
function getStatusLabel(status: number, type: string): string {
  const labels: Record<number, string> = {
    0: type === 'music' ? '未听' : '未看',
    1: type === 'music' ? '在听' : '在看',
    2: type === 'music' ? '已听' : '已看',
  }
  return labels[status] || '未知'
}

// 防抖查询数据库记录
async function queryRecordFromDB() {
  const parsed = parseRatingInput()
  if (!parsed) {
    ratingQueryResult.value = null
    isQuerying.value = false  // ✅ 修复：确保重置
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
    // ✅ 修复：无论成功失败都重置
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
    await showPageToast('error', '请输入平台 ID/URL')
    return
  }
  
  // 验证评分值
  if (!ratingValue.value || ratingValue.value < 1 || ratingValue.value > 10) {
    await showPageToast('error', '请选择有效的评分(1-10)')
    return
  }
  
  const parsed = parseRatingInput()
  if (!parsed) {
    await showPageToast('error', '无法解析输入的 ID 或 URL')
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
    await showPageToast('success', `评分已保存(${parsed.provider}/${parsed.providerId})`)
    
    // 清空输入
    ratingInput.value = ''
    ratingValue.value = null
    ratingQueryResult.value = null
  } catch (error) {
    console.error('[Rating] ❌ Failed:', error)
    await showPageToast('error', '保存评分失败', (error as Error).message)
  }
}



// ==================== 主题配置 ====================
// ✅ 修复：初始值设为 'auto',避免不必要的切换
const currentTheme = ref<'light' | 'dark' | 'auto'>('auto')
console.log('[Theme] Component initialized, currentTheme:', currentTheme.value)

// 应用主题到 DOM
function applyTheme(theme: 'light' | 'dark' | 'auto') {
  console.log('[Theme] applyTheme called with:', theme)
  
  // ✅ 修复：检测系统偏好
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
      document.documentElement.classList.add('dark')
      console.log('[Theme] Auto mode: system prefers dark')
    } else {
      document.documentElement.classList.remove('dark')
      console.log('[Theme] Auto mode: system prefers light')
    }
  } else if (theme === 'dark') {
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

const neodbToken = ref('')

// ✅ 配置保存状态指示器
const isConfigSaved = ref(false)

// ==================== WebDAV 操作 Loading 状态 ====================
const webdavLoading = ref({
  sync: false,        // 智能合并同步
  download: false,    // 云端覆盖本地
  upload: false,      // 本地覆盖云端
  import: false,      // 导入数据
})

// 计算属性：是否有任何 WebDAV 操作正在进行
const isAnyWebDAVOperationRunning = computed(() => {
  return Object.values(webdavLoading.value).some(loading => loading)
})

// ==================== 确认对话框状态 ====================
interface ConfirmDialogState {
  open: boolean
  title: string
  description: string
  warning?: string
  details?: string
  icon: any
  confirmText?: string
  action: () => Promise<void>
  loading: boolean
}

const confirmDialog = ref<ConfirmDialogState>({
  open: false,
  title: '',
  description: '',
  warning: undefined,
  details: undefined,
  icon: AlertCircle,
  confirmText: '确认',
  action: async () => {},
  loading: false,
})

/**
 * 显示确认对话框
 */
function showConfirmDialog(config: Omit<ConfirmDialogState, 'open' | 'loading'>) {
  confirmDialog.value = {
    ...config,
    open: true,
    loading: false,
  }
}

/**
 * 处理确认操作
 */
async function handleConfirmAction() {
  confirmDialog.value.loading = true
  
  try {
    await confirmDialog.value.action()
    confirmDialog.value.open = false
  } catch (error) {
    console.error('[Popup] Confirm action failed:', error)
    // 错误已由具体操作处理，这里只关闭 loading
  } finally {
    confirmDialog.value.loading = false
  }
}

async function loadSettings() {
  console.log('[Popup] Loading settings from storage...')
  try {
    // ✅ 从持久化存储读取 Token
    const settings = await Store.getSettings()
    console.log('[Popup] Raw settings loaded:', {
      hasUrl: !!settings.webdavUrl,
      hasUsername: !!settings.webdavUsername,
      hasPassword: !!settings.webdavPassword,
      urlLength: settings.webdavUrl?.length || 0,
    })
    
    neodbToken.value = settings.neodbToken || ''
    
    // 加载其他设置
    webdavConfig.value = {
      url: settings.webdavUrl || '',
      username: settings.webdavUsername || '',
      password: settings.webdavPassword || '',
    }
    
    // ✅ 更新保存状态
    isConfigSaved.value = !!(settings.webdavUrl && settings.webdavUsername && settings.webdavPassword)
    
    console.log('[Popup] Settings loaded successfully, isConfigSaved:', isConfigSaved.value)
  } catch (error) {
    console.error('[Popup] Failed to load settings:', error)
  }
}

// ✅ 组件挂载时自动加载配置
onMounted(() => {
  loadSettings()
})

async function saveWebDAVConfig() {
  console.log('[Popup] Saving WebDAV config:', {
    url: webdavConfig.value.url ? `${webdavConfig.value.url.substring(0, 20)}...` : '(empty)',
    username: webdavConfig.value.username || '(empty)',
    password: webdavConfig.value.password ? '***' : '(empty)',
  })
  
  // 验证 WebDAV URL
  if (webdavConfig.value.url && !webdavConfig.value.url.startsWith('https://')) {
    await showPageToast('error', 'URL 必须使用 HTTPS', '为保证安全，WebDAV URL 必须使用 HTTPS 协议')
    return
  }
  
  try {
    await Store.setSettings({
      webdavUrl: webdavConfig.value.url,
      webdavUsername: webdavConfig.value.username,
      webdavPassword: webdavConfig.value.password,
    })
    
    // ✅ 立即验证配置已保存
    const verifySettings = await Store.getSettings()
    console.log('[Popup] Config verification:', {
      url: verifySettings.webdavUrl ? '✓' : '✗',
      username: verifySettings.webdavUsername ? '✓' : '✗',
      password: verifySettings.webdavPassword ? '✓' : '✗'
    })
    
    if (!verifySettings.webdavUrl || !verifySettings.webdavUsername || !verifySettings.webdavPassword) {
      throw new Error('配置保存验证失败，请重试')
    }
    
    // ✅ 更新保存状态
    isConfigSaved.value = true
    
    await showPageToast('success', '配置已保存', 'WebDAV 云同步功能现已可用')
  } catch (error) {
    console.error('Failed to save WebDAV config:', error)
    isConfigSaved.value = false
    await showPageToast('error', '保存失败', String(error))
  }
}

async function testWebDAVConnection() {
  try {
    // 验证 URL
    if (!webdavConfig.value.url) {
      await showPageToast('error', '请输入 WebDAV URL')
      return
    }
    
    if (!webdavConfig.value.url.startsWith('https://')) {
      await showPageToast('error', 'URL 必须使用 HTTPS', '为保证安全，WebDAV URL 必须使用 HTTPS 协议')
      return
    }
    
    const result = await safeSendMessage(
      {
        type: 'WEBDAV_TEST',
        payload: webdavConfig.value,
      },
      {
        timeout: 10000,
        fallback: () => {
          showPageToast('error', '扩展上下文已失效，请重新打开 Popup')
        }
      }
    )
    
    if (!result) return
    
    if (result.success) {
      await showPageToast('success', 'WebDAV 连接成功', '服务器响应正常')
    } else {
      await showPageToast('error', 'WebDAV 连接失败', result.message || '请检查 URL、用户名和密码是否正确')
    }
  } catch (error) {
    await showPageToast('error', '测试失败', String(error))
  }
}

async function saveNeoDBToken() {
  try {
    const token = neodbToken.value.trim()
    
    // ✅ 使用持久化存储（local storage），方便用户长期使用
    await Store.setSettings({ neodbToken: token })
    await showPageToast('success', 'NeoDB Token 已保存', '评分同步功能现已激活')
  } catch (error) {
    console.error('Failed to save NeoDB token:', error)
    await showPageToast('error', '保存失败', String(error))
  }
}

async function exportData() {
  try {
    // ✅ 立即显示“正在准备...”提示
    await showPageToast('info', '正在准备导出数据...')
    
    const response = await safeSendMessage(
      { type: 'EXPORT_DATA' },
      {
        timeout: 30000,
        fallback: () => {
          showPageToast('error', '扩展上下文已失效，请重新打开 Popup')
        }
      }
    )
    
    if (!response?.success) {
      throw new Error(response?.error || '导出失败')
    }
    
    // 更新提示为"正在生成文件..."
    await showPageToast('info', '正在生成文件...')
    
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
    await showPageToast('success', '导出成功！')
  } catch (error) {
    console.error('[Popup] Export failed:', error)
    await showPageToast('error', '导出失败', String(error))
  }
}

function triggerImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    
    // 解析文件获取记录数
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const payload = JSON.parse(event.target?.result as string)
        
        let recordCount = 0
        for (const provider in payload.datasets || {}) {
          for (const type in payload.datasets[provider]) {
            recordCount += payload.datasets[provider][type].length
          }
        }
        
        // 显示确认对话框
        showConfirmDialog({
          title: '导入数据',
          description: `即将导入 ${recordCount.toLocaleString()} 条记录。`,
          warning: '导入的数据将与现有数据合并，相同 ID 的记录将被覆盖。',
          details: `文件名: ${file.name}`,
          icon: Upload,
          confirmText: '开始导入',
          action: () => executeImport(file, payload),
        })
      } catch (error) {
        await showPageToast('error', '文件解析失败', String(error))
      }
    }
    reader.onerror = () => {
      showPageToast('error', '文件读取失败', '请检查文件格式是否正确')
    }
    reader.readAsText(file)
  }
  input.click()
}

async function executeImport(file: File, payload: any) {
  webdavLoading.value.import = true
  
  try {
    await showPageToast('info', `正在读取文件: ${file.name}...`)
    await showPageToast('info', '正在解析数据...')
    
    let recordCount = 0
    for (const provider in payload.datasets || {}) {
      for (const type in payload.datasets[provider]) {
        recordCount += payload.datasets[provider][type].length
      }
    }
    await showPageToast('info', `正在导入 ${recordCount.toLocaleString()} 条记录...`)
    
    await safeSendMessage(
      {
        type: 'IMPORT_DATA',
        payload,
      },
      {
        timeout: 30000, // ✅ 降低至 30 秒，导入大量数据时更合理
        fallback: () => {
          showPageToast('error', '扩展上下文已失效，请重新打开 Popup')
        }
      }
    )
    
    await showPageToast('success', '导入成功', `共导入 ${recordCount.toLocaleString()} 条记录`)
    loadData()
  } catch (error) {
    await showPageToast('error', '导入失败', String(error))
  } finally {
    webdavLoading.value.import = false
  }
}

async function syncWithCloud() {
  // 前置检查
  if (!isConfigSaved.value) {
    await showPageToast('error', '配置未保存', '请先在设置中保存 WebDAV 配置')
    return
  }
  
  // 显示确认对话框
  showConfirmDialog({
    title: '智能合并同步',
    description: '将对比本地和云端数据，自动同步有变化的部分。',
    details: '此操作会比较各数据集的哈希值，仅传输有变化的数据。',
    icon: RefreshCw,
    confirmText: '开始同步',
    action: executeSyncWithCloud,
  })
}

async function executeSyncWithCloud() {
  webdavLoading.value.sync = true
  
  try {
    await showPageToast('info', '正在连接 WebDAV 服务器...')
    
    const result = await safeSendMessage(
      { type: 'WEBDAV_SYNC' },
      {
        timeout: 30000,
        fallback: () => {
          showPageToast('error', '扩展上下文已失效，请重新打开 Popup')
        }
      }
    )
    
    if (!result) return
    
    if (result.success) {
      const directionMap: Record<string, string> = {
        upload: '上传',
        download: '下载',
        merge: '合并'
      }
      const direction = directionMap[result.direction] || '同步'
      await showPageToast('success', '同步成功', result.message || `已${direction}数据`)
      loadData()
    } else {
      await showPageToast('error', '同步失败', result.message)
    }
  } catch (error) {
    await showPageToast('error', '同步失败', String(error))
  } finally {
    webdavLoading.value.sync = false
  }
}

async function downloadFromCloud() {
  if (!isConfigSaved.value) {
    await showPageToast('error', '配置未保存', '请先在设置中保存 WebDAV 配置')
    return
  }
  
  showConfirmDialog({
    title: '云端覆盖本地',
    description: '将用云端数据完全覆盖本地数据。',
    warning: '此操作不可逆！本地的所有修改将丢失。',
    details: '建议先导出本地数据作为备份。',
    icon: Download,
    confirmText: '确认覆盖',
    action: executeDownloadFromCloud,
  })
}

async function executeDownloadFromCloud() {
  webdavLoading.value.download = true
  
  try {
    await showPageToast('info', '正在从云端下载数据...')
    
    const result = await safeSendMessage(
      { type: 'WEBDAV_DOWNLOAD' },
      { timeout: 30000 }
    )
    
    if (!result) return
    
    if (result.success) {
      await showPageToast('success', '下载成功', result.message)
      loadData()
    } else {
      await showPageToast('error', '下载失败', result.message)
    }
  } catch (error) {
    await showPageToast('error', '下载失败', String(error))
  } finally {
    webdavLoading.value.download = false
  }
}

async function uploadToCloud() {
  if (!isConfigSaved.value) {
    await showPageToast('error', '配置未保存', '请先在设置中保存 WebDAV 配置')
    return
  }
  
  showConfirmDialog({
    title: '本地覆盖云端',
    description: '将用本地数据完全覆盖云端数据。',
    warning: '此操作不可逆！云端的所有修改将丢失。',
    details: '请确认这是您想要的操作。',
    icon: Upload,
    confirmText: '确认覆盖',
    action: executeUploadToCloud,
  })
}

async function executeUploadToCloud() {
  webdavLoading.value.upload = true
  
  try {
    await showPageToast('info', '正在上传数据到云端...')
    
    const result = await safeSendMessage(
      { type: 'WEBDAV_UPLOAD' },
      { timeout: 30000 }
    )
    
    if (!result) return
    
    if (result.success) {
      await showPageToast('success', '上传成功', result.message)
      loadData()
    } else {
      await showPageToast('error', '上传失败', result.message)
    }
  } catch (error) {
    await showPageToast('error', '上传失败', String(error))
  } finally {
    webdavLoading.value.upload = false
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
    loadData() // ✅ 移除 forceRefresh 参数
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
        // ✅ 修复：默认使用 auto,而不是 dark
        applyTheme('auto')
      }
    })
  } else {
    applyTheme('auto')
  }
  
  // 2. 加载数据
  loadData()
  loadSettings()
  
  // 3. 注册统一的 Storage 监听器
  // ✅ 修复：添加标志位防止循环触发
  let isHandlingStorageChange = false
  
  const storageListener = (changes: any, namespace: string) => {
    // 防止循环触发
    if (isHandlingStorageChange) {
      console.log('[Popup] Ignoring nested storage change')
      return
    }
    
    // 监听数据版本变化
    if (namespace === 'local' && changes.umm_data_version) {
      console.log('[Popup] Data version changed, reloading...')
      isHandlingStorageChange = true
      loadData().finally(() => {
        isHandlingStorageChange = false
      })
    }
    // 监听数据变化通知
    if (namespace === 'local' && changes.umm_data_changed) {
      console.log('[Popup] Data changed detected, refreshing...')
      isHandlingStorageChange = true
      loadData().finally(() => {
        isHandlingStorageChange = false
      })
    }
    // ✅ 监听设置变化，实现多 Popup 实例同步
    if (namespace === 'local' && changes.settings) {
      const newSettings = changes.settings.newValue
      if (newSettings?.neodbToken !== undefined) {
        neodbToken.value = newSettings.neodbToken
        console.log('[Popup] NeoDB token updated from storage')
      }
    }
  }
  
  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(storageListener)
  }
  
  // ✅ 注意：不再监听来自 Content Script 的 toast 通知
  // 所有 Toast 现在都直接显示在浏览器页面中，而非 Popup 内部
  
  // 5. 统一的清理逻辑
  onUnmounted(() => {
    if (chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(storageListener)
    }
    
    // ✅ 注意：不再需要移除消息监听器（已删除）
    
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
    
    // ✅ 修复：清理加载超时保护
    if (loadTimeout) {
      clearTimeout(loadTimeout)
      loadTimeout = null
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
              
              <!-- 已看/听状态 -->
              <Alert v-else-if="ratingQueryResult && ratingQueryResult.status === 2" variant="default">
                <CheckCircle2 class="h-4 w-4" />
                <AlertTitle class="font-semibold">
                  ✅ {{ ratingQueryResult.type === 'music' ? '已听' : '已看' }}
                </AlertTitle>
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
                      <strong class="font-medium">本地评分:</strong>
                      <Badge variant="default" class="font-medium">
                        <Star class="mr-1 h-3 w-3" />
                        {{ ratingQueryResult.rating }}/10
                      </Badge>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
              
              <!-- 其他状态（在看/未看） -->
              <Alert v-else-if="ratingQueryResult" variant="default">
                <Database class="h-4 w-4" />
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
                    <div class="flex items-center gap-2">
                      <strong class="font-medium">状态:</strong>
                      <Badge 
                        :variant="ratingQueryResult.status === 1 ? 'default' : 'secondary'"
                        class="text-xs font-medium"
                      >
                        {{ getStatusLabel(ratingQueryResult.status, ratingQueryResult.type) }}
                      </Badge>
                    </div>
                    <div v-if="ratingQueryResult.rating" class="flex items-center gap-2">
                      <strong class="font-medium">评分:</strong>
                      <Badge variant="outline" class="font-medium">
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
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-semibold">WebDAV 配置</h3>
                <!-- ✅ 新增：配置状态指示 -->
                <Badge v-if="isConfigSaved" variant="default" class="bg-green-500">
                  已保存
                </Badge>
                <Badge v-else variant="outline" class="text-orange-500 border-orange-500">
                  未保存
                </Badge>
              </div>
              
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
                <Button 
                  @click="exportData" 
                  variant="outline"
                  :disabled="isAnyWebDAVOperationRunning"
                >
                  <Download class="mr-2 h-4 w-4" />
                  导出数据
                </Button>
                <Button 
                  @click="triggerImport" 
                  variant="outline"
                  :disabled="isAnyWebDAVOperationRunning"
                >
                  <RefreshCw v-if="webdavLoading.import" class="mr-2 h-4 w-4 animate-spin" />
                  <Upload v-else class="mr-2 h-4 w-4" />
                  {{ webdavLoading.import ? '导入中...' : '导入数据' }}
                </Button>
              </div>
              
              <!-- ✅ 三种同步方式 -->
              <div class="space-y-2">
                <Button 
                  @click="downloadFromCloud" 
                  variant="outline" 
                  class="w-full"
                  :disabled="!isConfigSaved || isAnyWebDAVOperationRunning"
                >
                  <RefreshCw v-if="webdavLoading.download" class="mr-2 h-4 w-4 animate-spin" />
                  <Download v-else class="mr-2 h-4 w-4" />
                  {{ webdavLoading.download ? '下载中...' : '云端覆盖本地' }}
                </Button>
                <Button 
                  @click="uploadToCloud" 
                  variant="outline" 
                  class="w-full"
                  :disabled="!isConfigSaved || isAnyWebDAVOperationRunning"
                >
                  <RefreshCw v-if="webdavLoading.upload" class="mr-2 h-4 w-4 animate-spin" />
                  <Upload v-else class="mr-2 h-4 w-4" />
                  {{ webdavLoading.upload ? '上传中...' : '本地覆盖云端' }}
                </Button>
                <Button 
                  @click="syncWithCloud" 
                  class="w-full"
                  :disabled="!isConfigSaved || isAnyWebDAVOperationRunning"
                >
                  <RefreshCw v-if="webdavLoading.sync" class="mr-2 h-4 w-4 animate-spin" />
                  <RefreshCw v-else class="mr-2 h-4 w-4" />
                  {{ webdavLoading.sync ? '同步中...' : '智能合并同步' }}
                </Button>
              </div>
            </div>

            <Separator />

            <!-- NeoDB 配置 -->
            <div class="space-y-4">
              <h3 class="text-sm font-semibold">NeoDB 配置</h3>
              
              <div>
                <Label for="neodb-token" class="font-medium">API Token</Label>
                <Input
                  id="neodb-token"
                  v-model="neodbToken"
                  type="password"
                  placeholder="请输入您的 NeoDB API Token"
                  class="mt-2"
                />
                <p class="text-xs text-muted-foreground mt-2">
                  用于同步评分到 NeoDB，可在 NeoDB 个人中心获取
                </p>
              </div>

              <Button @click="saveNeoDBToken" class="w-full font-medium">
                保存 Token
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

    <!-- ==================== WebDAV 确认对话框 ==================== -->
    <Dialog v-model:open="confirmDialog.open">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <component :is="confirmDialog.icon" class="h-5 w-5" />
            {{ confirmDialog.title }}
          </DialogTitle>
          <DialogDescription>
            {{ confirmDialog.description }}
          </DialogDescription>
        </DialogHeader>
        
        <div class="py-4">
          <Alert v-if="confirmDialog.warning" variant="destructive">
            <XCircle class="h-4 w-4" />
            <AlertTitle>警告</AlertTitle>
            <AlertDescription>{{ confirmDialog.warning }}</AlertDescription>
          </Alert>
          
          <p v-if="confirmDialog.details" class="text-sm text-muted-foreground mt-3">
            {{ confirmDialog.details }}
          </p>
        </div>
        
        <DialogFooter>
          <Button 
            variant="outline" 
            @click="confirmDialog.open = false"
            :disabled="confirmDialog.loading"
          >
            取消
          </Button>
          <Button 
            @click="handleConfirmAction"
            :disabled="confirmDialog.loading"
          >
            <RefreshCw v-if="confirmDialog.loading" class="mr-2 h-4 w-4 animate-spin" />
            {{ confirmDialog.confirmText || '确认' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
/* shadcn-vue 官方设计不需要额外样式 */
/* 所有样式通过 Tailwind CSS 类名实现 */
</style>
