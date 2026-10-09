/**
 * WebDAV 全链路深度模拟（自愈与收敛篇）—— E updatedAt 保护 / F 代际偏斜自愈 /
 * G gen-1 旧算法版本兼容 / H sync 收敛。
 *
 * 与 `webdav-full-pipeline.spec.ts`（失败路径篇）共享环境装配
 * （helpers/webdav-pipeline-env.ts）；本文件自建前置状态（种子 → 上传建云 →
 * local == cloud），不依赖彼文件的执行顺序 —— Playwright 按文件分 worker，
 * 跨文件状态不可传递。
 */

import { test, expect } from '@playwright/test';
import { zipSync } from 'fflate';
import { mediaDB } from '@/engine/database/models';
import type { StoreRecord } from '@/types';
import { calculateStoreHash, calculateLegacyStoreHash } from '@/libraries/utils/hash-utils';
import * as WebDAV from '@/provider/webdav/api';
import {
  callDownload,
  callPreview,
  callSync,
  callUpload,
  CREDS,
  currentRemoteMeta,
  seedStore,
  setupWebdavPipelineEnv,
  teardownWebdavPipelineEnv,
  USER,
  PASS,
} from './helpers/webdav-pipeline-env';

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

test.beforeAll(setupWebdavPipelineEnv);
test.afterAll(teardownWebdavPipelineEnv);

// ==================== 前置 · 建云（种子 → 全量上传；local == cloud） ====================

test('P0·前置：种子 28,709 条并全量上传，建 local == cloud 基线', async () => {
  for (const [store, count] of [
    ['douban_records', 15018],
    ['jav_ids', 9668],
    ['bilibili_records', 1851],
    ['imdb_records', 789],
    ['neodb_records', 1233],
    ['tmdb_records', 117],
    ['youtube_records', 31],
    ['bangumi_records', 2],
  ] as const) {
    await seedStore(store, count);
  }
  const p1 = await callPreview('upload');
  expect(p1.preview?.totals.upload).toBe(8);
  const reply = await callUpload(p1.fingerprint!);
  expect(reply.success, reply.message ?? reply.error).toBe(true);
  expect(reply.verified, '上传必须完整落地').toBe(true);
});

// ==================== E · 无变化表的 updatedAt 保护（#2 行为锚点） ====================

test('E·download 无变化表：hash 相等但本地 updatedAt 较新 ⇒ 跳过且不回退时间戳', async () => {
  // 前置（serial）：D 收尾修复后 local == cloud。hash 刻意排除 updatedAt —— 只改
  // 本地时间戳，hashEqual 必须保持（否则锚点失真）。选 tmdb（117 条覆盖写秒级）。
  const tmdbEntries = await mediaDB.getAll('tmdb_records');
  expect(tmdbEntries.length).toBe(117);
  await mediaDB.batchPut(
    'tmdb_records',
    tmdbEntries.map(({ key, record }) => ({
      key,
      record: { ...record, updatedAt: '2027-06-01T00:00:00.000Z' },
    })),
  );

  const p1 = await callPreview('download');
  expect(p1.preview?.rows.find((r) => r.key === 'tmdb_records')?.direction).toBe('skip');

  const reply = await callDownload(p1.fingerprint!);
  expect(reply.success, reply.message ?? reply.error).toBe(true);
  expect(reply.verified, '全部表无变化 ⇒ 完整落地').toBe(true);
  expect(reply.totalDownloaded, '全部表无变化 ⇒ 零下载').toBe(0);
  expect(reply.message ?? '').toContain('8 个数据集无变化');

  const kept = await mediaDB.get('tmdb_records', tmdbEntries[0]!.key);
  expect(
    kept?.updatedAt,
    '本地较新的 updatedAt 不得被云端旧值回退（热力图/年度统计口径保护）',
  ).toBe('2027-06-01T00:00:00.000Z');
});

// ==================== F · 代际偏斜自愈（R2 修正端到端） ====================

