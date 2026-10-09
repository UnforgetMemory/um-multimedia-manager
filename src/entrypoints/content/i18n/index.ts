import locales, { type Locale } from './locales';
import { STORAGE_KEYS } from '@/libraries/config';

const STORAGE_KEY = 'umm:locale';
/**
 * 扩展语言设置的物理存储键，必须与 `AppSettings.language` 一致。
 * 经 `STORAGE_KEYS`（单一事实源，ADR-017）引用而非写裸字面量——此前这里是
 * `'language'` 的副本，与设置层存在漂移风险。
 */
const EXT_LANGUAGE_KEY = STORAGE_KEYS.LANGUAGE;

let currentLocale: Locale = 'zh-CN';

/**
 * 语言订阅者（外部 store，不引 vue）。
 *
 * `t()` 读的是模块级 `let`，已经挂载的 Vue 树对它没有响应式依赖——只换掉
 * `currentLocale` 不会让任何在渲染期调过 `t()` 的组件重渲染（X106 用真实浏览器量到：
 * 改存储语言后导航岛标签恒旧）。这里把「语言变了」广播出去，由挂载层决定怎么回填。
 */
const localeListeners = new Set<(locale: Locale) => void>();

function applyLocale(next: Locale): void {
  if (next === currentLocale) return;
  currentLocale = next;
  for (const fn of localeListeners) fn(next);
}

/** 订阅语言变化；返回取消订阅。只在语言**真的变了**时回调（初始化同值不回调）。 */
export function subscribeLocale(fn: (locale: Locale) => void): () => void {
  localeListeners.add(fn);
  return () => localeListeners.delete(fn);
}

/**
 * 同步可得的语言来源：localStorage（legacy 镜像）→ 浏览器语言。
 *
 * `document_start` 的早期壳不能为了等 `chrome.storage`（异步 IPC）而推迟首帧，
 * 故早期入口用 `initI18nSync()` 先按这里定调，随后由 `initI18n()` 异步升级为
 * 存储里的权威语言。优先级顺序与 `detectLocale()` 一致，仅缺 chrome.storage 分支。
 */
function resolveLocaleSync(): Locale {
  // Fall back to localStorage (legacy)
  const localStored = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (localStored && localStored in locales) return localStored;

  // Fall back to browser language
  const lang = navigator.language;
  if (lang.startsWith('zh')) {
    if (lang.includes('TW')) return 'zh-TW';
    if (lang.includes('HK')) return 'zh-HK';
    // 无地区后缀 / 仅 Hant 标记的传统中文（macOS・iOS 常见 zh-Hant）→ 繁体，
    // 否则会误落到 zh-CN（简体）。
    if (lang.includes('Hant')) return 'zh-TW';
    return 'zh-CN';
  }
  return 'en-US';
}

async function detectLocale(): Promise<Locale> {
  // Try chrome.storage.local first (set by Vue apps via STORAGE_KEYS.LANGUAGE)
  try {
    const result = await chrome.storage.local.get(EXT_LANGUAGE_KEY);
    const stored = result[EXT_LANGUAGE_KEY] as Locale | undefined;
    if (stored && stored in locales) return stored;
  } catch {
    // chrome.storage not available
  }
  return resolveLocaleSync();
}

/**
 * 同步初始化：只认同步可得的来源，保证 `document_start` 的早期壳不等异步 IPC。
 * 调用方随后仍应跑一次 `initI18n()`，把语言升级为存储里的权威设置。
 */
export function initI18nSync(): Locale {
  applyLocale(resolveLocaleSync());
  return currentLocale;
}

export async function initI18n(): Promise<void> {
  applyLocale(await detectLocale());
}

/**
 * Start listening for locale changes from other contexts (options/popup tabs).
 * Call this once after initI18n() to keep the content script's locale in sync.
 *
 * 每个 document 只该注册一次：legacy 管线与 Douban 主管线各自的 matches 互斥
 * （douban.com 不在 content.ts 的 matches 里），同文档不会有两个调用方。
 */
export function startLocaleSync(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const langChange = changes[EXT_LANGUAGE_KEY];
    if (langChange?.newValue && langChange.newValue !== langChange.oldValue) {
      const newLocale = langChange.newValue as Locale;
      if (newLocale in locales) {
        applyLocale(newLocale);
      }
    }
  });
}

export function t(key: string, params?: Record<string, string | number>): string {
  // 存在性判据（hasOwnProperty）而非 truthy：**空串是合法译文**（如
  // `douban.series.volume_count_lead` 在部分语言下有意留空）。用 `||` 兜底会把
  // 空串当成缺键 → 依次跌到 en 值、最后跌到**键名本身**，用户界面就会看到
  // `douban.series.volume_count_lead12 册`（X108 复审当场抓到的键泄漏）。
  const dict = locales[currentLocale];
  const resolved =
    dict && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : locales['en-US']?.[key];
  const str = resolved ?? key;
  if (!params) return str;
  return Object.entries(params).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
    str,
  );
}

/** 当前生效语言（只读，无副作用）。数字/日期等 locale 敏感格式化用它取语言。 */
export function getLocale(): Locale {
  return currentLocale;
}
