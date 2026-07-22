/**
 * PT 模块通用工具函数
 */

/**
 * 暗化元素
 */
export function dimElement(element: HTMLElement): void {
  element.classList.add('umm-dimmed')
}

/**
 * 等待元素出现并执行回调（带可选内容就绪检查）
 * 用于 SPA 场景：等待目标元素渲染出实际内容后再处理
 */
export function waitForElement(
  selector: string,
  callback: () => void,
  timeout = 15000,
  contentCheck?: (el: Element) => boolean,
  waitForObserverRef: { current: MutationObserver | null } = { current: null },
): void {
  const match = (): Element | null => {
    const el = document.querySelector(selector)
    if (!el) return null
    if (contentCheck && !contentCheck(el)) return null
    return el
  }

  if (match()) {
    console.log('[PT Dimmer] waitForElement: element already present for', selector)
    callback()
    return
  }

  let fulfilled = false
  const observer = new MutationObserver(() => {
    if (match()) {
      fulfilled = true
      observer.disconnect()
      waitForObserverRef.current = null
      console.log('[PT Dimmer] waitForElement: element appeared for', selector)
      callback()
    }
  })

  waitForObserverRef.current = observer
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  setTimeout(() => {
    if (fulfilled) return
    if (match()) {
      // Element appeared just before timeout — still fire
      observer.disconnect()
      waitForObserverRef.current = null
      callback()
      return
    }
    observer.disconnect()
    waitForObserverRef.current = null
    console.warn(
      `[PT Dimmer] waitForElement timed out after ${timeout}ms — selector: "${selector}"`,
      contentCheck ? '(with contentCheck)' : '',
    )
  }, timeout)
}
