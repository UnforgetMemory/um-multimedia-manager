/**
 * provider/webdav/api.ts —— 传输层契约（ADR-027 期间唯一零覆盖的 WebDAV 模块）。
 *
 * 用**注入式假 fetch** 在无网络、无 chrome 的前提下钉死协议细节：
 *   - URL 组合（`<base>/umm-data/meta.json` 与 `<hash>.zip`，含尾斜杠归一）
 *   - Basic auth 的 UTF-8 → base64 链（非 ASCII 凭据也不许乱码）
 *   - 状态码 → 错误语义（404 对 meta 是 null、对 dataset 是错误；非 2xx 带状态码）
 *   - 原子上传（R2）：先 PUT `<hash>.zip.tmp`，再 MOVE 到最终名
 *   - MOVE 不受支持 ⇒ 清理暂存并降级为直接 PUT（能力对齐）
 *   - 暂存 PUT 遇 409 ⇒ 先 MKCOL 再重试
 *   - AbortError ⇒ 超时消息，且**不得泄漏 URL 里的凭证**
 *
 * 超时用合成的 AbortError 触发：真实等待 30s 的 `WEBDAV_TIMEOUT` 会让单测不可接受。
 */

import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import {
  createDirectory,
  downloadDataset,
  fetchRemoteMeta,
  testConnection,
  uploadDataset,
} from '@/provider/webdav/api';

initFileSandbox();

interface DavCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

const calls: DavCall[] = [];
let responder: (call: DavCall, index: number) => Response | Promise<Response> = () =>
  new Response('', { status: 200 });

/** 假 fetch：记录调用 → 交给当前 responder（responder 抛错即模拟网络层失败）。 */
defineGlobal('fetch', async (input: unknown, init?: RequestInit): Promise<Response> => {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
    headers[key.toLowerCase()] = String(value);
  }
  const call: DavCall = {
    url: typeof input === 'string' ? input : String(input),
    method: init?.method ?? 'GET',
    headers,
    body: init?.body,
  };
  calls.push(call);
  return responder(call, calls.length - 1);
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** 断言 promise 必定 reject，并返回其错误对象（避免把 resolve 值当错误用）。 */
async function captureError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err: unknown) {
    return err as Error;
  }
  throw new Error('expected the call to reject, but it resolved');
}

const META_PAYLOAD = {
  schema: 'umm-meta',
  version: 1,
  generatedAt: '2026-01-01T00:00:00.000Z',
  datasets: [
    {
      key: 'douban_records',
      hash: 'h',
      updatedAt: '2026-01-01T00:00:00.000Z',
      recordCount: 2,
      dataVersion: 1,
    },
  ],
};

const BASE = 'https://dav.example/dav/';

test.beforeEach(() => {
  calls.length = 0;
  responder = () => new Response('', { status: 200 });
});

test.describe('URL composition & auth', () => {
  test('meta.json 的 URL 组合归一尾斜杠，并带 Basic auth', async () => {
    responder = () => jsonResponse(META_PAYLOAD);
    const meta = await fetchRemoteMeta(BASE, 'user', 'pw');
    expect(meta?.datasets[0]?.key).toBe('douban_records');
    expect(calls[0]?.url).toBe('https://dav.example/dav/umm-data/meta.json');
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from('user:pw', 'utf8').toString('base64')}`,
    );
  });

  test('dataset 文件名 = sha256(storeKey)[0:16].zip，且走 GET', async () => {
    responder = () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    await downloadDataset(BASE, 'user', 'pw', 'douban_records');
    // 只断言形状：16 位 hex + .zip（具体哈希由 mapping.spec 钉死）。
    expect(calls[0]?.url).toMatch(/^https:\/\/dav\.example\/dav\/umm-data\/[0-9a-f]{16}\.zip$/);
    expect(calls[0]?.method).toBe('GET');
  });

  test('非 ASCII 凭据按 UTF-8 编码（否则 btoa 会抛/乱码）', async () => {
    responder = () => jsonResponse(META_PAYLOAD);
    await fetchRemoteMeta(BASE, '用户', '密码');
    expect(calls[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from('用户:密码', 'utf8').toString('base64')}`,
    );
  });
});

