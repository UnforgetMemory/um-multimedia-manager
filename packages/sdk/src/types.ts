export interface SyncPayload {
  lastSyncAt: string;
  items: Array<{
    platform: string;
    mediaType: string;
    providerSelfId: string;
    title: string;
    originalTitle?: string;
    coverUrl?: string;
    description?: string;
    metadata?: Record<string, unknown>;
    linkedIds?: Record<string, string>;
    updatedAt: string;
  }>;
  marks: Array<{
    mediaItemId?: string;
    itemRef?: { platform: string; mediaType: string; providerSelfId: string };
    status: number;
    rating?: number;
    comment?: string;
    updatedAt: string;
  }>;
  deletedMarkIds: string[];
}

export interface SyncResponse {
  syncedAt: string;
  upserted: { items: number; marks: number; deleted: number };
  conflicts: unknown[];
}

export interface MarkRecord {
  id: string;
  mediaItemId: string;
  status: number;
  rating?: number;
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarksResponse {
  marks: MarkRecord[];
  serverTime: string;
}

export interface MarkUpdate {
  mediaItemId: string;
  status: number;
  rating?: number;
  comment?: string;
}

export interface MarkUpdateResponse {
  id: string;
  updatedAt: string;
}

export interface ApiToken {
  id: string;
  description?: string;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface CreateTokenResponse {
  token: string;
  description?: string;
  createdAt: string;
}

export interface SearchResult {
  id: string;
  platform: string;
  mediaType: string;
  providerSelfId: string;
  title: string;
  originalTitle?: string;
  coverUrl?: string;
  linkedIds?: string;
  userMark?: { status: number; rating?: number; comment?: string } | null;
}

export interface SearchResponse {
  items: SearchResult[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
