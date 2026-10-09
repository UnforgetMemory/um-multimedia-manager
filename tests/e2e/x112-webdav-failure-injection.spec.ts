/**
 * X112 — 远端 WebDAV 不确定性的故障注入验证（ADR-027）。
 *
 * 与前两个 e2e 的分工：x110/x111 验证「正常路径与已识别边界」，本 spec 专打
 * **失败路径**——远端可能返回 5xx、断流、慢响应、畸形 JSON、损坏/缺失 ZIP，
 * 也可能在同步进行中被另一台设备改写。判据一律是「不崩 + 不吞脏数据 + 不谎报成功」：
 *  - 预检阶段的远端故障 ⇒ `success:false` 且**零写入**；
 *  - 单表故障 ⇒ 该表跳过、其余表继续，`verified:false` 且文案如实说明；
 *  - 远端 meta 与 ZIP 自述不一致 ⇒ 拒绝吞入（R2 的读侧兜底）；
 *  - 远端不支持 MOVE ⇒ 降级为直接 PUT 仍须成功。
 *
 * 超时路径**不在此 spec**：仓库的 `WEBDAV_TIMEOUT` 是 30s，等待真实超时会让用例
 * 慢到不可接受；该分支由 `tests/unit/webdav-api.spec.ts` 用合成 AbortError 覆盖。
 */

