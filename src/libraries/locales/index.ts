import en from '../../libraries/locales/en';
import zhCN from '../../libraries/locales/zh-CN';
import zhTW from '../../libraries/locales/zh-TW';
import { EXTENSION_LOCALES, isExtensionLocale, SPA_LOCALE_FALLBACK } from '@/libraries/locale-sets';
import type { ExtensionLocale } from '@/libraries/locale-sets';

/** Message schema derived from the English locale — the canonical key set. */
export type MessageSchema = typeof en;

/** Locales the SPA (popup/options) ships a real dictionary for. */
export type Locale = 'en-US' | 'zh-CN' | 'zh-TW';

export const messages = {
  'en-US': en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
} satisfies Record<Locale, { [K in keyof MessageSchema]: string }>;

/*
 * 「这个扩展一共有哪几种语言」此前散在三个互不相等的集合里（注入层 4 / SPA 词典 3 /
 * 备份恢复白名单 3），而 WebDAV 恢复是 **fail-closed** 过滤器：没登记的语言值被直接
 * 丢弃且只留一行 warn —— zh-HK 用户在一次备份恢复后不声不响地失去了自己的语言设置。
 * 唯一清单与关系说明在 @/libraries/locale-sets（那边还解释了为什么不放进本目录），
 * 关系断言 = tests/unit/locale-set-parity.spec.ts（审计规则 33）。
 */

/** 全扩展可持有/可显示的语言清单（含粤语 zh-HK）。 */
export { EXTENSION_LOCALES, isExtensionLocale, SPA_LOCALE_FALLBACK };
export type { ExtensionLocale };

/** 有词典的 locale —— 派生自 `messages` 本体，不是第二份字面量清单。 */
export const SPA_MESSAGE_LOCALES: readonly Locale[] = Object.keys(messages) as Locale[];

/** 值是否有对应的 SPA 词典。 */
export function isSpaMessageLocale(value: string): value is Locale {
  return (SPA_MESSAGE_LOCALES as readonly string[]).includes(value);
}

/**
 * 把存储里的语言解析成 SPA 真正能渲染的 locale：有词典的直接用；没词典但登记了
 * 降级的用降级目标；两者都不是（陌生值/空值）返回 `undefined`，由调用方继续走
 * 浏览器语言探测。存储值本身永不被改写。
 */
export function resolveSpaLocale(stored: string | null | undefined): Locale | undefined {
  if (!stored || !isExtensionLocale(stored)) return undefined;
  if (isSpaMessageLocale(stored)) return stored;
  return SPA_LOCALE_FALLBACK[stored];
}
