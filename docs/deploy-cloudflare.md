# Cloudflare 部署指南

## 架构概览

```
Cloudflare Workers          Cloudflare Pages
┌──────────────────┐        ┌──────────────────┐
│   umm-api         │        │   umm-web         │
│   (services/worker│        │   (apps/web)      │
│   Hono + Drizzle) │        │   Nuxt 4 SSR)     │
│                   │        │                   │
│  POST /api/sync   │        │  /dashboard/*     │
│  GET  /api/items  │        │  /admin/*         │
│  GET  /api/marks  │        │  /auth/*          │
│  ...              │        │                   │
└────────┬─────────┘        └───────┬───────────┘
         │                          │
         ▼                          ▼
┌──────────────────────────────────────────────┐
│              D1 Database (umm)                │
│  media_items · user_marks · users ·           │
│  api_tokens · sync_logs · accounts ·          │
│  sessions · verification_tokens               │
├──────────────────────────────────────────────┤
│               KV Namespaces                   │
│  KV: PAT 缓存 (api)                           │
│  KV_SESSION: Auth.js 会话 (web)               │
└──────────────────────────────────────────────┘
```

---

## 前置条件

```bash
# 1. 安装 wrangler CLI（如果尚未安装）
npm install -g wrangler

# 2. 登录 Cloudflare
wrangler login

# 3. 确认登录状态
wrangler whoami
```

---

## 步骤 1：创建 D1 数据库

```bash
# 创建 D1 数据库
wrangler d1 create umm
```

输出示例：
```
✅ Successfully created DB 'umm' in region APAC
Created your new D1 database.

[[d1_databases]]
binding = "DB"
database_name = "umm"
database_id = "<your-database-id>"
```

记下 `database_id`，后续需要填入 wrangler.jsonc。

---

## 步骤 2：创建 KV 命名空间

```bash
# Worker API 用（PAT 缓存）
wrangler kv:namespace create umm-kv

# Web 应用用（Auth.js 会话）
wrangler kv:namespace create umm-session
```

输出示例：
```
✅ Successfully created KV namespace "umm-kv"
[[kv_namespaces]]
binding = "KV"
id = "<your-kv-id>"

✅ Successfully created KV namespace "umm-session"
[[kv_namespaces]]
binding = "KV_SESSION"
id = "<your-session-kv-id>"
```

记下两个 KV namespace 的 `id`。

---

## 步骤 3：更新 wrangler 配置

### services/worker/wrangler.jsonc

```jsonc
{
  "name": "umm-api",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-01",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "umm",
      "database_id": "<your-database-id>"  // ← 替换为实际 ID
    }
  ],
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "<your-kv-id>"                 // ← 替换为实际 ID
    }
  ]
}
```

### apps/web/wrangler.jsonc

```jsonc
{
  "name": "umm-web",
  "pages_build_output_dir": ".output/public",
  "compatibility_date": "2026-07-01",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "umm",
      "database_id": "<your-database-id>"  // ← 替换为实际 ID（同 D1）
    }
  ],
  "kv_namespaces": [
    {
      "binding": "KV_SESSION",
      "id": "<your-session-kv-id>"         // ← 替换为实际 ID
    }
  ]
}
```

---

## 步骤 4：运行 D1 迁移

```bash
# 从 monorepo 根目录
cd infra/drizzle

# 生成迁移 SQL（如尚未生成）
npx drizzle-kit generate

# 对远程 D1 执行迁移
npx wrangler d1 migrations apply umm --remote

# 验证表已创建
npx wrangler d1 execute umm --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

预期输出（8 张表）：
```
accounts, api_tokens, media_items, sessions, sync_logs, user_marks, users, verification_tokens
```

---

## 步骤 5：部署 Worker API

```bash
cd services/worker

# 部署到 Cloudflare Workers
npx wrangler deploy

