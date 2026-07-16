import { Hono } from 'hono';
import { SyncPayloadSchema } from '@umm/shared/schemas';
import { createDb } from '../db.js';
import { mediaItems, userMarks, syncLogs } from '@umm/database/schema';
import { eq, and } from 'drizzle-orm';

const sync = new Hono<{
  Bindings: { DB: D1Database };
  Variables: { userId: string };
}>();

sync.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const parseResult = SyncPayloadSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json({ error: 'Invalid payload', details: parseResult.error.flatten() }, 400);
  }

  const { items, marks, deletedMarkIds } = parseResult.data;
  const db = createDb(c.env.DB);
  let upsertedItems = 0;
  let upsertedMarks = 0;

  // UPSERT media items
  for (const item of items) {
    const existing = await db.select({ id: mediaItems.id })
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.platform, item.platform),
          eq(mediaItems.mediaType, item.mediaType),
          eq(mediaItems.providerSelfId, item.providerSelfId)
        )
      )
      .get();

    if (existing) {
      await db.update(mediaItems)
        .set({
          title: item.title,
          originalTitle: item.originalTitle ?? null,
          coverUrl: item.coverUrl ?? null,
          description: item.description ?? null,
          metadata: item.metadata ? JSON.stringify(item.metadata) : null,
          linkedIds: item.linkedIds ? JSON.stringify(item.linkedIds) : null,
          updatedAt: item.updatedAt,
        })
        .where(eq(mediaItems.id, existing.id));
    } else {
      await db.insert(mediaItems).values({
        id: crypto.randomUUID(),
        platform: item.platform,
        mediaType: item.mediaType,
        providerSelfId: item.providerSelfId,
        title: item.title,
        originalTitle: item.originalTitle ?? null,
        coverUrl: item.coverUrl ?? null,
        description: item.description ?? null,
        metadata: item.metadata ? JSON.stringify(item.metadata) : null,
        linkedIds: item.linkedIds ? JSON.stringify(item.linkedIds) : null,
        createdAt: item.updatedAt,
        updatedAt: item.updatedAt,
      });
    }
    upsertedItems++;
  }

  // UPSERT user marks
  for (const mark of marks) {
    const existing = await db.select({ id: userMarks.id })
      .from(userMarks)
      .where(
        and(
          eq(userMarks.userId, userId),
          eq(userMarks.mediaItemId, mark.mediaItemId)
        )
      )
      .get();

    if (existing) {
      await db.update(userMarks)
        .set({
          status: mark.status,
          rating: mark.rating ?? null,
          comment: mark.comment ?? null,
          updatedAt: mark.updatedAt,
        })
        .where(eq(userMarks.id, existing.id));
    } else {
      await db.insert(userMarks).values({
        id: crypto.randomUUID(),
        userId,
        mediaItemId: mark.mediaItemId,
        status: mark.status,
        rating: mark.rating ?? null,
        comment: mark.comment ?? null,
        createdAt: mark.updatedAt,
        updatedAt: mark.updatedAt,
      });
    }
    upsertedMarks++;
  }

  // Delete marks (security: only own marks)
  for (const id of deletedMarkIds) {
    await db.delete(userMarks)
      .where(
        and(eq(userMarks.id, id), eq(userMarks.userId, userId))
      );
  }

  // Log sync
  await db.insert(syncLogs).values({
    id: crypto.randomUUID(),
    userId,
    syncType: 'extension_push',
    itemCount: items.length + marks.length,
    status: 'success',
    createdAt: new Date().toISOString(),
  });

  return c.json({
    syncedAt: new Date().toISOString(),
    upserted: { items: upsertedItems, marks: upsertedMarks, deleted: deletedMarkIds.length },
    conflicts: [],
  });
});

export default sync;
