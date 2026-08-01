# ADR-008: 技术栈演化基线 — TypeScript 7 / Vue 3.6 / Vite 8 / WXT 0.21

- **日期**: 2026-08-01
- **分支**: `dev-2026-08-01`
- **状态**: Accepted（部分待发布后激活）

## 背景

用户要求全面升级技术栈：采用 Vite 最新特性、Vue 3.6 全新特性、TypeScript 7 编译提速，
替换当前架构基础基建。本仓库此前基线：TS 6.0.3 / Vite 8.1.4 / Vue 3.5.38 / WXT 0.20.27。

## 调研结论（2026-08-01 官方来源验证）

| 技术 | 现状 | 结论 | 依据 |
|---|---|---|---|
| **TypeScript 7** | 7.0.2 已 GA（2026-07-08） | **vue-tsc/Volar 尚不能消费 TS7**（无 JS 编译器 API、无 `./lib/tsc` 导出）。微软官方明确 Vue 项目暂留 TS6，等 7.1 新 API（预计 2026-10~11） | vuejs/language-tools#6124、MS 官方 GA 博客 |
| **Vue 3.6** | 3.6.0-rc.2（2026-07-22） | 未发布稳定版。核心 = Vapor Mode（对本仓库不适用：reka-ui 是 VDOM 库、Router/Pinia Vapor 支持 WIP）+ alien-signals 响应式重构（向后兼容、免费性能）。**等 stable 后一行升级** | vuejs/core releases、PR #12349 |
| **Vite** | 8.2.0（2026-07-30） | 无 Vite 9。Rolldown 已是 Vite 8 默认打包器（官方基准 10–30×）。仓库原已在 8.x → 只需补丁升级 | vite.dev 迁移指南、announcing-vite8 |
| **WXT** | 0.21.3（2026-07-31） | 用户决策立即升级。审计无阻塞：无 `url:` imports、无 useAppConfig、自定义 zip 模板不受影响 | wxt.dev 升级指南 |

## 决策

1. **TypeScript 保持 6.0.3**（官方稳妥路线），但启用 `erasableSyntaxOnly: true`
   前置兼容 TS7 —— 已改写全部 11 处 parameter properties 为显式字段声明。
   TS 7.1 发布后按本 ADR 附录的迁移路径升级。
2. **Vue 保持 3.5.40**（最新稳定版），3.6.0 stable 发布后一行切换
   （`vue@^3.6.0` + 保留现有插件版本），自动获得 alien-signals 响应式收益。
   不采用 Vapor Mode（reka-ui VDOM 组件栈 + shadow DOM 内容脚本 + Router/Pinia WIP）。
3. **Vite 8.1.4 → 8.2.0**，`build.rollupOptions` → `build.rolldownOptions`（Vite 8 弃用改名）。
4. **WXT 0.20.27 → 0.21.3**（用户决策）。已审计破坏性变更无阻塞。
5. **语法现代化**（已落地）：lib ES2023→ES2024（`Promise.withResolvers`/`using`）、
   `defineModel`×4、`satisfies`、catch-unknown 收窄、SendResponse `any`→`unknown`、
   `Record<string, any>`→`Record<string, unknown>`。

## 影响

- `tsconfig.json`：+`erasableSyntaxOnly`、lib ES2024
- `wxt.config.ts`：rolldownOptions
- `package.json`：18 依赖升级、移除废弃 `@types/dompurify`、移除失效 `overrides.rollup`
- 11 处 class 构造器改写（parameter properties → 显式字段）
- 4 个 Vue 组件 `defineModel` 化（Input/SegmentedControl/OptionPicker/UmmSearchFilter）

## 回滚

- 语法改写均为纯类型层改动，无运行时行为变化，可整体 revert
- WXT 0.21 如有运行期问题，回退 `wxt@^0.20.27` + 恢复 `rollupOptions` 即可

---

## 附录：TS 7.1 升级路径（预计 2026-10~11，待 7.1 API 发布后执行）

1. `npm i -D typescript@^7.1`（等 vue-tsc 官方 release 支持 TS7 新 API）
2. 验证 `npm run type-check`（vue-tsc 需已切换到新 API）
3. 本仓库 tsconfig 已 7.x 兼容（bundler resolution、strict、无 baseUrl、erasableSyntaxOnly 已启用）
4. 若 vue-tsc 尚未跟进：临时方案 `typescript-native-bridge`（第三方桥接，glibc 约束）或
   `@typescript/typescript6` 别名并存

## 附录：Vue 3.6 stable 升级路径（发布后执行）

1. `npm i vue@^3.6.0`（稳定版发布后 peer 范围自动满足，无需 overrides）
2. 验证 pinia/vueuse/reka-ui 运行时兼容（alien-signals 重构向后兼容，理论无碍）
3. 若需验证响应式收益：对比 type-check 无变化，运行时性能自动提升
