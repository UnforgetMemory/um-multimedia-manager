import en from './en'
import zhCN from './zh-CN'
import zhTW from './zh-TW'

export const messages = {
  'en-US': en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
} as const

export type Locale = keyof typeof messages
export type MessageSchema = typeof en
