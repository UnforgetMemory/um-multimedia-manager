# UM Multimedia Manager

多平台观影记录管理与同步工具。支持豆瓣、IMDb、NeoDB、Bilibili、YouTube 等多个平台的标记管理，提供浏览器扩展 + Web 管理面板的全方位体验。

## 项目结构

```
um-multimedia-manager/
├── apps/
│   ├── extension/         # Chrome 浏览器扩展 (WXT + Vue 3)
│   └── web/               # Web 管理面板 (Nuxt 4 + Cloudflare Pages)
├── packages/
│   ├── shared/            # DTO 类型、Zod 校验 schema (@umm/shared)
│   ├── database/          # Drizzle ORM D1 schema (@umm/database)
│   └── sdk/               # Worker API 客户端 SDK (@umm/sdk)
├── services/
│   └── worker/            # Cloudflare Worker API (Hono + Drizzle)
└── infra/
    └── drizzle/           # Drizzle Kit 迁移配置
```

## 架构

```
┌──────────────────────┐     ┌──────────────────────────────────┐
│  Chrome Extension     │     │  Cloudflare                      │
│  (apps/extension)     │     │                                  │
│                       │     │  ┌──────────────────────────┐    │
│  IndexedDB (本地)      │────▶│  │  services/worker (API)   │    │
│                       │  ╲  │  │  Hono + Drizzle          │    │
│  SyncManager          │   ╲ │  │                          │    │
│  增量同步 / 定时同步    │    ╲│  │  POST /api/sync         │    │
│                       │     │  │  GET /api/items          │    │
│                       │     │  │  GET/PUT /api/marks      │    │
│                       │     │  │  CRUD /api/tokens        │    │
│                       │     │  └──────────┬───────────────┘    │
│                       │     │             │                     │
│                       │     │  ┌──────────▼───────────────┐    │
│                       │     │  │  D1 Database (umm)       │    │
│                       │     │  │  media_items             │    │
│                       │     │  │  user_marks              │    │
│                       │     │  │  users / accounts        │    │
│                       │     │  │  api_tokens / sessions   │    │
│                       │     │  │  sync_logs               │    │
│                       │     │  └──────────────────────────┘    │
│                       │     │                                  │
│  ┌─────────────────┐  │     │  ┌──────────────────────────┐    │
│  │ Nuxt Web 面板    │──│────▶│  │  apps/web (Pages SSR)    │    │
│  │ Dashboard /     │  │     │  │  Nuxt 4 + Nitro          │    │
│  │ Admin           │  │     │  │  Dashboard / Admin       │    │
│  └─────────────────┘  │     │  └──────────────────────────┘    │
└──────────────────────┘     └──────────────────────────────────┘

KV 缓存:
  KV              → Worker (PAT 缓存, 5min TTL)
  KV_SESSION      → Web (Auth.js 会话存储)
```

### 数据模型

**两层分离架构：**

| 层 | 说明 | 示例 |
|----|------|------|
| **Media Items** | 全局唯一媒体条目 | `(douban, movie, 37332784)` → 标题、封面、linkedIds |
| **User Marks** | 按用户隔离的标记数据 | `user_id + media_item_id` → 状态、评分、评论 |

唯一键: `(platform + media_type + provider_self_id)`

### 同步流程

```
用户标记变更 → IndexedDB → SyncManager.trigger()
  → @umm/sdk.UmmApiClient.sync({itemRef, status, rating})
  → POST /api/sync (Worker)
  → UPSERT media_items (按复合键去重)
  → UPSERT user_marks (按 userId + mediaItemId 隔离)
  → D1 持久化
  → Web 面板查询 D1 展示
```

## 快速开始

### 前置要求

- Node.js >= 22
- npm >= 10
- [wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)（部署需要）

### 本地开发

```bash
# 安装所有 workspace 依赖
npm install

# 开发浏览器扩展
npm run dev:extension

# 开发 Web 面板
npm run dev:web

# 类型检查
npm run type-check

# 构建
npm run build:extension
npm run build:web
```

### 部署

参考 [部署指南](docs/deploy-cloudflare.md)

```bash
# 登录 Cloudflare
wrangler login

# 创建 D1 数据库
wrangler d1 create umm

# 创建 KV 命名空间
wrangler kv:namespace create umm-kv
wrangler kv:namespace create umm-session

# 部署 Worker API
cd services/worker
npx wrangler deploy

# 部署 Web 面板
cd apps/web
npm run build
npx wrangler pages deploy .output/public --project-name umm-web
```

## 组件详情

### 浏览器扩展 (apps/extension)

多平台观影记录管理 Chrome 扩展。支持：

- **豆瓣** — 30+ 页面类型覆盖，浮动标记面板，跨平台同步
- **IMDb** — 详情页标记面板
- **NeoDB** — 双向同步
- **Bilibili** — 视频播放页自动标记，首页推荐项徽章
- **YouTube** — Watch 页浮动按钮+进度追踪，首页推荐项徽章
- **数据管理** — WebDAV 备份/恢复，导入/导出
- **同步** — 通过 Worker API 增量同步到 Cloudflare D1

### Web 面板 (apps/web)

Nuxt 4 + Cloudflare Pages SSR 管理面板。

- **Dashboard** — 数据概览、条目浏览、标记管理、PAT 配置
- **Admin** — 用户管理、系统统计、同步日志
- **Auth** — Auth.js 登录/注册，GitHub OAuth

### Worker API (services/worker)

Cloudflare Worker 提供 REST API：

| 端点 | 鉴权 | 说明 |
|------|------|------|
| `GET /api/health` | 无 | 健康检查 |
| `POST /api/sync` | PAT | 增量同步 |
| `GET /api/marks` | PAT | 查询用户标记 |
| `PUT /api/marks` | PAT | 更新用户标记 |
| `GET /api/items` | PAT | 搜索媒体条目 |
| `POST /api/tokens` | PAT | 创建 PAT |
| `GET /api/tokens` | PAT | 列出 PAT |
| `DELETE /api/tokens/:id` | PAT | 吊销 PAT |

## 技术栈

| 组件 | 技术 |
|------|------|
| 浏览器扩展 | WXT, Vue 3, TypeScript, Tailwind CSS v4 |
| Web 面板 | Nuxt 4, Nitro, Auth.js, Tailwind CSS v4 |
| API | Hono, Drizzle ORM, Zod |
| 数据库 | Cloudflare D1 (SQLite) |
| 缓存 | Cloudflare KV |
| 部署 | Cloudflare Pages, Cloudflare Workers |

## 开发

### 分支策略

- `main` — 稳定版本
- `dev-YYYY-MM-DD` — 日常开发分支
- 功能分支合并到 dev 分支，经测试后合并到 main

### Commit 规范

使用 Conventional Commits：

```
feat: 新功能
fix: 修复
refactor: 重构
docs: 文档
chore: 杂项
```

## License

MIT