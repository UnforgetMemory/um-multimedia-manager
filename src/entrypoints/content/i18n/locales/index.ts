import enUS from './en-US';
import zhCN from './zh-CN';
import zhHK from './zh-HK';
import zhTW from './zh-TW';

/**
 * 内容脚本 locale 聚合入口（聚合式拆分，2026-09-25）。
 *
 * 原先 646 行的单文件 `locales.ts` 已按 locale 拆为一文件一语言，本文件只做聚合
 * 与类型导出——新增/修改某一语言不再触碰 600+ 行单体，diff 也按语言隔离。
 * 结构与 SPA 侧 `src/shared/locales/` 保持一致（各自 index.ts 聚合）。
 *
 * 消费者不变：`import locales, { type Locale } from './locales'` 经目录 index 解析。
 * `scripts/check-i18n.js` 已同步为按目录逐文件读取（块标记切分逻辑退役）。
 */

export type Locale = 'en-US' | 'zh-CN' | 'zh-HK' | 'zh-TW';

const locales: Record<Locale, Record<string, string>> = {
  'en-US': enUS,
  'zh-CN': zhCN,
  'zh-HK': zhHK,
  'zh-TW': zhTW,
};

export default locales;