test('F·download 代际偏斜自愈：本地空 + meta 陈旧但 ZIP 完整一代 ⇒ 按 ZIP 自述恢复', async () => {
  // 前置（serial）：E 之后全部表 local == cloud。youtube 选为注入目标（81 条，
  // 覆盖写秒级）：清空本地 + 把 meta hash 改陈旧 ⇒ 混装 + 本地空 ⇒ 必须自愈。
  const youtubeEntries = await mediaDB.getAll('youtube_records');
  expect(youtubeEntries.length).toBe(31);
  for (const { key } of youtubeEntries) await mediaDB.delete('youtube_records', key);
  expect(await mediaDB.count('youtube_records')).toBe(0);

  const rm = await currentRemoteMeta();
  rm.datasets = rm.datasets.map((d) =>
    d.key === 'youtube_records' ? { ...d, hash: 'c'.repeat(64) } : d,
  );
  await WebDAV.uploadMeta(CREDS.webdavUrl, USER, PASS, rm);

  const p1 = await callPreview('download');
  const youtubeRow = p1.preview?.rows.find((r) => r.key === 'youtube_records');
  expect(youtubeRow?.direction, 'meta hash 被改陈旧 ⇒ 方向 download').toBe('download');

  const reply = await callDownload(p1.fingerprint!);
  expect(reply.success, reply.message ?? reply.error).toBe(true);
  expect(reply.verified, '自愈恢复是完整落地 ⇒ verified:true').toBe(true);
  expect(reply.message ?? '', '代际偏斜必须自愈并显式回报（不得再丢回给用户手工修）').toContain(
    '1 张表按 ZIP 自述恢复',
  );
  expect(reply.message ?? '').toContain('youtube_records');
  expect(await mediaDB.count('youtube_records'), 'ZIP 完整一代数据必须恢复').toBe(31);
});

// ==================== G · 旧哈希算法代 ZIP 的版本兼容（用户云端形态复刻） ====================

test('G·download 版本兼容：gen-1 旧算法 ZIP + meta 陈旧 + 本地空 ⇒ 逐代识别后自愈恢复', async () => {
  // 前置（serial）：F 之后全部表 local == cloud。用户真机形态：云端 ZIP 由**旧哈希
  // 算法构建**（gen-1，签名字段无 comment）写入，meta 是另一代次 —— 只用当前算法
  // 重算会全部误判 corrupt。本用例钉死逐代识别：gen-1 ZIP 必须被识别为完整一代并
  // 自愈。选 bilibili（1851 条覆盖写秒级）。
  const bilibiliEntries = await mediaDB.getAll('bilibili_records');
  expect(bilibiliEntries.length).toBe(1851);

  // 手工构造 gen-1 ZIP：data.json 不变，meta.json.hash = gen-1 算法（无 comment 字段
  // 集），dataVersion = 1（旧构建的版本轴形态——哈希变更未 bump 版本的历史窗口）。
  const dataObj: Record<string, StoreRecord> = {};
  for (const { key, record } of bilibiliEntries) dataObj[key] = record;
  const legacyHash = await calculateLegacyStoreHash(bilibiliEntries);
  const encoder = new TextEncoder();
  const legacyZip = zipSync({
    'data.json': encoder.encode(JSON.stringify(dataObj)),
    'meta.json': encoder.encode(
      JSON.stringify({
        key: 'bilibili_records',
        hash: legacyHash,
        updatedAt: '2026-01-01T00:00:00.000Z',
        recordCount: bilibiliEntries.length,
        dataVersion: 1,
      }),
    ),
  });
  await WebDAV.uploadDataset(
    CREDS.webdavUrl,
    USER,
    PASS,
    'bilibili_records',
    new Blob([legacyZip.slice()], { type: 'application/zip' }),
  );
  // 远端 meta 仍是当前代 hash —— 与 gen-1 ZIP 构成跨代混装（用户形态）。
  await mediaDB.clearAll();
  // 本地全部清空（用户形态：本地为空，云端是唯一副本）；zipSync 修复后大表恢复很快。
  const p1 = await callPreview('download');
  const row = p1.preview?.rows.find((r) => r.key === 'bilibili_records');
  expect(row?.direction, 'meta（当前代）与 ZIP（gen-1）hash 不同 ⇒ download').toBe('download');

  const reply = await callDownload(p1.fingerprint!);
  expect(reply.success, reply.message ?? reply.error).toBe(true);
  expect(reply.message ?? '', 'gen-1 ZIP 必须经代际表识别为完整一代并自愈（版本兼容层）').toContain(
    '按 ZIP 自述恢复',
  );
  expect(reply.message ?? '').toContain('bilibili_records');
  expect(await mediaDB.count('bilibili_records'), 'gen-1 ZIP 数据完整落库').toBe(1851);
  // 恢复后的记录签名必须与云端逐字段一致（跨代识别不等于放松保真）。
  const restored = await mediaDB.get('bilibili_records', bilibiliEntries[0]!.key);
  expect(restored?.url).toBe(bilibiliEntries[0]!.record.url);
  expect(restored?.status).toBe(bilibiliEntries[0]!.record.status);
});

