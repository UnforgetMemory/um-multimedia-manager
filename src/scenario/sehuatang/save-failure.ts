/**
 * 跨页保存失败诊断（自 app.ts 拆出，2026-09-25）。
 *
 * 问题：复制磁力后立即切页，失败证据会随页面销毁而丢失（控制台无输出）。
 * 方案：把失败原因写入 sessionStorage（按源跨页存活），下一个页面初始化时
 * 读取并呈现红 toast，然后清除标记——用户于是能看到「上一次为什么没保存上」。
 *
 * 本模块零模块级可变状态（只用 sessionStorage），故可独立测试；toast 文案走
 * 内容脚本 i18n（`t`），键 `Magnet Save Failed`。
 */

import { t } from '@/entrypoints/content/i18n';
import { FloatingToast } from '@/entrypoints/content/utils/toast';

const SAVE_FAILURE_KEY = 'umm-sht-save-failure';

export function reportSaveFailure(reason: string, detail?: string): void {
  console.warn('[UMM] Sehuatang save failure:', reason, detail ?? '');
  try {
    sessionStorage.setItem(
      SAVE_FAILURE_KEY,
      JSON.stringify({ at: Date.now(), reason, detail: detail ?? '' }),
    );
  } catch {
    /* 存储不可用时仅 console 可见 */
  }
}

export function consumeSaveFailure(): void {
  try {
    const raw = sessionStorage.getItem(SAVE_FAILURE_KEY);
    if (!raw) return;
    sessionStorage.removeItem(SAVE_FAILURE_KEY);
    const parsed = JSON.parse(raw) as { reason?: string; detail?: string };
    const detail = parsed.detail ? ` (${parsed.detail})` : '';
    FloatingToast.error(t('Magnet Save Failed'), `${parsed.reason ?? ''}${detail}`);
  } catch {
    /* 解析失败忽略 */
  }
}
