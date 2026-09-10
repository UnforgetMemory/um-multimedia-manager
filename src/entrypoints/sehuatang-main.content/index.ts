/**
 * 色花堂主入口（document_idle，ADR-024 D1 / ADR-025 D6 / 首页搜索扩展 / 风控页）。
 *
 * 五条互斥分支——风控页优先级最高（URL 判型失效，见 0），其余按 classifyPage
 * 统一决策（thread > forumdisplay > search > index）：
 *   0. 风控页（年龄门，DOM 双标记检测）→ src/content/sehuatang/app-risk.ts。
 *      任意路径都可能返回风控页（站点根/分区/帖子/搜索/portal 均可能），
 *      URL 完全不可预判——classifyPage 的 URL 体系对它失效，判定只能靠
 *      文档 DOM 双标记（div.domain + a.enter-btn）。**必须先于一切分支**：
 *      帖子页静默记录让位（风控文档不是真实帖子，记录会落错键）；站点根
 *      命中的 index 判型也不再走首页应用（无 category_ 容器，只会白建壳
 *      后 dismiss）。重建 UI 的进入按钮点击委托回原 DOM 按钮（站点 JS
 *      绑定「写 safeid cookie + 重载」——通过风控的唯一途径）。
 *   1. 帖子详情页（viewthread）→ 静默记录已看后返回：不建 overlay、不注入
 *      任何 UI。记录键走 resolveThreadWatchKey（标题可提取番号 → 番号，
 *      分类落 jav_ids/usav_ids；提取失败 → TID 兜底落 sehuatang_ids）。
 *      三表互不冲突，且列表页/搜索页 dimmer 双键命中该记录。
 *   2. 列表页（forumdisplay）→ 接管 shadow host，编排完整 overlay 应用
 *      （src/content/sehuatang/app.ts）。刻意独立于 legacy content.ts 管线：
 *      不经 DB 健康检查串行门禁——首屏渲染只依赖行内 DOM 数据。仍需
 *      injectGlobalStyles：☰ 菜单/手动添加/查询面板/FloatingToast 是
 *      light-DOM 组件，依赖其 --usl-* 变量与组件样式（原页面被覆盖，注入
 *      零视觉成本）。
 *   3. 搜索页（search.php?mod=forum）→ src/content/sehuatang/app-search.ts。
 *      读模式（仅 dimmer，**不落库**）：原条目无磁力/详情子请求，dimmer
 *      是唯一反馈；数据变更交给用户点击进入帖子后的「帖子详情页静默记录」。
 *   4. 首页（pg_index）→ src/content/sehuatang/app-home.ts。导航模式：只
 *      渲染分区网格 + 子版块卡片，**不接触已看库**（首页无帖子条目，dimmer
 *      无语义）。
 *
 * matches 为 4 域全路径通配：风控页可在任意路径出现，判型全部内化到
 * main()——先风控 DOM 检测（两次 querySelector 的廉价守卫），再
 * classifyPage 四向分流；非托管页（portal/misc 等）零副作用直接返回。
 *
 * 早期入口（sehuatang-early.content）已对 2/3/4 三种页面建好 shadow host +
 * loading 骨架，本入口在 document_idle 接管；不重建——避免首帧覆盖闪烁。
 * 风控页接管双路：命中早期 matches 的路径直接接壳，其余路径经共享
 * createOverlay 自建（app-risk.ts 内聚）。
 */

import { defineContentScript } from 'wxt/utils/define-content-script'
import { initEventBus } from '@/utils/event-bus'
import { injectGlobalStyles } from '@/entrypoints/content/styles/global'
import { AdultAvStore } from '@/features/adult-av'
import { classifyPage } from '@/content/sehuatang/url'
import { isRiskGateDocument } from '@/content/sehuatang/extract-risk'
import { resolveThreadWatchKey } from '@/entrypoints/content/handlers/sehuatang-extract'
import { runSehuatangOverlayApp } from '@/content/sehuatang/app'
import { runSehuatangIndexApp } from '@/content/sehuatang/app-home'
import { runSehuatangSearchApp } from '@/content/sehuatang/app-search'
import { runSehuatangRiskApp } from '@/content/sehuatang/app-risk'

/** 帖子页标题：优先帖子主体（#thread_subject），退化到 document.title。 */
function threadTitle(): string {
  const subject = document.getElementById('thread_subject')?.textContent?.trim()
  return subject || document.title
}

/**
 * 帖子页静默记录（幂等同键覆盖）。失败仅 console 诊断——记录是后台增益，
 * 不得干扰用户浏览；下次访问重试。
 */
async function recordThreadVisit(url: string): Promise<void> {
  const key = resolveThreadWatchKey(threadTitle(), url)
  if (!key) return
  try {
    await AdultAvStore.add('sehuatang', key, 0, url)
    console.log('[UMM] Sehuatang thread visit recorded:', key)
  } catch (error) {
    console.warn('[UMM] Sehuatang thread visit record failed:', error)
  }
}

export default defineContentScript({
  // 4 域全路径通配（含站点根）：风控页可由任意路径返回，判型内化到 main()
  // ——先风控 DOM 检测，再 classifyPage 四向分流（非托管页零副作用返回）。
  matches: [
    '*://www.sehuatang.net/*',
    '*://www.sehuatang.org/*',
    '*://sehuatang.net/*',
    '*://sehuatang.org/*',
  ],
  runAt: 'document_idle',

  async main() {
    // 风控页优先级最高：DOM 检测（URL 不可预判——见文件头分支 0）。
    if (isRiskGateDocument(document)) {
      await runSehuatangRiskApp()
      return
    }

    const url = location.href
    const kind = classifyPage(url)

    // 帖子页：静默记录已看，不接管 overlay、不注入 UI。
    if (kind === 'thread') {
      await recordThreadVisit(url)
      return
    }

    // 列表 / 搜索 / 首页：URL 判型与早期入口一致；非受支持页（other）不接管。
    if (kind !== 'forumdisplay' && kind !== 'search' && kind !== 'index') return
    initEventBus()
    injectGlobalStyles()
    if (kind === 'forumdisplay') {
      await runSehuatangOverlayApp()
    } else if (kind === 'search') {
      await runSehuatangSearchApp()
    } else {
      await runSehuatangIndexApp()
    }
  },
})
