import { useColorMode } from '@vueuse/core'

/**
 * 获取当前主题模式
 * @returns 'light' | 'dark' | 'auto'
 */
export function getThemeMode() {
  const mode = useColorMode()
  return mode.value
}

/**
 * 设置主题模式
 * @param mode 'light' | 'dark' | 'auto'
 */
export function setThemeMode(mode: 'light' | 'dark' | 'auto') {
  const colorMode = useColorMode()
  colorMode.value = mode
}

/**
 * 切换亮色/暗色主题
 */
export function toggleTheme() {
  const mode = useColorMode()
  mode.value = mode.value === 'dark' ? 'light' : 'dark'
}

/**
 * 初始化主题（在应用启动时调用）
 */
export function initTheme() {
  // useColorMode 会自动处理初始化和持久化
  // 无需额外代码
}
