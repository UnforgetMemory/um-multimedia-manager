import { Hono } from 'hono';
import { createDb } from '../db.js';
import { userMarks } from '@umm/database/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

const marks = new Hono<{
  Bindings: { DB: D1Database };
  Variables: { userId: string };
}>();

// GET /api/marks?updated_since=ISO
marks.get('/', async (c) => {
  const userId = c.get('userId');
  const updatedSince = c.req.query('updated_since');
  const db = createDb(c.env.DB);

  const conditions: any[] = [eq(userMarks.userId, userId)];
  if (updatedSince) {
    conditions.push(sql`${userMarks.updatedAt} > ${updatedSince}`);
  }

  const result = await db.select({
    id: userMarks.id,
    mediaItemId: userMarks.mediaItemId,
    status: userMarks.status,
    rating: userMarks.rating,
    comment: userMarks.comment,
    createdAt: userMarks.createdAt,
    updatedAt: userMarks.updatedAt,
  })
    .from(userMarks)
    .where(and(...conditions))
    .orderBy(desc(userMarks.updatedAt))
    .all();

  return c.json({ marks: result, serverTime: new Date().toISOString() });
});

// PUT /api/marks - single mark upsert
marks.put('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{
    mediaItemId: string;
    status: number;
    rating?: number;
    comment?: string;
  }>();
  const db = createDb(c.env.DB);
  const now = new Date().toISOString();

  const existing = await db.select({ id: userMarks.id })
    .from(userMarks)
    .where(
      and(eq(userMarks.userId, userId), eq(userMarks.mediaItemId, body.mediaItemId))
    )
    .get();

  if (existing) {
    await db.update(userMarks)
      .set({ status: body.status, rating: body.rating ?? null, comment: body.comment ?? null, updatedAt: now })
      .where(eq(userMarks.id, existing.id));
    return c.json({ id: existing.id, updatedAt: now });
  } else {
    const id = crypto.randomUUID();
    await db.insert(userMarks).values({
      id, userId, mediaItemId: body.mediaItemId,
      status: body.status, rating: body.rating ?? null, comment: body.comment ?? null,
      createdAt: now, updatedAt: now,
    });
    return c.json({ id, updatedAt: now });
  }
});

export default marks;
