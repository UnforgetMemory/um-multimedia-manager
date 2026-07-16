import { Hono } from 'hono';
import { createDb } from '../db.js';
import { mediaItems, userMarks } from '@umm/database/schema';
import { eq, like, and, desc, sql } from 'drizzle-orm';

const items = new Hono<{ Bindings: { DB: D1Database }; Variables: { userId: string } }>();

// GET /api/items?q=title&platform=douban&media_type=movie&page=1&limit=20
items.get('/', async (c) => {
  const userId = c.get('userId');
  const q = c.req.query('q');
  const platform = c.req.query('platform');
  const mediaType = c.req.query('media_type');
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const offset = (page - 1) * limit;
  const db = createDb(c.env.DB);

  const conditions = [];
  if (q) conditions.push(like(mediaItems.title, `%${q}%`));
  if (platform) conditions.push(eq(mediaItems.platform, platform));
  if (mediaType) conditions.push(eq(mediaItems.mediaType, mediaType));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const result = await db.select({
    id: mediaItems.id,
    platform: mediaItems.platform,
    mediaType: mediaItems.mediaType,
    providerSelfId: mediaItems.providerSelfId,
    title: mediaItems.title,
    originalTitle: mediaItems.originalTitle,
    coverUrl: mediaItems.coverUrl,
    linkedIds: mediaItems.linkedIds,
    userMark: {
      status: userMarks.status,
      rating: userMarks.rating,
      comment: userMarks.comment,
    },
  })
    .from(mediaItems)
    .leftJoin(userMarks, and(
      eq(mediaItems.id, userMarks.mediaItemId),
      eq(userMarks.userId, userId)
    ))
    .where(where)
    .orderBy(desc(mediaItems.updatedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const countResult = await db.select({ count: sql<number>`count(*)` })
    .from(mediaItems)
    .where(where)
    .get();

  return c.json({
    items: result,
    pagination: {
      page, limit,
      total: countResult?.count ?? 0,
      totalPages: Math.ceil((countResult?.count ?? 0) / limit),
    },
  });
});

export default items;
