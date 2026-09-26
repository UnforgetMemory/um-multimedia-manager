import en from '../../libraries/locales/en';
import zhCN from '../../libraries/locales/zh-CN';
import zhTW from '../../libraries/locales/zh-TW';

/** Message schema derived from the English locale — the canonical key set. */
export type MessageSchema = typeof en;

/** Supported locales. */
export type Locale = 'en-US' | 'zh-CN' | 'zh-TW';

export const messages = {
  'en-US': en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
} satisfies Record<Locale, { [K in keyof MessageSchema]: string }>;
