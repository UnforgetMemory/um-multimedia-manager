// ─── 全局 Toast 单例控制器 ──────────────────────────────────
/**
 * 确保全局只有一个 Mukaku toast 实例
 * 解决多个 toast 同时出现的问题
 */

import { FloatingToast, PersistentToast } from '../../utils/toast'
import { t } from '../../i18n'

class MukakuToastController {
  private static instance: PersistentToast | null = null
  private static closeTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * 获取或创建 toast 实例
   */
  static getOrCreate(): PersistentToast {
    // 如果已有实例且未关闭，直接复用
    if (MukakuToastController.instance) {
      // 清除待关闭的定时器（如果有新任务到来）
      if (MukakuToastController.closeTimer) {
        clearTimeout(MukakuToastController.closeTimer)
        MukakuToastController.closeTimer = null
      }
      return MukakuToastController.instance
    }

    // 创建新实例
    MukakuToastController.instance = FloatingToast.persistent(t('mukaku.toast_title'), 'loading')
    return MukakuToastController.instance
  }

  /**
   * 更新 toast 内容
   */
  static update(message: string, progress: number): void {
    const toast = MukakuToastController.getOrCreate()
    toast.update({ message, progress })
  }

  /**
   * 显示成功状态（保持显示，不自动关闭）
   */
  static success(message: string): void {
    const toast = MukakuToastController.instance
    if (!toast) return

    // 使用 successKeep() 显示成功状态但不自动关闭
    toast.successKeep(message)

    // toast 会保持显示，直到下次创建新 toast 或调用 close()
  }

  /**
   * 显示错误状态并延迟关闭
   */
  static error(message: string): void {
    const toast = MukakuToastController.instance
    if (!toast) return

    toast.error(message)
    MukakuToastController.closeTimer = setTimeout(() => {
      MukakuToastController.instance = null
      MukakuToastController.closeTimer = null
    }, 3000)
  }

  /**
   * 立即关闭并清理
   */
  static close(): void {
    if (MukakuToastController.closeTimer) {
      clearTimeout(MukakuToastController.closeTimer)
      MukakuToastController.closeTimer = null
    }
    if (MukakuToastController.instance) {
      MukakuToastController.instance.close()
      MukakuToastController.instance = null
    }
  }

  /**
   * 检查是否有活跃的 toast
   */
  static hasActive(): boolean {
    return MukakuToastController.instance !== null
  }
}

export { MukakuToastController }