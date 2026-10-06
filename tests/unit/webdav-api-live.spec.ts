/**
 * WebDAV 传输层「真机」验证 —— 驱动**真实 api.ts** 打到**真实 HTTP 服务器 + 真实文件系统**。
 *
 * 与既有两层的关系（不重复）：
 *  - `webdav-api.spec.ts`：注入式假 fetch，钉协议细节（URL/头/状态码分支），可在毫秒级跑完；
 *  - `tests/e2e/x11*`：真实扩展 + SW + route 桩，钉编排与 UI；
 *  - **本 spec**：真 TCP / 真 HTTP / 真 rename —— 补上另外两层都证明不了的东西：
 *    「客户端用的 MOVE `Destination`/`Overwrite` 形态真的能被服务器接受」、
 *    「原子落名后盘上只有 `<hash>.zip` 而没有 `.tmp`」、
 *    「写失败时盘上的旧字节确实没被动过」。
 *
 * 服务器见 `./helpers/webdav-live-server.ts`（零依赖，刻意保留 409/405/401 等真实行为）。
 *
 * 已知噪音（无害，实测口径见下）：**隔离运行本 spec** 时，Node 24 + Windows 下可能在
 * worker 退出时向 stderr 打印一次 libuv 断言
 * （`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src/win/async.c`），
 * 成因是 worker 里残留的 keep-alive 连接在退出瞬间被拆。实测：**全量套件运行时不再出现**
 * （2850 用例、0 次断言噪音，exit 0），且未开真实监听的 spec 从不出现。
 * 若将来 CI 要求 stderr 绝对干净，升级路径是把服务器移进子进程
 * （本文件断言依赖进程内 `live.requests`，故未采用）。
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startLiveDav, type LiveDav } from './helpers/webdav-live-server';
import {
  createDirectory,
  downloadDataset,
  fetchRemoteMeta,
  testConnection,
  uploadDataset,
  uploadMeta,
} from '@/provider/webdav/api';
import { packageDataset, unpackageDataset } from '@/libraries/utils/zip-utils';
import { judgeDatasetHash } from '@/provider/webdav/plan';
import { identifyStoreHashGeneration } from '@/libraries/utils/hash-utils';
import type { RemoteMeta, StoreRecord } from '@/types';

const USER = 'live-user';
const PASS = 'live-pass';
/** `api.ts` 的 BASE_PATH —— 真实服务器上必须真的出现这个集合目录。 */
const BASE_PATH = 'umm-data';

let root = '';
let dav: LiveDav | undefined;

async function boot(options?: Parameters<typeof startLiveDav>[1]): Promise<LiveDav> {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'umm-live-dav-'));
  dav = await startLiveDav(root, options);
  return dav;
}

/** 换一台服务器但沿用同一个磁盘目录（用于「先成功后失败」这类跨阶段用例）。 */
async function reboot(options: Parameters<typeof startLiveDav>[1]): Promise<LiveDav> {
  await dav?.close();
  dav = await startLiveDav(root, options);
  return dav;
}

test.afterEach(async () => {
  await dav?.close();
  dav = undefined;
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = '';
});

function record(id: string): StoreRecord {
  return {
    url: `https://example.com/${id}`,
    status: 2,
    rating: 8,
    updatedAt: '2026-01-01T00:00:00.000Z',
    linkedIds: {},
  };
}

function entries(prefix: string, count: number): Array<{ key: string; record: StoreRecord }> {
  return Array.from({ length: count }, (_, i) => ({
    key: `movie::${prefix}${i + 1}`,
    record: record(`${prefix}${i + 1}`),
  }));
}

function filesIn(dir: string): string[] {
  const abs = path.join(root, dir);
  return fs.existsSync(abs) ? fs.readdirSync(abs).sort() : [];
}

function metaOf(recordCount: number, hash = 'stub-hash'): RemoteMeta {
  return {
    schema: 'umm-meta',
    version: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    datasets: [
      {
        key: 'douban_records',
        hash,
        updatedAt: '2026-01-01T00:00:00.000Z',
        recordCount,
        dataVersion: 1,
      },
    ],
  };
}

