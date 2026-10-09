/**
 * X110 — WebDAV 三动作的协议层模拟验证（ADR-027；UI 路径见 x111）。
 *
 * 层次：真实构建产物 + 真实 MV3 service worker + CONTEXT 级内存 WebDAV 桩
 * （SW 发出的请求只有 context 级 route 拦得到）。桩与夹具在
 * `./fixtures/webdav-server`，与 x111 共用（同时把两个 spec 各自压到 <=600 行）。
 *
 * 覆盖：并集语义（本地 2 + 云端 100 ⇒ 102）、三方向同轮、sync/upload/download 的
 * 指纹保护、版本门禁（dataset dataVersion 过新）、备份白名单边界、上传孤儿行、
 * 非法的预检模式。上传字节一律解包后再断言，使「落盘了什么」成为可判定事实。
 */

import { expect, test } from './fixtures/extension-harness';
import { strToU8 } from 'fflate';
import {
  BANGUMI,
  DAV_URL,
  DOUBAN,
  IMDB,
  SETTINGS_KEY,
  TMDB,
  TTL_CACHE,
  YOUTUBE,
  datasetFileName,
  datasetZip,
  installDavServer,
  manyRemote,
  metaEntry,
  metaOf,
  preview,
  remoteRecord,
  seed,
  send,
  storeKeys,
  zipRecordCount,
  type OpReply,
  type PreviewReply,
} from './fixtures/webdav-server';

/**
 * 每个用例先把 WebDAV 凭据写进设置。harness 给每个用例一个全新的 mkdtemp profile
 * （IndexedDB/设置都是空的），不设会直接得到「WebDAV URL not configured」。
 * 用 UPDATE_SETTINGS 消息而非 UI 表单，是为了让协议层用例与界面解耦（UI 由 x111 覆盖）。
 */
test.beforeEach(async ({ extPage }) => {
  const res = await send<{ success?: boolean }>(extPage, 'UPDATE_SETTINGS', {
    webdavUrl: DAV_URL,
    webdavUsername: 'e2e-user',
    webdavPassword: 'e2e-pass',
  });
  expect(res.success, '写入 WebDAV 凭据必须成功').toBe(true);
});

test('同步：本地 2 条 + 云端 100 条 ⇒ 并集 102 条（覆盖式丢失不再可能）', async ({
  extContext,
  extPage,
}) => {
  const dav = await installDavServer(extContext, {
    meta: metaOf([metaEntry(DOUBAN, 100, 'remote-hash', '2026-01-05T00:00:00.000Z')]),
    datasets: { [DOUBAN]: datasetZip(manyRemote('R', 100, '2026-01-01T00:00:00.000Z')) },
  });
  await seed(extPage, DOUBAN, 'movie::L1');
  await seed(extPage, DOUBAN, 'movie::L2');

  const plan = await preview(extPage, 'sync');
  const row = plan.preview?.rows.find((r) => r.key === DOUBAN);
  expect(row?.direction, '两侧分叉必须判为 merge，而不是「较新者胜」').toBe('merge');
  expect(row?.localCount).toBe(2);
  expect(row?.remoteCount).toBe(100);
  expect(row?.lossEstimate, 'sync 的丢失估算必须恒为 0（回归哨兵）').toBe(0);

  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC', {
    expectedFingerprint: plan.fingerprint,
  });
  expect(res.success, `操作失败：${res.message ?? res.error ?? '未知'}`).toBe(true);
  expect(res.verified, '执行后计数复核必须通过').toBe(true);

  const keys = await storeKeys(extPage, DOUBAN);
  expect(keys).toHaveLength(102);
  expect(keys).toContain('movie::L1');
  expect(keys).toContain('movie::R100');

  const uploaded = dav.blobs.get(await datasetFileName(DOUBAN));
  expect(uploaded, '合并结果必须回写云端').toBeTruthy();
  expect(zipRecordCount(uploaded as Uint8Array), '云端 ZIP 与本地一致（102）').toBe(102);
  expect(
    dav.meta?.datasets.find((d) => d.key === DOUBAN)?.recordCount,
    '远端 meta 必须反映并集计数',
  ).toBe(102);
});