import { expect, test } from './fixtures/extension-harness';
import { strToU8 } from 'fflate';
import {
  BANGUMI,
  DOUBAN,
  DAV_URL,
  IMDB,
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

test.beforeEach(async ({ extPage }) => {
  const res = await send<{ success?: boolean }>(extPage, 'UPDATE_SETTINGS', {
    webdavUrl: DAV_URL,
    webdavUsername: 'e2e-user',
    webdavPassword: 'e2e-pass',
  });
  expect(res.success).toBe(true);
});

/** 组装一个「命中指定 dataset 文件名的某方法」的故障判定。 */
function failedOn(method: string, file: string, status: number) {
  return (m: string, p: string): number | null =>
    m === method && p.includes(file) ? status : null;
}

// ==================== 网络层 ====================

test('网络层：meta GET 500 ⇒ 预检失败且零写入', async ({ extContext, extPage }) => {
  const dav = await installDavServer(extContext, {
    meta: metaOf([metaEntry(DOUBAN, 3, 'remote-hash', '2026-01-05T00:00:00.000Z')]),
    datasets: { [DOUBAN]: datasetZip(manyRemote('D', 3, '2026-01-01T00:00:00.000Z')) },
    faults: {
      statusFor: (method, path) => (method === 'GET' && path.endsWith('meta.json') ? 500 : null),
    },
  });
  await seed(extPage, BANGUMI, 'movie::B1');

  const plan = await send<PreviewReply>(extPage, 'WEBDAV_PREVIEW', { mode: 'sync' });
  expect(plan.success).toBe(false);

  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(res.success, '远端不可读时同步必须失败而不是当成「远端为空」').toBe(false);
  expect(dav.datasetPuts, '失败时必须零上传').toHaveLength(0);
  expect(dav.metaPuts, '失败时必须零 meta 写入').toBe(0);
  expect((await storeKeys(extPage, BANGUMI)).length, '本地不受影响').toBe(1);
});

test('网络层：meta GET 断流（fetch 抛错）⇒ 失败且不崩', async ({ extContext, extPage }) => {
  await installDavServer(extContext, {
    meta: metaOf([]),
    faults: { abortFor: (method, path) => method === 'GET' && path.endsWith('meta.json') },
  });
  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(res.success).toBe(false);
  expect(typeof res.error).toBe('string');
  // 后续消息仍然可用（SW 未因未捕获异常而半死）。
  const again = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(again.success).toBe(false);
});

test('网络层：单表 dataset GET 500 ⇒ 该表跳过，其余表照常同步', async ({ extContext, extPage }) => {
  const imdbFile = await datasetFileName(IMDB);
  await installDavServer(extContext, {
    meta: metaOf([
      metaEntry(IMDB, 2, 'remote-imdb', '2026-01-05T00:00:00.000Z'),
      metaEntry(DOUBAN, 2, 'remote-douban', '2026-01-05T00:00:00.000Z'),
    ]),
    datasets: {
      [IMDB]: datasetZip(manyRemote('I', 2, '2026-01-01T00:00:00.000Z')),
      [DOUBAN]: datasetZip(manyRemote('D', 2, '2026-01-01T00:00:00.000Z')),
    },
    faults: { statusFor: failedOn('GET', imdbFile, 500) },
  });

  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(res.success, `故障单表不得让整轮同步失败：${res.message ?? ''}`).toBe(true);
  expect(await storeKeys(extPage, IMDB), '故障表不得被写入').toHaveLength(0);
  expect(await storeKeys(extPage, DOUBAN), '无故障的表照常同步').toHaveLength(2);
  expect(res.verified, '有表跳过 ⇒ 未完整落地').toBe(false);
});

test('网络层：单表 dataset PUT 500 ⇒ 写入失败可见，云端该表保持原状', async ({
  extContext,
  extPage,
}) => {
  const bangumiFile = await datasetFileName(BANGUMI);
  const dav = await installDavServer(extContext, {
    meta: metaOf([]),
    faults: {
      // 原子路径先 PUT 暂存名；把暂存 PUT 打掉即模拟「新内容没上去」。
      statusFor: (m, p) => (m === 'PUT' && p.includes(bangumiFile) ? 500 : null),
    },
  });
  await seed(extPage, BANGUMI, 'movie::B1');
  await seed(extPage, BANGUMI, 'movie::B2');

  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(res.success).toBe(true);
  expect(res.verified, '有表写入失败 ⇒ 不得报完整落地').toBe(false);
  expect(res.message, '失败必须出现在回报文案里').toContain('写入失败');
  expect((await storeKeys(extPage, BANGUMI)).length, '本地记录不受影响').toBe(2);
  expect(dav.meta?.datasets.find((d) => d.key === BANGUMI)?.recordCount, '云端该表保持原状').toBe(
    0,
  );
});

test('网络层：慢响应（1.5s）不误判为失败', async ({ extContext, extPage }) => {
  await installDavServer(extContext, {
    meta: metaOf([metaEntry(DOUBAN, 2, 'remote-douban', '2026-01-05T00:00:00.000Z')]),
    datasets: { [DOUBAN]: datasetZip(manyRemote('D', 2, '2026-01-01T00:00:00.000Z')) },
    faults: {
      delayMsFor: (m) => (m === 'GET' || m === 'PUT' || m === 'MOVE' ? 300 : 0),
    },
  });
  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(res.success, `慢但成功不得被当成失败：${res.message ?? ''}`).toBe(true);
  expect(await storeKeys(extPage, DOUBAN)).toHaveLength(2);
});

// ==================== 协议层 ====================

test('协议层：远端 meta 是畸形 JSON ⇒ 预检失败且零写入', async ({ extContext, extPage }) => {
  const dav = await installDavServer(extContext, {
    meta: metaOf([metaEntry(DOUBAN, 1, 'remote-hash', '2026-01-05T00:00:00.000Z')]),
    faults: { malformedMeta: true },
  });
  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(res.success).toBe(false);
  expect(dav.datasetPuts).toHaveLength(0);
  expect(dav.metaPuts).toBe(0);
});

test('协议层：dataset ZIP 损坏 ⇒ 该表跳过，不阻断其余表', async ({ extContext, extPage }) => {
  await installDavServer(extContext, {
    meta: metaOf([
      metaEntry(IMDB, 2, 'garbage-hash', '2026-01-05T00:00:00.000Z'),
      metaEntry(DOUBAN, 1, 'remote-douban', '2026-01-05T00:00:00.000Z'),
    ]),
    datasets: {
      // 非 ZIP 的垃圾字节：unpackageDataset 必须拒绝，而不是把乱码当记录写进本地。
      [IMDB]: strToU8('this is not a zip at all'),
      [DOUBAN]: datasetZip(manyRemote('D', 1, '2026-01-01T00:00:00.000Z')),
    },
  });

  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(res.success, `损坏单表不得让整轮失败：${res.message ?? ''}`).toBe(true);
  expect(await storeKeys(extPage, IMDB), '损坏数据集绝不能被写入').toHaveLength(0);
  expect(await storeKeys(extPage, DOUBAN)).toHaveLength(1);
});

test('协议层：meta 声明有数据但 blob 404 ⇒ 该表跳过', async ({ extContext, extPage }) => {
  await installDavServer(extContext, {
    meta: metaOf([metaEntry(YOUTUBE, 5, 'remote-youtube', '2026-01-05T00:00:00.000Z')]),
    datasets: {}, // 故意不提供 blob
  });
  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(res.success).toBe(true);
  expect(await storeKeys(extPage, YOUTUBE), '取不到的数据集不得被当成空').toHaveLength(0);
});

test('协议层：远端 meta 与 ZIP 自述 hash 不一致 ⇒ 拒绝吞入（R2 读侧兜底）', async ({
  extContext,
  extPage,
}) => {
  // 远端 meta 声称 hash=a…a，但 ZIP 里自述的是 stub-hash —— 真实场景对应
  // 「上传在 blob 已换、meta 未换的中途被读到」。
  await installDavServer(extContext, {
    meta: metaOf([metaEntry(DOUBAN, 3, 'a'.repeat(64), '2026-01-05T00:00:00.000Z')]),
    datasets: { [DOUBAN]: datasetZip(manyRemote('D', 3, '2026-01-01T00:00:00.000Z')) },
  });
  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(res.success).toBe(true);
  expect(await storeKeys(extPage, DOUBAN), '混装状态不得被吞进本地').toHaveLength(0);
  expect(res.verified).toBe(false);
  expect(res.message).toContain('写入失败');
});

test('协议层：远端不支持 MOVE ⇒ 降级为直接 PUT 并清理暂存，结果仍正确', async ({
  extContext,
  extPage,
}) => {
  const bangumiFile = await datasetFileName(BANGUMI);
  const dav = await installDavServer(extContext, {
    meta: metaOf([]),
    noMoveSupport: true,
  });
  await seed(extPage, BANGUMI, 'movie::B1');

  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(res.success, `降级路径必须仍然成功：${res.message ?? ''}`).toBe(true);
  expect(res.verified).toBe(true);
  expect(dav.moves, 'MOVE 未被支持，不应有成功换名').toHaveLength(0);
  expect(dav.datasetDeletes, '降级时必须清理暂存文件').toContain(`${bangumiFile}.tmp`);
  expect(dav.datasetPuts).toContain(`${bangumiFile}.tmp`);
  expect(dav.datasetPuts).toContain(bangumiFile);
  expect(zipRecordCount(dav.blobs.get(bangumiFile) as Uint8Array)).toBe(1);
});

test('协议层：hash 不一致有出路 —— 同步拒绝后用「上传」以本机为准收敛', async ({
  extContext,
  extPage,
}) => {
  await installDavServer(extContext, {
    meta: metaOf([metaEntry(DOUBAN, 3, 'a'.repeat(64), '2026-01-05T00:00:00.000Z')]),
    datasets: { [DOUBAN]: datasetZip(manyRemote('D', 3, '2026-01-01T00:00:00.000Z')) },
  });
  await seed(extPage, DOUBAN, 'movie::L1');
  await seed(extPage, DOUBAN, 'movie::L2');

  const refused = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(refused.success).toBe(true);
  expect(refused.verified).toBe(false);
  expect(refused.message, '拒绝必须给出可操作的出路').toContain('上传');

  // 「上传」= 以本机为准重写 blob + meta ⇒ 不一致被消除。
  const uploaded = await send<OpReply>(extPage, 'WEBDAV_UPLOAD');
  expect(uploaded.success, `上传应修复不一致：${uploaded.message ?? uploaded.error ?? ''}`).toBe(
    true,
  );
  expect(uploaded.verified).toBe(true);

  const settled = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(settled.verified, '收敛后不得再有表写入失败').toBe(true);
  expect(await storeKeys(extPage, DOUBAN), '本机记录完好').toHaveLength(2);
});

test('下载复核可达失败：下载期间本地记录被删 ⇒ verified:false', async ({ extContext, extPage }) => {
  // 目的：证明 `verifyLocalNeverShrunk` 不是恒真断言。
  // 时序：handler 先取「下载前」快照（buildLocalMeta 在任何网络请求之前），
  // 因此等到第一次 dataset GET 出现后再删本地记录，必然落在「快照之后、复核之前」。
  const dav = await installDavServer(extContext, {
    meta: metaOf([metaEntry(DOUBAN, 1, 'remote-douban', '2026-01-05T00:00:00.000Z')]),
    datasets: { [DOUBAN]: datasetZip(manyRemote('D', 1, '2026-01-01T00:00:00.000Z')) },
    faults: { delayMsFor: (m, p) => (m === 'GET' && p.endsWith('.zip') ? 800 : 0) },
  });
  const localKeys = ['movie::A1', 'movie::A2', 'movie::A3', 'movie::A4', 'movie::A5'];
  for (const key of localKeys) await seed(extPage, DOUBAN, key);

  let sawDatasetGet = false;
  dav.faults.onRequest = (method, path) => {
    if (method === 'GET' && path.endsWith('.zip')) sawDatasetGet = true;
  };

  const inFlight = send<OpReply>(extPage, 'WEBDAV_DOWNLOAD');
  await expect.poll(() => sawDatasetGet, { timeout: 15_000 }).toBe(true);
  for (const key of localKeys) {
    await send(extPage, 'DB_DELETE', { storeName: DOUBAN, key });
  }

  const res = await inFlight;
  expect(res.success).toBe(true);
  expect(res.verified, '下载期间本地记录消失必须被复核发现').toBe(false);
});

test('网络层：上传时单表失败 ⇒ 其余表仍进备份，且 meta 照常落盘（逐表隔离 · U1）', async ({
  extContext,
  extPage,
}) => {
  // 判别力：修复前单表失败会中止整轮上传 —— 表现是「后面的表全都没进备份」且
  // **meta 完全没被写**（metaPuts === 0），远端停在旧样子。故断言 metaPuts === 1。
  const bangumiFile = await datasetFileName(BANGUMI);
  const doubanFile = await datasetFileName(DOUBAN);
  const dav = await installDavServer(extContext, {
    meta: metaOf([]),
    faults: {
      statusFor: (m, p) => (m === 'PUT' && p.includes(bangumiFile) ? 500 : null),
    },
  });
  await seed(extPage, DOUBAN, 'movie::D1');
  await seed(extPage, DOUBAN, 'movie::D2');
  await seed(extPage, BANGUMI, 'movie::B1');
  await seed(extPage, BANGUMI, 'movie::B2');

  const res = await send<OpReply>(extPage, 'WEBDAV_UPLOAD');
  expect(res.success, `上传失败：${res.message ?? res.error ?? '未知'}`).toBe(true);
  expect(dav.metaPuts, '单表失败不得让整轮中止（meta 必须落盘）').toBe(1);
  expect(dav.blobs.has(doubanFile), '故障表之前的表必须照常上传').toBe(true);
  expect(
    dav.meta?.datasets.find((d) => d.key === BANGUMI)?.recordCount,
    '失败表如实记 0（云端本就没有这份数据）',
  ).toBe(0);
  expect(res.verified, '有表失败 ⇒ 不得报完整落地').toBe(false);
  expect(res.message, '失败必须出现在回报文案里').toContain('上传失败');
});

test('协议层：单条记录格式不合 ⇒ 恢复计数可见且 verified:false（不谎报完整）', async ({
  extContext,
  extPage,
}) => {
  await installDavServer(extContext, {
    meta: metaOf([metaEntry(DOUBAN, 2, 'stub-hash', '2026-01-05T00:00:00.000Z')]),
    datasets: {
      // 一条合法 + 一条形状非法（不是对象）—— 逐记录校验会跳过后者。
      [DOUBAN]: datasetZip({
        'movie::GOOD': remoteRecord('GOOD', '2026-01-01T00:00:00.000Z'),
        'movie::BAD': 'not-a-record',
      }),
    },
  });

  const res = await send<OpReply>(extPage, 'WEBDAV_DOWNLOAD');
  expect(res.success, `下载失败：${res.message ?? res.error ?? '未知'}`).toBe(true);
  expect(res.totalDownloaded, '总数按 ZIP 内原始条数回报').toBe(2);
  expect(await storeKeys(extPage, DOUBAN), '非法记录不得写入').toHaveLength(1);
  expect(res.verified, '有记录被跳过 ⇒ 不得报完整落地').toBe(false);
  expect(res.message, '跳过条数必须出现在回报文案里').toContain('跳过');
});

// ==================== 竞态 ====================

test('竞态：执行中途远端被另一台设备改写 ⇒ 本次结果仍自洽（meta 与 blob 一致）', async ({
  extContext,
  extPage,
}) => {
  const dav = await installDavServer(extContext, {
    meta: metaOf([metaEntry(DOUBAN, 2, 'remote-douban', '2026-01-05T00:00:00.000Z')]),
    datasets: { [DOUBAN]: datasetZip(manyRemote('D', 2, '2026-01-01T00:00:00.000Z')) },
  });
  await seed(extPage, DOUBAN, 'movie::LOCAL1');

  // 第一次 dataset PUT（暂存名）时，第三方写入自己的 meta。
  let injected = false;
  dav.faults.onRequest = (method, path) => {
    if (!injected && method === 'PUT' && path.endsWith('.tmp')) {
      injected = true;
      dav.meta = metaOf([metaEntry(YOUTUBE, 99, 'b'.repeat(64), '2027-01-01T00:00:00.000Z')]);
    }
  };

  const res = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(res.success).toBe(true);
  expect(
    injected,
    `注入必须真的发生在执行中途；本轮 message=${res.message ?? ''} puts=${dav.datasetPuts.join('|')}`,
  ).toBe(true);
  // 本次同步以自己完整的 meta 覆盖远端：注入的脏条目不该残留，且本表计数自洽。
  // 注意断言的是**计数**而非键是否存在 —— 本地 meta 会为全部 10 张备份表发出条目
  // （空表记 0），所以「键存在」不能区分「我们的空条目」与「第三方的 99 条脏条目」。
  expect(
    dav.meta?.datasets.find((d) => d.key === YOUTUBE)?.recordCount,
    '注入的脏计数不得残留',
  ).toBe(0);
  expect(dav.meta?.datasets.find((d) => d.key === DOUBAN)?.recordCount).toBe(3);
  expect(await storeKeys(extPage, DOUBAN)).toHaveLength(3);
});

test('竞态：同步进行中本地新增记录 ⇒ 不崩且不丢', async ({ extContext, extPage }) => {
  await installDavServer(extContext, {
    meta: metaOf([metaEntry(DOUBAN, 2, 'remote-douban', '2026-01-05T00:00:00.000Z')]),
    datasets: { [DOUBAN]: datasetZip(manyRemote('D', 2, '2026-01-01T00:00:00.000Z')) },
    faults: { delayMsFor: (m) => (m === 'GET' ? 250 : 0) },
  });

  const inFlight = send<OpReply>(extPage, 'WEBDAV_SYNC');
  await seed(extPage, BANGUMI, 'movie::DURING_SYNC');
  const res = await inFlight;

  expect(res.success).toBe(true);
  const bangumi = await storeKeys(extPage, BANGUMI);
  expect(bangumi, '同步期间的本地写入不得被抹掉').toContain('movie::DURING_SYNC');
});

test('单飞锁：连续两次同步都必须成功（锁被释放，不泄漏）', async ({ extContext, extPage }) => {
  await installDavServer(extContext, {
    meta: metaOf([metaEntry(DOUBAN, 2, 'remote-douban', '2026-01-05T00:00:00.000Z')]),
    datasets: { [DOUBAN]: datasetZip(manyRemote('D', 2, '2026-01-01T00:00:00.000Z')) },
  });
  const first = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(first.success, `第一次：${first.message ?? first.error ?? ''}`).toBe(true);
  const second = await send<OpReply>(extPage, 'WEBDAV_SYNC');
  expect(
    second.success,
    `第二次失败即说明锁未释放（WRITE_IN_PROGRESS）：${second.error ?? ''}`,
  ).toBe(true);
  expect(second.error).not.toBe('WRITE_IN_PROGRESS');
});

test('预检仍可用：写锁只拦写操作，不拦只读预检', async ({ extContext, extPage }) => {
  await installDavServer(extContext, { meta: metaOf([]) });
  const plan = await preview(extPage, 'sync');
  expect(plan.preview?.rows.length).toBeGreaterThan(0);
});