test.describe('status → error semantics', () => {
  test('meta 404 ⇒ null（远端还没有备份）', async () => {
    responder = () => new Response('nope', { status: 404 });
    expect(await fetchRemoteMeta(BASE, 'u', 'p')).toBeNull();
  });

  test('meta 500 ⇒ 抛错并带状态码（不得当成「远端为空」）', async () => {
    responder = () => new Response('boom', { status: 500 });
    await expect(fetchRemoteMeta(BASE, 'u', 'p')).rejects.toThrow('Failed to fetch meta: HTTP 500');
  });

  test('dataset 404 ⇒ 抛「Dataset not found」并带 key', async () => {
    responder = () => new Response('', { status: 404 });
    await expect(downloadDataset(BASE, 'u', 'p', 'jav_ids')).rejects.toThrow(
      /Dataset not found: jav_ids/,
    );
  });

  test('createDirectory 容忍 405（已存在），但 500 必须抛', async () => {
    responder = () => new Response('', { status: 405 });
    await expect(createDirectory(BASE, 'u', 'p')).resolves.toBeUndefined();

    calls.length = 0;
    responder = () => new Response('', { status: 500 });
    await expect(createDirectory(BASE, 'u', 'p')).rejects.toThrow('HTTP 500');
  });

  test('testConnection：207 成功、401 明确报认证失败', async () => {
    responder = () => new Response('', { status: 207 });
    expect(await testConnection(BASE, 'u', 'p')).toEqual({ ok: true, message: 'Connected' });

    responder = () => new Response('', { status: 401 });
    const denied = await testConnection(BASE, 'u', 'p');
    expect(denied.ok).toBe(false);
    expect(denied.message).toContain('401');
    expect(calls[0]?.method).toBe('PROPFIND');
  });

  test('AbortError ⇒ 超时消息，且 URL 中的凭证被剥离', async () => {
    responder = () => {
      throw new DOMException('aborted', 'AbortError');
    };
    const withCreds = 'https://user:pw@dav.example/dav/';
    const err = await captureError(fetchRemoteMeta(withCreds, 'user', 'pw'));
    expect(err.message).toContain('WebDAV timeout after 30000ms');
    expect(err.message).toContain('https://dav.example/dav/umm-data/meta.json');
    expect(err.message, '日志/错误消息不得泄漏 URL 内嵌凭证').not.toContain(':pw@');
  });
});

test.describe('atomic upload (ADR-027 R2)', () => {
  test('先 PUT 暂存名再 MOVE 到最终名；不直接写最终名', async () => {
    responder = () => new Response('', { status: 201 });
    await uploadDataset(BASE, 'u', 'p', 'douban_records', new Blob([new Uint8Array([9])]));

    const staging = calls[0];
    const move = calls[1];
    expect(calls).toHaveLength(2);
    expect(staging?.method).toBe('PUT');
    expect(staging?.url).toMatch(/\/umm-data\/[0-9a-f]{16}\.zip\.tmp$/);
    expect(staging?.headers['content-type']).toBe('application/zip');
    expect(move?.method).toBe('MOVE');
    expect(move?.url).toBe(staging?.url);
    expect(move?.headers.destination).toBe(String(staging?.url).replace(/\.tmp$/, ''));
    expect(move?.headers.overwrite).toBe('T');
  });

  test('MOVE 不受支持（405）⇒ 清理暂存 + 降级为直接 PUT 最终名', async () => {
    responder = (call) => {
      if (call.method === 'MOVE') return new Response('nope', { status: 405 });
      return new Response('', { status: 201 });
    };
    await uploadDataset(BASE, 'u', 'p', 'douban_records', new Blob([new Uint8Array([9])]));

    const methods = calls.map((c) => c.method);
    expect(methods).toEqual(['PUT', 'MOVE', 'DELETE', 'PUT']);
    expect(calls[0]?.url).toMatch(/\.tmp$/);
    expect(calls[2]?.url).toMatch(/\.tmp$/);
    expect(calls[3]?.url).toMatch(/[0-9a-f]{16}\.zip$/);
  });

  test('暂存 PUT 遇 409 ⇒ 先 MKCOL 再重试，随后正常 MOVE', async () => {
    let firstPut = true;
    responder = (call) => {
      if (call.method === 'PUT' && firstPut) {
        firstPut = false;
        return new Response('', { status: 409 });
      }
      return new Response('', { status: 201 });
    };
    await uploadDataset(BASE, 'u', 'p', 'douban_records', new Blob([new Uint8Array([9])]));

    expect(calls.map((c) => c.method)).toEqual(['PUT', 'MKCOL', 'PUT', 'MOVE']);
    expect(calls[1]?.url).toBe('https://dav.example/dav/umm-data');
  });

  test('MOVE 返回 5xx（既非成功也非「不可用」）⇒ 抛错且**不写最终名**（旧内容得以保全）', async () => {
    responder = (call) => new Response('', { status: call.method === 'MOVE' ? 500 : 201 });
    await expect(
      uploadDataset(BASE, 'u', 'p', 'douban_records', new Blob([new Uint8Array([9])])),
    ).rejects.toThrow('Failed to finalize dataset: HTTP 500');
    // 关键不变量：硬失败时最终名绝不被触碰 —— 原子性的全部价值所在。
    expect(
      calls
        .filter((c) => c.method === 'PUT')
        .map((c) => c.url)
        .join(','),
    ).not.toMatch(/[0-9a-f]{16}\.zip$/);
    expect(calls.map((c) => c.method)).toEqual(['PUT', 'MOVE']);
  });

  test('MOVE 返回 400/401/502 也走降级（服务端/代理不接受该 MOVE 形态时不得让备份永久失败）', async () => {
    for (const status of [400, 401, 502]) {
      calls.length = 0;
      responder = (call) => new Response('', { status: call.method === 'MOVE' ? status : 201 });
      await uploadDataset(BASE, 'u', 'p', 'douban_records', new Blob([new Uint8Array([9])]));
      expect(
        calls.map((c) => c.method),
        `status=${status}`,
      ).toEqual(['PUT', 'MOVE', 'DELETE', 'PUT']);
      expect(calls[3]?.url, `status=${status} 必须写到最终名`).toMatch(/[0-9a-f]{16}\.zip$/);
    }
  });
});
