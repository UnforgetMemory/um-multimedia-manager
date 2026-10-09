import type { Locale } from '@/libraries/locales';

/**
 * 「这个扩展一共有哪几种语言」的唯一清单 + 各集合的关系（审计规则 33 的落点）。
 *
 * 为什么不在 `src/libraries/locales/` 里：`scripts/check-i18n.js` 把该目录下
 * 除 `index.ts` 外的每个 `.ts` 都当成本语言词典去做键集完整性比对，一份「清单」
 * 放那儿会被读成 0% 完整的 locale。为什么不并进 `locales/index.ts`：那个模块聚合了
 * 三本 SPA 词典（约 25 KB 文案），而备份恢复只需要这份清单——并过去会把 popup
 * 的词典拖进 Manifest V3 service worker 的冷启动 chunk。
 *
 * 关系（回归锁 tests/unit/locale-set-parity.spec.ts）：
 *   注入层 locale（src/entrypoints/content/i18n/locales/index.ts）
 *     == EXTENSION_LOCALES（逐元素相等）
 *     ⊇ SPA 有词典的 locale（SPA_MESSAGE_LOCALES，派生自 messages）
 *   差集成员必须在 SPA_LOCALE_FALLBACK 里登记降级目标，且目标须真有词典。
 */

/**
 * 数组是事实源，`ExtensionLocale` 由它派生——不再另抄一份字面量联合。
 * `zh-HK`（粤语）由注入层 overlay 提供文案，popup/options 暂无词典（见下）。
 */
export const EXTENSION_LOCALES = ['en-US', 'zh-CN', 'zh-HK', 'zh-TW'] as const;

/** 任一可持有/可显示的语言。 */
export type ExtensionLocale = (typeof EXTENSION_LOCALES)[number];

/** 值是否是本扩展可持有的语言（备份恢复与跨上下文同步的准入门槛）。 */
export function isExtensionLocale(value: string): value is ExtensionLocale {
  return (EXTENSION_LOCALES as readonly string[]).includes(value);
}

/**
 * 「有偏好、无词典」的语言降级到哪本词典。这是**故意留下的产品缺口**，不是疏漏：
 * popup/options 没有粤语文案，zh-HK 用户读繁体（存储值仍是 zh-HK，绝不背后改写）。
 * 补词典的人会被迫处理这里：`messages` 一旦多出 `zh-HK`，`Exclude<…>` 塌成 `never`，
 * 下面这条映射立刻变成多余项而 type-check 失败——缺口不会静默留存。
 */
export const SPA_LOCALE_FALLBACK: Readonly<Record<Exclude<ExtensionLocale, Locale>, Locale>> = {
  'zh-HK': 'zh-TW',
};
