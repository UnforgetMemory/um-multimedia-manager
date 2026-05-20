import gsap from 'gsap'

// 页面过渡动画
export function pageTransition(element: HTMLElement, direction: 'in' | 'out' = 'in') {
  return gsap.fromTo(
    element,
    { opacity: direction === 'in' ? 0 : 1, y: direction === 'in' ? 20 : 0 },
    { duration: 0.3, ease: 'power2.out' }
  )
}

// 列表项交错动画
export function staggerList(items: HTMLElement[], delay = 0.05) {
  return gsap.from(items, {
    opacity: 0,
    y: 10,
    stagger: delay,
    duration: 0.3,
    ease: 'power2.out',
  })
}

// Toast 通知滑入动画
export function toastSlideIn(element: HTMLElement) {
  return gsap.from(element, {
    x: 100,
    opacity: 0,
    duration: 0.3,
    ease: 'back.out(1.7)',
  })
}

// 淡入动画
export function fadeIn(element: HTMLElement, duration = 0.3) {
  return gsap.fromTo(
    element,
    { opacity: 0 },
    { duration, ease: 'power2.out' }
  )
}

// 滑入动画
export function slideUp(element: HTMLElement, duration = 0.3) {
  return gsap.fromTo(
    element,
    { opacity: 0, y: 10 },
    { duration, ease: 'power2.out' }
  )
}

// 缩放动画
export function scaleIn(element: HTMLElement, duration = 0.2) {
  return gsap.fromTo(
    element,
    { opacity: 0, scale: 0.95 },
    { duration, ease: 'power2.out' }
  )
}

// 按钮点击反馈动画
export function buttonClick(element: HTMLElement) {
  return gsap.to(element, {
    scale: 0.95,
    duration: 0.1,
    yoyo: true,
    repeat: 1,
    ease: 'power2.inOut',
  })
}

// 卡片悬浮动画
export function cardHover(element: HTMLElement) {
  return gsap.to(element, {
    y: -2,
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    duration: 0.2,
    ease: 'power2.out',
  })
}

// 卡片离开悬浮动画
export function cardLeave(element: HTMLElement) {
  return gsap.to(element, {
    y: 0,
    boxShadow: 'none',
    duration: 0.2,
    ease: 'power2.out',
  })
}
