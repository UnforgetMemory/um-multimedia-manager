import type {
  SyncPayload,
  SyncResponse,
  MarksResponse,
  MarkUpdate,
  MarkUpdateResponse,
  SearchResponse,
  ApiToken,
  CreateTokenResponse,
} from './types.js';

export class UmmApiClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options?.headers },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error: string }).error || `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async sync(payload: SyncPayload): Promise<SyncResponse> {
    return this.request<SyncResponse>('/api/sync', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getMarks(updatedSince?: string): Promise<MarksResponse> {
    const query = updatedSince ? `?updated_since=${encodeURIComponent(updatedSince)}` : '';
    return this.request<MarksResponse>(`/api/marks${query}`);
  }

  async updateMark(mark: MarkUpdate): Promise<MarkUpdateResponse> {
    return this.request<MarkUpdateResponse>('/api/marks', {
      method: 'PUT',
      body: JSON.stringify(mark),
    });
  }

  async searchItems(params: {
    q?: string; platform?: string; mediaType?: string; page?: number; limit?: number;
  }): Promise<SearchResponse> {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.platform) query.set('platform', params.platform);
    if (params.mediaType) query.set('media_type', params.mediaType);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    return this.request<SearchResponse>(`/api/items?${query.toString()}`);
  }

  async createToken(description?: string): Promise<CreateTokenResponse> {
    return this.request<CreateTokenResponse>('/api/tokens', {
      method: 'POST',
      body: JSON.stringify({ description }),
    });
  }

  async listTokens(): Promise<{ tokens: ApiToken[] }> {
    return this.request<{ tokens: ApiToken[] }>('/api/tokens');
  }

  async revokeToken(id: string): Promise<void> {
    await this.request(`/api/tokens/${id}`, { method: 'DELETE' });
  }
}