test('三种方向同轮共存：仅本地→上传、仅远端→下载、两侧分叉→合并', async ({
  extContext,
  extPage,
}) => {
  const dav = await installDavServer(extContext, {
    meta: metaOf([
      metaEntry(YOUTUBE, 5, 'remote-youtube', '2026-01-06T00:00:00.000Z'),
      metaEntry(DOUBAN, 2, 'remote-douban', '2026-01-06T00:00:00.000Z'),
    ]),
    datasets: {
      [YOUTUBE]: datasetZip(manyRemote('Y', 5, '2026-01-02T00:00:00.000Z')),
      [DOUBAN]: datasetZip({
        'movie::X2': remoteRecord('X2', '2026-01-02T00:00:00.000Z'),
        'movie::X3': remoteRecord('X3', '2026-01-02T00:00:00.000Z'),
      }),
    },
  });

  await seed(extPage, BANGUMI, 'movie::B1');
  await seed(extPage, BANGUMI, 'movie::B2');
  await seed(extPage, BANGUMI, 'movie::B3');
  await seed(extPage, DOUBAN, 'movie::X1');

  const plan = await preview(extPage, 'sync');
  const byKey = new Map((plan.preview?.rows ?? []).map((r) => [r.key, r]));
  expect(byKey.get(BANGUMI)?.direction, '仅本地 ⇒ 上传').toBe('upload');
  expect(byKey.get(YOUTUBE)?.direction, '仅远端 ⇒ 下载').toBe('download');
  expect(byKey.get(DOUBAN)?.direction, '两侧分叉 ⇒ 合并').toBe('merge');
  expect(plan.preview?.totals.upload).toBe(1);
  expect(plan.preview?.totals.download).toBe(1);
  expect(plan.preview?.totals.merge).toBe(1);
  expect(plan.preview?.totals.lossEstimate).toBe(0);

  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC', {
    expectedFingerprint: plan.fingerprint,
  });
  expect(res.success, `操作失败：${res.message ?? res.error ?? '未知'}`).toBe(true);
  expect(res.verified).toBe(true);
  expect(res.uploaded).toBeGreaterThan(0);
  expect(res.downloaded).toBeGreaterThan(0);

  expect(await storeKeys(extPage, YOUTUBE), '远端独有的 5 条必须落到本地').toHaveLength(5);
  expect(await storeKeys(extPage, DOUBAN), '本地 1 + 远端 2 ⇒ 3').toHaveLength(3);
  expect(await storeKeys(extPage, BANGUMI), '本地独有必须原样保留').toHaveLength(3);

  const remoteCounts = new Map((dav.meta?.datasets ?? []).map((d) => [d.key, d.recordCount]));
  expect(remoteCounts.get(DOUBAN)).toBe(3);
  expect(remoteCounts.get(BANGUMI)).toBe(3);
  expect(remoteCounts.get(YOUTUBE)).toBe(5);
  expect(
    zipRecordCount(dav.blobs.get(await datasetFileName(BANGUMI)) as Uint8Array),
    '上传方向必须真的把本地独有的 3 条写进云端 ZIP',
  ).toBe(3);
});

test('预检指纹失配（远端在预检后被改写）⇒ STALE_PLAN 且零写入', async ({ extContext, extPage }) => {
  const server = await installDavServer(extContext, {
    meta: metaOf([metaEntry(YOUTUBE, 1, 'remote-youtube', '2026-01-06T00:00:00.000Z')]),
    datasets: { [YOUTUBE]: datasetZip(manyRemote('Y', 1, '2026-01-02T00:00:00.000Z')) },
  });

  const plan = await preview(extPage, 'sync');

  // 预检之后、执行之前，远端被「另一台设备」改写。
  server.meta = metaOf([metaEntry(YOUTUBE, 42, 'remote-youtube-2', '2026-02-01T00:00:00.000Z')]);

  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC', {
    expectedFingerprint: plan.fingerprint,
  });
  expect(res.success).toBe(false);
  expect(res.errorCode).toBe('STALE_PLAN');
  expect(await storeKeys(extPage, YOUTUBE), '中止必须零写入').toHaveLength(0);
  expect(server.datasetPuts, '中止必须零上传').toHaveLength(0);
});

test('版本门禁：dataset dataVersion 过新 ⇒ 整表跳过且不写入本地', async ({
  extContext,
  extPage,
}) => {
  // dataVersion 99 > CURRENT_DATASET_VERSION(1) ⇒ validateDatasetVersion 抛
  // VERSION_TOO_NEW ⇒ 该 dataset 被跳过，其余 dataset 不受影响。
  await installDavServer(extContext, {
    meta: metaOf([metaEntry(IMDB, 1, 'remote-imdb', '2026-01-06T00:00:00.000Z')]),
    datasets: {
      [IMDB]: datasetZip({ 'movie::tt1': remoteRecord('tt1', '2026-01-02T00:00:00.000Z') }, 99),
    },
  });
  await seed(extPage, BANGUMI, 'movie::B1');

  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(res.success, `操作失败：${res.message ?? res.error ?? '未知'}`).toBe(true);
  expect(await storeKeys(extPage, IMDB), '版本不相容的 dataset 绝不能被写入').toHaveLength(0);
  expect(await storeKeys(extPage, BANGUMI), '其余 dataset 不受影响').toHaveLength(1);
});

