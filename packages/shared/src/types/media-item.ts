import type { Platform } from './platform.js';
import type { MediaType } from './media-type.js';

export interface MediaItemDTO {
  id: string;
  platform: Platform;
  mediaType: MediaType;
  providerSelfId: string;
  title: string;
  originalTitle?: string;
  coverUrl?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  linkedIds?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}
