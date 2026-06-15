<p align="center">
  <a href="README.en.md"><img src="https://img.shields.io/badge/lang-English-blue.svg" alt="English"></a>
</p>

<p align="center">
  <img src="assets/logo.png" alt="UMM Logo" width="128" height="128">
</p>

<h1 align="center">UMM — 多媒体管理器</h1>

<p align="center">
  <a href="https://github.com/"><img src="https://img.shields.io/badge/版本-3.3.0-blue" alt="Version"></a>
  <a href="https://developer.chrome.com/docs/extensions/mv3/"><img src="https://img.shields.io/badge/Chrome-88%2B-brightgreen" alt="Chrome"></a>
  <a href="https://developer.chrome.com/docs/extensions/mv3/"><img src="https://img.shields.io/badge/Manifest-V3-orange" alt="Manifest"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/许可证-Apache%202.0-green" alt="License"></a>
</p>

<p align="center">
  <b>UMM（UM Multimedia Manager，UM 即 UnforgetMemory）</b> 是一款基于 Manifest V3 的 Chrome 浏览器扩展，帮你统一管理多平台的观影和收听记录。它不仅能跨平台标记"看过/听过"，还能在 PT 站点自动标注已看过的内容，省去反复对照的麻烦。
</p>

---

## 功能特性

- **🎯 跨平台标记** — 在豆瓣（电影/音乐）、IMDb、NeoDB、TMDB 页面上通过悬浮面板一键标记状态和评分
- **🔗 ID 关联** — 自动建立豆瓣 ↔ IMDb ↔ NeoDB 的多平台 ID 映射，一份记录关联所有平台
- **🌙 PT 站点自动变暗** — M-Team、Audiences、HDHome、HDArea、OurBits、PTerClub 等 PT 站点上，已标记的种子自动置灰淡化，一眼分辨是否看过
- **📦 WebDAV 云端备份** — 支持 WebDAV 协议备份数据，同时提供 ZIP 格式的手动导出/导入
- **🧩 NeoDB API 集成** — 自动从 NeoDB 拉取评分和元数据，丰富你的收藏记录
- **🎨 主题切换** — 亮色、暗色、跟随系统，三种主题自由切换
- **⚡ Service Worker 架构** — 后台 Service Worker 周期性同步、缓存清理，无需保持页面打开
- **📊 统计看板** — 弹出面板中查看所有记录的统计、搜索和筛选
- **📝 选项页** — 独立选项页面提供丰富的统计数据、活跃度热力图、平台分布、评分管理和外观定制
- **🔞 成人视频支持** — 识别并统一管理 JavDB、色花堂等成人视频平台的观看记录
- **🎨 设计系统** — 统一的设计 tokens、扩展排版系统和字体缩放，让界面更协调

## 支持的站点

| 类型 | 站点 | 用途 |
|------|------|------|
| 影视平台 | `movie.douban.com` `imdb.com` `neodb.social` `themoviedb.org` | 观影标记与元数据 |
| 音乐平台 | `music.douban.com` `neodb.social/album` | 收听标记 |
| PT 站点 | M-Team、Audiences、HDHome、HDArea、OurBits、PTerClub 等 | 已看种子自动淡化 |
| 成人视频 | JavDB、Sehuatang 等 | 观看记录管理 |
| 其他 | `search.douban.com`、Mukaku 等 | 搜索增强与记录同步 |

## 技术栈

| 技术 | 用途 |
|------|------|
| **Vue 3 (Composition API)** | UI 框架 |
| **TypeScript** | 类型安全 |
| **WXT** | Chrome 扩展构建工具（替代 CRXJS） |
| **Tailwind CSS v4** | 样式方案 |
| **shadcn/vue (reka-ui)** | 组件库 |
| **VueUse** | Composition API 工具库 |
| **IndexedDB** | 本地持久化存储 |
| **Lucide** | 图标库 |
| **GSAP** | 动画引擎 |
| **JSZip** | ZIP 打包与解包 |
| **Playwright** | E2E 测试 |

## 架构

