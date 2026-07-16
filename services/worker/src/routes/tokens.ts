import { Hono } from 'hono';
import { createDb } from '../db.js';
import { apiTokens } from '@umm/database/schema';
import { eq, desc, and } from 'drizzle-orm';
import { generateToken } from '../utils/crypto.js';

const tokens = new Hono<{
  Bindings: { DB: D1Database; KV: KVNamespace };
  Variables: { userId: string };
}>();

// POST /api/tokens - create new PAT
tokens.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ description?: string }>().catch(() => ({}) as { description?: string });
  const db = createDb(c.env.DB);
  const { raw, hash } = await generateToken();
  const now = new Date().toISOString();

  await db.insert(apiTokens).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash: hash,
    description: body.description ?? null,
    createdAt: now,
  });

  return c.json({ token: raw, description: body.description ?? null, createdAt: now });
});

// GET /api/tokens - list tokens (without hash values)
tokens.get('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const result = await db.select({
    id: apiTokens.id,
    description: apiTokens.description,
    lastUsedAt: apiTokens.lastUsedAt,
    expiresAt: apiTokens.expiresAt,
    createdAt: apiTokens.createdAt,
  })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt))
    .all();

  return c.json({ tokens: result });
});

// DELETE /api/tokens/:id - revoke token
tokens.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const tokenId = c.req.param('id');
  const db = createDb(c.env.DB);

  const result = await db.delete(apiTokens)
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)))
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'Token not found' }, 404);
  }

  return c.json({ status: 'revoked' });
});

export default tokens;
