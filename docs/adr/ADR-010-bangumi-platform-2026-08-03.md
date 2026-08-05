# ADR-010: Bangumi 平台接入 + 视频记录键统一（decision-3）— 2026-08-03

- **日期**: 2026-08-03
- **状态**: Accepted
- **依据**: `docs/audit/architecture-scan-2026-08-03.md` §1.1 / §2.1 / §3.3-M4 / §7（待用户决策项 3、4 均已采纳）

## 背景

用户决策接入 Bangumi（`bgm.tv` / `bangumi.tv` / `chii.in`）作为第 10 个平台。
架构扫描同期发现两项历史债需一并收敛：

1. **store key 三形态不一致**（§2.1）：`bilibili_records` / `youtube_records` 存在
   `video::BV…`（内容脚本）、裸 `BV…`（handlers/bilibili.ts）、`movie::BV…`
   （`Identity.fromUrl` 产出）三种键形态，`GET_ALL_RECORDS` 已归一化 `type='video'`
   但 store key 未收敛（审计决策项 3，采纳推荐 `movie::`）。
2. **v8→v9 jav_ids 迁移数据丢失**（§3.3 M4）：v8→v9 迁移段注释声称
   "rename sehuatang_avids → jav_ids, migrate data"，实际只 `createObjectStore` 未拷贝
   数据 → v8 及以下用户升级后成人记录孤儿化（审计决策项 4，采纳补拷贝）。

## 决策与执行结果

### 决策 1 — Bangumi 平台接入（DB_VERSION 12）

沿用既有平台接入契约，**零新增消息类型**，全部经既有类型化 Store 消息层：

- `Platform.KNOWN` 追加 `'bangumi'`（`src/domain/platform/Platform.ts`，Provider 类型自动派生）；
- `Identity.fromUrl` 解析 `bgm.tv`/`bangumi.tv`/`chii.in` 的 `/subject/{id}` → `(bangumi, tv, {id})`，
  `buildCanonicalUrl` 输出 `https://bgm.tv/subject/{id}/`；
- `STORE_NAMES.BANGUMI = 'bangumi_records'` + `RECORD_STORES` 收录 + `wxt.config.ts` host_permissions
  三域名；`storePlatformMap` 补 `[STORE_NAMES.BANGUMI]: 'bangumi'`（统计平台维恢复，§1.1）；
- 迁移段 v11→v12 建 `bangumi_records` store（含 status/updatedAt 索引）。

测试配套高于既有站点：`Platform.spec` + `bangumi-extract.spec`（204L）+ `bangumi-list-extract.spec`（243L）
+ 2 个 QA 脚本（18/18 选择器验证）。

### 决策 2 — `createDetailPageHandler` 新增 `resolveIdentity` 钩子

Bangumi 详情页 URL **不编码媒体类型**（bgm.tv/subject/123 无法区分动画/书籍/音乐），
真实类型只能从页面 `#infobox` 推断。工厂新增可选钩子：

```ts
resolveIdentity?: (identity: UrlIdentity, pageState: PageScanResult) => UrlIdentity | Promise<UrlIdentity>
```

调用序：`scanFn` → `resolveIdentity` → `dbGet`（store key `${type}::${providerId}` 用解析后类型）。
`Identity.fromUrl` 默认 `tv`，`resolveBangumiIdentity`（bangumi.ts）读 infobox 替换为真实类型，
store key 与实际类型一致。此为工厂**合理扩展**（+24L），非绕行既有 flow。

### 决策 3 — bilibili/youtube store key 统一为 `movie::`（DB_VERSION 13 + `normalizeVideoKey`）

审计决策项 3 采纳推荐 `movie::`（与 `Identity.fromUrl` 输出一致，避免历史数据二次迁移）：

- `normalizeVideoKey()`（`features/database/models.ts`）规则：
  `video::X` → `movie::X`；裸 `X` → `movie::X`；`movie::X` 不变；其他带前缀键（`tv::`/`music::`…）原样保留并记日志；
- v13 迁移对 `bilibili_records` / `youtube_records` 逐 store 单事务游标重写：
  目标键冲突时保留既有 `movie::` 条目并删除旧键（保守，不覆盖）；
- 内容脚本侧：抽共享模块 `entrypoints/content/ui/video-overlay*.ts`（T18），
  `storeKey(id) = 'movie::' + id`，bilibili.content 837→167L、youtube-homepage 875→321L；
- `GET_ALL_RECORDS` 既有 `type='video'` 归一注释同步更新。

### 决策 4 — M4：v8→v9 jav_ids 数据补拷贝（DB_VERSION 13）

`sehuatang_avids` 从未被删除，故升级途经 v8 的库两 store 并存。
v13 迁移段在单 readwrite 事务内游标拷贝：`jav_ids` 已存在的键**不被**陈旧副本覆盖
（existing wins 防御），拷贝计数打日志。

## 影响

- `DB_VERSION` 12 → **13**（v12 已随 Bangumi 发布，v13 需新迁移段）
- 迁移幂等且保守：键重写遇冲突丢旧留新；jav_ids 拷贝不覆盖既有数据
- 平台维度：`Platform.KNOWN` 10 平台、统计平台维恢复（bangumi 计数不再归 'unknown'）
- 代码规模：bilibili.content / youtube-homepage 各缩 ~670 / ~550 行，共享至
  `video-overlay.ts`（866L）+ `video-overlay-pure/tracker/styles` 拆分
- 内容脚本不再手写裸 `sendMessage(DB_GET)`，改走类型化 `Store.dbGet` + `storeKey()`

## 回滚

- Bangumi 接入（决策 1/2）：纯增量，可整体 revert 至 `4f458f2^` 而不影响既有平台；
- 决策 3 键统一：**不可逆但幂等**——迁移已执行后回滚代码会造成新旧键并存，
  需同时 revert 内容脚本 `storeKey()` 与 `GET_ALL_RECORDS` 归一逻辑；
- 决策 4 补拷贝：幂等（existing wins），重复执行无副作用。

## 后续（不在本次范围）

- `scanBangumiPageStatus` 双写（renderFn 自保存 + 工厂 base-save）待收敛
- `/subject/{id}/ep` 剧集页映射待 QA 快照实测
- bangumi-list.ts 直引 `dbGetAll` vs `Store.dbGetAll` 两种 import 风格待统一
