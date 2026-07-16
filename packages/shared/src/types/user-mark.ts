import type { StatusCode } from './status.js';

export interface UserMarkDTO {
  id: string;
  userId: string;
  mediaItemId: string;
  status: StatusCode;
  rating?: number;      // 0-10, step 0.5
  comment?: string;
  createdAt: string;
  updatedAt: string;
}