test('安全边界：远端 meta 里的非备份 store 键被拒绝，且不触任何本地表', async ({
  extContext,
  extPage,
}) => {
  const dav = await installDavServer(extContext, {
    meta: metaOf([metaEntry(TTL_CACHE, 3, 'remote-ttl', '2026-01-06T00:00:00.000Z')]),
    datasets: { [TTL_CACHE]: datasetZip(manyRemote('T', 3, '2026-01-02T00:00:00.000Z')) },
  });

  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(res.success, `操作失败：${res.message ?? res.error ?? '未知'}`).toBe(true);
  expect(await storeKeys(extPage, TTL_CACHE), 'ttl_cache 不在备份白名单，必须被拒').toHaveLength(0);
  const ttlFile = await datasetFileName(TTL_CACHE);
  expect(dav.datasetPuts, '被拒的 dataset 不得被上传覆盖（含暂存名）').not.toContain(
    `${ttlFile}.tmp`,
  );
  expect(dav.datasetPuts).not.toContain(ttlFile);
  // R4：非备份键也不再被回写进新 meta（远端 meta 自净）。
  expect(
    dav.meta?.datasets.some((d) => d.key === TTL_CACHE),
    '非备份键必须从远端 meta 中消失',
  ).toBe(false);
});

test('上传边界：本机为空而云端有数据 ⇒ 写空数据集（不留不可达孤儿）且 meta 记 0', async ({
  extContext,
  extPage,
}) => {
  const dav = await installDavServer(extContext, {
    meta: metaOf([metaEntry(TMDB, 4, 'remote-tmdb', '2026-01-06T00:00:00.000Z')]),
    datasets: { [TMDB]: datasetZip(manyRemote('T', 4, '2026-01-02T00:00:00.000Z')) },
  });

  const plan = await preview(extPage, 'upload');
  const row = plan.preview?.rows.find((r) => r.key === TMDB);
  expect(row?.orphansRemote, '本机空 + 云端有数据必须被标为高危孤儿行').toBe(true);
  expect(row?.lossEstimate, '高风险行必须给出丢失估算').toBe(4);

  const res = await send<OpReply>(extPage, 'WEBDAV_UPLOAD', {
    expectedFingerprint: plan.fingerprint,
  });
  expect(res.success, `操作失败：${res.message ?? res.error ?? '未知'}`).toBe(true);
  expect(res.verified).toBe(true);

  const tmdbFile = await datasetFileName(TMDB);
  expect(dav.datasetPuts, '必须先写暂存名（原子落名的前一步）').toContain(`${tmdbFile}.tmp`);
  expect(dav.moves, '暂存名必须被 MOVE 到最终名（否则最终名可能被写成半截）').toContain(
    `${tmdbFile}.tmp`,
  );
  expect(zipRecordCount(dav.blobs.get(tmdbFile) as Uint8Array)).toBe(0);
  expect(dav.meta?.datasets.find((d) => d.key === TMDB)?.recordCount).toBe(0);
});

test('下载执行：upsert 不删本地 / 设置恢复 / 计数复核 / 指纹保护', async ({
  extContext,
  extPage,
}) => {
  const dav = await installDavServer(extContext, {
    meta: metaOf([
      metaEntry(DOUBAN, 3, 'remote-douban', '2026-01-05T00:00:00.000Z'),
      metaEntry(SETTINGS_KEY, 1, 'remote-settings', '2026-01-05T00:00:00.000Z'),
    ]),
    datasets: {
      [DOUBAN]: datasetZip(manyRemote('D', 3, '2026-01-01T00:00:00.000Z')),
      // __settings__ 是纯 JSON（非 ZIP）：下载链路的专用恢复分支直接 text() + JSON.parse
      [SETTINGS_KEY]: strToU8(JSON.stringify({ theme: 'dark' })),
    },
  });
  await seed(extPage, DOUBAN, 'movie::LOCAL1');

  const plan = await preview(extPage, 'download');
  const row = plan.preview?.rows.find((r) => r.key === DOUBAN);
  expect(row?.direction).toBe('download');
  expect(row?.localCount).toBe(1);
  expect(row?.remoteCount).toBe(3);

  const res = await send<OpReply>(extPage, 'WEBDAV_DOWNLOAD', {
    expectedFingerprint: plan.fingerprint,
  });
  expect(res.success, `下载失败：${res.message ?? res.error ?? '未知'}`).toBe(true);
  expect(res.verified, '「本地计数不减少」复核必须通过').toBe(true);
  expect(res.totalDownloaded).toBe(3);

  const keys = await storeKeys(extPage, DOUBAN);
  expect(keys, 'upsert 语义：远端 3 条并入，本地独有 1 条保留').toHaveLength(4);
  expect(keys).toContain('movie::LOCAL1');

  // 设置走 __settings__ 专用分支（IMPORT_SETTINGS_KEYS 白名单 + 取值校验后落 settingsCache）
  const settings = await send<{ success?: boolean; settings?: { theme?: string } }>(
    extPage,
    'GET_SETTINGS',
  );
  expect(settings.settings?.theme, '__settings__ 数据集必须被恢复').toBe('dark');

  // 指纹保护对下载同样生效：预检后远端被改写 ⇒ 中止且零写入
  const before = (await storeKeys(extPage, DOUBAN)).length;
  dav.meta = metaOf([metaEntry(DOUBAN, 42, 'remote-douban-2', '2026-03-01T00:00:00.000Z')]);
  const stale = await send<OpReply>(extPage, 'WEBDAV_DOWNLOAD', {
    expectedFingerprint: plan.fingerprint,
  });
  expect(stale.success).toBe(false);
  expect(stale.errorCode).toBe('STALE_PLAN');
  expect((await storeKeys(extPage, DOUBAN)).length, 'STALE_PLAN 必须零写入').toBe(before);
});

