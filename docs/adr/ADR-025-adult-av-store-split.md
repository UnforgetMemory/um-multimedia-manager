# ADR-025 成人番号存储三表拆分（jav_ids / usav_ids / sehuatang_ids）

- 状态：accepted
- 日期：2026-09-10
- 决策者：用户 + umpp 会话（Q1 访问即记录 / Q2 无需搬迁 / Q3 各自按表计数）
- 前置：ADR-024（色花堂 overlay + 详情缓存）

## 背景

`jav_ids` 单表混存三种语义不同的键：日系番号（javdb/sehuatang）、美/欧厂牌番号（`Studio.YY.MM.DD`，ADR-024 后新增）、TID 兜底键（无番号帖子）。问题：

1. 语义混杂——历史总阅/统计要靠 `isTidTrackKey` 消费侧过滤补丁才能呈现真实番号数；
2. 用户明确要求日系与欧美**物理分表**、各自专一，且 TID 独立成表作为帖子浏览记录；
3. 统计需拆分展示：日系已看 / 欧美已看 / 帖子已看（替代单一历史总阅）。

## 决策

### D1：三表形态（主库 umm-media-db v14）

- `jav_ids`：日系番号（既有表，继续承载 javdb/sehuatang/mukaku 的日系键）；
- `usav_ids`：美/欧厂牌番号（新表，`Studio.YY.MM.DD` 形态键）；
- `sehuatang_ids`：帖子浏览记录（新表，`sehuatang::TID-<tid>` 键）。
- 三表均在主库（备份/导出白名单 `BACKUP_STORES` 同步纳入——用户数据必须可备份）；key 形态不变（保留 `source::id` 前缀，后缀匹配逻辑零改动）。
- 新表索引与 jav_ids 对齐（`updatedAt` 索引）。

### D2：分类器写入（background 单一分类点）

- `features/adult-av/models.ts` 新增纯函数：`isUsAvId(id)`（点分日期后缀形态判定）+ `classifyAvId(id) → 'jp'|'us'|'tid'`（TID 前缀 → tid；us 形态 → us；其余 → jp）。
- `ADULT_AV_ADD` / `ADULT_AV_BATCH_ADD` 按分类写入目标表——**内容脚本无感知**（消息契约不变）。

### D3：三表合并读（兼容性兜底）

- `ADULT_AV_CHECK` / `ADULT_AV_CHECK_BATCH`：watched 集合 = 三表 `status>=2` 后缀的并集——旧数据落错表（含旧备份恢复）不影响命中。
- `ADULT_AV_GET_ALL`：合并 jav_ids + usav_ids（sehuatang_ids 是帖子浏览记录，不进番号列表/查询面板；`isTidTrackKey` 过滤保留作防御）。

### D4：历史数据不搬迁（用户裁决）

- v14 迁移只 `createObjectStore` 两张新表，**不搬运** jav_ids 存量混合键；混合残留由 D3 读侧合并永久兼容（遵循 v13 防中止迁移模板精神，但无 cursor 数据移动）。

### D5：按表统计（用户裁决）

- 新消息 `ADULT_AV_STATS → { jp, us, tid }`：各表 `status>=2` 计数（jp 计数保留 `isTidTrackKey` 排除——挡存量 TID 残留）。
- 色花堂 overlay 头部统计：「历史总阅」单值 → 三段「日系 / 欧美 / 帖子」；本地标记后按分类器增量 bump（不重新全量读）。

### D6：帖子浏览记录（用户裁决 Q1）

- sehuatang-main 入口 matches 增加 `thread-*` 形态（伪静态）；`forum.php?mod=viewthread&tid=` 已在 `/forum*` 覆盖内。
- 访问帖子页 → 解析记录键 `resolveThreadWatchKey(标题, URL)` = 标题可提取番号？番号 : `TID-<tid>` →
  `ADULT_AV_ADD`（幂等同键覆盖）。**写入侧分类优先，非无条件写 TID**——这是「三表互不冲突」
  （需求 1）与「提取失败才兜底」（需求 2）的必然结果：
  - 标题含番号 → 落 jav_ids/usav_ids（该帖在语义上是「番号」，计入日系/欧美已看）；
  - 提取失败 → TID 兜底落 sehuatang_ids（计入帖子已看）。
  若帖子页无条件写 TID，则同一帖子会同时污染两番号表与帖子表，统计双计且违背互斥。
- 帖子页不建 overlay、不注入 UI（静默记录即返回）；记录失败仅 console 诊断（增益路径不阻塞浏览）。
- 与列表行 `parseThreadRow` 共用同一优先级（`avId ?? tid`），保证两处写键一致。

### D7：dimmer 双键兜底（需求 2）

- 列表卡片同时持有 `data-avid`（主键 = `avId ?? tid`）与 `data-tid`（`TID-<tid>`）。
- 已看判定集合 = 三表合并；命中判定为**双键任一命中**（`collectThreadTrackKeys` 收集 avId + tid
  去重大写 → `ADULT_AV_CHECK_BATCH` → `partitionInitialVisible` / `applyWatchedClasses` 双键比对）。
- 必要性：同一帖子「列表标题可提取番号、帖子页标题不可提取」时，记录落在 sehuatang_ids 的 TID 键，
  而列表主键是番号——单键判定会漏掉，双键兜底保证 dimmer/隐藏不失效。


## 影响面

- 修改：`types/index.ts`（RecordStoreName +2）、`features/database/models.ts`（STORE_NAMES/BACKUP_STORES/DB_VERSION=14/export）、`features/database/migrate.ts`（v14 块）、`features/adult-av/models.ts`（分类器）、`background/handlers/adult-av.ts`（分类写/三表读/STATS）、`background/handlers/db.ts`（白名单 +2）、`types/messages.ts` + `background.ts`（ADULT_AV_STATS 四处同步）、`content/sehuatang/url.ts`（帖子页判型）、`sehuatang-main.content`（matches + 记录分支）、`content/sehuatang/app.ts`（三段统计）、content i18n `locales.ts`（Header Info 键 ×4 locale）。
- 不动：主库其余表结构、既有消息契约形状、WebDAV 备份链（BACKUP_STORES 派生自动纳入）、douban 体系。
- 测试：分类器用例、v14 迁移用例（建表/不搬迁/幂等）、handler 分类写读用例、url 判型用例。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 迁移中止破坏主库 | v14 仅建表无数据移动，风险面最小；preventDefault 模板沿用 |
| 旧备份恢复混合数据落 jav_ids | D3 合并读命中不受影响；统计按表计的偏差用户已接受（Q2/Q3） |
| 帖子页误记录 | url 判型纯函数 + 测试锁定两种形态；记录幂等 |
| 分类器与提取器漂移 | 分类器只判定归一化后的 id 形态（点分日期后缀），提取器输出必过归一化——单一形态定义 |

## 备选方案

- 存量搬迁（move 到新表）：被用户否决（Q2 无需搬迁，读侧合并兜底）。
- 统计按形态分类计数：被用户否决（Q3 各自按表）。
- sehuatang_ids 独立 DB（仿 umm-sehuatang-cache）：被否决——帖子已看是用户数据，必须随备份/导出（缓存库不进备份是因其可重建；浏览记录不可重建）。