test.describe('真实 HTTP + 真实文件系统', () => {
  test('PROPFIND 连通性 + Basic auth：正确凭据通过、错误凭据 401', async () => {
    const live = await boot({ auth: { user: USER, pass: PASS } });
    expect(await testConnection(live.baseUrl, USER, PASS)).toEqual({
      ok: true,
      message: 'Connected',
    });
    const denied = await testConnection(live.baseUrl, USER, 'wrong');
    expect(denied.ok).toBe(false);
    expect(denied.message).toContain('401');
  });

  test('MKCOL 建集合 + 原子上传：盘上只有 <hash>.zip，字节与入参一致', async () => {
    const live = await boot({ auth: { user: USER, pass: PASS } });
    await createDirectory(live.baseUrl, USER, PASS);
    expect(fs.existsSync(path.join(root, BASE_PATH)), 'MKCOL 必须真的建目录').toBe(true);

    const { blob } = await packageDataset('douban_records', entries('D', 3));
    await uploadDataset(live.baseUrl, USER, PASS, 'douban_records', blob);

    const files = filesIn(BASE_PATH);
    expect(files, '原子落名后盘上只应有最终名').toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f]{16}\.zip$/);

    // 真实字节一致性：盘上读回 → 解包 → 记录数与入参一致。
    const onDisk = fs.readFileSync(path.join(root, BASE_PATH, files[0] as string));
    const unpacked = await unpackageDataset(new Blob([onDisk], { type: 'application/zip' }));
    expect(Object.keys(unpacked.data)).toHaveLength(3);

    // 请求序列证明走的是「暂存 + MOVE」而不是原地 PUT。
    const methods = live.requests.map((r) => r.method);
    expect(methods).toEqual(['MKCOL', 'PUT', 'MOVE']);
    expect(live.requests[1]?.path).toMatch(/\.zip\.tmp$/);
  });

  test('父集合缺失 ⇒ PUT 409 ⇒ 客户端 MKCOL 后重试（真实状态码驱动）', async () => {
    const live = await boot({ auth: { user: USER, pass: PASS } });
    const { blob } = await packageDataset('douban_records', entries('D', 1));
    await uploadDataset(live.baseUrl, USER, PASS, 'douban_records', blob);

    expect(filesIn(BASE_PATH)).toHaveLength(1);
    const methods = live.requests.map((r) => r.method);
    expect(methods, '必须先撞 409 再补 MKCOL').toEqual(['PUT', 'MKCOL', 'PUT', 'MOVE']);
  });

  test('MOVE 不被支持（405）⇒ 真实 DELETE 暂存 + 直接 PUT，盘上不留 .tmp', async () => {
    const live = await boot({ auth: { user: USER, pass: PASS }, move: 'unsupported' });
    await createDirectory(live.baseUrl, USER, PASS);
    const { blob } = await packageDataset('douban_records', entries('D', 2));
    await uploadDataset(live.baseUrl, USER, PASS, 'douban_records', blob);

    const files = filesIn(BASE_PATH);
    expect(files, '降级后盘上只应有最终名（暂存被真删）').toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f]{16}\.zip$/);
    expect(live.requests.map((r) => r.method)).toEqual(['MKCOL', 'PUT', 'MOVE', 'DELETE', 'PUT']);

    const onDisk = fs.readFileSync(path.join(root, BASE_PATH, files[0] as string));
    const unpacked = await unpackageDataset(new Blob([onDisk], { type: 'application/zip' }));
    expect(Object.keys(unpacked.data)).toHaveLength(2);
  });

  test('坚果云形态：MOVE 409 ⇒ 同样降级直传（真机实证：坚果云 MOVE 一律 409）', async () => {
    const live = await boot({ auth: { user: USER, pass: PASS }, move: 'conflict' });
    await createDirectory(live.baseUrl, USER, PASS);
    const { blob } = await packageDataset('douban_records', entries('D', 2));
    await uploadDataset(live.baseUrl, USER, PASS, 'douban_records', blob);

    const files = filesIn(BASE_PATH);
    expect(files, '409 降级后盘上只应有最终名').toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f]{16}\.zip$/);
    expect(live.requests.map((r) => r.method)).toEqual(['MKCOL', 'PUT', 'MOVE', 'DELETE', 'PUT']);
  });

  test('MOVE 500 ⇒ 硬失败，且盘上旧内容一字未动（原子性的实证）', async () => {
    const live = await boot({ auth: { user: USER, pass: PASS } });
    await createDirectory(live.baseUrl, USER, PASS);
    const v1 = await packageDataset('douban_records', entries('D', 2));
    await uploadDataset(live.baseUrl, USER, PASS, 'douban_records', v1.blob);
    const finalName = filesIn(BASE_PATH)[0] as string;
    const before = fs.readFileSync(path.join(root, BASE_PATH, finalName));

    // 同一磁盘、换成「MOVE 必失败」的服务器：写入新内容（5 条）必须失败。
    await reboot({ auth: { user: USER, pass: PASS }, move: 'serverError' });
    const v2 = await packageDataset('douban_records', entries('D', 5));
    await expect(
      uploadDataset(dav!.baseUrl, USER, PASS, 'douban_records', v2.blob),
    ).rejects.toThrow('Failed to finalize dataset: HTTP 500');

    const after = fs.readFileSync(path.join(root, BASE_PATH, finalName));
    expect(Buffer.compare(after, before), '失败的上传绝不能改动最终名').toBe(0);
    // 孤儿暂存是这一路径的已知代价（下次同名上传会覆盖它）。
    expect(filesIn(BASE_PATH).some((f) => f.endsWith('.tmp'))).toBe(true);
  });

  test('响应被截断（content-length 不符）⇒ 读 dataset 抛错，不静默成功', async () => {
    const live = await boot({
      auth: { user: USER, pass: PASS },
      truncateOn: (method) => method === 'GET',
    });
    await expect(downloadDataset(live.baseUrl, USER, PASS, 'douban_records')).rejects.toThrow();
  });

  test('meta 404 ⇒ null；uploadMeta 后经真实 HTTP 读回（结构等价）', async () => {
    const live = await boot({ auth: { user: USER, pass: PASS } });
    await createDirectory(live.baseUrl, USER, PASS);
    expect(await fetchRemoteMeta(live.baseUrl, USER, PASS), '无 meta 必须是 null').toBeNull();

    const meta = metaOf(3, 'a'.repeat(64));
    await uploadMeta(live.baseUrl, USER, PASS, meta);
    expect(await fetchRemoteMeta(live.baseUrl, USER, PASS)).toEqual(meta);
  });

  test('真实文件系统上的「损坏远端」：盘上 hash 与 ZIP 自述不符 ⇒ 判定函数拒绝', async () => {
    const live = await boot({ auth: { user: USER, pass: PASS } });
    await createDirectory(live.baseUrl, USER, PASS);
    const { blob } = await packageDataset('douban_records', entries('D', 2));
    await uploadDataset(live.baseUrl, USER, PASS, 'douban_records', blob);
    // 手工把 meta.json 改成与实际 blob 不符的 hash —— 模拟「另一台设备写了 meta、
    // blob 没跟上」的真实损坏形态。
    await uploadMeta(live.baseUrl, USER, PASS, metaOf(2, 'b'.repeat(64)));

    const remote = await fetchRemoteMeta(live.baseUrl, USER, PASS);
    const expected = remote?.datasets[0]?.hash;
    const downloaded = await downloadDataset(live.baseUrl, USER, PASS, 'douban_records');
    const packed = await unpackageDataset(downloaded);

    // ZIP 数据与自带 manifest 一致 = 完整一代 ⇒ 自愈采纳（显式 cloud-wins、幂等）。
    // （代际识别走 identifyStoreHashGeneration —— 与生产 readDatasetEntries 同一函数。）
    const gen = await identifyStoreHashGeneration(
      entries('D', 2),
      packed.meta.hash,
      packed.meta.dataVersion,
    );
    expect(gen, 'packageDataset 产物必须命中当前哈希代').not.toBeNull();
    expect(judgeDatasetHash(expected, packed.meta.hash, true)).toBe('accept-stale-generation');
    // 同一函数在一致时不得误判（避免假守卫）。
    expect(judgeDatasetHash(packed.meta.hash, packed.meta.hash, true)).toBe('accept');
  });
});

test.describe('judgeDatasetHash 形态矩阵（纯函数）', () => {
  const hash = 'f'.repeat(64);

  test('非 64-hex 的期望值一律不参与判定（旧格式/哨兵值不得整表误拒）', () => {
    for (const expected of [undefined, 'empty', 'unknown', '', 'ABC', `${'a'.repeat(63)}`]) {
      expect(judgeDatasetHash(expected, 'whatever', true), String(expected)).toBe('accept');
    }
  });

  test('64-hex 期望值：一致接受', () => {
    expect(judgeDatasetHash(hash, hash, true)).toBe('accept');
  });

  test('不一致且 ZIP 内部自洽识别失败 ⇒ 拒绝（真损坏）', () => {
    expect(judgeDatasetHash(hash, '0'.repeat(64), false)).toBe('refuse-corrupt-zip');
  });

  test('ZIP 内部自洽 ⇒ 一律自愈采纳（覆盖=显式 cloud-wins 幂等；sync=并集安全）', () => {
    expect(judgeDatasetHash(hash, '0'.repeat(64), true)).toBe('accept-stale-generation');
  });
});