test('复核可见性：远端 meta 落盘与写入不符 ⇒ verified:false（证明该断言不空转）', async ({
  extContext,
  extPage,
}) => {
  // 远端「假成功」：meta PUT 返回 201 但不落盘，写后回读仍是旧计数 ⇒ 复核必须失败。
  // 没有这条，前面所有 verified:true 断言都可能是恒真的空转。
  await installDavServer(extContext, {
    meta: metaOf([metaEntry(DOUBAN, 100, 'remote-hash', '2026-01-05T00:00:00.000Z')]),
    datasets: { [DOUBAN]: datasetZip(manyRemote('R', 100, '2026-01-01T00:00:00.000Z')) },
    ignoreMetaPut: true,
  });
  await seed(extPage, DOUBAN, 'movie::L1');
  await seed(extPage, DOUBAN, 'movie::L2');

  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  // 复核是「报告」而不是「阻断」：数据仍然合并成功，但必须如实标记未通过。
  expect(res.success).toBe(true);
  expect(res.verified, 'meta 未落盘时必须回报未通过').toBe(false);
  expect(res.message, '未通过必须出现在回报文案里').toContain('完整性复核未通过');
  expect(await storeKeys(extPage, DOUBAN), '复核失败不影响合并本身').toHaveLength(102);
});

test('预检风险：本地与云端时间戳相同但内容不同 ⇒ 标记「本地会被云端覆盖」', async ({
  extContext,
  extPage,
}) => {
  // 用户实测截图里正是这种形态：本地 117 / 云端 117、两侧最新时间相同、方向「下载」。
  // 原实现只在「本地更晚」时告警 ⇒ 等时间戳 + 内容有别（典型是注释）会被静默回退。
  const ts = '2026-09-21T22:45:00.000Z';
  await installDavServer(extContext, {
    meta: metaOf([metaEntry(DOUBAN, 1, 'remote-hash', ts)]),
    datasets: { [DOUBAN]: datasetZip(manyRemote('D', 1, ts)) },
  });
  await send(extPage, 'DB_PUT', {
    storeName: DOUBAN,
    key: 'movie::LOCAL-COMMENTED',
    record: {
      url: 'https://example.com/local-commented',
      status: 2,
      rating: 8,
      comment: '只在本地写过的注释',
      updatedAt: ts,
      linkedIds: {},
    },
  });

  const plan = await preview(extPage, 'download');
  const row = plan.preview?.rows.find((r) => r.key === DOUBAN);
  expect(row?.localCount).toBe(1);
  expect(row?.remoteCount).toBe(1);
  expect(row?.localLatest, '计数 > 0 的一侧必须保留真实时间').toBe(ts);
  expect(row?.hashEqual, '内容不同 ⇒ hash 必不相等').toBe(false);
  expect(row?.revertsNewer, '等时间戳 + 内容不同必须告警（否则本地修订被静默回退）').toBe(true);
});

test('信任边界：非法预检模式被显式拒绝，不静默落进某个合法模式', async ({
  extContext,
  extPage,
}) => {
  await installDavServer(extContext, { meta: null });
  const res = await send<PreviewReply>(extPage, 'WEBDAV_PREVIEW', { mode: 'bogus' });
  expect(
    res.success,
    '非法模式必须被拒（buildPreview 对未知模式会落进 else = download 语义）',
  ).toBe(false);
  expect(res.error).toBe('INVALID_MODE');
});
