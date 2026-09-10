/**
 * 色花堂 overlay 共享常量（零依赖模块——早期入口与主入口都要引用，
 * 独立成文件避免早期入口为取一个 ID 而拖入整张样式表）。
 */

/** Shadow host 元素 ID（早期入口创建，主入口接管）。 */
export const SEHUATANG_OVERLAY_ID = 'umm-sht-overlay'

/**
 * overlay host 的页面级 z-index：高于 Discuz 自有固定元素（对话框/回顶部
 * 等 z 1000+ 量级），低于全局 light-DOM 弹层 .umm-overlay（2147483001，
 * 菜单/手动添加/查询面板仍浮现于 overlay 之上）。
 */
export const SEHUATANG_OVERLAY_Z_INDEX = 2147483000
