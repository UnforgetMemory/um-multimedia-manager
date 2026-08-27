# ADR-022: 命名间距层级的统一标准（勘误与收编）

- **日期**: 2026-08-26
- **状态**: Accepted（初版基于误判，本版为勘误重写）
- **前置**: ADR-018 三层令牌

## 勘误

初版断言"命名间距全库 300+ 处引用却从未定义"——**错误**。根因：侦察时 `git grep` 使用基本正则，`(xs|sm|…)` 交替语法未加 `-E` 导致漏检。事实是 `breakpoints.css` 一直完整定义 `--umm-space-{xs…2xl}`：clamp 流式基础 + 320px→5120px 共 14 档断点阶梯，与 `--umm-font-*`、`--umm-card-*`、`--umm-grid-cols` 同源同构。初版写入 design-tokens.css 的 6 行静态 rem 定义已**回退**（静态与流式双源必然漂移）。

## 决策

### D1 统一标准 = breakpoints.css 流式系统

命名间距（及字号/卡宽/栅格列数）的**单一事实源**是 `breakpoints.css`：clamp 流式基础值 + 14 档断点阶梯（320/375/480/640/768/1024/1280/1536/1920/2560/3200/3840/5120px）。不设静态副本。

### D2 收编 4 个未接入页面

`search` / `genre` / `artists-overview` / `game-explore` 四页的 css preset 未含 `breakpoints` 层，间距消费依赖行内 fallback（个别行无 fallback → 计算值失效）。统一改为基于 `BASE_SHARED` 组合（search 保留 `media-chips` 附加层），四页从此共享全站流式间距/字号系统。

## 明确保留的偏离

| 偏离 | 理由 |
|---|---|
| 调用点 fallback 字面值暂不清理 | breakpoints 全站覆盖后，行内 fallback 成为死兜底（行为中性）；300+ 处纯机械清理属后续独立 ADR |
| 数值 `--umm-space-0…2-5`（0–10px 微距）不动 | 用途不同（微调 vs 语义层级），不与命名层级合并 |

## 影响

css-composer.ts（4 页 preset 收编 `breakpoints`）、design-tokens.css（回退初版 6 行）。**视觉变化面**：四页的间距/字号从固定 fallback 切到流式值（1280px 视口下 `md` ≈21px，原 fallback 12–16px；`sm`≈14px，原 8–12px），需加载 dev 构建对这四页（搜索页/标签页/音乐人总览/游戏浏览）做视觉回归确认。

## 教训记录

`git grep` 基本正则的 `(...)` 是字面量，交替匹配必须 `-E`。本次误报浪费了一轮"补定义"工作；对"变量未定义"类结论，必须先用 `-E`（或 ripgrep）复查再下判断。
