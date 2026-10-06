/**
 * 真实 WebDAV 服务器（零依赖，node:http + node:fs）—— 供「真机」集成测试用。
 *
 * 为什么需要它：route 桩（`tests/e2e/fixtures/webdav-server.ts`）里的 MOVE/DELETE
 * 是我们自己解释的语义，**无法证明客户端用的 `Destination` / `Overwrite` 形态符合
 * RFC 4918**，也无法证明真正落到磁盘的字节与文件名。本服务器把请求真正落到文件系统
 * 上（真 TCP、真 HTTP、真 rename），从而把「原子落名」从「桩说是」升级为「盘上是」。
 *
 * 刻意保留真实服务端的行为特征：
 *  - PUT 到不存在的集合 ⇒ **409**（逼客户端走 MKCOL 重试路径）
 *  - MKCOL 已存在 ⇒ **405**（逼客户端走「容忍 405」路径）
 *  - 无 Basic 凭据 ⇒ **401**
 *  - PUT 是原地覆盖（不先删旧文件）—— 这正是需要原子上传的原因
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

export interface LiveDavOptions {
  /** MOVE 行为：正常 / 未实现(405) / 服务端错误(500)。 */
  move?: 'support' | 'unsupported' | 'serverError' | 'conflict';
  /** Basic auth；给出则校验，缺/错即 401。 */
  auth?: { user: string; pass: string };
  /** 命中即返回该状态码（在正常处理之前）。 */
  statusOn?: (method: string, pathname: string) => number | null;
  /**
   * 命中即以「声明长度远大于实际 body」的方式截断响应（模拟断流/半截传输）。
   * 刻意**不销毁 socket**：服务端 destroy 会在 Windows 上触发 libuv 断言
   * （`!(handle->flags & UV_HANDLE_CLOSING)`）把噪音打进套件 stderr；
   * 长度不符同样能让客户端 fetch 抛错，语义等价而干净。
   */
  truncateOn?: (method: string, pathname: string) => boolean;
}

export interface LiveDavRequest {
  method: string;
  path: string;
}

export interface LiveDav {
  baseUrl: string;
  requests: LiveDavRequest[];
  close: () => Promise<void>;
}

/** 挂载前缀：baseUrl 形如 `http://127.0.0.1:<port>/dav`。 */
const MOUNT = '/dav';

function safeResolve(root: string, pathname: string): string | null {
  if (!pathname.startsWith(MOUNT)) return null;
  const rel = decodeURIComponent(pathname.slice(MOUNT.length)).replace(/^\/+/, '');
  const abs = path.resolve(root, rel);
  return abs === root || abs.startsWith(root + path.sep) ? abs : null;
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export async function startLiveDav(
  rootDir: string,
  options: LiveDavOptions = {},
): Promise<LiveDav> {
  const requests: LiveDavRequest[] = [];

  // keepAlive 关掉：测试里没有长连接需求，而残留的 keep-alive socket 会让 close()
  // 悬挂；此前用 closeAllConnections() 强拆会在 Windows 上触发 libuv 断言
  // （`!(handle->flags & UV_HANDLE_CLOSING)`），把噪音打进套件 stderr。
  const server = http.createServer({ keepAlive: false }, (req, res) => {
    void (async () => {
      const method = (req.method ?? 'GET').toUpperCase();
      const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
      requests.push({ method, path: pathname });

      // 每个响应都显式关闭连接：否则 undici 的 keep-alive 连接会在 server.close()
      // 期间被拆，进而在 Windows 上触发 libuv 噪音断言
      // （`!(handle->flags & UV_HANDLE_CLOSING)`, src/win/async.c）。
      res.shouldKeepAlive = false;

      if (options.truncateOn?.(method, pathname)) {
        // content-length 声明 4096，实际只给 4 字节 ⇒ 客户端必然读到残缺响应。
        res.writeHead(200, {
          'content-type': 'application/octet-stream',
          'content-length': '4096',
        });
        res.end('trun');
        return;
      }
      const forced = options.statusOn?.(method, pathname);
      if (typeof forced === 'number') {
        res.writeHead(forced).end('injected');
        return;
      }

      if (options.auth) {
        const header = req.headers.authorization ?? '';
        const raw = header.startsWith('Basic ')
          ? Buffer.from(header.slice(6), 'base64').toString('utf8')
          : '';
        if (raw !== `${options.auth.user}:${options.auth.pass}`) {
          res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="dav"' }).end('unauthorized');
          return;
        }
      }

      const target = safeResolve(rootDir, pathname);
      if (!target) {
        res.writeHead(400).end('bad path');
        return;
      }

      switch (method) {
        case 'PROPFIND':
          res
            .writeHead(207, { 'content-type': 'application/xml; charset=utf-8' })
            .end('<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"></d:multistatus>');
          return;
        case 'OPTIONS':
          res.writeHead(200, { Allow: 'GET,PUT,DELETE,MKCOL,MOVE,PROPFIND,OPTIONS' }).end();
          return;
        case 'MKCOL': {
          if (fs.existsSync(target)) {
            // RFC 4918：集合已存在 ⇒ 405。客户端必须容忍它。
            res.writeHead(405).end('exists');
            return;
          }
          try {
            fs.mkdirSync(target);
            res.writeHead(201).end();
          } catch {
            res.writeHead(409).end('parent missing');
          }
          return;
        }
        case 'PUT': {
          const parent = path.dirname(target);
          if (!fs.existsSync(parent)) {
            // 父集合不存在 ⇒ 409（逼客户端走 MKCOL 重试）。
            res.writeHead(409).end('no parent');
            return;
          }
          const body = await readBody(req);
          fs.writeFileSync(target, body);
          res.writeHead(201).end();
          return;
        }
        case 'DELETE':
          if (!fs.existsSync(target)) {
            res.writeHead(404).end('missing');
            return;
          }
          fs.rmSync(target, { force: true });
          res.writeHead(204).end();
          return;
        case 'MOVE': {
          if (options.move === 'unsupported') {
            res.writeHead(405).end('MOVE not allowed');
            return;
          }
          if (options.move === 'conflict') {
            // 坚果云真机形态：MOVE 一律 409（直传 PUT 正常）
            res.writeHead(409).end('conflict');
            return;
          }
          if (options.move === 'serverError') {
            res.writeHead(500).end('move failed');
            return;
          }
          const destinationHeader = req.headers.destination;
          const destination = Array.isArray(destinationHeader)
            ? destinationHeader[0]
            : destinationHeader;
          const destPath = destination ? new URL(destination, 'http://127.0.0.1').pathname : '';
          const targetPath = safeResolve(rootDir, destPath);
          if (!fs.existsSync(target)) {
            res.writeHead(404).end('source missing');
            return;
          }
          if (!targetPath || !fs.existsSync(path.dirname(targetPath))) {
            res.writeHead(409).end('dest parent missing');
            return;
          }
          // Windows 的 rename 不会覆盖已存在目标 —— Overwrite: T 要求替换。
          if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true });
          fs.renameSync(target, targetPath);
          res.writeHead(201).end();
          return;
        }
        case 'GET': {
          if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
            res.writeHead(404).end('missing');
            return;
          }
          const bytes = fs.readFileSync(target);
          res.writeHead(200, { 'content-type': 'application/octet-stream' }).end(bytes);
          return;
        }
        default:
          res.writeHead(405).end('unsupported method');
      }
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end('handler error');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}${MOUNT}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