```
┌────────────────────────────────────────────────┐
│                Service Worker                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ Message  │  │ IndexedDB │  │ Alarm Tasks  │ │
│  │ Router   │  │ (单例)    │  │ (缓存清理等) │ │
│  └──────────┘  └──────────┘  └──────────────┘ │
└────────────────────┬───────────────────────────┘
                     │ Messaging API
         ┌───────────┴───────────┐
         ▼                       ▼
┌─────────────────┐    ┌─────────────────────┐
│   Content Script│    │    Popup UI         │
│  ┌───────────┐  │    │  ┌───────────────┐  │
│  │ Router    │  │    │  │ 统计 / 搜索   │  │
│  │ → Handler │  │    │  │ 设置 / 导出   │  │
│  │ → Enhancer│  │    │  └───────────────┘  │
│  └───────────┘  │    └─────────────────────┘
└─────────────────┘
```

Content Script 按页面 URL 路由到对应的 Handler（豆瓣/IMDb/NeoDB），完成标记和 ID 关联；Enhancer 负责 PT 站点淡化等增强功能。Popup 提供全局数据看板与设置界面。

## 安装

### 从源码构建

```bash
# 克隆仓库
git clone <repo-url>
cd um-multimedia-manager

# 安装依赖
npm install

# 构建生产版本
npm run build
```

构建产物位于 `dist/chrome-mv3` 目录。

### 加载到 Chrome

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的 **开发者模式**（Developer mode）
3. 点击 **加载已解压的扩展程序**（Load unpacked）
4. 选择项目的 `dist/chrome-mv3` 目录

> **注意**：项目使用 WXT 框架，构建输出目录不同于传统 CRXJS 项目，请确认选中 `dist/chrome-mv3`。

## 使用指南

### 快速标记

1. 访问支持的站点页面（如豆瓣电影 `movie.douban.com/subject/`）
2. 页面右上角自动出现悬浮面板
3. 点击 **已完成** / **想看** / **清除** 切换状态
4. 调整评分（0–10 星，步长 0.5）
5. 点击 **保存**

面板可拖拽位置，支持最小化和关闭。

### PT 站点淡化

在支持的 PT 站（M-Team、Audiences、HDHome 等），已经标记为"看过"的种子条目会自动变灰，方便快速跳过。

### 查看统计

点击浏览器工具栏的 UMM 图标，打开弹出面板：

- **统计概览** — 总记录数、各平台分布
- **搜索过滤** — 按标题、平台、状态快速定位
- **数据导出** — 一键导出 ZIP 备份文件

### 数据管理

所有记录存储在本地 IndexedDB 中，无需手动保存。可通过 WebDAV 备份到云端，或通过弹窗面板导出 ZIP 文件保存到本地。

## 配置

### WebDAV 备份

在扩展设置页面配置 WebDAV 服务器地址、用户名和密码，即可启用自动备份：

| 字段 | 说明 |
|------|------|
| 服务器 URL | 例如 `https://example.com/remote.php/dav/files/user/` |
| 用户名 | WebDAV 登录用户名 |
| 密码 | WebDAV 密码或应用专用密码 |

### NeoDB API Token

如需启用 NeoDB 元数据增强，需在设置中配置 NeoDB API Token：

