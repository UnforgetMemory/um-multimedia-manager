import { createMiddleware } from 'hono/factory';
import { isValidTokenFormat, hashToken } from '../utils/crypto.js';

export const authMiddleware = createMiddleware<{
  Bindings: { DB: D1Database; KV: KVNamespace };
  Variables: { userId: string };
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  if (!isValidTokenFormat(token)) {
    return c.json({ error: 'Invalid token format' }, 401);
  }

  const tokenHash = await hashToken(token);

  // Check KV cache first
  const cached = await c.env.KV.get(`pat:${tokenHash}`);
  if (cached) {
    c.set('userId', cached);
    await next();
    return;
  }

  // Fallback to D1
  const result = await c.env.DB.prepare(
    "SELECT user_id FROM api_tokens WHERE token_hash = ? AND (expires_at IS NULL OR expires_at > datetime('now'))"
  ).bind(tokenHash).first<{ user_id: string }>();

  if (!result) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  // Cache in KV for 5 minutes
  await c.env.KV.put(`pat:${tokenHash}`, result.user_id, { expirationTtl: 300 });

  c.set('userId', result.user_id);
  await next();
});
