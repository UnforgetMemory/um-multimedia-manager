import { z } from 'zod';
import { MediaItemSchema } from './media-item.js';
import { UserMarkSchema } from './user-mark.js';
import { PLATFORMS } from '../types/platform.js';
import { MEDIA_TYPES } from '../types/media-type.js';

export const SyncItemSchema = MediaItemSchema.extend({
  updatedAt: z.string().datetime(),
});

export const ItemRefSchema = z.object({
  platform: z.enum(PLATFORMS),
  mediaType: z.enum(MEDIA_TYPES),
  providerSelfId: z.string().min(1),
});

export const SyncMarkSchema = UserMarkSchema.extend({
  mediaItemId: z.string().uuid().optional(),
  itemRef: ItemRefSchema.optional(),
  updatedAt: z.string().datetime(),
}).refine(
  (data) => data.mediaItemId || data.itemRef,
  { message: 'Either mediaItemId or itemRef is required' },
);

export type SyncMark = z.infer<typeof SyncMarkSchema>;

export const SyncPayloadSchema = z.object({
  lastSyncAt: z.string().datetime(),
  items: z.array(SyncItemSchema).max(500),
  marks: z.array(SyncMarkSchema).max(500),
  deletedMarkIds: z.array(z.string().uuid()).max(100),
});