1. 登录 [NeoDB](https://neodb.social)
2. 进入个人设置页面生成 API Token
3. 填入扩展设置的对应字段

## 开发

### 环境要求

- Node.js >= 22
- npm >= 10
- Chrome >= 88

### 开发模式

```bash
npm run dev
```

开发模式下代码改动会自动热更新到浏览器中加载的扩展。

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发模式 |
| `npm run build` | 构建生产版本 |
| `npm run zip` | 构建并打包为 `.zip` |
| `npm run type-check` | TypeScript 类型检查 |
| `npm test` | 运行 Playwright 测试 |
| `npm run test:unit` | 运行单元测试 |
| `npm run test:integration` | 运行集成测试 |
| `npm run test:ui` | 启动 Playwright UI 测试模式 |
| `npm run package:patch` | 发布补丁版本 |
| `npm run package:minor` | 发布小版本 |
| `npm run package:major` | 发布大版本 |
| `npm run data:export` | 命令行导出数据 |
| `npm run data:import` | 命令行导入数据 |
| `npm run deps:audit` | 依赖安全审计 |

## 项目结构

```
um-multimedia-manager/
├── wxt.config.ts                 # WXT 扩展构建配置
├── components.json               # shadcn/vue 组件配置
├── tsconfig.json                 # TypeScript 配置
├── playwright.config.ts          # Playwright E2E 测试配置
├── icons/                        # 扩展图标
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── src/
│   ├── entrypoints/              # WXT 入口点
│   │   ├── background.ts         # Service Worker（消息路由 + DB + 告警任务）
│   │   ├── content.ts            # Content Script 主入口
│   │   ├── popup/                # 弹窗 UI
│   │   │   ├── main.ts
│   │   │   ├── App.vue
│   │   │   ├── pages/            # 弹窗页面
│   │   │   └── index.html
│   │   └── options/              # 选项页 UI
│   │       ├── main.ts
│   │       ├── App.vue
│   │       ├── router.ts
│   │       ├── tabs/             # 选项页标签
│   │       │   ├── OverviewTab.vue   # 统计概览
│   │       │   ├── RatingTab.vue     # 评分管理
│   │       │   ├── LinkedTab.vue     # 关联查询
│   │       │   ├── SyncTab.vue       # WebDAV 同步
│   │       │   ├── SettingsTab.vue   # 配置
│   │       │   └── AppearanceTab.vue # 外观定制
│   │       └── index.html
│   ├── content/                  # Content Script 业务逻辑
│   │   ├── router.ts             # URL 路由分发
│   │   ├── handlers/             # 各平台处理器
│   │   │   ├── douban.ts         # 豆瓣入口
│   │   │   ├── douban-scanner.ts # 豆瓣页面扫描
│   │   │   ├── douban-sync.ts    # 豆瓣保存同步
│   │   │   ├── douban-neodb.ts   # 豆瓣 NeoDB 推送
│   │   │   ├── douban-toast.ts   # 豆瓣通知
│   │   │   ├── imdb.ts           # IMDb
│   │   │   ├── neodb.ts          # NeoDB
│   │   │   ├── mukaku.ts         # Mukaku 同步
│   │   │   ├── pt-detail.ts      # PT 详情页
│   │   │   ├── javdb.ts          # JavDB
│   │   │   └── sehuatang.ts      # 色花堂
│   │   ├── enhancers/            # 页面增强功能
│   │   │   ├── pt-dimmer.ts      # PT 站点已看淡出
│   │   │   └── douban-search.ts  # 豆瓣搜索增强
│   │   ├── observers/            # 页面状态观察者
│   │   │   └── rating.ts         # 评分变化监听
│   │   ├── i18n/                 # 国际化
│   │   ├── styles/               # 注入样式
│   │   └── utils/                # Content Script 工具
│   ├── features/                 # 业务模块
│   │   ├── database/             # IndexedDB 封装与数据模型
│   │   ├── identity/             # URL 身份识别
│   │   ├── migration/            # 数据迁移
│   │   ├── neodb/                # NeoDB API 客户端
│   │   ├── webdav/               # WebDAV 客户端
│   │   ├── settings/             # 缓存管理
│   │   └── adult-av/             # 成人视频 ID 识别与存储
│   ├── stores/                   # Pinia 状态管理
│   │   ├── app.ts                # 应用级状态
│   │   ├── theme.ts              # 主题状态
│   │   └── confirm.ts            # 确认对话框状态
│   ├── composables/              # Vue composables
│   │   ├── useStats.ts           # 统计数据计算
│   │   ├── usePlatformMeta.ts    # 平台元信息
│   │   └── useToast.ts           # 通知系统
│   ├── components/               # 通用组件
│   │   ├── StatCard.vue          # 统计卡片
│   │   ├── HeatmapCalendar.vue   # 活跃度热力图
│   │   ├── PlatformDistribution.vue # 平台分布
│   │   ├── ToastContainer.vue    # 通知容器
│   │   ├── ConfirmDialog.vue     # 确认对话框
│   │   └── ui/                   # shadcn/vue 组件
│   ├── styles/                   # 全局样式
│   │   ├── design-tokens.css     # 设计系统变量
│   │   └── typography.css        # 排版系统
│   └── types/                    # TypeScript 类型定义
├── scripts/                      # 构建与维护脚本
│   ├── package.js                # 版本管理与打包
│   ├── unpack.js                 # 解包扩展
│   ├── fix-paths.js              # 构建后路径修正
│   ├── resize-icons.ts           # 图标尺寸调整
│   ├── data-export.js            # CLI 数据导出
│   ├── data-import.js            # CLI 数据导入
│   └── migrate-data.ts           # 数据迁移工具
├── .omo/                         # 工作计划与规格文档
└── docs/                         # 文档
```

## 许可

[Apache 2.0](LICENSE)

---

*UMM — 把你的观影记录统一起来。*
