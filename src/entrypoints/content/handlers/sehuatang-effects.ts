/**
 * 色花堂卡片网格动效层（纯 CSS 高级动效，零运行时依赖）
 *
 * 1. 图片模糊遮罩：封面默认 blur(14px) + 深色渐变 scrim，鼠标在**图片区**
 *    停留超过防抖延迟（160ms）才揭示；移出图片区即恢复模糊。文字区域
 *    （标题/日期/磁力）悬停不触发。防抖避免鼠标扫过网格时卡片集体闪烁。
 *    事件委托挂在网格容器上（捕获阶段，覆盖懒加载图片）。
 * 2. 卡片入场级联：runCardEntrance 逐卡追加 .umm-sht-enter + 递增
 *    animation-delay（spring 风格 cubic-bezier 过冲缓动）。
 * 3. 底部「灵动岛」悬浮栏入场：样式注入即触发（插入元素时动画自动播放）。
 *
 * 无障碍：prefers-reduced-motion 时禁用全部动画与揭示过渡。
 *
 * 样式单一事实源 = src/content/sehuatang/styles.ts 的 EFFECTS_CSS
 * （Shadow DOM 编译期注入），本模块只管行为、不再注入样式。
 */

const REVEALED_CLASS = 'umm-sht-revealed'
const INIT_FLAG = 'data-umm-sht-reveal'

/**
 * 图片模糊遮罩 + hover 揭示（防抖，作用域=图片区）。
 *
 * mouseenter 与 pointerenter 双注册：真实浏览器两者都会触发，schedule 幂等
 * （clear 旧定时器后重设），不会产生悬挂定时器；jsdom 测试环境用 MouseEvent。
 * 捕获阶段挂载容器上，覆盖后续异步插入的卡片与图片。
 * 判定链：target → .umm-card-image → .umm-card——文字区域事件不落入图片区即忽略。
 */
export function initImageReveal(container: HTMLElement, delayMs = 160): void {
  if (container.getAttribute(INIT_FLAG) === '1') return
  container.setAttribute(INIT_FLAG, '1')

  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>()

  const clear = (card: HTMLElement) => {
    const timer = timers.get(card)
    if (timer !== undefined) {
      clearTimeout(timer)
      timers.delete(card)
    }
  }
  const schedule = (card: HTMLElement) => {
    if (card.classList.contains(REVEALED_CLASS)) return
    clear(card)
    timers.set(card, setTimeout(() => {
      timers.delete(card)
      card.classList.add(REVEALED_CLASS)
    }, delayMs))
  }
  const cardFromImageEvent = (e: Event): HTMLElement | null => {
    const target = e.target as HTMLElement
    // 作用域收窄到图片区：标题/日期/磁力等文字区域悬停不得触发揭示。
    const imageArea = target.closest?.('.umm-card-image') as HTMLElement | null
    if (!imageArea) return null
    const card = imageArea.closest?.('.umm-card') as HTMLElement | null
    return card && container.contains(card) ? card : null
  }
  const onEnter = (e: Event) => {
    const card = cardFromImageEvent(e)
    if (card) schedule(card)
  }
  const onLeave = (e: Event) => {
    const card = cardFromImageEvent(e)
    if (!card) return
    clear(card)
    card.classList.remove(REVEALED_CLASS)
  }

  // mouseenter/mouseleave 不冒泡，必须用捕获阶段委托。
  container.addEventListener('pointerenter', onEnter, true)
  container.addEventListener('pointerleave', onLeave, true)
  container.addEventListener('mouseenter', onEnter, true)
  container.addEventListener('mouseleave', onLeave, true)
}

/**
 * 卡片入场级联：追加 .umm-sht-enter（触发 keyframes 动画）并按索引递增
 * animation-delay。类名与延迟同帧赋值，动画从各卡的延迟后开始（backwards
 * 填充保证延迟期内保持初始帧，不闪烁）。
 * newOnly=true 时只处理未入场的卡片（AJAX 分页追加新卡时不重播整个网格）。
 */
export function runCardEntrance(container: HTMLElement, staggerMs = 45, newOnly = false): void {
  const selector = newOnly ? '.umm-card:not(.umm-sht-enter)' : '.umm-card'
  const cards = Array.from(container.querySelectorAll(selector)) as HTMLElement[]
  cards.forEach((card, idx) => {
    card.classList.add('umm-sht-enter')
    card.style.animationDelay = `${idx * staggerMs}ms`
  })
}
