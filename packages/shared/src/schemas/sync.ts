import { z } from 'zod';
import { MediaItemSchema } from './media-item.js';
import { UserMarkSchema } from './user-mark.js';

export const SyncItemSchema = MediaItemSchema.extend({
  updatedAt: z.string().datetime(),
});

export const SyncMarkSchema = UserMarkSchema.extend({
  mediaItemId: z.string().uuid(),
  updatedAt: z.string().datetime(),
});

export const SyncPayloadSchema = z.object({
  lastSyncAt: z.string().datetime(),
  items: z.array(SyncItemSchema).max(500),
  marks: z.array(SyncMarkSchema).max(500),
  deletedMarkIds: z.array(z.string().uuid()).max(100),
});
