import { z } from 'zod';

/**
 * Schema for validating user mark input (create/update payload).
 * Does NOT include auto-generated fields: id, userId, createdAt, updatedAt.
 */
export const UserMarkSchema = z.object({
  status: z.number().int().min(0).max(3),
  rating: z.number().min(0).max(10).optional(),
  comment: z.string().max(1000).optional(),
});

/**
 * Schema for a stored user mark record (including auto-generated fields).
 * Use this when validating full records returned from the database.
 */
export const StoredUserMarkSchema = UserMarkSchema.extend({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