// ==================== H · 同步收敛（本地非空的代际偏斜必须可并入） ====================

test('H·sync 收敛：本地非空 + meta 陈旧但 ZIP 完整一代 ⇒ sync 并入不拒、meta 随上传收敛', async () => {
  // 前置（serial）：G 之后全部表 local == cloud（G 的自愈恢复已把数据补齐）。用户
  // 真机二次操作形态：本地已有恢复数据（非空），meta 因历史混装仍陈旧 —— 点「同步」
  // 必须能收敛（merge 上下文逐记录较新者胜，完整一代并入永不盲目覆盖），而不是
  // 「download 拒绝、sync 也拒绝」两头困死。选 imdb 注入（789 条覆盖写秒级）。
  const imdbEntries = await mediaDB.getAll('imdb_records');
  expect(imdbEntries.length).toBe(789);

  // douban 同时注入两类异常：hash 偏斜（触发 merge/自愈）+ 计数谎报（云端声明
  // 16000，ZIP 实际 15018）⇒ 同步必须质疑并按实际内容纠错 meta。
  const rm = await currentRemoteMeta();
  rm.datasets = rm.datasets.map((d) => {
    if (d.key === 'imdb_records') return { ...d, hash: 'd'.repeat(64) };
    if (d.key === 'douban_records') return { ...d, hash: 'd'.repeat(64), recordCount: 16000 };
    return d;
  });
  await WebDAV.uploadMeta(CREDS.webdavUrl, USER, PASS, rm);

  const p1 = await callPreview('sync');
  const byKey = new Map(p1.preview?.rows.map((r) => [r.key, r.direction]));
  expect(byKey.get('imdb_records'), '本地非空 + meta 陈旧 ⇒ 两侧非空 ⇒ merge').toBe('merge');
  expect(byKey.get('douban_records')).toBe('merge');
  const p2 = await callPreview('sync');
  expect(p2.fingerprint).toBe(p1.fingerprint);

  const reply = await callSync(p1.fingerprint!);
  expect(reply.success, reply.message ?? reply.error).toBe(true);
  expect(reply.verified, '全部行成功落地 ⇒ verified:true').toBe(true);
  expect(
    reply.message ?? '',
    '本地非空的代际偏斜在 merge 上下文必须可并入（不得两头困死）——imdb（H 注入）+ youtube（F 残留陈旧 meta）+ douban（同）',
  ).toContain('3 张表按 ZIP 自述恢复');
  expect(reply.message ?? '').toContain('imdb_records');
  expect(reply.message ?? '').toContain('youtube_records');
  expect(reply.message ?? '').toContain('douban_records');
  // 质疑云端：声明计数 ≠ ZIP 实际 ⇒ 显式回报 + 上传以实际内容纠错 meta。
  expect(reply.message ?? '', '云端计数谎报必须被质疑并纠错').toContain('云端数据存疑');
  expect(reply.message ?? '').toContain('douban_records（声明 16000 / 实际 15018）');

  // 收敛断言：落盘不变量 + meta 已被 sync 重写为当前代（偏斜消除）。
  expect(await mediaDB.count('imdb_records')).toBe(789);
  expect(await mediaDB.count('youtube_records')).toBe(31);
  const rm2 = await currentRemoteMeta();
  const localImdbHash = await calculateStoreHash(await mediaDB.getAll('imdb_records'));
  const localYoutubeHash = await calculateStoreHash(await mediaDB.getAll('youtube_records'));
  expect(
    rm2.datasets.find((d) => d.key === 'imdb_records')?.hash,
    'sync 重写 meta 后必须与本地一致（偏斜消除）',
  ).toBe(localImdbHash);
  expect(
    rm2.datasets.find((d) => d.key === 'youtube_records')?.hash,
    'youtube 的陈旧 meta 同步收敛',
  ).toBe(localYoutubeHash);
  expect(
    rm2.datasets.find((d) => d.key === 'imdb_records')?.dataVersion,
    'meta 随上传收敛到当前格式版本',
  ).toBe(2);

  // 收敛后预检：imdb/youtube/douban 无变化（skip）—— 偏斜与谎报不再反复出现。
  const p3 = await callPreview('sync');
  for (const key of ['imdb_records', 'youtube_records', 'douban_records']) {
    expect(p3.preview?.rows.find((r) => r.key === key)?.direction, `${key} 收敛后 skip`).toBe(
      'skip',
    );
  }
});
