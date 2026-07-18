# Test Plan — UMM Web Panel

> 测试层级、策略、工具链、执行流程

## 1. 测试层级

```
Unit Test (Vitest + Nuxt Test Utils)
├── server/utils/api.ts        — apiSuccess/apiError/parsePagination
├── server/utils/migrate.ts    — applyStatements
├── server/utils/auth.ts       — hashPassword/generateSessionToken
├── server/utils/db.ts         — useDb
├── composables/useAuth.ts     — signIn/signOut/fetchSession
└── components/*.vue           — UmmStatCard/UmmPageHeader

API Integration Test (Vitest + h3 test utils)
├── GET  /api/system/init      — init check + auto-migration
├── POST /api/system/init      — create admin + session
├── GET  /api/health           — D1 connectivity
├── GET  /api/auth/session     — session validation
├── POST /api/auth/callback/credentials — login
├── POST /api/auth/logout      — logout
├── GET  /api/items            — list items + pagination
├── GET  /api/marks            — user marks
└── GET  /api/admin/*          — admin stats/users/logs

Security Test (Vitest + h3 test utils)
├── Anonymous → 401 on protected endpoints
├── Non-admin → 403 on admin endpoints
├── IDOR: user A reads user B's marks
├── Input validation: malformed body → 400
└── SQL injection: special chars in queries

E2E Test (Playwright)
├── Landing page loads
├── Setup wizard: DB check → create admin → auto-login
├── Login → Dashboard with stats
├── Admin panel: users/logs
├── Dark/light theme toggle
└── Logout → redirect

Cloudflare Runtime Compatibility
├── Build succeeds with cloudflare_pages preset
└── wrangler pages dev preview
```

## 2. 工具链

| 层级 | 工具 | 命令 |
|------|------|------|
| Unit | Vitest + @nuxt/test-utils | `npx vitest run test/server/utils/` |
| API | Vitest + h3 | `npx vitest run test/server/api/` |
| Security | Vitest + h3 | `npx vitest run test/server/security/` |
| E2E | Playwright | `npx playwright test` |
| Build | Nuxt + wrangler | `npm run build:web && npx wrangler pages dev dist` |

## 3. 测试数据库策略

```
wrangler d1 migrations apply umm-db --local
↓
插入 seed data (测试用户、标记、条目)
↓
执行测试 (每个测试独立事务)
↓
清理/回滚
```

在 CI 中：使用独立的 D1 测试数据库，每次运行前执行 migration。

## 4. 测试执行规则

```
每个功能必须经过:
1. 编写测试用例 (先 RED)
2. 运行测试 → 确认失败
3. 编写实现 → 确认 GREEN
4. 回归: 运行全部测试
5. 输出测试报告
```

禁止:
- 只解释代码不运行
- 假设测试通过
- 跳过失败测试

## 5. QA 独立性

QA/安全测试必须基于代码和实际输出，不接受开发者的解释。