# 验证部署
curl https://umm-api.<your-subdomain>.workers.dev/api/health
# 预期: {"status":"ok","version":"0.1.0"}
```

---

## 步骤 6：创建 Pages 项目 + 部署 Web 应用

### 方式 A：Wrangler CLI 部署（推荐首次）

```bash
cd apps/web

# 构建 Nuxt 应用
npm run build

# 部署到 Cloudflare Pages
npx wrangler pages deploy .output/public --project-name umm-web
```

首次部署会提示创建项目，按提示操作即可。

### 方式 B：GitHub 集成（推荐持续部署）

1. 在 Cloudflare Dashboard → Workers & Pages → 创建 Pages 项目
2. 连接 GitHub 仓库
3. 配置构建设置：
   - **生产分支**: `dev-2026-07-16`（或后续主分支）
   - **构建命令**: `cd apps/web && npm run build`
   - **构建输出目录**: `apps/web/dist`（Nitro cloudflare-pages preset 输出）
   - **根目录**: 留空（monorepo 根目录）
4. 在环境变量中设置 `AUTH_SECRET`

---

## 步骤 7：设置环境变量（Web 应用）

Web 应用需要 `AUTH_SECRET` 用于 Auth.js session 加密。

```bash
# 在 Cloudflare Dashboard 中设置
wrangler pages secret put AUTH_SECRET --project-name umm-web
```

生成一个随机密钥：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 验证完整部署

```bash
# 1. 健康检查
curl https://umm-api.<your-subdomain>.workers.dev/api/health

# 2. 创建测试 PAT（通过 API）
curl -X POST https://umm-api.<your-subdomain>.workers.dev/api/tokens \
  -H "Authorization: Bearer <admin-pat>" \
  -H "Content-Type: application/json" \
  -d '{"description": "test"}'

# 3. 测试同步
curl -X POST https://umm-api.<your-subdomain>.workers.dev/api/sync \
  -H "Authorization: Bearer <test-pat>" \
  -H "Content-Type: application/json" \
  -d '{
    "lastSyncAt": "2026-01-01T00:00:00Z",
    "items": [
      {"platform": "douban", "mediaType": "movie", "providerSelfId": "test001", "title": "测试电影", "updatedAt": "2026-07-16T00:00:00Z"}
    ],
    "marks": [{"itemRef": {"platform": "douban", "mediaType": "movie", "providerSelfId": "test001"}, "status": 2, "updatedAt": "2026-07-16T00:00:00Z"}],
    "deletedMarkIds": []
  }'

# 4. 验证数据写入
npx wrangler d1 execute umm --remote --command "SELECT id, platform, media_type, title FROM media_items LIMIT 5;"
```

---

## 常用命令速查

```bash
# Worker
cd services/worker
npx wrangler deploy            # 部署
npx wrangler dev               # 本地开发
npx wrangler tail              # 查看日志

# Web 应用
cd apps/web
npm run build                  # 构建
npx wrangler pages deploy .output/public --project-name umm-web  # 部署

# D1
cd infra/drizzle
npx drizzle-kit generate       # 生成迁移
npx wrangler d1 migrations apply umm --remote  # 执行迁移
npx wrangler d1 execute umm --remote --command "SELECT * FROM media_items LIMIT 10"  # 查询

# KV
npx wrangler kv:key get pat:<hash> --namespace-id <kv-id>  # 查看缓存
npx wrangler kv:key delete pat:<hash> --namespace-id <kv-id>  # 删除缓存
```

---

## 免费额度

| 资源 | 免费额度 | 本项目用量 |
|------|---------|-----------|
| Workers | 100k 请求/天 | API 同步请求 |
| Pages | 500 构建/月 · 无限请求 | Nuxt SSR |
| D1 | 5GB 存储 · 500万行读取/月 | 核心数据库 |
| KV | 1000 每日写入 · 1000 每日读取 | PAT 缓存 + 会话 |

预计在个人使用场景下完全在免费额度内。