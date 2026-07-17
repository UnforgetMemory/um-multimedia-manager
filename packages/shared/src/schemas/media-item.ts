import { z } from 'zod';
import { PLATFORMS } from '../types/platform.js';
import { MEDIA_TYPES } from '../types/media-type.js';

/**
 * Schema for validating media item input (create/update payload).
 * Does NOT include auto-generated fields: id, createdAt, updatedAt.
 */
export const MediaItemSchema = z.object({
  platform: z.enum(PLATFORMS),
  mediaType: z.enum(MEDIA_TYPES),
  providerSelfId: z.string().min(1),
  title: z.string(),
  originalTitle: z.string().optional(),
  coverUrl: z.string().url().optional(),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  linkedIds: z.record(z.string()).optional(),
});

/**
 * Schema for a stored media item record (including auto-generated fields).
 * Use this when validating full records returned from the database.
 */
export const StoredMediaItemSchema = MediaItemSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
